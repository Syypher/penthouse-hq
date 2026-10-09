const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { loadConfig, validateConfig } = require("../config");
const EXAMPLE = path.join(__dirname, "..", "hq.config.example.json");
const example = () => JSON.parse(fs.readFileSync(EXAMPLE, "utf8"));

test("the shipped example config is valid", () => {
  assert.deepEqual(validateConfig(example()), []);
});

test("a sixth department is rejected with a clear message", () => {
  const c = example();
  c.departments.push({ name: "Legal", color: "#ffffff" });
  assert.match(validateConfig(c).join(" "), /at most 5 departments fit the floor \(got 6\)/);
});

test("a sixth agent in one department is rejected", () => {
  const c = example();
  for (let i = 0; i < 3; i++) c.agents.push({ id: "x" + i, name: "X", dept: "Product", agentTypes: [], hangout: "window" + i });
  assert.match(validateConfig(c).join(" "), /department "Product" has 6 agents; its room holds 5 desks/);
});

test("duplicate ids, unknown departments and shared hangouts are rejected", () => {
  const c = example();
  c.agents[1].id = c.agents[0].id;
  c.agents[2].dept = "Nowhere";
  c.agents[3].hangout = c.agents[4].hangout;
  const msg = validateConfig(c).join(" ");
  assert.match(msg, /duplicate agent id/);
  assert.match(msg, /unknown department "Nowhere"/);
  assert.match(msg, /share the hangout/);
});

test("an agent may name the live sessions and the heartbeat file that give it work", () => {
  const c = example();
  c.agents[0].sessions = ["research-fixer", "research-*"];
  c.agents[0].heartbeat = "heartbeat/fixer.json";
  c.agents[1].heartbeat = "C:/elsewhere/scout.json"; // a heartbeat alone, no sessions
  assert.deepEqual(validateConfig(c), []);
});

test("sessions that are not a list of names, or a heartbeat that is not a path, is one line each", () => {
  for (const [key, bad, line] of [
    ["sessions", "research-fixer", /^agent "engineer" sessions must be a list of names$/],
    ["sessions", ["research-fixer", 7], /^agent "engineer" sessions must be a list of names$/],
    ["sessions", null, /^agent "engineer" sessions must be a list of names$/],
    ["heartbeat", 7, /^agent "engineer" heartbeat must be a file path$/],
    ["heartbeat", ["a.json"], /^agent "engineer" heartbeat must be a file path$/],
    ["heartbeat", "", /^agent "engineer" heartbeat must be a file path$/],
  ]) {
    const c = example();
    c.agents[0][key] = bad;
    const errs = validateConfig(c);
    assert.equal(errs.length, 1, `${key} = ${JSON.stringify(bad)}: ${errs.join("; ")}`);
    assert.match(errs[0], line);
  }
});

test("a relative heartbeat path resolves against the config file's folder; an absolute one stays", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-cfg-"));
  const c = example();
  c.agents[0].heartbeat = "beats/fixer.json";
  const abs = path.resolve(os.tmpdir(), "elsewhere", "scout.json");
  c.agents[1].heartbeat = abs;
  const named = path.join(dir, "demo.config.json");
  fs.writeFileSync(named, JSON.stringify(c));
  const loaded = loadConfig(os.tmpdir(), named); // the app folder is not the config's folder
  assert.equal(loaded.agents[0].heartbeat, path.join(dir, "beats", "fixer.json"));
  assert.equal(loaded.agents[1].heartbeat, abs);
  assert.equal(loaded.agents[2].heartbeat, undefined);
});

test("loadConfig prefers hq.config.json and falls back to the example", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-"));
  fs.copyFileSync(EXAMPLE, path.join(dir, "hq.config.example.json"));
  assert.equal(loadConfig(dir).appName, "HQ");
  fs.writeFileSync(path.join(dir, "hq.config.json"), JSON.stringify({ ...example(), appName: "Mine" }));
  assert.equal(loadConfig(dir).appName, "Mine");
});

test("a broken config names the file and the problem", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-"));
  fs.writeFileSync(path.join(dir, "hq.config.json"), JSON.stringify({ ...example(), departments: [] }));
  assert.throws(() => loadConfig(dir), /hq\.config\.json: .*at least one department/);
});

test("a named config file is the only one read: a missing one is an error, never a fallback", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-cfg-"));
  fs.writeFileSync(path.join(dir, "hq.config.json"), JSON.stringify({ ...example(), appName: "Owner HQ" }));
  const named = path.join(dir, "demo.config.json");
  fs.writeFileSync(named, JSON.stringify({ ...example(), appName: "Demo" }));
  assert.equal(loadConfig(dir, named).appName, "Demo");
  assert.throws(() => loadConfig(dir, path.join(dir, "missing.json")), /ENOENT/);
  assert.equal(loadConfig(dir).appName, "Owner HQ"); // no file named: today's rule
});
