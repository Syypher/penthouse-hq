const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { parseFileText, projectName, subagentLabel, buildIndex, computeStats, resetIndex, readTranscript, WALK_OPS } = require("../collect");
const { costForUsage, priceFor } = require("../pricing");
const { CACHE_NAME } = require("../lib/instance");
const { fileId } = require("../lib/tail");
const { T0, asst, user, tool, text, jsonl } = require("./helpers");
const fsp = require("fs/promises");

// The per-agent breakdown as 1c8e82f computed it (collect.js parseAgents, deleted in the final fix round): a whole
// read of the file on every tick. Kept verbatim as the reference the cached breakdown must equal.
function referenceAgents(fp) {
  const mk = () => ({ out: 0, fin: 0, cread: 0, cwrite: 0, tools: 0, cost: 0 });
  const res = { main: mk(), side: mk() };
  const raw = fs.readFileSync(fp, "utf8");
  let run = null;
  const flushRun = () => {
    if (!run) return;
    const { model, bucket: b, usage: u } = run;
    const r = costForUsage(model, u);
    b.out += u.output_tokens || 0;
    b.fin += u.input_tokens || 0;
    b.cread += u.cache_read_input_tokens || 0;
    b.cwrite += u.cache_creation_input_tokens || 0;
    b.cost += r.cost;
    run = null;
  };
  for (const line of raw.split("\n")) {
    if (!line) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (rec.type !== "assistant" || !rec.message || !rec.message.usage) continue;
    const b = rec.isSidechain ? res.side : res.main;
    const id = rec.message.id || null;
    if (!run || !id || id !== run.id) {
      flushRun();
      run = { id, model: rec.message.model || "unknown", bucket: b, usage: rec.message.usage };
    } else run.usage = rec.message.usage;
    const c = rec.message.content;
    if (Array.isArray(c)) b.tools += c.filter((x) => x && x.type === "tool_use").length;
  }
  flushRun();
  return res;
}
const row = (label, x) => ({ label, out: x.out, fin: x.fin, cread: x.cread, cwrite: x.cwrite, tools: x.tools, cost: x.cost });
const add = (...xs) => xs.reduce((o, a) => ({ out: o.out + a.out, fin: o.fin + a.fin, cread: o.cread + a.cread, cwrite: o.cwrite + a.cwrite, tools: o.tools + a.tools, cost: o.cost + a.cost }), { out: 0, fin: 0, cread: 0, cwrite: 0, tools: 0, cost: 0 });
const both = (a) => add(a.main, a.side);
const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms)); // the watcher's events land in a few ms; this is the margin
const sortFp = (l) => [...l].sort((a, b) => (a.fp < b.fp ? -1 : 1));
// a stats payload without its clock, and with the three ranked lists in name order where their counts tie
// (ties keep the cache's insertion order, which a watched index and a cold walk fill differently)
const byName = (l, k) => [...l].sort((a, b) => (a[k] < b[k] ? -1 : 1));
const sameStats = (s) => { const { generatedAt, byTool, byProject, byModel, ...rest } = s; return { ...rest, byTool: byName(byTool, "name"), byProject: byName(byProject, "project"), byModel: byName(byModel, "model") }; };
const metaOf = (fp) => fp.replace(/\.jsonl$/, ".meta.json");

test("one response written over several lines is billed once", () => {
  const usage = { output_tokens: 1e6 };
  const raw = jsonl([
    asst({ id: "msg_a", usage, content: [tool("Read", { file_path: "a.js" })] }),
    asst({ id: "msg_a", usage, content: [tool("Edit", { file_path: "a.js" })] }),
    asst({ id: "msg_b", usage: { output_tokens: 0 } }),
  ]);
  const d = parseFileText(raw, "p");
  assert.equal(d.cost, 20); // Opus 5.5 output is $20/MTok, billed once
  assert.equal(d.tools.Read.count, 1);
  assert.equal(d.tools.Edit.count, 1);
  assert.equal(d.tools.Read.cost + d.tools.Edit.cost, 20);
});

test("tool calls are counted per UTC day", () => {
  const raw = jsonl([asst({ id: "m1", content: [tool("Bash", { command: "ls", description: "List files" }), tool("Grep", {})] })]);
  assert.equal(parseFileText(raw, "p").toolDays["2026-10-05"], 2);
});

test("the last 8 days keep actions and cost per 15-minute slot; older activity is dropped", () => {
  const raw = jsonl([
    asst({ sec: 0, id: "m1", usage: { output_tokens: 1e6 }, content: [tool("Read", {}), tool("Grep", {})] }),
    asst({ sec: 0, id: "m1", usage: { output_tokens: 1e6 }, content: [tool("Edit", {})] }),
    asst({ sec: -9 * 86400, id: "m0", content: [tool("Read", {})] }),
  ]);
  assert.deepEqual(parseFileText(raw, "p", T0 + 60e3).slots, { [T0]: [3, 20] }); // T0 is 12:00 UTC, a slot start
});

test("a response whose early lines are streaming placeholders is billed by its last line, once", () => {
  // subagent transcripts write output_tokens growing from the first line to the last
  const raw = jsonl([
    asst({ id: "msg_s", usage: { output_tokens: 7 }, content: [tool("Read", {})] }),
    asst({ id: "msg_s", usage: { output_tokens: 1e6 }, content: [text("done")] }),
  ]);
  const d = parseFileText(raw, "p");
  assert.equal(d.cost, 20); // Opus 5.5 output is $20/MTok, the final usage billed once
  assert.equal(d.days["2026-10-05"], 20);
  assert.equal(d.models["claude-opus-5-5"].cost, 20);
  assert.equal(d.tools.Read.cost, 20); // the tool carries the response's final output cost
});

