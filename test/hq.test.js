const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createHq } = require("../lib/hq");
const { createBoard } = require("../lib/board");
const { T0, at, asst, user, tool, jsonl } = require("./helpers");

const A = "aaaaaaaa-0000-0000-0000-000000000001"; // live, registered
const OLD = "bbbbbbbb-0000-0000-0000-000000000002"; // yesterday, unregistered
const C = "cccccccc-0000-0000-0000-000000000003"; // registered, no transcript, last seen 24 h ago
const NOW = T0 + 120e3;

const queued = (sec, content) => ({ type: "queue-operation", operation: "enqueue", timestamp: at(sec), content });
const notif = (taskId, useId, summary) => `<task-notification>\n<task-id>${taskId}</task-id>\n<tool-use-id>${useId}</tool-use-id>\n<status>completed</status>\n<summary>${summary}</summary>\n</task-notification>`;
// Session A delegates twice to the SEO agent (the first finishes), messages a peer, hears back, and opens a PR.
const COLLAB = [
  asst({ sec: 20, content: [{ ...tool("Agent", { description: "Audit the sitemap", subagent_type: "seo-technical", prompt: "PROMPT-BODY", run_in_background: true }), id: "tu_d1" }] }),
  { type: "user", timestamp: at(21), toolUseResult: { status: "async_launched" }, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_d1", content: "launched" }] } },
  asst({ sec: 25, content: [{ ...tool("Agent", { description: "Check robots.txt", subagent_type: "seo-technical" }), id: "tu_d2" }] }),
  asst({ sec: 30, content: [tool("SendMessage", { to: "uds:pipe-b", summary: "Ask beta to release App.tsx", message: "PROMPT-BODY" })] }),
  queued(40, '<cross-session-message from="uds:pipe-b" from-name="beta" from-mode="prompting">\nReleased App.tsx\n</cross-session-message>'),
  queued(50, notif("x1", "tu_d1", 'Agent "Audit the sitemap" completed')),
  queued(60, notif("x2", "tu_other", "Tests passed")),
  { type: "pr-link", timestamp: at(70), prNumber: 263, prUrl: "https://github.com/o/r/pull/263", prRepository: "o/r" },
];

function world({ registry = true, extra = [], subExtra = [], chunk, home, edit } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hq-"));
  const proj = path.join(root, "projects", "p1");
  fs.mkdirSync(path.join(proj, A, "subagents"), { recursive: true });
  const secret = "export TOKEN=sk-live-123";
  fs.writeFileSync(path.join(proj, A + ".jsonl"), jsonl([
    { type: "ai-title", aiTitle: "Build HQ", sessionId: A },
    user({ sec: 0, text: "go" }),
    ...extra,
    asst({ sec: 100, content: [tool("Bash", { command: secret, description: "Set up the env" })] }),
  ]));
  fs.writeFileSync(path.join(proj, A, "subagents", "agent-x1.jsonl"), jsonl([user({ sec: 90, sidechain: true }), ...subExtra, asst({ sec: 110, sidechain: true, content: [tool("Read", { file_path: "a.md" })] })])); // real subagent rows are all sidechain
  fs.writeFileSync(path.join(proj, A, "subagents", "agent-x1.meta.json"), JSON.stringify({ agentType: "seo-technical", description: "Audit the sitemap", toolUseId: "tu_d1" }));
  fs.writeFileSync(path.join(proj, OLD + ".jsonl"), jsonl([user({ sec: -86400 })]));
  const reg = path.join(root, "registry.json");
  if (registry)
    fs.writeFileSync(reg, JSON.stringify({
      sessions: { [A]: { id: A, name: "alpha", task: "ship HQ >/dev/null 2>" }, [C]: { id: C, name: "gamma", cwd: "C:/Users/me/myapp", lastSeen: NOW - 86400e3 } },
      claims: [{ repo: "r", path: "x.js", session: A, at: 1 }], locks: {}, notes: [],
    }));
  const index = {
    mains: [
      { fp: path.join(proj, A + ".jsonl"), sessionId: A, mtimeMs: NOW - 5e3, project: "p1" },
      { fp: path.join(proj, OLD + ".jsonl"), sessionId: OLD, mtimeMs: NOW - 86400e3, project: "p1" },
    ],
    subMtime: { [A]: NOW - 10e3 },
    subs: [{ fp: path.join(proj, A, "subagents", "agent-x1.jsonl"), sessionId: A, mtimeMs: NOW - 10e3 }],
  };
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "hq.config.example.json"), "utf8")); // never the owner's edited copy
  if (edit) edit(config, root);
  const hq = createHq({ config, board: createBoard(reg), chunk, home });
  return { hq, index, proj };
}

