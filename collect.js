// Indexes <data>/projects/**/*.jsonl (by default ~/.claude/projects) into dashboard stats.
// Async + incremental: per-file results are cached in memory AND on disk
// (keyed by mtime+size), so old/unchanged transcripts are never re-parsed
// across server restarts. Only new/active files are read on each refresh,
// and a file that only grew is read from where its last read ended.
// The tree is walked whole once, at startup; after that a recursive watch
// names the files that changed, and a slice of the tree is re-checked each
// tick as the safety net, so an idle tick never stats every transcript.
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const os = require("os");
const { costForUsage, priceFor } = require("./pricing");
const { clip } = require("./lib/session");
const { CACHE_NAME } = require("./lib/instance");
const { newCursor, readNew, fileId, CHUNK } = require("./lib/tail");

const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const CACHE_FILE = path.join(__dirname, CACHE_NAME); // v4: the per-agent breakdown (main thread, inline subagents) rides with each file
const SLOT = 15 * 60e3;
const SLOT_KEEP = 8 * 86400e3; // a parse keeps 8 days of slots, enough for any 7-day window read later
const WALK_OPS = 200; // directory reads and stats the reconciling walk makes per tick: the whole tree about every 20 ticks
const FOLD_VERSION = 1; // stamped into each fold state: bump it when the parse or pricing.js changes, so a cached fold is read whole once
const GUARD = 64; // the bytes before a fold's offset it reads back first, to check the file was not rewritten in place

let memCache = new Map(); // fp -> { mtimeMs, size, data, meta, off, fid, chk, fold } (the last four: see readTranscript)
let diskLoaded = false;
let lastSave = 0;
// The live index of one root: the transcripts on disk with their place in the tree, the files the watcher has
// touched since the last tick, and the reconciling walk in flight. One root at a time (the server has one).
let index = null;

// Claude Code names a project folder after its path with each of : \ / and . turned into "-".
const encode = (p) => String(p).replace(/[:\\/.]/g, "-");
function projectName(key, home = os.homedir()) {
  const hk = encode(home);
  if (key === hk) return "Home";
  if (!key.startsWith(hk + "-")) return key;
  return key.slice(hk.length + 1).replace(/^-+/, "") || "Home";
}
// The two meta fields the panels show; a subagent's meta file is read once, when its transcript is parsed.
function readMeta(fp) {
  try {
    const m = JSON.parse(fs.readFileSync(fp.replace(/\.jsonl$/, ".meta.json"), "utf8"));
    return { agentType: m.agentType || null, description: m.description || null };
  } catch {
    return null;
  }
}
// The live panel's label for a subagent: its description when known, else its id.
function subagentLabel(fp, meta) {
  const id = path.basename(fp, ".jsonl").replace(/^agent-/, "").slice(0, 8);
  return meta && meta.description ? clip(meta.description, 60) : "subagent " + id;
}
function ymd(d) {
  return d.toISOString().slice(0, 10);
}
const bucket = () => ({ out: 0, fin: 0, cread: 0, cwrite: 0, tools: 0, cost: 0 });

function loadDiskCache(file) {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
    const obj = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const fp in obj) memCache.set(fp, obj[fp]);
  } catch {}
}
async function saveDiskCache(file, force) {
  const now = Date.now();
  if (!force && now - lastSave < 30000) return;
  lastSave = now;
  const obj = {};
  for (const [fp, v] of memCache) obj[fp] = v;
  try {
    await fsp.writeFile(file, JSON.stringify(obj)); // async: don't block the event loop
  } catch {}
}