test("a project label is the folder under home, Home for home itself; other roots stay as they are", () => {
  const home = "C:\\Users\\me";
  assert.equal(projectName("C--Users-me-wt-feature-x", home), "wt-feature-x");
  assert.equal(projectName("C--Users-me", home), "Home");
  assert.equal(projectName("C--Users-me--claude-dashboard", home), "claude-dashboard"); // a dot encodes as a dash too
  assert.equal(projectName("D--work-site", home), "D--work-site");
  assert.equal(projectName("-home-me-myapp", "/home/me"), "myapp");
});

test("a subagent in the live panel is labeled by its description, clipped, else by its id", () => {
  const fp = "C:/x/s/subagents/agent-a99914fcadb6bee94.jsonl";
  assert.equal(subagentLabel(fp, { description: "Audit the sitemap" }), "Audit the sitemap");
  assert.equal(subagentLabel(fp, { description: "x".repeat(80) }).length, 60);
  assert.equal(subagentLabel(fp, null), "subagent a99914fc");
});

test("the index carries a subagent's type and description so no refresh has to read its meta", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hq-idx-"));
  const dir = path.join(root, "C--Users-me-wt-x", "s1", "subagents");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(root, "C--Users-me-wt-x", "s1.jsonl"), jsonl([asst({})]));
  fs.writeFileSync(path.join(dir, "agent-a99914fcadb6bee94.jsonl"), jsonl([asst({ sidechain: true })]));
  fs.writeFileSync(path.join(dir, "agent-a99914fcadb6bee94.meta.json"), JSON.stringify({ agentType: "seo-technical", description: "Audit the sitemap", prompt: "WHOLE PROMPT" }));
  const index = await buildIndex(null, root);
  assert.equal(index.mains.length, 1);
  assert.deepEqual(index.subs.map((s) => s.meta), [{ agentType: "seo-technical", description: "Audit the sitemap" }]); // never the prompt
  resetIndex();
});

test("the per-file parse carries the per-agent breakdown the old parseAgents re-read every tick for", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hq-agents-"));
  const u = { input_tokens: 10, output_tokens: 7, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 };
  const main = jsonl([
    asst({ id: "m1", usage: u, content: [tool("Read", {}), tool("Grep", {})] }),
    asst({ id: "m1", usage: u, content: [tool("Edit", {})] }),
    asst({ id: "s1", sidechain: true, usage: { input_tokens: 3, output_tokens: 2 }, content: [tool("Bash", {})] }), // an inline subagent streams its placeholders first
    asst({ id: "s1", sidechain: true, usage: { input_tokens: 3, output_tokens: 1e6 }, content: [text("done")] }),
    asst({ id: "m2", usage: { output_tokens: 1e6 } }),
  ]);
  const sub = jsonl([
    asst({ id: "a1", sidechain: true, usage: { output_tokens: 5 }, content: [tool("Read", {})] }),
    asst({ id: "a1", sidechain: true, usage: { output_tokens: 1e6, cache_read_input_tokens: 50 }, content: [text("ok")] }),
  ]);
  fs.writeFileSync(path.join(dir, "main.jsonl"), main);
  fs.writeFileSync(path.join(dir, "sub.jsonl"), sub);
  for (const f of ["main.jsonl", "sub.jsonl"]) {
    const d = parseFileText(fs.readFileSync(path.join(dir, f), "utf8"), "p");
    assert.deepEqual(d.agents, referenceAgents(path.join(dir, f)), f);
    assert.equal(d.agents.main.cost + d.agents.side.cost, d.cost, f + ": the two buckets add up to the file's cost");
  }
  const a = parseFileText(main, "p").agents;
  assert.deepEqual([a.main.out, a.main.fin, a.main.cread, a.main.cwrite, a.main.tools], [1e6 + 7, 10, 100, 20, 3]);
  assert.deepEqual([a.side.out, a.side.fin, a.side.tools], [1e6, 3, 1]); // the inline subagent's final usage, billed once
  assert.deepEqual(parseFileText("", "p").agents, { main: { out: 0, fin: 0, cread: 0, cwrite: 0, tools: 0, cost: 0 }, side: { out: 0, fin: 0, cread: 0, cwrite: 0, tools: 0, cost: 0 } });
});

test("the active session's agent rows come from the cache: computeStats reads no transcript", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hq-active-"));
  const proj = path.join(root, "C--Users-me-wt-x"), sid = "s1";
  fs.mkdirSync(path.join(proj, sid, "subagents"), { recursive: true });
  const mainFp = path.join(proj, sid + ".jsonl");
  const subFp = path.join(proj, sid, "subagents", "agent-a99914fcadb6bee94.jsonl");
  const oldFp = path.join(proj, sid, "agent-b00000000000000000.jsonl"); // the older layout, straight under the session folder
  fs.writeFileSync(mainFp, jsonl([asst({ id: "m1", usage: { output_tokens: 1e6 }, content: [tool("Read", {})] }), asst({ id: "s1", sidechain: true, usage: { output_tokens: 3 }, content: [tool("Grep", {})] })]));
  fs.writeFileSync(subFp, jsonl([asst({ id: "a1", sidechain: true, usage: { output_tokens: 2e6, cache_read_input_tokens: 9 }, content: [tool("Bash", {}), tool("Edit", {})] })]));
  fs.writeFileSync(metaOf(subFp), JSON.stringify({ agentType: "seo-technical", description: "Audit the sitemap" }));
  fs.writeFileSync(oldFp, jsonl([asst({ id: "b1", sidechain: true, usage: { output_tokens: 1000 }, content: [tool("Read", {})] })]));
  const index = await buildIndex(null, root);
  const orig = fs.readFileSync;
  fs.readFileSync = () => { throw new Error("computeStats read a transcript"); };
  let stats;
  try {
    stats = computeStats(index.mains, index.subMtime, 0, index.subs);
  } finally {
    fs.readFileSync = orig;
  }
  const A = referenceAgents(mainFp), B = referenceAgents(subFp), C = referenceAgents(oldFp);
  assert.equal(stats.active.sessionId, sid);
  assert.deepEqual(stats.active.agents, [row("main thread", A.main), row("inline subagents", A.side), row("subagent b0000000", both(C)), row("Audit the sitemap", both(B))]);
  assert.deepEqual(stats.active.total, add(A.main, A.side, both(C), both(B)));
  resetIndex();
});

