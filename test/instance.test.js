const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadInstance, settingsPath, inside, sealedConfig } = require("../lib/instance");

const HOME = path.resolve("/hq-home/me"); // never read: these tests only build paths from it
const APP = path.resolve("/hq-app");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hq-inst-"));
function settings(obj) {
  const f = path.join(tmp(), "s.json");
  fs.writeFileSync(f, typeof obj === "string" ? obj : JSON.stringify(obj));
  return f;
}

test("with no settings file every path is today's", () => {
  assert.deepEqual(loadInstance(null, { appDir: APP, home: HOME }), {
    dataDir: path.join(HOME, ".claude"),
    projectsDir: path.join(HOME, ".claude", "projects"),
    registryPath: path.join(HOME, ".claude", "coordination", "registry.json"),
    stateDir: APP,
    cacheFile: path.join(APP, ".filecache.v4.json"),
    runtimeFile: path.join(APP, ".runtime.json"),
    configPath: null,
    port: 7763,
    homeDir: HOME,
    sealed: false,
  });
});

test("paths in a settings file resolve against the file's folder; the registry follows the data folder", () => {
  const f = settings({ dataDir: "data", stateDir: "state", configPath: "demo.config.json", port: 7791, homeDir: "D:/studio" });
  const d = path.dirname(f);
  const i = loadInstance(f, { appDir: APP, home: HOME });
  assert.equal(i.projectsDir, path.join(d, "data", "projects"));
  assert.equal(i.registryPath, path.join(d, "data", "coordination", "registry.json")); // never the real ~/.claude registry
  assert.equal(i.cacheFile, path.join(d, "state", ".filecache.v4.json"));
  assert.equal(i.runtimeFile, path.join(d, "state", ".runtime.json"));
  assert.equal(i.configPath, path.join(d, "demo.config.json"));
  assert.equal(i.port, 7791);
  assert.equal(i.homeDir, path.resolve(d, "D:/studio"));
});

test("a settings file that is missing, not JSON, misspelled or mistyped stops the start; it never falls back to the defaults", () => {
  const opts = { appDir: APP, home: HOME };
  assert.throws(() => loadInstance(path.join(tmp(), "nope.json"), opts), /settings nope\.json/);
  assert.throws(() => loadInstance(settings("{ not json"), opts), /settings s\.json: not readable JSON/);
  assert.throws(() => loadInstance(tmp(), opts), /cannot be read \(EISDIR\)/); // a folder, not a file: the code, not "not readable JSON"
  assert.throws(() => loadInstance(settings([]), opts), /not a JSON object/);
  assert.throws(() => loadInstance(settings({ datadir: "x" }), opts), /unknown key "datadir"/);
  assert.throws(() => loadInstance(settings({ dataDir: 7 }), opts), /dataDir must be a path/);
  assert.throws(() => loadInstance(settings({ port: "7791" }), opts), /port must be/);
  assert.throws(() => loadInstance(settings({ port: 70000 }), opts), /port must be/);
  assert.throws(() => loadInstance(settings({ sealed: "yes" }), opts), /sealed must be/);
});

test("error messages name the settings file, never its folder", () => {
  const f = settings({ datadir: "x" });
  assert.throws(() => loadInstance(f, { appDir: APP, home: HOME }), (e) => !e.message.includes(path.dirname(f)));
});

test("--settings takes the next argument; without it there is no settings file", () => {
  assert.equal(settingsPath(["node", "server.js"]), null);
  assert.equal(settingsPath(["node", "server.js", "--settings", "x.json"]), path.resolve("x.json"));
  assert.throws(() => settingsPath(["node", "server.js", "--settings"]), /needs a file path/);
  assert.throws(() => settingsPath(["node", "server.js", "--settings", "--other"]), /needs a file path/);
});

test("a flag that only starts with --settings is a mistake, never a settings file; other flags are not this module's business", () => {
  assert.throws(() => settingsPath(["node", "server.js", "--settings=x.json"]), /needs a file path/);
  assert.throws(() => settingsPath(["node", "server.js", "--settingsx", "x.json"]), /needs a file path/);
  assert.equal(settingsPath(["node", "server.js", "--other", "x.json"]), null);
});

test("inside: a folder and its children are inside; a sibling with the same prefix is not", () => {
  const h = path.resolve("/Users/me");
  assert.ok(inside(h, h));
  assert.ok(inside(path.join(h, ".claude", "projects"), h));
  assert.ok(inside(path.join(h, "..foo"), h)); // a folder named "..foo" is still a child
  assert.ok(!inside(path.resolve("/Users/me2/data"), h));
  assert.ok(!inside(path.resolve("/Users"), h));
  if (process.platform === "win32") assert.ok(inside("C:\\USERS\\ME\\data", "C:\\Users\\me"));
});