test("live = recent transcripts plus open registrations; a stale registration is idle with its age", async () => {
  const { hq, index } = world();
  await hq.update(index, { today: 1.5, toolsToday: 7 }, NOW);
  const p = hq.payload();
  assert.deepEqual(p.sessions.map((s) => s.id).sort(), [A, C].sort());
  const a = p.sessions.find((s) => s.id === A);
  assert.equal(a.name, "alpha");
  assert.equal(a.task, "ship HQ");
  assert.equal(a.status, "working");
  assert.equal(a.action, "Set up the env");
  assert.deepEqual(a.claims, ["x.js"]);
  const c = p.sessions.find((s) => s.id === C);
  assert.equal(c.status, "idle");
  assert.equal(c.lastAt, NOW - 86400e3);
  assert.equal(p.vitals.toolCallsToday, 7);
  assert.equal(p.pill.working, 1);
});

test("a running subagent turns the matching job agent green", async () => {
  const { hq, index } = world();
  await hq.update(index, null, NOW);
  const seo = hq.payload().floor.agents.find((x) => x.id === "seo");
  assert.equal(seo.working, true);
  assert.equal(seo.doing, "Audit the sitemap");
  assert.equal(hq.payload().floor.agents.find((x) => x.id === "billing").working, false);
});

test("the payload never carries shell command text", async () => {
  const { hq, index } = world();
  await hq.update(index, null, NOW);
  assert.ok(!hq.json().includes("sk-live-123"));
});

test("no registry still lists sessions; the board is null", async () => {
  const { hq, index } = world({ registry: false });
  await hq.update(index, null, NOW);
  assert.equal(hq.payload().board, null);
  assert.deepEqual(hq.payload().sessions.map((s) => s.id), [A]);
});

test("a half-written line is picked up whole on the next refresh", async () => {
  const { hq, index, proj } = world();
  await hq.update(index, null, NOW);
  const fp = path.join(proj, A + ".jsonl");
  const line = JSON.stringify(asst({ sec: 115, content: [tool("Grep", {})] }));
  fs.appendFileSync(fp, line.slice(0, 20));
  await hq.update(index, null, NOW);
  assert.equal(hq.payload().sessions.find((s) => s.id === A).toolCount, 1);
  fs.appendFileSync(fp, line.slice(20) + "\n");
  await hq.update(index, null, NOW);
  assert.equal(hq.payload().sessions.find((s) => s.id === A).toolCount, 2);
});