test("after the first walk, a new session, an appended row, a new subagent and a deleted file reach the next index, which equals a fresh full walk", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hq-watch-"));
  const p1 = path.join(root, "C--Users-me-a"), p2 = path.join(root, "C--Users-me-b");
  fs.mkdirSync(path.join(p1, "s1", "subagents"), { recursive: true });
  fs.mkdirSync(p2, { recursive: true });
  fs.writeFileSync(path.join(p1, "s1.jsonl"), jsonl([asst({ id: "m1", usage: { output_tokens: 1e6 }, content: [tool("Read", {})] })]));
  fs.writeFileSync(path.join(p1, "s1", "subagents", "agent-a0000000000000001.jsonl"), jsonl([asst({ id: "a1", sidechain: true, usage: { output_tokens: 1e6 } })]));
  fs.writeFileSync(path.join(p2, "gone.jsonl"), jsonl([asst({ id: "g1", usage: { output_tokens: 1e6 } })]));
  const first = await buildIndex(null, root);
  assert.deepEqual(first.mains.map((m) => m.sessionId).sort(), ["gone", "s1"]);
  // the tree changes under a running index
  await settle(50);
  fs.mkdirSync(path.join(root, "C--Users-me-c"), { recursive: true });
  fs.writeFileSync(path.join(root, "C--Users-me-c", "s3.jsonl"), jsonl([asst({ id: "n1", usage: { output_tokens: 1e6 }, content: [tool("Edit", {})] })])); // a new session in a new project
  fs.appendFileSync(path.join(p1, "s1.jsonl"), jsonl([asst({ id: "m2", usage: { output_tokens: 1e6 }, content: [tool("Grep", {})] })])); // a resumed session
  const sub2 = path.join(p1, "s1", "subagents", "agent-a0000000000000002.jsonl");
  fs.writeFileSync(sub2, jsonl([asst({ id: "a2", sidechain: true, usage: { output_tokens: 3e6 }, content: [tool("Bash", {})] })]));
  fs.writeFileSync(metaOf(sub2), JSON.stringify({ agentType: "seo-technical", description: "Check robots.txt" }));
  fs.unlinkSync(path.join(p2, "gone.jsonl"));
  await settle();
  const second = await buildIndex(null, root);
  const watched = sameStats(computeStats(second.mains, second.subMtime, 0, second.subs));
  resetIndex(); // a cold index of the same tree is the reference
  const fresh = await buildIndex(null, root);
  assert.deepEqual(sortFp(second.mains), sortFp(fresh.mains));
  assert.deepEqual(sortFp(second.subs), sortFp(fresh.subs));
  assert.deepEqual(second.subMtime, fresh.subMtime);
  assert.deepEqual(second.mains.map((m) => m.sessionId).sort(), ["s1", "s3"]);
  assert.equal(second.subs.find((s) => s.fp === sub2).meta.description, "Check robots.txt");
  assert.deepEqual(watched, sameStats(computeStats(fresh.mains, fresh.subMtime, 0, fresh.subs)));
  assert.equal(watched.totals.cost, 140); // at $20/MTok of output: s1's two responses, its first subagent's one, the new session's one and the new subagent's 3e6; gone.jsonl's $20 is out
  assert.equal(watched.active.agents.length, 3); // s1 (its subagent wrote last): main thread and its two subagents, no inline row
  resetIndex();
});

test("an idle tick stats a slice of the tree, never all of it", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hq-slice-"));
  const proj = path.join(root, "C--Users-me-many");
  fs.mkdirSync(proj, { recursive: true });
  const N = WALK_OPS + 100;
  for (let i = 0; i < N; i++) fs.writeFileSync(path.join(proj, `s${String(i).padStart(3, "0")}.jsonl`), jsonl([asst({ id: "m" + i, usage: { output_tokens: 1e6 } })]));
  const first = await buildIndex(null, root);
  assert.equal(first.mains.length, N);
  const orig = fsp.stat;
  let stats = 0;
  fsp.stat = (...a) => { stats++; return orig(...a); };
  try {
    const idle = await buildIndex(null, root);
    assert.equal(idle.mains.length, N); // the index is whole whatever the slice covered
    assert.ok(stats > 0 && stats <= WALK_OPS, `an idle tick made ${stats} stats for ${N} files (bar: at most ${WALK_OPS})`);
  } finally {
    fsp.stat = orig;
  }
  resetIndex();
});