test("a sealed copy refuses data, registry or state inside the user folder or state inside the app folder, and needs its own config and state", () => {
  const home = tmp(), out = tmp();
  const opts = { appDir: APP, home };
  const ok = { sealed: true, dataDir: path.join(out, "data"), stateDir: path.join(out, "state"), configPath: path.join(out, "c.json") };
  assert.equal(loadInstance(settings(ok), opts).sealed, true);
  assert.throws(() => loadInstance(settings({ ...ok, configPath: undefined }), opts), /a sealed copy names its configPath/);
  assert.throws(() => loadInstance(settings({ ...ok, stateDir: undefined }), opts), /a sealed copy names its stateDir/);
  assert.throws(() => loadInstance(settings({ ...ok, stateDir: path.join(APP, "state") }), opts), /stateDir must not be inside the app folder/);
  assert.throws(() => loadInstance(settings({ ...ok, dataDir: path.join(home, ".claude") }), opts), /sealed, but dataDir is inside the user folder/);
  assert.throws(() => loadInstance(settings({ ...ok, registryPath: path.join(home, ".claude", "coordination", "registry.json") }), opts), /sealed, but registryPath is inside the user folder/);
  assert.throws(() => loadInstance(settings({ ...ok, stateDir: home }), opts), /sealed, but stateDir is inside the user folder/);
});

test("a sealed copy follows a link to where a folder really is", () => {
  const home = tmp(), out = tmp();
  fs.mkdirSync(path.join(home, "inner"));
  fs.symlinkSync(path.join(home, "inner"), path.join(out, "link"), "junction");
  const s = settings({ sealed: true, dataDir: path.join(out, "link", "data"), stateDir: path.join(out, "state"), configPath: path.join(out, "c.json") });
  assert.throws(() => loadInstance(s, { appDir: APP, home }), /sealed, but dataDir is inside the user folder/);
});

test("a sealed copy whose config reads a heartbeat inside the user folder refuses, naming the agent, never a path", () => {
  const home = tmp(), out = tmp();
  const s = settings({ sealed: true, dataDir: path.join(out, "data"), stateDir: path.join(out, "state"), configPath: path.join(out, "c.json") });
  const inst = loadInstance(s, { appDir: APP, home });
  const inHome = path.join(home, "my-agents", "heartbeat", "scout.json");
  const config = { agents: [{ id: "research-analyst", heartbeat: path.join(out, "beats", "analyst.json") }, { id: "research-scout", heartbeat: inHome }, { id: "seo" }] };
  assert.throws(() => sealedConfig(s, inst, config, home), (e) => {
    assert.equal(e.message, 'settings s.json: sealed, but agent "research-scout" reads a heartbeat inside the user folder');
    assert.ok(!e.message.includes(home) && !e.message.includes(inHome) && !e.message.includes(path.basename(home)), "no path, not even the folder's name");
    return true;
  });
  // a link out of the copy's own folder into the user folder is followed, as for dataDir
  fs.mkdirSync(path.join(home, "inner"));
  fs.symlinkSync(path.join(home, "inner"), path.join(out, "link"), "junction");
  assert.throws(() => sealedConfig(s, inst, { agents: [{ id: "linked", heartbeat: path.join(out, "link", "a.json") }] }, home), /sealed, but agent "linked" reads a heartbeat inside the user folder/);
  // outside the user folder, or a copy that is not sealed: no objection
  sealedConfig(s, inst, { agents: [config.agents[0], config.agents[2]] }, home);
  sealedConfig(null, loadInstance(null, { appDir: APP, home }), config, home);
});

test("a heartbeat whose place cannot be checked stops a sealed copy with its own line, naming the agent, never a path", () => {
  const home = tmp(), out = tmp();
  const s = settings({ sealed: true, dataDir: path.join(out, "data"), stateDir: path.join(out, "state"), configPath: path.join(out, "c.json") });
  const inst = loadInstance(s, { appDir: APP, home });
  const locked = path.join(out, "locked");
  fs.mkdirSync(locked);
  const orig = fs.realpathSync.native;
  fs.realpathSync.native = function (p, ...a) {
    if (path.resolve(String(p)) === locked) throw Object.assign(new Error(`EACCES: permission denied, realpath '${p}'`), { code: "EACCES" });
    return orig.call(this, p, ...a);
  };
  try {
    assert.throws(() => sealedConfig(s, inst, { agents: [{ id: "research-scout", heartbeat: path.join(locked, "scout.json") }] }, home), (e) => {
      assert.equal(e.message, 'settings s.json: sealed, but the heartbeat of agent "research-scout" cannot be checked (EACCES)');
      assert.equal(e.code, undefined, "no code, so the start never reports it as a configPath problem");
      assert.ok(!e.message.includes(out) && !e.message.includes(path.basename(out)), "no path, not even the folder's name");
      return true;
    });
  } finally {
    fs.realpathSync.native = orig;
  }
});

test("a sealed copy follows a junction at its projects folder into the user folder and refuses it", () => {
  const home = tmp(), out = tmp();
  fs.mkdirSync(path.join(home, "inner"));
  fs.mkdirSync(path.join(out, "data"));
  fs.symlinkSync(path.join(home, "inner"), path.join(out, "data", "projects"), "junction");
  const s = settings({ sealed: true, dataDir: path.join(out, "data"), stateDir: path.join(out, "state"), configPath: path.join(out, "c.json") });
  assert.throws(() => loadInstance(s, { appDir: APP, home }), /sealed, but projectsDir is inside the user folder/);
});