// Parse one transcript's text into an additive contribution object. One response is written
// as several lines (one per content block) that share a message.id. In main transcripts every
// line repeats the same usage; in subagent transcripts the early lines are streaming placeholders
// and only the last line carries the final output_tokens. So a response is billed once, from the
// usage on its last line, while tool calls are counted on every line. `slots` holds
// [actions, cost] per 15-minute slot start (epoch ms) for the last 8 days before `now`.
// `agents` splits the same responses by the first line's isSidechain into the main thread and the
// inline subagents (the active session's per-agent table), so no tick has to read the file again.
// The parse is a fold, so a growing transcript is read once: `newFold()` is the state before the first
// line, `foldLines` adds complete lines, and `viewOf` gives what a whole parse returns for them plus the
// bytes after the last newline. Lines share only the open response (`run`, with the tool names it wrote
// in `pending`), so that and the sums are all a fold carries; the open response is billed in the view,
// never in the state, because its later lines may still come. A state slot is [actions, cost, first,
// last], the last two the earliest and latest offset into the slot it was touched at, so a later `now`
// can cut the 8-day window exactly; `cut` is the latest window start the state was built under.
function newFold() {
  return { v: FOLD_VERSION, data: { cost: 0, tokens: 0, cacheSaved: 0, days: {}, models: {}, tools: {}, toolDays: {}, slots: {}, agents: { main: bucket(), side: bucket() } }, run: null, pending: [], cut: 0 };
}
function slotOf(f, ts, now) {
  const ms = Date.parse(ts);
  if (!(ms >= now - SLOT_KEEP)) return null; // also rejects a missing or bad timestamp
  const k = Math.floor(ms / SLOT) * SLOT;
  const at = ms - k;
  const s = f.data.slots[k];
  if (!s) return (f.data.slots[k] = [0, 0, at, at]);
  if (at < s[2]) s[2] = at;
  if (at > s[3]) s[3] = at;
  return s;
}
// Bill the open response once, from the usage on its latest line, then its tools: they carry only its
// OUTPUT (generation) cost, since tool_use blocks are output.
function flushRun(f, now) {
  const run = f.run; // { id, model, timestamp, usage, side }
  if (!run) return;
  const data = f.data;
  const { model, timestamp, usage } = run;
  const agent = run.side ? data.agents.side : data.agents.main;
  const r = costForUsage(model, usage);
  data.cost += r.cost;
  data.tokens += r.tokens || 0;
  data.cacheSaved += r.cacheSaved || 0;
  if (timestamp) {
    const d = String(timestamp).slice(0, 10);
    data.days[d] = (data.days[d] || 0) + r.cost;
    const s = slotOf(f, timestamp, now);
    if (s) s[1] += r.cost;
  }
  const m = data.models[model] || (data.models[model] = { tokens: 0, cost: 0 });
  m.tokens += r.tokens || 0;
  m.cost += r.cost;
  agent.out += usage.output_tokens || 0;
  agent.fin += usage.input_tokens || 0;
  agent.cread += usage.cache_read_input_tokens || 0;
  agent.cwrite += usage.cache_creation_input_tokens || 0;
  agent.cost += r.cost;
  const p = priceFor(model);
  const pendingOut = p ? ((usage.output_tokens || 0) * p.out) / 1e6 : 0;
  const each = f.pending.length ? pendingOut / f.pending.length : 0;
  for (const name of f.pending) {
    const t = data.tools[name] || (data.tools[name] = { count: 0, cost: 0 });
    t.count += 1;
    t.cost += each;
  }
  f.pending = [];
  f.run = null;
}
function foldLine(f, line, now) {
  if (!line) return;
  let rec;
  try {
    rec = JSON.parse(line);
  } catch {
    return;
  }
  if (rec.type !== "assistant" || !rec.message || !rec.message.usage) return;
  const side = !!rec.isSidechain;
  const agent = side ? f.data.agents.side : f.data.agents.main;
  const id = rec.message.id || null;
  if (!f.run || !id || id !== f.run.id) {
    flushRun(f, now);
    f.run = { id, model: rec.message.model || "unknown", timestamp: rec.timestamp, usage: rec.message.usage, side };
  } else f.run.usage = rec.message.usage;
  const content = rec.message.content;
  if (Array.isArray(content))
    for (const b of content) {
      if (!b || b.type !== "tool_use") continue;
      f.pending.push(b.name || "unknown");
      agent.tools += 1;
      if (rec.timestamp) {
        const d = String(rec.timestamp).slice(0, 10);
        f.data.toolDays[d] = (f.data.toolDays[d] || 0) + 1;
        const s = slotOf(f, rec.timestamp, now);
        if (s) s[0] += 1;
      }
    }
}
// Fold complete lines in at `now`. A slot whose last timestamp is before the window start is dropped: the
// start only moves forward (a clock that went back is caught by viewOf), so no view can need it again.
function foldLines(f, lines, now) {
  if (now - SLOT_KEEP > f.cut) f.cut = now - SLOT_KEEP;
  for (const k in f.data.slots) if (+k + f.data.slots[k][3] < f.cut) delete f.data.slots[k];
  for (const line of lines) foldLine(f, line, now);
}
// Whether a view at `now` can be cut from the state exactly. Not when another version of this parse made the
// state (its sums may follow other rules or prices), when the window starts earlier than one the state was built
// under (the clock went back, so a row the state cut would count again), or between the first and last timestamp
// of a slot (the slot's sums cannot be split). Rows folded in at `now` cannot change the answer: their timestamps
// are all inside the window, so it is known before anything is read.
function cuttable(f, now) {
  if (f.v !== FOLD_VERSION) return false;
  const c = now - SLOT_KEEP;
  if (c < f.cut) return false;
  for (const k in f.data.slots) if (+k + f.data.slots[k][2] < c && +k + f.data.slots[k][3] >= c) return false;
  return true;
}
// What a whole parse at `now` returns for the folded lines followed by `tail`, the bytes after the last
// newline (a whole parse tries those as a line too); null when the state cannot give it exactly.
function viewOf(f, tail, project, now) {
  if (!cuttable(f, now)) return null;
  const v = structuredClone(f);
  for (const k in v.data.slots) if (+k + v.data.slots[k][3] < now - SLOT_KEEP) delete v.data.slots[k]; // all of it has left the window
  foldLine(v, tail, now);
  flushRun(v, now);
  for (const k in v.data.slots) v.data.slots[k].length = 2;
  return { project, ...v.data };
}
function parseFileText(raw, project, now = Date.now()) {
  const lines = raw ? raw.split("\n") : [];
  const tail = lines.length ? lines.pop() : "";
  const f = newFold();
  foldLines(f, lines, now);
  return viewOf(f, tail, project, now);
}
// Fold the lines `fp` holds after byte `off` into a copy of `fold` and view the result, reading through
// lib/tail.js a chunk per turn of the event loop; `chk` (base64) is the bytes just before `off` that must still
// be there. Null when the view cannot be cut exactly (checked before any read), or the file could not be read,
// was replaced or truncated since the stat, or was rewritten in place.
async function foldFrom(fp, project, fold, off, fid, chk, now) {
  if (!cuttable(fold, now)) return null;
  const f = structuredClone(fold); // the cached state stays as it was whatever happens here
  let cursor = { ...newCursor(), pos: off, id: fid, check: Buffer.from(chk, "base64") };
  for (;;) {
    const r = readNew(fp, cursor, CHUNK, { trim: false, guard: GUARD });
    if (r.reset || r.failed) return null;
    foldLines(f, r.lines, now);
    cursor = r.cursor;
    if (!r.more) break;
    await new Promise((next) => setImmediate(next));
  }
  const data = viewOf(f, cursor.rest.toString("utf8"), project, now);
  return data && { data, off: cursor.pos - cursor.rest.length, fid: cursor.id, chk: cursor.check.toString("base64"), fold: f };
}
// A changed transcript's cache entry. `off` is the byte offset just after its last complete line, `fid` the
// file it was read from (lib/tail.js fileId), `chk` the GUARD bytes before `off`, and `fold` the state after
// that line. A file that only grew (the same file, larger than at its last read, still holding `chk` before
// `off`) has only the bytes after `off` read and folded in, so a live transcript costs what it gained.
// Anything else is read whole and parsed from the first line: a file that shrank, kept its size, was replaced
// or rewritten in place, an entry cached before offsets were kept, a read that failed or met a replaced file,
// and a state viewOf cannot cut exactly (another FOLD_VERSION included). When nothing can be read, a cached
// entry is kept as it was, its old mtime and size too, so the next refresh tries again; with none, an empty parse.
async function readTranscript(fp, project, cached, st, now = Date.now()) {
  const grew = cached && cached.fold && cached.off != null && cached.chk != null && cached.fid === fileId(st) && st.size > cached.size;
  const r =
    (grew && (await foldFrom(fp, project, cached.fold, cached.off, cached.fid, cached.chk, now))) ||
    (await foldFrom(fp, project, newFold(), 0, null, "", now));
  if (r) return { mtimeMs: st.mtimeMs, size: st.size, ...r };
  if (cached) return cached;
  return { mtimeMs: st.mtimeMs, size: st.size, data: parseFileText("", project, now), off: 0, fid: fileId(st), chk: "", fold: newFold() };
}