test("a copy's own cache file and home folder: the index saves its cache there and labels projects under that home", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hq-idx-"));
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "hq-state-"));
  fs.mkdirSync(path.join(root, "D--studio-tallyrun"));
  fs.writeFileSync(path.join(root, "D--studio-tallyrun", "s1.jsonl"), jsonl([asst({ usage: { output_tokens: 1e6 } })]));
  const cacheFile = path.join(state, ".filecache.v4.json");
  const index = await buildIndex(null, root, { cacheFile, home: "D:\\studio" });
  assert.deepEqual(index.mains.map((m) => m.project), ["tallyrun"]);
  assert.ok(Object.keys(JSON.parse(fs.readFileSync(cacheFile, "utf8"))).some((fp) => fp.endsWith("s1.jsonl")));
  resetIndex();
});

// parseFileText as 6df0c8e had it, a whole read parsed from the first line: kept verbatim as the reference a
// transcript folded as it grows must equal, field for field.
const SLOT = 15 * 60e3;
const SLOT_KEEP = 8 * 86400e3;
const bucket = () => ({ out: 0, fin: 0, cread: 0, cwrite: 0, tools: 0, cost: 0 });
function referenceParse(raw, project, now = Date.now()) {
  const data = { project, cost: 0, tokens: 0, cacheSaved: 0, days: {}, models: {}, tools: {}, toolDays: {}, slots: {}, agents: { main: bucket(), side: bucket() } };
  if (!raw) return data;
  const slotOf = (ts) => {
    const ms = Date.parse(ts);
    if (!(ms >= now - SLOT_KEEP)) return null; // also rejects a missing or bad timestamp
    const k = Math.floor(ms / SLOT) * SLOT;
    return data.slots[k] || (data.slots[k] = [0, 0]);
  };
  let run = null; // the response being read: { id, model, timestamp, usage, agent }, usage from its latest line
  let pending = [];
  let pendingOut = 0;
  const flushTools = () => {
    // attribute only the OUTPUT (generation) cost: tool_use blocks are output
    const each = pending.length ? pendingOut / pending.length : 0;
    for (const name of pending) {
      const t = data.tools[name] || (data.tools[name] = { count: 0, cost: 0 });
      t.count += 1;
      t.cost += each;
    }
    pending = [];
    pendingOut = 0;
  };
  const flushRun = () => {
    if (!run) return;
    const { model, timestamp, usage, agent } = run;
    const r = costForUsage(model, usage);
    data.cost += r.cost;
    data.tokens += r.tokens || 0;
    data.cacheSaved += r.cacheSaved || 0;
    if (timestamp) {
      const d = String(timestamp).slice(0, 10);
      data.days[d] = (data.days[d] || 0) + r.cost;
      const s = slotOf(timestamp);
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
    pendingOut = p ? ((usage.output_tokens || 0) * p.out) / 1e6 : 0;
    flushTools();
    run = null;
  };
  for (const line of raw.split("\n")) {
    if (!line) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }
    if (rec.type !== "assistant" || !rec.message || !rec.message.usage) continue;
    const agent = rec.isSidechain ? data.agents.side : data.agents.main;
    const id = rec.message.id || null;
    if (!run || !id || id !== run.id) {
      flushRun();
      run = { id, model: rec.message.model || "unknown", timestamp: rec.timestamp, usage: rec.message.usage, agent };
    } else run.usage = rec.message.usage;
    const content = rec.message.content;
    if (Array.isArray(content))
      for (const b of content) {
        if (!b || b.type !== "tool_use") continue;
        pending.push(b.name || "unknown");
        agent.tools += 1;
        if (rec.timestamp) {
          const d = String(rec.timestamp).slice(0, 10);
          data.toolDays[d] = (data.toolDays[d] || 0) + 1;
          const s = slotOf(rec.timestamp);
          if (s) s[0] += 1;
        }
      }
  }
  flushRun();
  return data;
}

