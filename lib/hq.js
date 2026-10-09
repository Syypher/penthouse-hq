// Joins live transcripts, their subagents and the coordination board into the /api/hq payload.
// update() runs on the server's refresh tick; payload() and json() are cheap reads of the result.
const fs = require("fs");
const path = require("path");
const { newCursor, readNew } = require("./tail");
const { newSession, foldSession, statusOf, sparkOf } = require("./session");
const { newProgress, foldProgress, progressView } = require("./progress");
const { newCache, foldCache, cacheView } = require("./cache");
const { boardView, clean } = require("./board");
const { newCollab, foldCollab, collabView } = require("./collab");

const LIVE_MS = 15 * 60e3;
const GRACE_MS = 2 * 60 * 60e3; // a tracker outlives its session's live window by this, so a break shorter than that never costs a full re-read
const MAX_SUBS = 12;
const MAX_LIST = 20; // delegations and handoffs per session
const MAX_FLOW = 60;
const DAY = 86400e3;
const QUIET_MS = 2 * 60 * 60e3; // a running delegation with no write for this long reads as quiet
const FRESH_MS = 5 * 60e3; // a message this recent makes its link flow
const ORDER = { "needs-you": 0, working: 1, thinking: 2, idle: 3 };
// A heartbeat file (an agent that is not a subagent writes it with temp plus rename): { agent, status, task,
// startedAt, endedAt, summary }. Its text comes from AI answers and web pages, so it is kept short and only ever text.
const BEAT_MAX = 64 * 1024;
const BEAT_STATUS = new Set(["working", "idle", "failed"]);
const TASK_MAX = 200;
const LINE_MAX = 300;
const LINES_MAX = 5;
const SUB_ID = /^a[0-9a-f]{16}$/; // a subagent file's id: subagents/agent-<id>.jsonl
const matches = (type, pats) => (pats || []).some((p) => (p.endsWith("*") ? type.startsWith(p.slice(0, -1)) : type === p));
const hash = (s) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

function tracker(fp, id, sub = false) {
  return { fp, sub, cursor: newCursor(), s: newSession(id), p: newProgress(), c: newCache(), k: newCollab() };
}
// Folds what the file has gained since the tracker last read it, one chunk at a time, giving the
// event loop a turn between chunks so HTTP requests interleave with a long first read.
async function pump(t, chunk) {
  for (;;) {
    const { lines, cursor, reset, more } = readNew(t.fp, t.cursor, chunk);
    if (reset) Object.assign(t, tracker(t.fp, t.s.id, t.sub));
    t.cursor = cursor;
    for (const line of lines) {
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      // Every row of a subagent's own file is marked sidechain (74,855 of 74,855 usage rows, measured
      // 2026-10-06); in that file it is the main line, and the fold functions skip sidechain rows.
      if (t.sub && row.isSidechain) row = { ...row, isSidechain: false };
      foldSession(t.s, row);
      foldProgress(t.p, row);
      foldCache(t.c, row);
      foldCollab(t.k, row);
    }
    if (!more) return;
    await new Promise((r) => setImmediate(r));
  }
}
function readMeta(fp) {
  try {
    return JSON.parse(fs.readFileSync(fp.replace(/\.jsonl$/, ".meta.json"), "utf8"));
  } catch {
    return {};
  }
}
// At most n characters (code points, so no emoji is cut in half); a cut line ends in an ellipsis.
function cap(s, n) {
  const c = [...s];
  return c.length > n ? c.slice(0, n - 1).join("") + "\u2026" : s;
}
const UNREAD = Symbol("unread"); // a read that failed after a good stat (a scanner holding the file, say)
// A heartbeat file's contents, or null for anything that is not one: over 64 KB, not JSON, the wrong shape; UNREAD
// when the read itself fails. At most 64 KB and one byte is ever read, so a file that grew after its stat is never
// loaded whole.
function readBeat(fp) {
  let fd, n = 0;
  const buf = Buffer.alloc(BEAT_MAX + 1);
  try {
    fd = fs.openSync(fp, "r");
    while (n < buf.length) {
      const got = fs.readSync(fd, buf, n, buf.length - n, n);
      if (!got) break;
      n += got;
    }
  } catch {
    return UNREAD;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }
  if (n > BEAT_MAX) return null; // it grew past 64 KB between the stat and the read
  let b;
  try {
    b = JSON.parse(buf.toString("utf8", 0, n));
  } catch {
    return null;
  }
  const time = (t) => t == null || typeof t === "string";
  if (!b || typeof b !== "object" || !BEAT_STATUS.has(b.status) || typeof b.task !== "string") return null;
  if (!Array.isArray(b.summary) || !b.summary.every((l) => typeof l === "string") || !time(b.startedAt) || !time(b.endedAt)) return null;
  const at = Date.parse(b.endedAt || b.startedAt);
  return { status: b.status, task: cap(b.task, TASK_MAX), summary: b.summary.slice(0, LINES_MAX).map((l) => cap(l, LINE_MAX)), updatedAt: Number.isFinite(at) ? at : null };
}