// A transcript's place in the tree, from its path: <root>/<project>/<sessionId>.jsonl is a main transcript
// (depth 0); anything deeper belongs to the session folder it sits under. The project is labeled under the
// index's home, so a session the watch finds later reads the same as one the walk found.
function fileInfo(root, fp, home) {
  const parts = path.relative(root, fp).split(path.sep);
  if (parts.length < 2 || !fp.endsWith(".jsonl") || parts[0] === "..") return null;
  const depth = parts.length - 2;
  return { fp, project: projectName(parts[0], home), depth, dir: path.dirname(fp), sessionId: depth === 0 ? path.basename(fp, ".jsonl") : parts[1] };
}
function dropFile(S, fp) {
  const had = S.files.delete(fp);
  if (memCache.delete(fp) || had) S.changed++;
}
// Stat one transcript and bring its cache entry up to date; only a changed file is read.
async function refreshFile(S, fp, info) {
  let st;
  try {
    st = await fsp.stat(fp);
  } catch {
    return dropFile(S, fp);
  }
  if (!st.isFile()) return dropFile(S, fp);
  const f = info || S.files.get(fp) || fileInfo(S.root, fp, S.home);
  if (!f) return;
  const cached = memCache.get(fp);
  let data, meta, read = cached;
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
    data = cached.data;
    meta = cached.meta;
    if (meta === undefined && f.depth > 0) {
      meta = readMeta(fp); // a subagent entry cached before meta was kept: read once, then carried
      S.filled++;
    }
    if (data.project !== f.project) data.project = f.project; // a label cached under an older naming rule
  } else {
    read = await readTranscript(fp, f.project, cached, st);
    data = read.data;
    meta = f.depth > 0 ? readMeta(fp) : undefined;
    S.parsed++;
  }
  // the mtime and size of what was parsed (a kept entry's own, so a refresh that could not read tries again); an
  // entry cached before offsets has no off, fid, chk or fold, and is read whole once
  memCache.set(fp, { mtimeMs: read.mtimeMs, size: read.size, data, meta, off: read.off, fid: read.fid, chk: read.chk, fold: read.fold });
  if (!S.files.has(fp)) S.changed++;
  S.files.set(fp, { fp, project: f.project, depth: f.depth, dir: f.dir, sessionId: f.sessionId, mtimeMs: st.mtimeMs });
  if (S.seen) S.seen.add(fp);
}
// One pass over the whole tree, one filesystem call per step: every directory read, then every transcript
// stat'ed (yielding its progress), then whatever the pass never met is dropped. The first pass runs whole;
// later passes advance WALK_OPS steps a tick, so a lost watch event is caught within about 20 ticks.
async function* walkPass(S) {
  S.seen = new Set();
  const all = [];
  let pdirs = [];
  try {
    pdirs = await fsp.readdir(S.root, { withFileTypes: true });
  } catch {}
  yield null;
  async function* walk(dir, project, depth, sid) {
    let entries;
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    yield null;
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) yield* walk(full, project, depth + 1, depth === 0 ? e.name : sid);
      else if (e.isFile() && e.name.endsWith(".jsonl"))
        all.push({ fp: full, project, depth, dir, sessionId: depth === 0 ? path.basename(e.name, ".jsonl") : sid });
    }
  }
  for (const pd of pdirs) if (pd.isDirectory()) yield* walk(path.join(S.root, pd.name), projectName(pd.name, S.home), 0, null);
  for (let i = 0; i < all.length; i++) {
    await refreshFile(S, all[i].fp, all[i]);
    yield { done: i + 1, total: all.length };
  }
  for (const fp of [...memCache.keys()]) if (!S.seen.has(fp)) dropFile(S, fp); // gone (or only in the disk cache), and not re-added by the watcher meanwhile
  S.seen = null;
}
// The recursive watch names every transcript written, created or removed under the root (Windows, macOS and
// Linux all support it) without a stat of anything else. A null name means the OS dropped events, and an error
// means the watch is gone: either way the next tick walks the whole tree, which also restarts the watch.
function watchRoot(S) {
  if (S.watcher) return;
  try {
    const w = fs.watch(S.root, { recursive: true, persistent: false }, (ev, name) => {
      if (name == null) S.walkNow = true;
      else if (String(name).endsWith(".jsonl")) S.dirty.add(path.join(S.root, String(name)));
    });
    w.on("error", () => {
      try {
        w.close();
      } catch {}
      S.watcher = null;
      S.walkNow = true;
    });
    S.watcher = w;
  } catch (e) {
    S.walkNow = true;
    if (!S.warned) {
      S.warned = true;
      console.warn(`HQ: cannot watch ${S.root} (${e.message}); walking it every tick instead`);
    }
  }
}
function resetIndex() {
  if (index && index.watcher) {
    try {
      index.watcher.close();
    } catch {}
  }
  index = null;
  memCache = new Map();
  diskLoaded = false;
  lastSave = 0; // the save throttle belongs to the old cache file; a new index's first save is never held back by it
}