// Bytes read from transcripts while fn runs: through lib/tail.js (fs.readSync) and whole reads (fsp.readFile).
async function reads(fn) {
  const rs = fs.readSync, rf = fsp.readFile;
  let n = 0;
  fs.readSync = (...a) => { const k = rs.apply(fs, a); n += k; return k; };
  fsp.readFile = async (...a) => { const b = await rf.apply(fsp, a); n += Buffer.byteLength(b); return b; };
  try {
    const value = await fn();
    return { n, value };
  } finally {
    fs.readSync = rs;
    fsp.readFile = rf;
  }
}
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hq-fold-")), "t.jsonl");
const DAY = 86400e3;
// A fold first reads back the bytes just before its offset, at most GUARD of them, to check the file still holds them.
const GUARD = 64;
const folded = (gained, off) => gained + Math.min(GUARD, off);
// Runs fn while fs.openSync fails for fp on the opens `fails` picks (counted from 1), and says how many opens there were.
async function failingOpens(fp, fails, fn) {
  const open = fs.openSync;
  let opens = 0;
  fs.openSync = (p, ...a) => {
    if (p === fp && fails(++opens)) throw Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" });
    return open.call(fs, p, ...a);
  };
  try {
    return { ...(await fn()), opens };
  } finally {
    fs.openSync = open;
  }
}
// A transcript with every shape a fold has to carry from one read to the next: responses written over several
// lines (main thread and inline subagent, the subagent's early lines streaming placeholders), lines with no id,
// user rows, a broken row and an empty one, four models (one unpriced), cache-write breakdowns, two UTC days, a
// response older than the 8-day window, and multi-byte characters in every row so a cut can fall inside one.
function richText() {
  const rows = [asst({ sec: -9 * 86400, id: "old", usage: { output_tokens: 500 }, content: [tool("Read", { file_path: "caf\u00e9.js" })] })];
  const models = ["claude-opus-5-5", "claude-sonnet-5-5", "<synthetic>", "claude-fable-5-1"];
  for (let i = 0; i < 40; i++) {
    const sec = i * 1800 - 3600, model = models[i % 4];
    const u = { input_tokens: 3 + i, output_tokens: 100 * i + 1, cache_read_input_tokens: 1000 * i, cache_creation_input_tokens: 50, ...(i % 2 ? { cache_creation: { ephemeral_5m_input_tokens: 20, ephemeral_1h_input_tokens: 30 } } : {}) };
    rows.push(user({ sec, text: "\u00e9t\u00e9 \ud83d\ude80 " + i }));
    rows.push(asst({ sec, id: "m" + i, model, usage: u, content: [text("r\u00e9sum\u00e9 " + i), tool("Edit", { file_path: "\ud83d\ude80/" + i + ".ts" })] }));
    rows.push(asst({ sec: sec + 1, id: "m" + i, model, usage: u, content: [tool(i % 2 ? "Bash" : "Gr\u00e9p", { command: "ls \u00fc" })] }));
    if (i % 3 === 0) {
      rows.push(asst({ sec: sec + 2, id: "s" + i, sidechain: true, usage: { output_tokens: 2 }, content: [tool("Grep", { pattern: "\u00df" })] }));
      rows.push(asst({ sec: sec + 3, id: "s" + i, sidechain: true, usage: { output_tokens: 1e5 + i }, content: [text("d\u00f6ne")] }));
    }
    if (i % 5 === 0) rows.push(asst({ sec: sec + 4, id: null, usage: { output_tokens: 9 }, content: [tool("Read", { file_path: "\u00e5" })] }));
    if (i % 7 === 0) rows.push('{"type":"assistant","message":{"id":"broken","usage":{"output', "");
  }
  return rows.map((r) => (typeof r === "string" ? r : JSON.stringify(r))).join("\n") + "\n";
}
// mulberry32: the same cuts on every run
const rng = (a) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

test("a transcript read as it grows, cut anywhere (inside a line, inside a character), folds to what one whole parse gives, reading each byte once", async () => {
  const bytes = Buffer.from(richText(), "utf8");
  const NOW = T0 + 2 * DAY;
  const two = bytes.indexOf(Buffer.from("\u00e9", "utf8")) + 1; // between the two bytes of a two-byte character
  const four = bytes.indexOf(Buffer.from("\ud83d\ude80", "utf8")) + 2; // in the middle of a four-byte one
  assert.ok(bytes[two - 1] === 0xc3 && bytes[four - 2] === 0xf0, "the cuts fall inside characters");
  const plans = [[two], [four], [Math.floor(bytes.length / 3), four + 1000]];
  for (let seed = 1; seed <= 5; seed++) {
    const r = rng(seed), cuts = new Set();
    while (cuts.size < 40) cuts.add(1 + Math.floor(r() * (bytes.length - 1)));
    plans.push([...cuts]);
  }
  for (const plan of plans) {
    const fp = tmpFile();
    let entry = null, at = 0;
    for (const cut of [...plan.sort((a, b) => a - b), bytes.length]) {
      fs.appendFileSync(fp, bytes.subarray(at, cut));
      at = cut;
      const st = fs.statSync(fp);
      const { n, value } = await reads(() => readTranscript(fp, "p", entry, st, NOW));
      assert.equal(n, entry ? folded(at - entry.off, entry.off) : at, `cut at ${cut}: a fold reads from the end of the last complete line, the first read is whole`);
      entry = value;
      assert.deepEqual(entry.data, referenceParse(bytes.subarray(0, at).toString("utf8"), "p", NOW), `cut at ${cut} of plan ${plan.length}`);
    }
  }
});

test("a response whose lines arrive in two appends is billed once, from its last line", async () => {
  const fp = tmpFile();
  const first = jsonl([asst({ id: "msg_x", usage: { output_tokens: 7 }, content: [tool("Read", {})] })]); // a streaming placeholder
  const second = jsonl([asst({ id: "msg_x", usage: { output_tokens: 1e6 }, content: [tool("Edit", {})] }), asst({ id: "msg_y", usage: { output_tokens: 0 } })]);
  fs.writeFileSync(fp, first);
  let entry = (await reads(() => readTranscript(fp, "p", null, fs.statSync(fp), T0))).value;
  fs.appendFileSync(fp, second);
  const { n, value } = await reads(() => readTranscript(fp, "p", entry, fs.statSync(fp), T0));
  entry = value;
  assert.equal(n, folded(Buffer.byteLength(second), Buffer.byteLength(first))); // folded, not read whole
  const d = entry.data;
  assert.equal(d.cost, 20); // Opus 5.5 output is $20/MTok: the final usage, once, the placeholder's 7 tokens never
  assert.equal(d.agents.main.out, 1e6);
  assert.deepEqual([d.tools.Read.count, d.tools.Edit.count], [1, 1]);
  assert.equal(d.tools.Read.cost + d.tools.Edit.cost, 20);
  assert.deepEqual(d, referenceParse(first + second, "p", T0));
});

