// SessionStart launcher: ensure the dashboard server is up, then open the tab
// ONCE. Fast path: if a server is already responding, do nothing (tab persists).
// Otherwise take an atomic lock BEFORE spawning so two sessions starting at the
// same instant can't each spawn a server. Spawns hidden + detached (no flash).
const fs = require("fs");
const path = require("path");
const http = require("http");
const net = require("net");
const { spawn } = require("child_process");

const DIR = __dirname;
const RUNTIME = path.join(DIR, ".runtime.json");
const LOCK = path.join(DIR, ".launch.lock");
const LOG = path.join(DIR, ".server.log"); // the server's stderr: a bad config at startup, a failed refresh

function readRuntime() {
  try {
    return JSON.parse(fs.readFileSync(RUNTIME, "utf8"));
  } catch {
    return null;
  }
}

function ping(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port, path: "/api/stats", timeout: 900 },
      (res) => {
        res.resume();
        resolve(true);
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Is anything accepting connections on the port? The OS completes the TCP
// handshake even while the server's event loop is busy re-indexing, which is
// when the HTTP ping above times out. Using the ping here spawned a second,
// third and fourth server (each walks to the next free port), 2026-10-02.
function listening(port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: "127.0.0.1", port });
    sock.setTimeout(1500);
    sock.on("connect", () => {
      sock.destroy();
      resolve(true);
    });
    sock.on("error", () => resolve(false));
    sock.on("timeout", () => {
      sock.destroy();
      resolve(false);
    });
  });
}

// Atomic create-if-absent; recover a stale lock (>30s old) from a crashed launcher.
function acquireLock() {
  try {
    fs.writeFileSync(LOCK, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    try {
      const st = fs.statSync(LOCK);
      if (Date.now() - st.mtimeMs > 30000) {
        fs.unlinkSync(LOCK);
        fs.writeFileSync(LOCK, String(process.pid), { flag: "wx" });
        return true;
      }
    } catch {}
    return false;
  }
}
function releaseLock() {
  try {
    fs.unlinkSync(LOCK);
  } catch {}
}

function openBrowser(url) {
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {}
}

// The server's stderr goes to the log file (appended; started over once it passes 1 MB), so what a server
// said before it died is readable after it is gone. A log that cannot be opened costs nothing but the log.
function openLog() {
  try {
    const big = fs.existsSync(LOG) && fs.statSync(LOG).size > 1 << 20;
    return fs.openSync(LOG, big ? "w" : "a");
  } catch {
    return "ignore";
  }
}
function giveUp() {
  let tail = "";
  try {
    tail = fs.readFileSync(LOG, "utf8").trim().split("\n").slice(-12).join("\n");
  } catch {}
  process.stderr.write(`HQ: the server did not come up within 8 s. Its last lines (${LOG}):\n${tail || "(nothing written)"}\n`);
}

async function main() {
  const rt = readRuntime();
  if (rt && rt.port && (await listening(rt.port))) return; // already running

  if (!acquireLock()) return; // another launcher is spawning right now
  try {
    const log = openLog();
    spawn(process.execPath, [path.join(DIR, "server.js")], {
      detached: true,
      stdio: ["ignore", "ignore", log],
      windowsHide: true,
    }).unref();
    if (log !== "ignore") fs.closeSync(log); // the child holds its own handle

    const start = Date.now();
    await new Promise((resolve) => {
      const tryOpen = async () => {
        const r = readRuntime();
        if (r && r.port && (await ping(r.port))) {
          openBrowser("http://127.0.0.1:" + r.port);
          return resolve();
        }
        if (Date.now() - start < 8000) setTimeout(tryOpen, 300);
        else {
          giveUp();
          resolve();
        }
      };
      setTimeout(tryOpen, 400);
    });
  } finally {
    releaseLock();
  }
}

main();
