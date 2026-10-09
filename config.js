// Loads hq.config.json (the only place identity lives), falling back to the neutral example.
// The floor has room for 5 departments of 5 desks, so anything beyond that is an error.
const fs = require("fs");
const path = require("path");
const MAX_DEPTS = 5;
const MAX_PER_DEPT = 5;

function validateConfig(c) {
  if (!c || typeof c !== "object") return ["the config is not a JSON object"];
  const errs = [];
  if (!c.appName) errs.push("appName is required");
  if (typeof c.planUsd !== "number" || c.planUsd < 0) errs.push("planUsd must be a number");
  const depts = Array.isArray(c.departments) ? c.departments : [];
  if (!depts.length) errs.push("departments must list at least one department");
  if (depts.length > MAX_DEPTS) errs.push(`at most ${MAX_DEPTS} departments fit the floor (got ${depts.length})`);
  const names = new Set(depts.map((d) => d.name));
  if (names.size !== depts.length) errs.push("department names must be unique");
  const ids = new Set();
  const hangouts = new Map();
  const per = {};
  for (const a of Array.isArray(c.agents) ? c.agents : []) {
    if (!a.id) { errs.push("every agent needs an id"); continue; }
    if (ids.has(a.id)) errs.push(`duplicate agent id "${a.id}"`);
    ids.add(a.id);
    if (!names.has(a.dept)) errs.push(`agent "${a.id}" names unknown department "${a.dept}"`);
    per[a.dept] = (per[a.dept] || 0) + 1;
    if (a.hangout && hangouts.has(a.hangout)) errs.push(`agents "${hangouts.get(a.hangout)}" and "${a.id}" share the hangout "${a.hangout}"`);
    if (a.hangout) hangouts.set(a.hangout, a.id);
    // work that is not a subagent: live sessions by board name (exact, or a trailing *), and a heartbeat file
    if (a.sessions !== undefined && !(Array.isArray(a.sessions) && a.sessions.every((p) => typeof p === "string"))) errs.push(`agent "${a.id}" sessions must be a list of names`);
    if (a.heartbeat !== undefined && !(typeof a.heartbeat === "string" && a.heartbeat)) errs.push(`agent "${a.id}" heartbeat must be a file path`);
  }
  for (const d in per) if (per[d] > MAX_PER_DEPT) errs.push(`department "${d}" has ${per[d]} agents; its room holds ${MAX_PER_DEPT} desks`);
  if (!Array.isArray(c.sessionAvatars) || !c.sessionAvatars.length) errs.push("sessionAvatars must list at least one look");
  return errs;
}

// With a named file (a copy's own config), exactly that file is read: no fallback to the owner's.
// A relative heartbeat path resolves against the config file's own folder.
function loadConfig(dir = __dirname, file = null) {
  const own = path.join(dir, "hq.config.json");
  if (!file) file = fs.existsSync(own) ? own : path.join(dir, "hq.config.example.json");
  const c = JSON.parse(fs.readFileSync(file, "utf8"));
  const errs = validateConfig(c);
  if (errs.length) throw new Error(`${path.basename(file)}: ${errs.join("; ")}`);
  for (const a of c.agents || []) if (a.heartbeat) a.heartbeat = path.resolve(path.dirname(file), a.heartbeat);
  return c;
}

module.exports = { loadConfig, validateConfig, MAX_DEPTS, MAX_PER_DEPT };