test("a file that shrank, and one replaced by a larger file under the same name, are read whole again", async () => {
  const fp = tmpFile();
  const r = (id, out, name) => asst({ id, usage: { output_tokens: out }, content: [tool(name, {})] });
  fs.writeFileSync(fp, jsonl([r("a1", 1e6, "Read"), r("a2", 2e6, "Grep"), r("a3", 3e6, "Edit")]));
  let entry = (await reads(() => readTranscript(fp, "p", null, fs.statSync(fp), T0))).value;
  const steps = [
    () => fs.writeFileSync(fp, jsonl([r("b1", 5e6, "Bash")])), // truncated and rewritten in place: same file, fewer bytes
    () => {
      const swap = fp + ".swap";
      fs.writeFileSync(swap, jsonl([r("c1", 7e6, "Write"), r("c2", 1e6, "Read"), r("c3", 1e6, "Read")]));
      fs.renameSync(swap, fp); // a new file, larger than the one it replaced
    },
  ];
  for (const step of steps) {
    const before = entry.size;
    step();
    const st = fs.statSync(fp);
    const { n, value } = await reads(() => readTranscript(fp, "p", entry, st, T0));
    assert.equal(n, st.size, `read whole (${before} bytes before, ${st.size} now)`);
    entry = value;
    assert.deepEqual(entry.data, referenceParse(fs.readFileSync(fp, "utf8"), "p", T0));
  }
});

test("the 8-day slot window a later refresh cuts is exact: a slot the edge splits is read whole, one it passed is dropped, and a clock that went back reads whole", async () => {
  const fp = tmpFile();
  const row = (sec, id, name) => asst({ sec, id, usage: { output_tokens: 1e6 }, content: [tool(name, {})] });
  const steps = [
    [[row(0, "a", "Read"), row(300, "b", "Grep"), row(600, "c", "Edit"), row(3600, "d", "Bash")], T0 + 8 * DAY - 3600e3, true], // the first read: the 12:00 slot holds 12:00, 12:05 and 12:10
    [[row(8 * 86400, "e", "Read")], T0 + 8 * DAY + 7 * 60e3, true], // the edge at 12:07 splits that slot: read whole
    [[row(840, "f", "Write")], T0 + 8 * DAY + 12 * 60e3, false], // the edge at 12:12 has passed all it held, and a 12:14 row lands in it: folded
    [[row(8 * 86400 + 60, "g", "Read")], T0 + 7 * DAY, true], // the clock went back a day: read whole
  ];
  let entry = null;
  for (const [rows, now, whole] of steps) {
    fs.appendFileSync(fp, jsonl(rows));
    const st = fs.statSync(fp);
    const { n, value } = await reads(() => readTranscript(fp, "p", entry, st, now));
    assert.equal(n, whole ? st.size : folded(st.size - entry.off, entry.off), new Date(now).toISOString());
    entry = value;
    assert.deepEqual(entry.data, referenceParse(fs.readFileSync(fp, "utf8"), "p", now), new Date(now).toISOString());
  }
});

test("a live index reads only what a transcript gained, and its stats equal a cold walk's", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hq-gain-"));
  const proj = path.join(root, "C--Users-me-wt-x");
  fs.mkdirSync(proj, { recursive: true });
  const fp = path.join(proj, "s1.jsonl");
  fs.writeFileSync(fp, richText());
  await buildIndex(null, root);
  await settle(50);
  const more = jsonl([asst({ sec: 70200, id: "s39", sidechain: true, usage: { output_tokens: 3e5 }, content: [tool("Read", {})] }), asst({ sec: 70300, id: "n1", usage: { output_tokens: 2e6 }, content: [tool("Edit", {})] })]);
  fs.appendFileSync(fp, more); // the open response's next line, then a new one
  await settle();
  const { n, value } = await reads(() => buildIndex(null, root));
  assert.equal(n, Buffer.byteLength(more) + GUARD, `read ${n} bytes of a ${fs.statSync(fp).size}-byte transcript that gained ${Buffer.byteLength(more)}`);
  const live = sameStats(computeStats(value.mains, value.subMtime, 0, value.subs));
  resetIndex();
  const cold = await buildIndex(null, root);
  assert.deepEqual(live, sameStats(computeStats(cold.mains, cold.subMtime, 0, cold.subs)));
  resetIndex();
});

test("an entry cached before offsets were kept is used as it is, read whole once when its file grows, then folded", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hq-old-"));
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "hq-state-"));
  const proj = path.join(root, "C--Users-me-wt-x");
  fs.mkdirSync(proj, { recursive: true });
  const fp = path.join(proj, "s1.jsonl");
  const a = jsonl([asst({ id: "m1", usage: { output_tokens: 1e6 }, content: [tool("Read", {})] })]);
  fs.writeFileSync(fp, a);
  const st = fs.statSync(fp);
  const cacheFile = path.join(state, CACHE_NAME);
  fs.writeFileSync(cacheFile, JSON.stringify({ [fp]: { mtimeMs: st.mtimeMs, size: st.size, data: referenceParse(a, "wt-x") } })); // the shape an older version saves
  resetIndex();
  assert.equal((await reads(() => buildIndex(null, root, { cacheFile }))).n, 0, "unchanged: the cached parse is used as it is");
  await settle(50);
  const b = jsonl([asst({ id: "m2", usage: { output_tokens: 2e6 }, content: [tool("Grep", {})] })]);
  fs.appendFileSync(fp, b);
  await settle();
  assert.equal((await reads(() => buildIndex(null, root, { cacheFile }))).n, Buffer.byteLength(a + b), "no offset to start from: one whole read");
  const c = jsonl([asst({ id: "m3", usage: { output_tokens: 3e6 }, content: [tool("Edit", {})] })]);
  fs.appendFileSync(fp, c);
  await settle();
  const { n, value } = await reads(() => buildIndex(null, root, { cacheFile }));
  assert.equal(n, Buffer.byteLength(c) + GUARD, "then only what was appended");
  const live = sameStats(computeStats(value.mains, value.subMtime, 0, value.subs));
  assert.equal(live.totals.cost, 120);
  resetIndex();
  const cold = await buildIndex(null, root);
  assert.deepEqual(live, sameStats(computeStats(cold.mains, cold.subMtime, 0, cold.subs)));
  resetIndex();
});