test("delegations, handoffs and finished work reach the session, the flow, the team map and the floor", async () => {
  const { hq, index } = world({ extra: COLLAB });
  await hq.update(index, null, NOW);
  const p = hq.payload();
  const a = p.sessions.find((s) => s.id === A);
  assert.deepEqual(a.delegations.map((d) => [d.id, d.agentId, d.status]), [["tu_d2", "seo", "running"], ["tu_d1", "seo", "done"]]);
  assert.equal(a.delegations[1].doneAt, T0 + 50e3);
  assert.deepEqual(a.handoffs.map((h) => [h.dir, h.peer]), [["in", "beta"], ["out", "beta"]]); // the pipe resolved to a name
  assert.deepEqual(a.completions.map((c) => c.text), ["Tests passed"]);
  assert.equal(a.prs[0].number, 263);
  assert.equal(a.spark.length, 30);
  assert.deepEqual(p.flow.map((e) => e.kind), ["pr", "done", "delegate", "handoff", "handoff", "delegate"]);
  const del = p.team.edges.find((e) => e.kind === "delegate");
  assert.deepEqual([del.from, del.to, del.count, del.active], ["s:" + A, "a:seo", 2, true]);
  assert.equal(p.team.edges.find((e) => e.kind === "handoff").count, 2);
  assert.deepEqual(p.floor.links, [{ from: A, to: "seo" }]);
  assert.ok(!hq.json().includes("PROMPT-BODY"));
  await hq.update(index, null, T0 + 3 * 3600e3); // A stays live through its open registration
  assert.equal(hq.payload().sessions.find((s) => s.id === A).delegations[0].status, "quiet");
});

test("a message to the session's own subagent shows as its agent, never as a raw id", async () => {
  const { hq, index } = world({
    extra: [
      asst({ sec: 30, content: [tool("SendMessage", { to: "x1", summary: "Also check the robots file", message: "PROMPT-BODY" })] }),
      asst({ sec: 31, content: [tool("SendMessage", { to: "a0123456789abcdef", summary: "Status?", message: "PROMPT-BODY" })] }), // a subagent whose file is not loaded
    ],
  });
  await hq.update(index, null, NOW);
  const p = hq.payload();
  const a = p.sessions.find((s) => s.id === A);
  assert.deepEqual(a.handoffs.map((h) => [h.dir, h.peer, h.agentId]), [["out", "a subagent", null], ["out", "SEO/AEO Officer", "seo"]]);
  const labels = p.team.nodes.map((n) => n.label);
  assert.ok(!labels.includes("x1") && !labels.includes("a0123456789abcdef"), labels.join(", "));
  assert.deepEqual(p.team.nodes.filter((n) => n.kind === "agent").map((n) => [n.id, n.label]), [["t:subagent", "a subagent"], ["a:seo", "SEO/AEO Officer"]]);
  assert.deepEqual(p.team.edges.map((e) => [e.from, e.to, e.kind]), [["s:" + A, "t:subagent", "handoff"], ["s:" + A, "a:seo", "handoff"]]);
  assert.deepEqual(p.flow.filter((e) => e.kind === "handoff").map((e) => [e.from, e.to]), [["alpha", "a subagent"], ["alpha", "SEO/AEO Officer"]]);
  assert.ok(!hq.json().includes("PROMPT-BODY"));
});

test("a shell finished inside a subagent shows that call's description, never its command or the summary's quote", async () => {
  const note = (taskId, useId, status, summary) => `<task-notification>\n<task-id>${taskId}</task-id>\n<tool-use-id>${useId}</tool-use-id>\n<status>${status}</status>\n<summary>${summary}</summary>\n</task-notification>`;
  const { hq, index } = world({
    subExtra: [
      asst({ sec: 95, sidechain: true, content: [{ ...tool("Bash", { command: "SECRET-SUB-CMD-1", description: 'Say "hi" to the log', run_in_background: true }), id: "tu_bg1" }] }),
      asst({ sec: 96, sidechain: true, content: [{ ...tool("Bash", { command: "SECRET-SUB-CMD-2", run_in_background: true }), id: "tu_bg2" }] }), // no description
    ],
    extra: [
      queued(60, note("x3", "tu_bg1", "completed", 'Background command "Say "hi" to the log" completed (exit code 0)')),
      queued(61, note("x4", "tu_bg2", "failed", 'Background command "SECRET-SUB-CMD-2" failed with exit code 1')), // Claude Code quotes the command when there is no description
      queued(62, note("x5", "tu_unknown", "completed", "Background command finished")), // no quote, no known call
    ],
  });
  await hq.update(index, null, NOW);
  const a = hq.payload().sessions.find((s) => s.id === A);
  assert.deepEqual(a.completions.map((c) => [c.status, c.text]), [
    ["done", "A background command"],
    ["failed", "A background command"],
    ["done", 'Say "hi" to the log'],
  ]);
  assert.equal(a.completions[0].useId, undefined); // an internal handle, not payload
  assert.ok(!hq.json().includes("SECRET-SUB-CMD"));
});

