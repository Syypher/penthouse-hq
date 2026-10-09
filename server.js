// Read-only local HQ server (127.0.0.1 only, GET only). Indexes asynchronously and incrementally
// so the page never hangs: until the first index is ready the APIs answer {building, progress}.
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildIndex, computeStats } = require("./collect");
const { loadConfig } = require("./config");
const { createHq } = require("./lib/hq");
const { createBoard } = require("./lib/board");
const { loadInstance, sealedConfig, settingsPath } = require("./lib/instance");

const DIR = __dirname;
// Every folder this copy reads and writes: today's with no --settings, else the settings file's. A copy started
// from its settings stops on a settings problem with one line on stderr, never a stack or a path; required as
// a module, or with no settings file, the error is thrown as it always was.
const SETTINGS = settingsPath(process.argv);
function stop(e) {
  if (!SETTINGS || require.main !== module) throw e;
  console.error(e.message);
  process.exit(1);
}
let inst, config;
try {
  inst = loadInstance(SETTINGS, { appDir: DIR, home: os.homedir() });
  config = loadConfig(DIR, inst.configPath);
  sealedConfig(SETTINGS, inst, config, os.homedir()); // the heartbeat paths are known only once the config is read
} catch (e) {
  // loadInstance's messages are one clean line already; a config file that cannot be read gets the same shape
  stop(SETTINGS && inst && e.code ? new Error(`settings ${path.basename(SETTINGS)}: configPath cannot be read (${e.code})`) : e);
}

const hq = createHq({ config, board: createBoard(inst.registryPath), home: inst.homeDir });
const indexOwn = (onProgress) => buildIndex(onProgress, inst.projectsDir, { cacheFile: inst.cacheFile, home: inst.homeDir });
let stats = null;
let ready = false;
let error = null; // the last refresh's failure, cleared by the next good one
let progress = { done: 0, total: 0 };
let busy = false;

// `build` is a seam for tests; the server itself always indexes its own data folder.
async function refresh(build = indexOwn) {
  if (busy) return;
  busy = true;
  try {
    const index = await build((d, t) => {
      progress = { done: d, total: t };
    });
    stats = computeStats(index.mains, index.subMtime, config.planUsd, index.subs);
    await hq.update(index, stats);
    ready = true;
    error = null;
  } catch (e) {
    console.error(e);
    error = String((e && e.stack) || e);
    stats = { error };
  } finally {
    busy = false;
  }
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".glb": "model/gltf-binary", ".png": "image/png", ".svg": "image/svg+xml",
};
const ROOTS = { "/public/": "public", "/vendor/": "vendor", "/assets/": "assets" };
// The pinned engine and the baked model never change between launches, so the browser may keep them an hour;
// the page, its modules and the two APIs are always fetched fresh.
const CACHED = ["/vendor/", "/assets/"];

// Maps a URL path to a file inside one of the static roots, or null.
function staticPath(urlPath) {
  for (const prefix in ROOTS) {
    if (!urlPath.startsWith(prefix)) continue;
    let rel;
    try {
      rel = decodeURIComponent(urlPath.slice(prefix.length));
    } catch {
      return null;
    }
    if (rel.includes("\0")) return null; // a NUL byte truncates paths in C APIs; no real file name carries one
    const base = path.join(DIR, ROOTS[prefix]);
    const fp = path.resolve(base, rel);
    return fp.startsWith(base + path.sep) ? fp : null;
  }
  return null;
}

function send(res, status, type, body, headers) {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers });
  res.end(body);
}

// DNS rebinding guard: a hostile page whose domain resolves to 127.0.0.1 still sends its own Host.
function localHost(host) {
  const name = String(host || "").replace(/:\d+$/, "").toLowerCase();
  return name === "127.0.0.1" || name === "localhost";
}

function handler(req, res) {
  try {
    if (!localHost(req.headers.host)) return send(res, 403, "text/plain", "local only");
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "text/plain", "GET only", { Allow: "GET, HEAD" });
    const url = (req.url || "/").split("?")[0];
    if (url === "/api/hq") {
      if (!ready) return send(res, 200, "application/json", JSON.stringify({ building: true, progress, error }));
      // The last good payload stays up while a refresh fails; only then is it parsed again to carry the error.
      return send(res, 200, "application/json", error ? JSON.stringify({ ...JSON.parse(hq.json()), error }) : hq.json());
    }
    // The boss model is optional (assets/README.md): the page asks first, so a floor without one requests no file that is not there
    if (url === "/api/assets") return send(res, 200, "application/json", JSON.stringify({ boss: fs.existsSync(path.join(DIR, "assets", "boss.glb")) }));
    if (url === "/api/stats") {
      const body = stats ? Object.assign({ building: busy, progress }, stats) : { building: true, progress };
      return send(res, 200, "application/json", JSON.stringify(body));
    }
    const fp = url === "/" || url === "/index.html" ? path.join(DIR, "public", "index.html") : staticPath(url);
    if (!fp || !fs.existsSync(fp) || !fs.statSync(fp).isFile()) return send(res, 404, "text/plain", "not found");
    const body = fs.readFileSync(fp); // read before writeHead so a throw can still 500
    const cache = CACHED.some((p) => url.startsWith(p)) ? { "Cache-Control": "max-age=3600" } : undefined;
    return send(res, 200, TYPES[path.extname(fp)] || "application/octet-stream", body, cache);
  } catch (e) {
    send(res, 500, "text/plain", String(e));
  }
}

function listen(port, attemptsLeft) {
  const server = http.createServer(handler);
  server.on("error", (e) => {
    if (e.code === "EADDRINUSE" && attemptsLeft > 0 && port < 65535) listen(port + 1, attemptsLeft - 1); // the walk ends at the last port
    else process.exit(1);
  });
  server.listen(port, "127.0.0.1", () => {
    try {
      fs.writeFileSync(inst.runtimeFile, JSON.stringify({ pid: process.pid, port: server.address().port, startedAt: new Date().toISOString() }));
    } catch {}
    refresh();
    setInterval(refresh, 4000); // incremental, cheap once warm
  });
}

if (require.main === module) {
  // The port file and the parse cache live in the state folder, so it exists before anything listens or indexes.
  // A folder that cannot be made stops the start like any other settings problem; the message carries the error
  // code, never the folder's path. With no settings file the state folder is this app folder, which exists.
  try {
    fs.mkdirSync(inst.stateDir, { recursive: true });
  } catch (e) {
    console.error(`settings ${SETTINGS ? path.basename(SETTINGS) : ""}: stateDir cannot be created (${e.code})`);
    process.exit(1);
  }
  listen(inst.port, 25);
}
module.exports = { handler, refresh, staticPath };
