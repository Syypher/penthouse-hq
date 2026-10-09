// Where one copy of HQ reads and writes. With no settings file every path is the one HQ has always
// used; a settings file (node server.js --settings <file>) moves them, so a second copy such as a demo
// never touches this one's sessions, registry, cache, config or port file. Paths in the file resolve
// against the file's own folder. A settings problem stops the start: falling back to the defaults
// would read the owner's real data. Messages name the setting and the file, never a folder, because
// the user folder's path carries the Windows username.
const fs = require("fs");
const path = require("path");

const KEYS = new Set(["dataDir", "registryPath", "stateDir", "configPath", "port", "homeDir", "sealed"]);
const CACHE_NAME = ".filecache.v4.json"; // the parse cache's base name; collect.js writes the same file

// The value after --settings, or null when the flag is absent. A flag that only starts with --settings
// (--settings=x, --settingsx) is a mistake, never a settings file; other flags are not this module's business.
function settingsPath(argv) {
  if (argv.some((a) => a.startsWith("--settings") && a !== "--settings")) throw new Error("--settings needs a file path");
  const i = argv.indexOf("--settings");
  if (i < 0) return null;
  const v = argv[i + 1];
  if (!v || v.startsWith("--")) throw new Error("--settings needs a file path");
  return path.resolve(v);
}

// Where a path really is: links and junctions followed for the part of it that exists.
function real(p) {
  let head = p;
  const tail = [];
  while (!fs.existsSync(head)) {
    const up = path.dirname(head);
    if (up === head) return p;
    tail.unshift(path.basename(head));
    head = up;
  }
  return path.join(fs.realpathSync.native(head), ...tail);
}

// Is child the parent folder or somewhere under it? (On Windows path.relative ignores case.)
function inside(child, parent) {
  const rel = path.relative(parent, child);
  return !(rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel));
}

function loadInstance(file, { appDir, home }) {
  const name = file ? path.basename(file) : "";
  const fail = (msg) => new Error(`settings ${name}: ${msg}`);
  let s = {};
  if (file) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch (e) {
      throw fail(e.code === "ENOENT" ? "file not found" : `cannot be read (${e.code})`);
    }
    try {
      s = JSON.parse(text);
    } catch {
      throw fail("not readable JSON");
    }
    if (!s || typeof s !== "object" || Array.isArray(s)) throw fail("not a JSON object");
    for (const k in s) if (!KEYS.has(k)) throw fail(`unknown key "${k}"`);
  }
  const base = file ? path.dirname(file) : appDir;
  const dir = (k, dflt) => {
    if (s[k] === undefined) return dflt;
    if (typeof s[k] !== "string" || !s[k]) throw fail(`${k} must be a path`);
    return path.resolve(base, s[k]);
  };
  if (s.port !== undefined && !(Number.isInteger(s.port) && s.port >= 0 && s.port <= 65535)) throw fail("port must be a whole number from 0 to 65535");
  if (s.sealed !== undefined && typeof s.sealed !== "boolean") throw fail("sealed must be true or false");
  const dataDir = dir("dataDir", path.join(home, ".claude"));
  const stateDir = dir("stateDir", appDir);
  const inst = {
    dataDir,
    projectsDir: path.join(dataDir, "projects"),
    registryPath: dir("registryPath", path.join(dataDir, "coordination", "registry.json")),
    stateDir,
    cacheFile: path.join(stateDir, CACHE_NAME),
    runtimeFile: path.join(stateDir, ".runtime.json"),
    configPath: dir("configPath", null),
    port: s.port === undefined ? 7763 : s.port,
    homeDir: dir("homeDir", home),
    sealed: s.sealed === true,
  };
  if (inst.sealed) {
    if (!inst.configPath) throw fail("a sealed copy names its configPath");
    if (s.stateDir === undefined) throw fail("a sealed copy names its stateDir");
    const h = real(home);
    for (const k of ["dataDir", "projectsDir", "registryPath", "stateDir"]) if (inside(real(inst[k]), h)) throw fail(`sealed, but ${k} is inside the user folder`);
    if (inside(real(inst.stateDir), real(appDir))) throw fail("stateDir must not be inside the app folder");
  }
  return inst;
}

// A sealed copy reads nothing inside the user folder, so a config agent's heartbeat file there stops the start
// too, links followed as for dataDir. The config is the loaded one (its heartbeat paths already absolute); the
// message names the agent, never the path. A place that cannot be checked stops the start with its own line, so it
// never reads as a configPath problem.
function sealedConfig(file, inst, config, home) {
  if (!inst.sealed) return;
  const fail = (msg) => new Error(`settings ${path.basename(file)}: sealed, but ${msg}`);
  const h = real(home);
  for (const a of config.agents || []) {
    if (!a.heartbeat) continue;
    let at;
    try {
      at = real(a.heartbeat);
    } catch (e) {
      throw fail(`the heartbeat of agent "${a.id}" cannot be checked (${e.code || "error"})`);
    }
    if (inside(at, h)) throw fail(`agent "${a.id}" reads a heartbeat inside the user folder`);
  }
}

module.exports = { loadInstance, sealedConfig, settingsPath, inside, CACHE_NAME };