test("project is the cwd's folder, registry cwd first, else the index's name; a branch of HEAD is no branch", async () => {
  const { hq, index } = world({ extra: [{ ...user({ sec: 1 }), cwd: "C:/Users/me/wt-feature-x", gitBranch: "HEAD" }] });
  await hq.update(index, null, NOW);
  const p = hq.payload();
  const a = p.sessions.find((s) => s.id === A);
  assert.equal(a.project, "wt-feature-x");
  assert.equal(a.branch, null);
  assert.equal(p.sessions.find((s) => s.id === C).project, "myapp"); // registry cwd, no transcript
  const plain = world();
  await plain.hq.update(plain.index, null, NOW);
  assert.equal(plain.hq.payload().sessions.find((s) => s.id === A).project, "p1"); // no cwd anywhere: the index's name
});

test("a transcript folded in chunks gives the same payload as one read, and no read is ever larger than the chunk", async () => {
  const whole = world({ extra: COLLAB });
  const chunked = world({ extra: COLLAB, chunk: 64 }); // every row is longer than this, so every row straddles a chunk
  const orig = fs.readSync;
  let largest = 0;
  fs.readSync = (fd, buf, off, len, pos) => { largest = Math.max(largest, len); return orig(fd, buf, off, len, pos); };
  try {
    await whole.hq.update(whole.index, null, NOW);
    const before = largest;
    largest = 0;
    await chunked.hq.update(chunked.index, null, NOW);
    assert.ok(before > 64 && largest === 64, `one read ${before} bytes, chunked at most ${largest}`);
  } finally {
    fs.readSync = orig;
  }
  assert.deepEqual(chunked.hq.payload(), whole.hq.payload());
  assert.equal(chunked.hq.payload().sessions.find((s) => s.id === A).delegations.length, 2);
});

test("a session quiet for under 2 h keeps its tracker, so coming back reads only the new bytes; past 2 h it starts over", async () => {
  const { hq, index, proj } = world({ registry: false }); // shown by its transcript's age alone
  const fp = path.join(proj, A + ".jsonl");
  await hq.update(index, null, NOW);
  assert.deepEqual(hq.payload().sessions.map((s) => s.id), [A]);
  await hq.update(index, null, NOW + 20 * 60e3); // 20 quiet minutes: off the live list
  assert.deepEqual(hq.payload().sessions.map((s) => s.id), []);
  const line = JSON.stringify(asst({ sec: 1300, content: [tool("Grep", {})] })) + "\n";
  fs.appendFileSync(fp, line);
  index.mains[0].mtimeMs = NOW + 21 * 60e3;
  const orig = fs.readSync;
  let bytes = 0;
  fs.readSync = (...a) => { const n = orig(...a); bytes += n; return n; };
  try {
    await hq.update(index, null, NOW + 21 * 60e3);
    assert.equal(bytes, Buffer.byteLength(line), "only the appended row was read");
    assert.equal(hq.payload().sessions.find((s) => s.id === A).toolCount, 2);
    // the same break, 3 h long: the tracker is gone and the file is read from the start
    await hq.update(index, null, NOW + 4 * 3600e3);
    assert.deepEqual(hq.payload().sessions.map((s) => s.id), []);
    fs.appendFileSync(fp, line);
    index.mains[0].mtimeMs = NOW + 4 * 3600e3 + 60e3;
    bytes = 0;
    await hq.update(index, null, NOW + 4 * 3600e3 + 60e3);
    assert.equal(bytes, fs.statSync(fp).size + fs.statSync(path.join(proj, A, "subagents", "agent-x1.jsonl")).size, "the whole file and its subagent's were read again");
    assert.equal(hq.payload().sessions.find((s) => s.id === A).toolCount, 3);
  } finally {
    fs.readSync = orig;
  }
});