test("the fold state saved in the cache file survives a restart: the next growth reads only what was appended", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hq-restart-"));
  const state = fs.mkdtempSync(path.join(os.tmpdir(), "hq-state-"));
  const proj = path.join(root, "C--Users-me-wt-x");
  fs.mkdirSync(proj, { recursive: true });
  const fp = path.join(proj, "s1.jsonl");
  const cacheFile = path.join(state, CACHE_NAME);
  fs.writeFileSync(fp, richText());
  resetIndex();
  await buildIndex(null, root, { cacheFile }); // a new index's first save is never held back
  resetIndex(); // the server restarts
  const more = jsonl([asst({ sec: 70200, id: "s39", sidechain: true, usage: { output_tokens: 3e5 }, content: [tool("Bash", {})] }), asst({ sec: 70300, id: "n1", usage: { output_tokens: 2e6 } })]); // the open response's next line, then a new one
  fs.appendFileSync(fp, more);
  const { n, value } = await reads(() => buildIndex(null, root, { cacheFile }));
  assert.equal(n, Buffer.byteLength(more) + GUARD);
  const live = sameStats(computeStats(value.mains, value.subMtime, 0, value.subs));
  resetIndex();
  const cold = await buildIndex(null, root);
  assert.deepEqual(live, sameStats(computeStats(cold.mains, cold.subMtime, 0, cold.subs)));
  resetIndex();
});

test("a refresh whose fold and whole read both fail keeps the cached entry as it was, and the next refresh reads again", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hq-locked-"));
  const proj = path.join(root, "C--Users-me-wt-x");
  fs.mkdirSync(proj, { recursive: true });
  const fp = path.join(proj, "s1.jsonl");
  fs.writeFileSync(fp, richText());
  const first = await buildIndex(null, root);
  const cost = computeStats(first.mains, first.subMtime, 0, first.subs).totals.cost;
  assert.ok(cost > 0);
  await settle(50);
  const more = jsonl([asst({ sec: 70300, id: "n1", usage: { output_tokens: 2e6 }, content: [tool("Edit", {})] })]);
  fs.appendFileSync(fp, more);
  await settle();
  const locked = await failingOpens(fp, () => true, () => reads(() => buildIndex(null, root)));
  assert.ok(locked.opens >= 2, `the fold and the whole read were both tried (${locked.opens} opens)`);
  assert.equal(locked.n, 0);
  assert.equal(computeStats(locked.value.mains, locked.value.subMtime, 0, locked.value.subs).totals.cost, cost, "nothing could be read: the cost stays, never zero");
  const { n, value } = await reads(() => buildIndex(null, root)); // no new write and no watch event: the kept mtime and size make it read again
  assert.equal(n, Buffer.byteLength(more) + GUARD);
  const live = sameStats(computeStats(value.mains, value.subMtime, 0, value.subs));
  assert.equal(live.totals.cost, cost + 40); // Opus 5.5 output at $20/MTok
  resetIndex();
  const cold = await buildIndex(null, root);
  assert.deepEqual(live, sameStats(computeStats(cold.mains, cold.subMtime, 0, cold.subs)));
  resetIndex();
});

test("a file rewritten in place to a larger size (same path, same file id) is read whole; an append reads what it gained and the guard", async () => {
  const fp = tmpFile();
  const r = (id, out, name) => asst({ id, usage: { output_tokens: out }, content: [tool(name, {})] });
  fs.writeFileSync(fp, jsonl([r("a1", 1e6, "Read"), r("a2", 2e6, "Grep")]));
  let entry = (await reads(() => readTranscript(fp, "p", null, fs.statSync(fp), T0))).value;
  const id = fileId(fs.statSync(fp));
  const c = jsonl([r("c1", 5e6, "Bash"), r("c2", 1e6, "Read"), r("c3", 1e6, "Write"), r("c4", 1e6, "Read")]);
  fs.writeFileSync(fp, c); // truncated and rewritten, not renamed
  let st = fs.statSync(fp);
  assert.equal(fileId(st), id, "the same file");
  assert.ok(st.size > entry.size, "and larger than its last read");
  let x = await reads(() => readTranscript(fp, "p", entry, st, T0));
  entry = x.value;
  assert.deepEqual(entry.data, referenceParse(c, "p", T0));
  assert.equal(entry.off, st.size);
  const d = jsonl([r("d1", 3e6, "Edit")]);
  fs.appendFileSync(fp, d);
  st = fs.statSync(fp);
  x = await reads(() => readTranscript(fp, "p", entry, st, T0));
  assert.equal(x.n, Buffer.byteLength(d) + GUARD);
  assert.deepEqual(x.value.data, referenceParse(c + d, "p", T0));
});

test("a fold stamped with another version, or with none, is read whole and equals a whole parse", async () => {
  const fp = tmpFile();
  const a = jsonl([asst({ id: "a1", usage: { output_tokens: 1e6 }, content: [tool("Read", {})] })]);
  fs.writeFileSync(fp, a);
  const entry = (await reads(() => readTranscript(fp, "p", null, fs.statSync(fp), T0))).value;
  const b = jsonl([asst({ id: "b1", usage: { output_tokens: 2e6 }, content: [tool("Grep", {})] })]);
  fs.appendFileSync(fp, b);
  const st = fs.statSync(fp);
  for (const v of ["another", undefined]) {
    const stale = structuredClone(entry);
    stale.fold.v = v;
    stale.fold.data.cost += 1000; // sums made under other prices or rules
    const { n, value } = await reads(() => readTranscript(fp, "p", stale, st, T0));
    assert.equal(n, st.size, `version ${v}: read whole`);
    assert.deepEqual(value.data, referenceParse(a + b, "p", T0));
  }
});