// Refresh the cache and return the index. The first call walks the whole tree (reporting progress); each
// later call re-checks the files the watch named plus a slice of the tree, so its cost follows what changed.
// `cacheFile` is where the parse cache is loaded from and saved to: by default the app folder's for the
// default projects folder, and none for any other root (a test root never touches the disk cache). `home`
// is the user folder the project folders are named under, so a copy labels projects under its own home.
async function buildIndex(onProgress, root = PROJECTS_DIR, { cacheFile = root === PROJECTS_DIR ? CACHE_FILE : null, home = os.homedir() } = {}) {
  if (!index || index.root !== root || index.cacheFile !== cacheFile || index.home !== home) {
    resetIndex();
    index = { root, cacheFile, home, files: new Map(), dirty: new Set(), pass: null, seen: null, watcher: null, walkNow: true, warned: false, parsed: 0, filled: 0, changed: 0 };
  }
  const S = index;
  if (S.cacheFile) loadDiskCache(S.cacheFile);
  S.parsed = 0;
  S.filled = 0;
  S.changed = 0;
  watchRoot(S);
  const full = S.walkNow;
  if (full) {
    S.walkNow = false;
    S.pass = walkPass(S);
  } else {
    const touched = [...S.dirty];
    S.dirty.clear();
    for (const fp of touched) await refreshFile(S, fp);
  }
  if (!S.pass) S.pass = walkPass(S);
  for (let i = 0; full || i < WALK_OPS; i++) {
    const r = await S.pass.next();
    if (r.done) {
      S.pass = null;
      break;
    }
    if (full && r.value && onProgress && (r.value.done & 31) === 0) onProgress(r.value.done, r.value.total);
    if (full && (i & 31) === 0) await new Promise((next) => setImmediate(next)); // yield so the server stays responsive
  }
  const mains = [];
  const subMtime = {}; // sessionId -> newest subagent-file mtime
  const subs = [];
  for (const f of S.files.values()) {
    if (f.depth === 0) mains.push({ fp: f.fp, dir: f.dir, sessionId: f.sessionId, mtimeMs: f.mtimeMs, project: f.project });
    else {
      // subagent files live in <sessionId>/subagents/agent-*.jsonl (older ones in <sessionId>/)
      subMtime[f.sessionId] = Math.max(subMtime[f.sessionId] || 0, f.mtimeMs);
      subs.push({ fp: f.fp, sessionId: f.sessionId, mtimeMs: f.mtimeMs, meta: (memCache.get(f.fp) || {}).meta || null });
    }
  }
  if (S.cacheFile && (S.parsed > 0 || S.filled > 0 || S.changed > 0)) await saveDiskCache(S.cacheFile, S.parsed > 20);
  if (full && onProgress) onProgress(S.files.size, S.files.size);
  return { mains, subMtime, subs };
}