test("the payload names the home folder so the page masks it while streaming; none given, none named", async () => {
  const named = world({ home: path.join("C:", "Users", "homeuser") });
  await named.hq.update(named.index, null, NOW);
  assert.equal(named.hq.payload().homeName, "homeuser");
  const plain = world();
  await plain.hq.update(plain.index, null, NOW);
  assert.equal(plain.hq.payload().homeName, null);
});

// Desks for agents that are not subagents: Billing Watch (no running subagent of its type in this world) follows named
// live sessions, a heartbeat file in the world's folder, or both. `heartbeat` is the file's object, its raw text, or null
// for a file that is named but missing.
const iso = (t) => new Date(t).toISOString();
const HB = (fields = {}) => ({ agent: "billing", status: "working", task: "Asking the engines", startedAt: iso(NOW - 60e3), endedAt: null, summary: ["Asked 12 questions", "Acme named in 3"], ...fields });
const NO_DESK_WORK = { working: false, doing: null, forSession: null, source: null, status: "idle", task: null, summary: [], updatedAt: null };
function desk(opts = {}) {
  let file = null;
  const w = world({
    edit: (config, root) => {
      const a = config.agents.find((x) => x.id === "billing");
      if (opts.sessions) a.sessions = opts.sessions;
      if (!("heartbeat" in opts)) return;
      a.heartbeat = file = path.join(root, "billing.json");
      if (opts.heartbeat != null) fs.writeFileSync(file, typeof opts.heartbeat === "string" ? opts.heartbeat : JSON.stringify(opts.heartbeat));
    },
  });
  return { ...w, file };
}
const billing = (hq) => hq.payload().floor.agents.find((a) => a.id === "billing");
const pick = (a, keys) => Object.fromEntries(keys.map((k) => [k, a[k]]));
const DESK_KEYS = Object.keys(NO_DESK_WORK);
const withoutBilling = (p) => ({ ...p, floor: { ...p.floor, agents: p.floor.agents.filter((a) => a.id !== "billing") } });
async function baseline() {
  const b = world();
  await b.hq.update(b.index, null, NOW);
  return b.hq.payload();
}

test("a live session named in an agent's sessions puts it to work with that session's action and takes no live seat; its Live row is unchanged", async () => {
  const base = await baseline();
  assert.deepEqual(base.floor.sessions.map((s) => s.id), [A, C]);
  for (const pats of [["alpha"], ["alph*"]]) {
    const { hq, index } = desk({ sessions: pats });
    await hq.update(index, null, NOW);
    const p = hq.payload();
    assert.deepEqual(pick(billing(hq), DESK_KEYS), { working: true, doing: "Set up the env", forSession: "alpha", source: "session", status: "working", task: "Set up the env", summary: [], updatedAt: T0 + 100e3 }, pats.join());
    assert.deepEqual(p.floor.sessions.map((s) => s.id), [C], "alpha sits at Billing Watch's desk, not in a live seat");
    assert.deepEqual(p.sessions, base.sessions, "its Dashboard Live row is unchanged");
    assert.deepEqual(p.floor.agents.filter((a) => a.id !== "billing"), base.floor.agents.filter((a) => a.id !== "billing"), "agents without the keys carry exactly today's fields");
  }
});