// `home` is the owner's home directory: its folder name reaches the page so Streamer mode can mask it
// wherever a path shows it. `chunk` caps one transcript read (tests pass a small one).
function createHq({ config, board, home = null, chunk }) {
  const live = new Map(); // session id -> { main, project, subs: Map(fp -> { t, meta, mtimeMs }), shown }
  const beats = new Map(); // agent id -> { mtimeMs, size, beat }: its heartbeat file as last read
  const homeName = home ? path.basename(home) : null;
  let snapshot = null;
  let text = "null";

  // One stat per heartbeat a refresh; the file is read again only when its time or size changed. A missing file is
  // no activity for that desk; a read that fails keeps what was last read and is tried again on the next refresh.
  // Neither ever stops the rest of the payload.
  function readBeats() {
    for (const a of config.agents) {
      if (!a.heartbeat) continue;
      let st;
      try {
        st = fs.statSync(a.heartbeat);
      } catch {
        beats.delete(a.id);
        continue;
      }
      const was = beats.get(a.id);
      if (was && was.mtimeMs === st.mtimeMs && was.size === st.size) continue;
      const beat = st.isFile() && st.size <= BEAT_MAX ? readBeat(a.heartbeat) : null;
      if (beat !== UNREAD) beats.set(a.id, { mtimeMs: st.mtimeMs, size: st.size, beat });
    }
  }

  async function update(index, stats, now = Date.now()) {
    readBeats();
    const snap = board ? board.read(now) : null;
    const byId = new Map(index.mains.map((m) => [m.sessionId, m]));
    const lastOf = (m) => Math.max(m.mtimeMs, index.subMtime[m.sessionId] || 0);
    const ids = new Set(); // shown: written to in the last 15 minutes, or registered and not ended
    for (const m of index.mains) if (now - lastOf(m) <= LIVE_MS) ids.add(m.sessionId);
    if (snap) for (const s of Object.values(snap.sessions)) if (!s.endedAt) ids.add(s.id);
    const kept = new Set(ids); // tracked: shown, or quiet for less than the grace period, so coming back reads only what is new
    for (const m of index.mains) if (now - lastOf(m) <= GRACE_MS) kept.add(m.sessionId);
    for (const [id, L] of [...live]) {
      if (kept.has(id)) L.shown = ids.has(id);
      else live.delete(id);
    }
    for (const id of ids) {
      const m = byId.get(id);
      let L = live.get(id);
      if (!L) live.set(id, (L = { main: null, project: null, subs: new Map(), shown: true }));
      if (!L.main && m) {
        L.main = tracker(m.fp, id);
        L.project = m.project;
      }
      if (L.main) await pump(L.main, chunk);
    }
    for (const sub of index.subs) {
      const L = live.get(sub.sessionId);
      if (!L || !L.shown) continue;
      let S = L.subs.get(sub.fp);
      if (!S) L.subs.set(sub.fp, (S = { t: tracker(sub.fp, path.basename(sub.fp, ".jsonl"), true), meta: readMeta(sub.fp), mtimeMs: -1 }));
      if (sub.mtimeMs !== S.mtimeMs) {
        S.mtimeMs = sub.mtimeMs;
        await pump(S.t, chunk);
      }
    }
    snapshot = build(snap, stats, now);
    text = JSON.stringify(snapshot);
  }

  // A session's delegations with their agent, cost and quiet state, and its handoffs with names for pipes.
  function collabOf(L, k, peerOf, now) {
    if (!k) return { delegations: [], handoffs: [], prs: [], completions: [] };
    const byUse = new Map([...L.subs.values()].filter((x) => x.meta.toolUseId).map((x) => [x.meta.toolUseId, x.t]));
    const byId = new Map([...L.subs.values()].map((x) => [x.t.s.id, x]));
    const agentOf = (type) => config.agents.find((a) => matches(type, a.agentTypes));
    const delegations = k.delegations.slice(0, MAX_LIST).map((d) => {
      const sub = byUse.get(d.id);
      const agent = agentOf(d.type);
      const lastWrite = Math.max(d.startedAt, (sub && sub.s.lastAt) || 0);
      return {
        ...d,
        status: d.status === "running" && now - lastWrite > QUIET_MS ? "quiet" : d.status,
        agentId: agent ? agent.id : null,
        agentName: agent ? agent.name : d.type,
        cost: sub ? sub.c.cost : null,
      };
    });
    // A message to one of this session's own subagents is a follow-up to that agent, not a handoff to a peer.
    const toAgent = (to) => {
      const sub = byId.get("agent-" + to);
      if (!sub && !SUB_ID.test(to)) return null;
      const type = (sub && sub.meta.agentType) || "subagent";
      const agent = agentOf(type);
      return { peer: agent ? agent.name : type === "subagent" ? "a subagent" : type, agentId: agent ? agent.id : null, agentType: type };
    };
    const handoffs = [
      ...k.sent.map((m) => ({ at: m.at, dir: "out", ...(toAgent(m.to) || { peer: peerOf(m.to), agentId: null, agentType: null }), text: m.text })),
      ...k.received.map((m) => ({ at: m.at, dir: "in", peer: m.from, agentId: null, agentType: null, text: m.text })),
    ]
      .sort((a, b) => b.at - a.at)
      .slice(0, MAX_LIST);
    // A shell that finished inside a subagent: its launching call sits in that subagent's transcript, so the
    // description comes from there and the command never does (the notification quotes the command when
    // the call had no description: 9 of 812 measured 2026-10-06).
    const shells = new Map();
    for (const x of L.subs.values()) for (const [id, desc] of x.t.k.shell) shells.set(id, desc);
    const completions = k.completions.slice(0, 10).map(({ useId, ...c }) => ({ ...c, text: shells.has(useId) ? shells.get(useId) || "A background command" : c.text }));
    return { delegations, handoffs, prs: k.prs.slice(0, 10), completions };
  }

  // The last 24 h of work between sessions, agents and peers, newest first.
  function flowOf(sessions, view, byName, now) {
    const flow = [];
    for (const x of sessions) {
      for (const d of x.delegations)
        flow.push({ at: d.doneAt || d.startedAt, kind: "delegate", from: x.name, to: d.agentName, agentId: d.agentId, sessionId: x.id, text: d.description, status: d.status, startedAt: d.startedAt, doneAt: d.doneAt });
      for (const h of x.handoffs) {
        if (h.dir === "in" && byName.has(h.peer)) continue; // the live sender already shows it
        flow.push({ at: h.at, kind: "handoff", from: h.dir === "out" ? x.name : h.peer, to: h.dir === "out" ? h.peer : x.name, sessionId: x.id, text: h.text });
      }
      for (const c of x.completions) flow.push({ at: c.at, kind: "done", from: x.name, sessionId: x.id, text: c.text, status: c.status });
      for (const p of x.prs) flow.push({ at: p.at, kind: "pr", from: x.name, sessionId: x.id, text: `Opened PR #${p.number}` + (p.repo ? ` in ${p.repo}` : ""), url: p.url });
    }
    if (view) for (const e of view.feed) flow.push({ at: e.at, kind: e.kind, from: e.by, sessionId: byName.has(e.by) ? byName.get(e.by).id : null, text: e.text });
    return flow.filter((e) => now - e.at <= DAY).sort((a, b) => b.at - a.at).slice(0, MAX_FLOW);
  }

  // Who worked with whom over the last 24 h: one node per session, agent or peer, one edge per pair and kind.
  function teamOf(sessions, byName, now) {
    const nodes = new Map();
    const edges = new Map();
    const node = (id, n) => {
      if (!nodes.has(id)) nodes.set(id, { id, ...n });
    };
    const sessionNode = (x) => node("s:" + x.id, { label: x.name, kind: "session", status: x.status, sessionId: x.id });
    const link = (from, to, kind, at, active) => {
      const key = [from, to].sort().join("|") + "|" + kind;
      if (!edges.has(key)) edges.set(key, { from, to, kind, count: 0, lastAt: 0, active: false });
      const e = edges.get(key);
      e.count++;
      e.lastAt = Math.max(e.lastAt, at);
      e.active = e.active || active;
    };
    const agentNode = (agentId, type, label) => {
      const agent = agentId ? config.agents.find((a) => a.id === agentId) : null;
      const dept = agent ? config.departments.find((p) => p.name === agent.dept) : null;
      const aid = agent ? "a:" + agent.id : "t:" + type;
      node(aid, { label, kind: "agent", color: dept ? dept.color : null });
      return aid;
    };
    for (const x of sessions) {
      const me = "s:" + x.id;
      for (const d of x.delegations) {
        if (d.status !== "running" && now - (d.doneAt || d.startedAt) > DAY) continue;
        sessionNode(x);
        link(me, agentNode(d.agentId, d.type, d.agentName), "delegate", d.doneAt || d.startedAt, d.status === "running");
      }
      for (const h of x.handoffs) {
        if (now - h.at > DAY) continue;
        if (h.agentType) {
          sessionNode(x); // a follow-up to this session's own subagent joins its agent node
          link(me, agentNode(h.agentId, h.agentType, h.peer), "handoff", h.at, now - h.at <= FRESH_MS);
          continue;
        }
        const peer = byName.get(h.peer);
        if (h.dir === "in" && peer) continue; // counted on the sender
        const pid = peer ? "s:" + peer.id : "p:" + h.peer;
        sessionNode(x);
        if (peer) sessionNode(peer);
        else node(pid, { label: h.peer, kind: "peer" });
        link(h.dir === "out" ? me : pid, h.dir === "out" ? pid : me, "handoff", h.at, now - h.at <= FRESH_MS);
      }
    }
    return { nodes: [...nodes.values()], edges: [...edges.values()] };
  }

  // Where an agent named in config by `sessions` or `heartbeat` gets its work: a matched live session that is working
  // or thinking, else a running subagent of its type (today's rule), else its heartbeat; `source` names which one
  // ("session", "subagent", "heartbeat", or null for none). A working heartbeat whose file has not changed for
  // QUIET_MS reads as quiet.
  function deskOf(a, mine, job, now) {
    const s = mine.find((x) => x.status === "working" || x.status === "thinking");
    if (s) return { working: true, doing: s.action, forSession: s.name, source: "session", status: "working", task: s.action, summary: [], updatedAt: s.lastAt };
    if (job) return { source: "subagent", status: "working", task: job.description, summary: [], updatedAt: null };
    const b = beats.get(a.id);
    if (!b || !b.beat) return { source: null, status: "idle", task: null, summary: [], updatedAt: null };
    const status = b.beat.status === "working" && now - b.mtimeMs > QUIET_MS ? "quiet" : b.beat.status;
    return { working: status === "working", doing: status === "working" ? b.beat.task : null, forSession: null, source: "heartbeat", status, task: b.beat.task, summary: b.beat.summary, updatedAt: b.beat.updatedAt };
  }

  function build(snap, stats, now) {
    const shown = [...live].filter(([, L]) => L.shown); // a tracker kept through a quiet spell is not a session on the page
    const view = boardView(snap, shown.map(([id]) => id));
    const views = new Map(shown.map(([id, L]) => [id, L.main ? collabView(L.main.k) : null]));
    const pipes = Object.assign({}, ...[...views.values()].map((k) => (k ? k.pipes : {})));
    const peerOf = (to) => (to.startsWith("uds:") ? pipes[to] || "another session" : to);
    const sessions = [];
    const boardNames = new Map(); // session id -> its name on the coordination board
    for (const [id, L] of shown) {
      const r = snap && snap.sessions[id];
      if (r && r.name) boardNames.set(id, r.name);
      const s = L.main ? L.main.s : newSession(id);
      const subs = [...L.subs.values()]
        .map(({ t, meta }) => {
          const st = statusOf(t.s, now);
          return {
            id: t.s.id, type: meta.agentType || null, description: meta.description ? clean(meta.description) : null,
            running: st === "working" || st === "thinking", cost: t.c.cost, cache: cacheView(t.c, now), toolCount: t.s.toolCount, lastAt: t.s.lastAt,
          };
        })
        .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
      const status = statusOf(s, now);
      const cwd = (r && r.cwd) || s.cwd;
      sessions.push({
        id,
        name: (r && r.name) || s.title || id.slice(0, 8),
        title: s.title,
        project: (cwd && path.basename(cwd)) || L.project, // the folder's own name, never the encoded one
        cwd,
        branch: s.branch === "HEAD" ? null : s.branch, // outside a branch Claude Code records "HEAD"
        task: r && r.task ? clean(r.task) : null,
        status,
        action: s.events.length ? s.events[s.events.length - 1].label : null,
        startedAt: s.firstAt,
        lastAt: s.lastAt != null ? s.lastAt : (r && r.lastSeen) || null,
        toolCount: s.toolCount,
        cost: (L.main ? L.main.c.cost : 0) + subs.reduce((x, u) => x + u.cost, 0),
        progress: L.main ? progressView(L.main.p, now) : null,
        cache: L.main ? cacheView(L.main.c, now) : null,
        subagents: subs.slice(0, MAX_SUBS),
        subagentsTotal: subs.length,
        locks: view ? view.locks.filter((l) => l.session === id || (r && l.session === r.name)).map((l) => l.name) : [],
        claims: view ? view.claims.filter((c) => c.session === id).map((c) => c.path) : [],
        events: s.events.slice().reverse(),
        registered: !!r,
        avatar: hash(id) % config.sessionAvatars.length,
        spark: sparkOf(s, now),
        ...collabOf(L, views.get(id), peerOf, now),
      });
    }
    sessions.sort((a, b) => ORDER[a.status] - ORDER[b.status] || (b.lastAt || 0) - (a.lastAt || 0));
    const byName = new Map(sessions.map((x) => [x.name, x]));
    const links = [];
    for (const x of sessions)
      for (const d of x.delegations)
        if (d.status === "running" && d.agentId && !links.some((l) => l.from === x.id && l.to === d.agentId)) links.push({ from: x.id, to: d.agentId });
    const running = sessions.flatMap((x) => x.subagents.filter((u) => u.running).map((u) => ({ ...u, sessionName: x.name })));
    // a live session whose board name an agent's `sessions` matches sits at that agent's desk, never in a live seat;
    // its Live row on the Dashboard is unchanged
    const seatOf = new Map();
    for (const a of config.agents)
      if (a.sessions) for (const x of sessions) if (!seatOf.has(x.id) && boardNames.has(x.id) && matches(boardNames.get(x.id), a.sessions)) seatOf.set(x.id, a.id);
    const agents = config.agents.map((a) => {
      const job = running.find((u) => matches(u.type || "", a.agentTypes));
      const out = { id: a.id, name: a.name, dept: a.dept, hangout: a.hangout, look: a.look, avatar: a.avatar, working: !!job, doing: job ? job.description : null, forSession: job ? job.sessionName : null };
      if (!a.sessions && !a.heartbeat) return out;
      return Object.assign(out, deskOf(a, sessions.filter((x) => seatOf.get(x.id) === a.id), job, now));
    });
    const count = (st) => sessions.filter((x) => x.status === st).length;
    const conflicts = view ? view.conflicts.length : null;
    return {
      generatedAt: now,
      appName: config.appName,
      homeName,
      vitals: {
        liveSessions: sessions.length,
        subagentsRunning: running.length,
        toolCallsToday: stats ? stats.toolsToday : null,
        spendToday: stats ? stats.today : null,
        planUsd: config.planUsd,
        filesClaimed: view ? view.claims.length : null,
        conflicts,
      },
      pill: { working: count("working") + count("thinking"), needsYou: count("needs-you"), conflicts: conflicts || 0 },
      sessions,
      board: view ? { conflicts: view.conflicts, locks: view.locks, feed: view.feed } : null,
      activity: stats && stats.activity ? stats.activity : null,
      flow: flowOf(sessions, view, byName, now),
      team: teamOf(sessions, byName, now),
      floor: {
        departments: config.departments,
        owner: config.owner,
        accent: config.accent,
        sessionAvatars: config.sessionAvatars,
        links,
        agents,
        sessions: sessions.filter((x) => !seatOf.has(x.id)).map((x) => ({ id: x.id, name: x.name, status: x.status, working: x.status === "working" || x.status === "thinking", action: x.action, avatar: x.avatar })),
      },
    };
  }

  return { update, payload: () => snapshot, json: () => text };
}

module.exports = { createHq };