// Aggregate the cached per-file data into the dashboard payload (synchronous, fast).
function computeStats(mains, subMtime, planUsd, subs) {
  const allDays = {}, allToolDays = {}, allSlots = {}, byProject = {}, byModel = {}, byTool = {};
  let totalCost = 0, totalTokens = 0, cacheSaved = 0;
  for (const { data } of memCache.values()) {
    totalCost += data.cost;
    totalTokens += data.tokens;
    cacheSaved += data.cacheSaved;
    const bp = byProject[data.project] || (byProject[data.project] = { cost: 0, tokens: 0 });
    bp.cost += data.cost;
    bp.tokens += data.tokens;
    for (const d in data.days) allDays[d] = (allDays[d] || 0) + data.days[d];
    for (const d in data.toolDays) allToolDays[d] = (allToolDays[d] || 0) + data.toolDays[d];
    for (const k in data.slots || {}) {
      const s = allSlots[k] || (allSlots[k] = [0, 0]);
      s[0] += data.slots[k][0];
      s[1] += data.slots[k][1];
    }
    for (const m in data.models) {
      const t = byModel[m] || (byModel[m] = { tokens: 0, cost: 0 });
      t.tokens += data.models[m].tokens;
      t.cost += data.models[m].cost;
    }
    for (const n in data.tools) {
      const t = byTool[n] || (byTool[n] = { count: 0, cost: 0 });
      t.count += data.tools[n].count;
      t.cost += data.tools[n].cost;
    }
  }

  const now = new Date();
  const todayStr = ymd(now);
  const monthPrefix = todayStr.slice(0, 7);
  const last30 = [];
  for (let i = 29; i >= 0; i--)
    last30.push({ date: ymd(new Date(now.getTime() - i * 86400000)), cost: 0, tools: 0 });
  const idx = {};
  last30.forEach((d, i) => (idx[d.date] = i));
  for (const k in allDays) if (idx[k] !== undefined) last30[idx[k]].cost = allDays[k];
  for (const k in allToolDays) if (idx[k] !== undefined) last30[idx[k]].tools = allToolDays[k];
  const today = allDays[todayStr] || 0;
  let monthToDate = 0;
  for (const k in allDays) if (k.startsWith(monthPrefix)) monthToDate += allDays[k];
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  const projMonth = dayOfMonth > 0 ? (monthToDate / dayOfMonth) * daysInMonth : 0;

  let active = null;
  if (mains.length) {
    subMtime = subMtime || {};
    const eff = (x) => Math.max(x.mtimeMs, subMtime[x.sessionId] || 0); // count subagent writes
    const m = mains.reduce((a, b) => (eff(b) > eff(a) ? b : a));
    // the per-agent breakdown rides in each file's cache entry: nothing is read here
    const agentsOf = (fp) => {
      const c = memCache.get(fp);
      return (c && c.data.agents) || { main: bucket(), side: bucket() };
    };
    const agents = [];
    const A = agentsOf(m.fp);
    const row = (label, x) => ({ label, out: x.out, fin: x.fin, cread: x.cread, cwrite: x.cwrite, tools: x.tools, cost: x.cost });
    agents.push(row("main thread", A.main));
    if (A.side.out > 0 || A.side.tools > 0) agents.push(row("inline subagents", A.side));
    // the session's own subagent files, in a directory listing's order: <sessionId>/ first, then <sessionId>/subagents/
    const sdir = path.join(m.dir, m.sessionId), sub2 = path.join(sdir, "subagents");
    const mine = (subs || []).filter((s) => s.sessionId === m.sessionId && (path.dirname(s.fp) === sdir || path.dirname(s.fp) === sub2));
    mine.sort((a, b) => (path.dirname(a.fp) === sub2) - (path.dirname(b.fp) === sub2) || (a.fp < b.fp ? -1 : a.fp > b.fp ? 1 : 0));
    for (const s of mine) {
      const a = agentsOf(s.fp);
      agents.push({
        label: subagentLabel(s.fp, s.meta),
        out: a.main.out + a.side.out,
        fin: a.main.fin + a.side.fin,
        cread: a.main.cread + a.side.cread,
        cwrite: a.main.cwrite + a.side.cwrite,
        tools: a.main.tools + a.side.tools,
        cost: a.main.cost + a.side.cost,
      });
    }
    const total = agents.reduce(
      (o, a) => ({
        out: o.out + a.out, fin: o.fin + a.fin, cread: o.cread + a.cread,
        cwrite: o.cwrite + a.cwrite, tools: o.tools + a.tools, cost: o.cost + a.cost,
      }),
      { out: 0, fin: 0, cread: 0, cwrite: 0, tools: 0, cost: 0 }
    );
    active = { sessionId: m.sessionId, project: m.project, agents, total };
  }

  const models = Object.entries(byModel)
    .filter(([model]) => model !== "<synthetic>" && model !== "unknown")
    .map(([model, v]) => ({ model, ...v }))
    .sort((a, b) => b.cost - a.cost);

  const SLOTS = 672; // 7 days of 15-minute slots, the newest one still filling
  const end = Math.floor(now.getTime() / SLOT) * SLOT;
  const slots = [];
  for (let i = SLOTS - 1; i >= 0; i--) {
    const t = end - i * SLOT;
    const s = allSlots[t] || [0, 0];
    slots.push({ t, tools: s[0], cost: s[1] });
  }

  return {
    generatedAt: now.toISOString(),
    plan: planUsd,
    totals: { cost: totalCost, tokens: totalTokens, cacheSaved },
    today,
    monthToDate,
    projMonth,
    savedVsApi: monthToDate - planUsd,
    toolsToday: allToolDays[todayStr] || 0,
    last30,
    byProject: Object.entries(byProject)
      .map(([project, v]) => ({ project, ...v }))
      .sort((a, b) => b.cost - a.cost),
    byModel: models,
    byTool: Object.entries(byTool)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 14),
    active,
    activity: { slots, days: last30 },
  };
}

module.exports = { buildIndex, computeStats, parseFileText, readTranscript, projectName, subagentLabel, resetIndex, WALK_OPS };