test("a name that matches no live session does nothing; a matched session that is not working still sits at the desk, the agent idle", async () => {
  const base = await baseline();
  const { hq, index } = desk({ sessions: ["alp", "beta", "alpha-*", "ALPHA"] });
  await hq.update(index, null, NOW);
  assert.deepEqual(pick(billing(hq), DESK_KEYS), NO_DESK_WORK);
  assert.deepEqual(withoutBilling(hq.payload()), withoutBilling(base));
  const idle = desk({ sessions: ["gamma"] }); // registered, last seen a day ago
  await idle.hq.update(idle.index, null, NOW);
  assert.deepEqual(pick(billing(idle.hq), DESK_KEYS), NO_DESK_WORK);
  assert.deepEqual(idle.hq.payload().floor.sessions.map((s) => s.id), [A], "gamma takes no live seat either");
});

test("a heartbeat working puts the agent to work on its task; idle and failed leave it idle with its task, summary and time", async () => {
  const work = desk({ heartbeat: HB() });
  await work.hq.update(work.index, null, NOW);
  assert.deepEqual(pick(billing(work.hq), DESK_KEYS), { working: true, doing: "Asking the engines", forSession: null, source: "heartbeat", status: "working", task: "Asking the engines", summary: ["Asked 12 questions", "Acme named in 3"], updatedAt: NOW - 60e3 });
  for (const status of ["idle", "failed"]) {
    const d = desk({ heartbeat: HB({ status, task: `shift ended (${status})`, endedAt: iso(NOW - 30e3) }) });
    await d.hq.update(d.index, null, NOW);
    assert.deepEqual(pick(billing(d.hq), DESK_KEYS), { working: false, doing: null, forSession: null, source: "heartbeat", status, task: `shift ended (${status})`, summary: ["Asked 12 questions", "Acme named in 3"], updatedAt: NOW - 30e3 }, status);
  }
});

test("a heartbeat that is missing, not JSON, the wrong shape or over 64 KB is no activity, and the rest of the payload is as it was", async () => {
  const base = await baseline();
  const at64k = (n) => { const s = JSON.stringify(HB({ pad: "" })); return JSON.stringify(HB({ pad: "x".repeat(n - s.length) })); };
  assert.equal(Buffer.byteLength(at64k(65536)), 65536);
  const bad = {
    missing: null, "not JSON": "{ not json", "JSON null": "null", "an array": "[]", "a bad status": HB({ status: "busy" }), "no status": HB({ status: undefined }),
    "a task that is not text": HB({ task: 7 }), "a summary that is one string": HB({ summary: "one line" }), "a summary line that is not text": HB({ summary: ["ok", 7] }),
    "a start that is not a time": HB({ startedAt: 5 }), "over 64 KB": at64k(65537),
  };
  for (const [what, heartbeat] of Object.entries(bad)) {
    const d = desk({ heartbeat });
    await d.hq.update(d.index, null, NOW);
    assert.deepEqual(pick(billing(d.hq), DESK_KEYS), NO_DESK_WORK, what);
    assert.deepEqual(withoutBilling(d.hq.payload()), withoutBilling(base), what);
  }
  const edge = desk({ heartbeat: at64k(65536) }); // exactly 64 KB is still read
  await edge.hq.update(edge.index, null, NOW);
  assert.equal(billing(edge.hq).status, "working");
});

test("a working heartbeat whose file has not changed for over 2 h reads as quiet, not working", async () => {
  const { hq, index, file } = desk({ heartbeat: HB() });
  const touch = (t) => fs.utimesSync(file, new Date(t), new Date(t));
  touch(NOW - 2 * 3600e3 - 60e3);
  await hq.update(index, null, NOW);
  assert.deepEqual(pick(billing(hq), ["working", "doing", "source", "status", "task"]), { working: false, doing: null, source: "heartbeat", status: "quiet", task: "Asking the engines" });
  touch(NOW - 2 * 3600e3 + 60e3);
  await hq.update(index, null, NOW);
  assert.deepEqual(pick(billing(hq), ["working", "status"]), { working: true, status: "working" });
  const idle = desk({ heartbeat: HB({ status: "idle", endedAt: iso(NOW - 5 * 3600e3) }) });
  fs.utimesSync(idle.file, new Date(NOW - 5 * 3600e3), new Date(NOW - 5 * 3600e3));
  await idle.hq.update(idle.index, null, NOW);
  assert.equal(billing(idle.hq).status, "idle", "only a working heartbeat goes quiet");
});