test("CRLF lines, cut anywhere (between a CR and its LF too), fold to what one whole parse gives", async () => {
  const bytes = Buffer.from(richText().split("\n").map((l, i) => (l && i % 2 ? l + "\r" : l)).join("\n"), "utf8");
  const NOW = T0 + 2 * DAY;
  const r = rng(11), cuts = new Set([bytes.indexOf(0x0d) + 1, bytes.lastIndexOf(0x0d) + 1]);
  while (cuts.size < 30) cuts.add(1 + Math.floor(r() * (bytes.length - 1)));
  const fp = tmpFile();
  let entry = null, at = 0;
  for (const cut of [...[...cuts].sort((x, y) => x - y), bytes.length]) {
    fs.appendFileSync(fp, bytes.subarray(at, cut));
    at = cut;
    const { n, value } = await reads(() => readTranscript(fp, "p", entry, fs.statSync(fp), NOW));
    assert.equal(n, entry ? folded(at - entry.off, entry.off) : at, `cut at ${cut}`);
    entry = value;
    assert.deepEqual(entry.data, referenceParse(bytes.subarray(0, at).toString("utf8"), "p", NOW), `cut at ${cut}`);
  }
});

test("a file that grows while it is read: the read runs to its newest end, the offset passes the stat's size, and the next refresh folds from there", async () => {
  const fp = tmpFile();
  const a = richText();
  fs.writeFileSync(fp, a);
  const st = fs.statSync(fp);
  const b = jsonl([asst({ sec: 70300, id: "n1", usage: { output_tokens: 2e6 }, content: [tool("Edit", {})] })]);
  fs.appendFileSync(fp, b); // after the stat that found the change, before the read
  let x = await reads(() => readTranscript(fp, "p", null, st, T0 + DAY));
  assert.equal(x.n, Buffer.byteLength(a + b));
  assert.deepEqual([x.value.size, x.value.off], [Buffer.byteLength(a), Buffer.byteLength(a + b)]);
  assert.deepEqual(x.value.data, referenceParse(a + b, "p", T0 + DAY));
  x = await reads(() => readTranscript(fp, "p", x.value, fs.statSync(fp), T0 + DAY)); // larger than the entry's size, nothing past its offset
  assert.equal(x.n, 0);
  assert.deepEqual(x.value.data, referenceParse(a + b, "p", T0 + DAY));
  const c = jsonl([asst({ sec: 70400, id: "n2", usage: { output_tokens: 1e6 }, content: [tool("Read", {})] })]);
  fs.appendFileSync(fp, c);
  x = await reads(() => readTranscript(fp, "p", x.value, fs.statSync(fp), T0 + DAY));
  assert.equal(x.n, Buffer.byteLength(c) + GUARD);
  assert.deepEqual(x.value.data, referenceParse(a + b + c, "p", T0 + DAY));
});

test("a read that fails in the middle of a fold leaves the cached entry untouched and reads whole", async () => {
  const fp = tmpFile();
  const NOW = T0 + DAY;
  fs.writeFileSync(fp, richText());
  const entry = (await reads(() => readTranscript(fp, "p", null, fs.statSync(fp), NOW))).value;
  const before = JSON.stringify(entry);
  const rows = [];
  for (let i = 0; i < 4000; i++) rows.push(asst({ sec: 70300 + i, id: "b" + i, usage: { output_tokens: 1000 }, content: [tool("Read", { file_path: "x".repeat(400) })] }));
  fs.appendFileSync(fp, jsonl(rows)); // more than one 2 MB chunk, so the fold reads more than once
  const st = fs.statSync(fp);
  assert.ok(st.size - entry.off > 2 * 1024 * 1024);
  const x = await failingOpens(fp, (k) => k === 2, () => reads(() => readTranscript(fp, "p", entry, st, NOW))); // the fold's second chunk
  assert.ok(x.opens >= 3, `the fold's first chunk, its failed second, then a whole read (${x.opens} opens)`);
  assert.ok(x.n > st.size, "read whole after the failed fold");
  assert.equal(JSON.stringify(entry), before, "the cached entry is untouched");
  assert.deepEqual(x.value.data, referenceParse(fs.readFileSync(fp, "utf8"), "p", NOW));
});

test("an empty transcript that later grows folds from its first byte", async () => {
  const fp = tmpFile();
  fs.writeFileSync(fp, "");
  let x = await reads(() => readTranscript(fp, "p", null, fs.statSync(fp), T0));
  assert.equal(x.n, 0);
  assert.equal(x.value.off, 0);
  assert.deepEqual(x.value.data, referenceParse("", "p", T0));
  const a = jsonl([asst({ id: "a1", usage: { output_tokens: 1e6 }, content: [tool("Read", {})] }), asst({ id: "a1", usage: { output_tokens: 1e6 }, content: [tool("Edit", {})] })]);
  fs.appendFileSync(fp, a);
  x = await reads(() => readTranscript(fp, "p", x.value, fs.statSync(fp), T0));
  assert.equal(x.n, Buffer.byteLength(a)); // folded from offset 0: nothing before it to check
  assert.deepEqual(x.value.data, referenceParse(a, "p", T0));
});