test("a heartbeat keeps at most 5 summary lines of at most 300 characters and a task line of at most 200", async () => {
  const long = (n, c) => c.repeat(n);
  const d = desk({ heartbeat: HB({ task: long(250, "t"), summary: Array.from({ length: 7 }, (_, i) => i + long(450, "y")) }) });
  await d.hq.update(d.index, null, NOW);
  const b = billing(d.hq);
  assert.equal(b.task.length, 200);
  assert.ok(b.task.startsWith(long(199, "t")) && b.task.endsWith("\u2026"), "a cut line says it was cut");
  assert.equal(b.summary.length, 5);
  assert.ok(b.summary.every((s, i) => s.length === 300 && s.startsWith(i + "yyy") && s.endsWith("\u2026")));
  const fits = desk({ heartbeat: HB({ task: long(200, "t"), summary: [long(300, "s")] }) });
  await fits.hq.update(fits.index, null, NOW);
  assert.deepEqual(pick(billing(fits.hq), ["task", "summary"]), { task: long(200, "t"), summary: [long(300, "s")] }, "lines at the cap stay whole");
});

test("a working matched session wins over the heartbeat; otherwise the heartbeat speaks", async () => {
  const both = desk({ sessions: ["alpha"], heartbeat: HB() });
  await both.hq.update(both.index, null, NOW);
  assert.deepEqual(pick(billing(both.hq), ["working", "doing", "forSession", "source", "task", "summary"]), { working: true, doing: "Set up the env", forSession: "alpha", source: "session", task: "Set up the env", summary: [] });
  const quiet = desk({ sessions: ["gamma"], heartbeat: HB() }); // gamma is matched but idle
  await quiet.hq.update(quiet.index, null, NOW);
  assert.deepEqual(pick(billing(quiet.hq), ["working", "doing", "forSession", "source", "status"]), { working: true, doing: "Asking the engines", forSession: null, source: "heartbeat", status: "working" });
});

test("a heartbeat costs one stat a refresh and is read again only when its time or size changed", async () => {
  const { hq, index, file } = desk({ heartbeat: HB() });
  const orig = { stat: fs.statSync, open: fs.openSync };
  let stats = 0, reads = 0;
  fs.statSync = function (p, ...a) { if (String(p) === file) stats++; return orig.stat.call(this, p, ...a); };
  fs.openSync = function (p, ...a) { if (String(p) === file) reads++; return orig.open.call(this, p, ...a); }; // every read opens the file (readFileSync too)
  try {
    for (let i = 0; i < 3; i++) await hq.update(index, null, NOW);
    assert.deepEqual([stats, reads], [3, 1], "three refreshes, one read");
    fs.writeFileSync(file, JSON.stringify(HB({ task: "Asking the engines again" }))); // a new size
    await hq.update(index, null, NOW);
    assert.deepEqual([reads, billing(hq).task], [2, "Asking the engines again"]);
    fs.writeFileSync(file, JSON.stringify(HB({ task: "Asking the engines AGAIN" }))); // the same size, a new time
    const t = new Date(Date.now() + 60e3);
    fs.utimesSync(file, t, t);
    await hq.update(index, null, NOW);
    assert.deepEqual([reads, billing(hq).task], [3, "Asking the engines AGAIN"]);
    fs.unlinkSync(file);
    await hq.update(index, null, NOW);
    assert.deepEqual([stats, reads], [6, 3], "a missing file costs its stat and nothing more");
    assert.deepEqual(pick(billing(hq), DESK_KEYS), NO_DESK_WORK);
  } finally {
    fs.statSync = orig.stat;
    fs.openSync = orig.open;
  }
});

test("an agent with a heartbeat and a running subagent of its type works from the subagent, and the source says so", async () => {
  const { hq, index } = world({
    edit: (config, root) => {
      const file = path.join(root, "seo.json");
      fs.writeFileSync(file, JSON.stringify(HB({ agent: "seo" })));
      config.agents.find((x) => x.id === "seo").heartbeat = file; // seo's type, seo-technical, runs in alpha
    },
  });
  await hq.update(index, null, NOW);
  const seo = hq.payload().floor.agents.find((x) => x.id === "seo");
  assert.deepEqual(pick(seo, DESK_KEYS), { working: true, doing: "Audit the sitemap", forSession: "alpha", source: "subagent", status: "working", task: "Audit the sitemap", summary: [], updatedAt: null });
});

test("a heartbeat read that fails after a good stat is not kept: the next refresh reads it again", async () => {
  const { hq, index, file } = desk({ heartbeat: HB() });
  const orig = { read: fs.readFileSync, open: fs.openSync };
  let fail = 0;
  const flaky = (f) => function (p, ...a) {
    if (String(p) === file && fail > 0) { fail--; throw Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" }); } // a scanner holding the file
    return f.call(this, p, ...a);
  };
  fs.readFileSync = flaky(orig.read);
  fs.openSync = flaky(orig.open);
  try {
    fail = 1;
    await hq.update(index, null, NOW);
    assert.deepEqual(pick(billing(hq), DESK_KEYS), NO_DESK_WORK, "nothing read yet: no activity for now");
    await hq.update(index, null, NOW);
    assert.equal(billing(hq).task, "Asking the engines", "the next refresh reads it again");
    fs.writeFileSync(file, JSON.stringify(HB({ task: "Asking the engines again" })));
    fail = 1;
    await hq.update(index, null, NOW);
    assert.equal(billing(hq).task, "Asking the engines", "a failed read keeps what was last read");
    await hq.update(index, null, NOW);
    assert.equal(billing(hq).task, "Asking the engines again", "and the next refresh reads the new one");
  } finally {
    fs.readFileSync = orig.read;
    fs.openSync = orig.open;
  }
});

test("a heartbeat that grows past 64 KB after its stat is never read whole: at most 64 KB and one byte", async () => {
  const { hq, index, file } = desk({ heartbeat: HB() });
  const small = fs.statSync(file);
  fs.writeFileSync(file, JSON.stringify(HB({ pad: "x".repeat(1024 * 1024) }))); // 1 MB now, the stat still says small
  const orig = { stat: fs.statSync, read: fs.readFileSync, open: fs.openSync, readSync: fs.readSync, close: fs.closeSync };
  const fds = new Set(); // the heartbeat's open handles (a closed handle's number is reused by the transcript reads)
  let whole = 0, bytes = 0;
  fs.statSync = function (p, ...a) { return String(p) === file ? small : orig.stat.call(this, p, ...a); };
  fs.readFileSync = function (p, ...a) { if (String(p) === file) whole++; return orig.read.call(this, p, ...a); };
  fs.openSync = function (p, ...a) { const fd = orig.open.call(this, p, ...a); if (String(p) === file) fds.add(fd); return fd; };
  fs.readSync = function (fd, ...a) { const n = orig.readSync.call(this, fd, ...a); if (fds.has(fd)) bytes += n; return n; };
  fs.closeSync = function (fd, ...a) { fds.delete(fd); return orig.close.call(this, fd, ...a); };
  try {
    await hq.update(index, null, NOW);
  } finally {
    Object.assign(fs, { statSync: orig.stat, readFileSync: orig.read, openSync: orig.open, readSync: orig.readSync, closeSync: orig.close });
  }
  assert.equal(whole, 0, "never read whole");
  assert.ok(bytes > 0 && bytes <= 64 * 1024 + 1, `read ${bytes} bytes`);
  assert.deepEqual(pick(billing(hq), DESK_KEYS), NO_DESK_WORK, "too big is no activity");
});
