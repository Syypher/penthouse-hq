// The Dashboard tab, Robinhood-simple: one number and its chart, the live sessions as rows that open
// their details under themselves, a map of who works with whom, and the Flow rail of handoffs,
// delegations and finished work. Every string from a transcript goes through el() or svg(), so it
// can only ever be text. Rows, flow items and map nodes are kept by key between polls, so a poll
// that changes nothing moves nothing, and a poll that does change something moves only that: rows
// glide to their new order, new items slide in, numbers roll, colors and sparklines ease.
import { el, svg } from "./dom.js";
import { usd, tokens, dur, ago, clock, countdown, num, count, noun, STATUS } from "./format.js";
import { sparkPath } from "./chart.js";
import { createHero } from "./hero.js";
import { ms, animate, finished, flip, roll, underline, edge, ENTER, LEAVE } from "./motion.js";
import { MASK, shown, streaming, splitNames } from "./streamer.js";

const $ = (id) => document.getElementById(id);
// Streamer mode: a name or title is rendered through shown() and blurred, so the real text is never drawn
const name = (text, tag = "span") => el(tag, { class: streaming() ? "masked" : null, text: shown(text) });
const names = (list) => list.filter(Boolean).flatMap((t, i) => (i ? [" \u00b7 ", name(t)] : [name(t)]));
// Free text (a task line, a path, a message) with every known name masked in place: not streaming
// gives the text as it is; streaming gives the plain runs as strings and each name as a masked span.
// No attribute on the page carries free text, so there is no string form of this.
let known = [];
const said = (text) => (streaming() ? splitNames(text, known).map((p) => (p.masked ? el("span", { class: "masked", text: MASK }) : p.text)) : [text]);
// Every name the page masks as a label, read from the poll it came in: sessions with their projects
// and branches, subagent titles and types, every floor agent (named in a task line or not), peers,
// repos, the Flow's parties, the board's lock holders and conflict parties. Rebuilt on every poll, so
// a name quoted in old text is caught too, and so is a session that has ended but still signs a note on
// the board. The payload's placeholders for an unknown party and the built-in generic subagent types
// are common words, not names, so they never mask a task or a path, unless a session, project, branch,
// lock holder, conflict party or note author really carries that word as its name. The home folder's name
// (the server sends it) is one more hard name, so no path on the page shows the owner's user folder.
const NOT_NAMES = new Set(["a subagent", "another session", "general-purpose", "Explore", "Plan", "claude"]);
function namesOf(hq) {
  const out = [], hard = new Set();
  const own = (...names) => { for (const n of names) { out.push(n); hard.add(n); } };
  if (hq.homeName) own(hq.homeName);
  for (const s of hq.sessions) {
    own(s.name, s.project, s.branch);
    for (const u of s.subagents) out.push(u.description, u.type);
    for (const d of s.delegations) out.push(d.agentName, d.description);
    for (const h of s.handoffs) out.push(h.peer);
    for (const p of s.prs) out.push(p.repo);
  }
  for (const a of (hq.floor && hq.floor.agents) || []) out.push(a.name);
  for (const e of hq.flow || []) out.push(e.from, e.to);
  if (hq.team) for (const n of hq.team.nodes) out.push(n.label);
  if (hq.board) {
    for (const l of hq.board.locks) own(l.sessionName);
    for (const c of hq.board.conflicts) own(...c.sessions);
    for (const e of hq.board.feed || []) own(e.by);
  }
  return out.filter((n) => hard.has(n) || !NOT_NAMES.has(n));
}
let last = null;
let openId = null;
let hero = null;
let filter = "all";
let booted = false;

// The header's app name and status pill show on every tab, so app.js writes them for every new payload
export function renderHeader(hq) {
  document.title = hq.appName;
  $("app-name").textContent = hq.appName;
  const p = hq.pill;
  $("pill").textContent = `${p.working} working \u00b7 ${p.needsYou} needs you \u00b7 ${count(p.conflicts, "conflict")}`;
}

export function renderDashboard(hq) {
  last = hq;
  known = namesOf(hq);
  const now = Date.now();
  if (!hero) hero = createHero($("hero"), { label: "Actions", field: "tools", format: num });
  hero.update(hq.activity);
  renderStats(hq.vitals);
  renderRows(hq.sessions, now);
  renderTeam(hq.team);
  renderFlow(now);
  if (!booted) {
    booted = true; // first paint: the modules settle in one after another while the line draws
    document.querySelectorAll("#view-dashboard .grid > *").forEach((n, i) => animate(n, ENTER, ms("slow"), { delay: 60 * i }));
  }
}

const STATS = [
  ["live", (v) => num(v.liveSessions), () => "live"],
  ["subs", (v) => num(v.subagentsRunning), (v) => noun(v.subagentsRunning, "subagent") + " running"],
  ["actions", (v) => (v.toolCallsToday == null ? "-" : num(v.toolCallsToday)), (v) => noun(v.toolCallsToday, "action") + " today"],
  ["spend", (v) => usd(v.spendToday), (v) => `today, API-equivalent ($${v.planUsd}/mo plan)`],
  ["files", (v) => (v.filesClaimed == null ? "-" : num(v.filesClaimed)), (v) => noun(v.filesClaimed, "file") + " claimed" + (v.conflicts ? `, ${v.conflicts} in conflict` : "")],
];
function renderStats(v) {
  const box = $("stats");
  if (!box.children.length) box.replaceChildren(...STATS.map(() => el("span", {}, el("b", { class: "roll" }), el("span"))));
  STATS.forEach(([k, value, label], i) => {
    const span = box.children[i];
    roll(span.firstChild, value(v), "stat:" + k); // first paint lands at once; later changes roll
    span.lastChild.textContent = " " + label(v);
  });
}

const DONE = { done: "Done", failed: "Failed", stopped: "Stopped" };
const delegStatus = (d, now) => (d.status === "running" ? `Running ${dur(now - d.startedAt)}` : d.status === "done" ? `Done in ${dur(d.doneAt - d.startedAt)}` : DONE[d.status] || "No activity");
// A link to a PR; while streaming it is text with no href, so hovering it shows no owner/repo in the status bar
const link = (url, text) => (url && /^https:\/\//.test(url) && !streaming() ? el("a", { href: url, target: "_blank", rel: "noopener noreferrer", onclick: (e) => e.stopPropagation() }, ...said(text)) : said(text));
const activate = (fn) => ({ tabindex: "0", role: "button", onclick: fn, onkeydown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), fn()) });
const progressText = (p) => `Step ${p.step} of ${p.of}` + (p.done ? ", done" : p.finishAt ? `, done around ${clock(p.finishAt)}` : "");

// --- live sessions: one row per session, kept by id so a changed poll moves only what changed; the
// open row's details are rebuilt in place on every poll, with nothing replayed ---
const rowsById = new Map();
let rowQueue = Promise.resolve();
let moreRows = null;
const sid = (id) => "sd-" + String(id).replace(/[^\w-]/g, "_");

function makeRow(s) {
  const r = {
    where: el("span", { class: "ri-where" }), sub: el("p", { class: "ri-sub" }), meta: el("p", { class: "ri-meta" }),
    fill: el("span", { class: "fill" }), progT: el("span", { class: "ri-prog-t" }), spark: svg("path"), st: el("span", { class: "st-label" }),
    detail: el("div", { class: "ri-detail" }),
  };
  r.nm = el("span");
  r.name = el("p", { class: "ri-name" }, r.nm, r.where);
  r.prog = el("div", { class: "ri-prog", hidden: true }, el("span", { class: "track" }, r.fill), r.progT);
  r.head = el("div", { class: "ri-head", "aria-expanded": "false", "aria-controls": sid(s.id), ...activate(() => toggleSession(s.id)) },
    el("div", {}, r.name, r.sub, r.meta, r.prog),
    svg("svg", { class: "spark", viewBox: "0 0 96 32", preserveAspectRatio: "none", "aria-hidden": "true" }, r.spark),
    r.st);
  r.more = el("div", { class: "ri-more", id: sid(s.id) }, r.detail);
  r.li = el("li", { class: "row-item" }, r.head, r.more);
  return r;
}

function updateRow(r, s, now) {
  r.s = s; // what the row last drew, so a Streamer toggle can redraw it in place (remask)
  r.now = now;
  const p = s.progress;
  const open = openId === s.id;
  r.li.className = `row-item st-${s.status}` + (open ? " open" : "");
  r.head.setAttribute("aria-expanded", String(open));
  r.head.setAttribute("aria-label", `${shown(s.name)}, ${STATUS[s.status]}`);
  r.nm.textContent = shown(s.name);
  r.nm.classList.toggle("masked", streaming());
  r.where.replaceChildren(...names([s.project, s.branch]));
  r.sub.replaceChildren(...said(s.action || s.task || "No tool calls yet"));
  r.meta.replaceChildren(...said([
    s.startedAt ? `${dur(now - s.startedAt)} elapsed` : s.lastAt ? `last seen ${ago(s.lastAt, now)}` : null,
    count(s.toolCount, "action"),
    s.subagentsTotal ? `${s.subagents.filter((u) => u.running).length} of ${count(s.subagentsTotal, "subagent")} running` : null,
    usd(s.cost),
    s.locks.length ? `holds the ${s.locks.join(", ")} ${noun(s.locks.length, "lock")}` : null,
  ].filter(Boolean).join(" \u00b7 ")));
  r.prog.hidden = !p;
  if (p) {
    r.fill.style.width = p.pct + "%"; // the width transition in app.css carries it
    r.progT.textContent = progressText(p);
  }
  const d = sparkPath(s.spark, 96, 32);
  if (r.spark.getAttribute("d") !== d) r.spark.style.d = `path("${d}")`; // set as CSS so the d transition runs
  r.spark.setAttribute("d", d);
  r.st.className = `st-label c-${s.status}`;
  r.st.textContent = STATUS[s.status];
  if (open) fillDetail(r, s, now);
}

// Leaving rows fade first, then the list closes the gap; then kept rows glide to the new order and
// new rows slide in. Polls queue behind each other so a slow sequence never tangles with the next.
function renderRows(sessions, now) {
  rowQueue = rowQueue.then(() => applyRows(sessions, now)).catch(console.error); // a renderer error is logged, the queue stays alive
}
// Settles once every render queued so far has drawn its rows (app.js opens a row after it)
export const rowsDrawn = () => rowQueue;
// A Streamer toggle redraws every drawn row in place, now, in the toggle's own task, from what each row last drew: a row
// fading out (it stays in rowsById until it is removed) and the open row's details included. Whatever the row queue is
// doing, no frame after the press carries a real name. It writes text only and measures nothing, so it is the one render
// that also lands in a hidden Dashboard.
export function remask() {
  for (const r of rowsById.values()) if (r.s) updateRow(r, r.s, r.now);
}
async function applyRows(sessions, now) {
  const ul = $("sessions");
  if (!moreRows) moreRows = edge(ul);
  const ids = new Set(sessions.map((s) => s.id));
  const gone = [...rowsById].filter(([id]) => !ids.has(id));
  if (gone.length) {
    if (gone.some(([id]) => id === openId)) closeSession();
    await Promise.all(gone.map(([, r]) => finished(animate(r.li, LEAVE, ms("fast")))));
    flip(ul, () => gone.forEach(([id, r]) => { r.li.remove(); rowsById.delete(id); }));
    await new Promise((res) => setTimeout(res, ms("mid")));
  }
  const empty = ul.querySelector(".empty");
  if (!sessions.length) {
    if (!empty) ul.replaceChildren(el("li", { class: "empty", text: "No live sessions. Start one and it shows up here within a few seconds." }));
    moreRows();
    return;
  }
  if (empty) empty.remove();
  const fresh = [];
  flip(ul, () => ul.append(...sessions.map((s) => {
    let r = rowsById.get(s.id);
    if (!r) {
      r = makeRow(s);
      rowsById.set(s.id, r);
      fresh.push(r.li);
    }
    updateRow(r, s, now);
    return r.li;
  })), fresh);
  moreRows();
}

const short = (s, n = 20) => (s.length > n ? s.slice(0, n - 1) + "\u2026" : s);

// --- who works with whom: sessions in the middle, the agents and peers they worked with around ---
// them, one curve per pair, thicker the more often they worked together, flowing while the work
// runs. The drawing fills its module's box; nodes and curves are kept by id, so a change eases
// them to their new place.
let teamSig = "", teamSvg = null, teamW = 0, teamH = 0;
const teamNodes = new Map(), teamEdges = new Map();
function renderTeam(team) {
  const box = $("team");
  const H = parseInt(getComputedStyle(box).getPropertyValue("--team-h"), 10) || 360;
  const sig = JSON.stringify(team) + "|" + box.clientWidth + "|" + H + "|" + streaming();
  if (sig === teamSig) return; // unchanged: keep the running animations smooth
  teamSig = sig;
  if (!team || !team.edges.length) {
    teamSvg = null;
    teamNodes.clear();
    teamEdges.clear();
    box.replaceChildren(el("p", { class: "muted", text: "When sessions delegate to agents or message each other, the links show up here." }));
    return;
  }
  const W = Math.max(380, Math.min(800, box.clientWidth || 800)), cx = W / 2, cy = H / 2; // narrow boxes keep the labels readable
  if (!teamSvg || W !== teamW || H !== teamH) {
    teamW = W;
    teamH = H;
    teamNodes.clear();
    teamEdges.clear();
    teamSvg = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Who works with whom over the last 24 hours" });
    box.replaceChildren(teamSvg);
  }
  const pos = new Map();
  const ring = (list, rx, ry, a0) => list.forEach((n, i) => {
    const a = a0 + (2 * Math.PI * i) / list.length;
    pos.set(n.id, [cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  });
  const inner = team.nodes.filter((n) => n.kind === "session");
  const outer = team.nodes.filter((n) => n.kind !== "session");
  if (inner.length === 1) pos.set(inner[0].id, [cx, cy]);
  else ring(inner, W * 0.16, H * 0.19, -Math.PI / 2);
  ring(outer, W * 0.4, H * 0.36, -Math.PI / 2 + Math.PI / Math.max(2, outer.length));
  const keep = new Set();
  const fade = (node) => finished(animate(node, [{ opacity: 1 }, { opacity: 0 }], ms("fast"))).then(() => node.remove());
  for (const e of team.edges) {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) continue;
    const key = `${e.from}>${e.to}>${e.kind}`;
    keep.add(key);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    const qx = mx + (my - cy) * 0.18, qy = my - (mx - cx) * 0.18;
    const d = `M${a[0].toFixed(1)},${a[1].toFixed(1)} Q${qx.toFixed(1)},${qy.toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`;
    let path = teamEdges.get(key);
    if (!path) {
      path = svg("path", { d }, svg("title"));
      path.style.d = `path("${d}")`;
      teamEdges.set(key, path);
      teamSvg.prepend(path); // curves under the nodes
      animate(path, [{ opacity: 0 }, { opacity: 1 }], ms("slow"));
    } else if (path.getAttribute("d") !== d) {
      path.style.d = `path("${d}")`; // the d transition in app.css eases the curve
      path.setAttribute("d", d);
    }
    path.setAttribute("class", `edge ${e.kind}${e.active ? " active" : ""}`);
    path.style.strokeWidth = String(Math.min(5, 1 + Math.log2(1 + e.count)));
    path.firstChild.textContent = count(e.count, e.kind === "delegate" ? "delegation" : "message");
  }
  for (const [key, path] of teamEdges) if (!keep.has(key)) { teamEdges.delete(key); fade(path); }
  const keepNodes = new Set();
  for (const n of team.nodes) {
    const [x, y] = pos.get(n.id);
    const r = n.kind === "session" ? 6 : 4.5;
    keepNodes.add(n.id);
    let g = teamNodes.get(n.id);
    const fresh = !g;
    if (fresh) {
      g = svg("g", {}, svg("circle"), svg("text"));
      if (n.sessionId) {
        g.setAttribute("tabindex", "0");
        g.setAttribute("role", "button");
        g.addEventListener("click", () => openSession(n.sessionId));
        g.addEventListener("keydown", (e) => e.key === "Enter" && openSession(n.sessionId));
      }
      teamNodes.set(n.id, g);
      teamSvg.append(g);
    }
    g.setAttribute("class", `node ${n.kind}${n.kind === "session" ? " s-" + n.status : ""}`);
    g.setAttribute("aria-label", shown(n.label));
    g.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; // the transform transition eases it
    g.firstChild.setAttribute("r", String(r));
    g.lastChild.setAttribute("y", String(r + 15));
    g.lastChild.textContent = short(shown(n.label), W >= 600 ? 20 : W >= 420 ? 16 : 14); // a narrow map cuts sooner so neighbors stay apart
    g.lastChild.classList.toggle("masked", streaming());
    // a label near the left or right edge slides sideways so it stays inside the drawing
    const half = g.lastChild.getComputedTextLength() / 2, pad = 4;
    g.lastChild.setAttribute("x", (x - half < pad ? pad - x + half : x + half > W - pad ? W - pad - x - half : 0).toFixed(1));
    if (fresh) animate(g, [{ opacity: 0 }, { opacity: 1 }], ms("slow"));
  }
  for (const [id, g] of teamNodes) if (!keepNodes.has(id)) { teamNodes.delete(id); fade(g); }
}

// --- the Flow rail: the filters are built once with a sliding underline; items are kept by key, so
// a poll only slides in what is new (with a brief accent highlight) and a filter switch re-lists ---
const FILTERS = [["all", "All"], ["handoff", "Handoffs"], ["delegate", "Delegations"], ["done", "Done"], ["board", "Board"]];
const GROUP = { handoff: "handoff", delegate: "delegate", done: "done", pr: "done", note: "board", lock: "board", unlock: "board" };
const flowItems = new Map();
let flowUi = null;
const flowKey = (e) => [e.kind, e.at, e.from, e.to, e.text].join("|");

function buildFlow() {
  const group = el("div", { class: "filters", role: "group", "aria-label": "Show" });
  const line = underline(group);
  const buttons = FILTERS.map(([k, label]) => el("button", {
    type: "button", "aria-pressed": String(k === filter), text: label,
    onclick: () => {
      if (k === filter) return;
      filter = k;
      for (const b of buttons) b.setAttribute("aria-pressed", String(b.textContent === label));
      line.to(buttons[FILTERS.findIndex(([x]) => x === k)]);
      renderFlow(Date.now(), true);
    },
  }));
  group.append(...buttons);
  flowUi = { warn: el("p", { class: "warn", hidden: true }), list: el("ol", { class: "flow scroll" }), empty: el("p", { class: "muted", hidden: true }) };
  $("flow").replaceChildren(el("h2", { text: "Flow" }), group, flowUi.warn, flowUi.list, flowUi.empty);
  flowUi.more = edge(flowUi.list);
  line.to(buttons[0]);
}

function renderFlow(now, relist = false) {
  if (!flowUi) buildFlow();
  const list = (last.flow || []).filter((e) => filter === "all" || GROUP[e.kind] === filter);
  const conflicts = last.board ? last.board.conflicts : [];
  flowUi.warn.hidden = !conflicts.length;
  if (conflicts.length) // the paths stay visible, the session names are masked
    flowUi.warn.replaceChildren(`${count(conflicts.length, "file conflict")}: `, ...conflicts.flatMap((c, i) => [i ? "; " : "", ...said(c.path), " (", ...c.sessions.flatMap((n, j) => [j ? ", " : "", name(n)]), ")"]));
  flowUi.empty.hidden = list.length > 0;
  flowUi.empty.textContent = filter === "all" ? "Handoffs, delegations and finished work show up here as they happen." : "Nothing of this kind yet.";
  if (relist) {
    flowItems.clear();
    flowUi.list.replaceChildren();
  }
  const first = !flowUi.list.children.length;
  const keys = new Set(list.map(flowKey));
  for (const [k, it] of flowItems) if (!keys.has(k)) { flowItems.delete(k); it.li.remove(); }
  const fresh = [];
  flip(flowUi.list, () => flowUi.list.replaceChildren(...list.map((e) => {
    const k = flowKey(e);
    let it = flowItems.get(k);
    if (!it) {
      it = flowRow(e);
      flowItems.set(k, it);
      fresh.push(it.li);
    }
    it.time.textContent = ago(e.at, now);
    for (const [b, t] of it.labels) {
      b.textContent = shown(t); // the mask lands on a kept item too
      b.classList.toggle("masked", streaming());
    }
    if (it.what) it.what.replaceChildren(...[link(e.url, e.text)].flat()); // and inside its text, with the link following the mask
    if (it.st) {
      it.st.className = `st ${e.status}`;
      it.st.textContent = delegStatus(e, now);
    }
    return it.li;
  })), fresh);
  flowUi.more();
  if (!first && !relist && ms("slow")) // only what a poll brought in gets the highlight
    for (const li of fresh) {
      li.classList.add("fl-new");
      setTimeout(() => li.classList.remove("fl-new"), 1200);
    }
}

function flowRow(e) {
  const it = { time: el("time"), st: e.kind === "delegate" ? el("span", { class: "st" }) : null, labels: [], what: e.text ? el("p", { class: "fl-what" }) : null };
  const who = (t) => { const b = el("b"); it.labels.push([b, t]); return b; }; // written in renderFlow, as is the text
  const parts = e.to ? [who(e.from), " \u2192 ", who(e.to)] : [e.from ? who(e.from) : el("b", { text: "Board" })];
  it.li = el("li", { class: `fl fl-${e.kind}`, ...(e.sessionId ? activate(() => openSession(e.sessionId)) : {}) },
    el("div", {}, el("p", { class: "fl-who" }, ...parts), it.what),
    el("div", { class: "fl-side" }, it.time, it.st));
  return it;
}

function cacheLine(c, now) {
  const ttl = c.ttl >= 3600e3 ? "1 h" : "5 min";
  const rw = c.rewritesToday.expired.count + c.rewritesToday.prefixChanged.count;
  const rewrites = rw ? ` \u00b7 ${count(rw, "full rewrite")} today (+${usd(c.rewritesToday.expired.extra + c.rewritesToday.prefixChanged.extra)})` : "";
  if (c.state === "warm")
    return `Warm, ${countdown(c.expiresAt - now)} left (${ttl}) \u00b7 ${tokens(c.prefix)} prefix \u00b7 next turn ${usd(c.warmCost)}` + (c.cooling ? `, ${usd(c.wakeCost)} if it expires` : "") + rewrites;
  return `Cold since ${clock(c.expiresAt)}, ${ago(c.expiresAt, now)} \u00b7 waking it costs ${usd(c.wakeCost)}` + rewrites;
}

// a section's title carries its total once more than four items hide below the fold (a number, so streamer mode leaves it)
const section = (title, body, total = 0) => el("section", {}, el("h3", {}, title, total > 4 ? el("span", { class: "n", text: num(total) }) : null), body);
const none = (text = "None yet.") => el("p", { class: "muted", text });
// every list under a row runs newest first, four items tall, and scrolls inside itself for the rest
const newest = (items, at) => (at ? [...items].sort((a, b) => (at(b) || 0) - (at(a) || 0)) : items);
const list = (items, render, cls = "", tag = "ul") => el(tag, { class: "ri-list scroll " + cls }, items.map(render));
const plain = (items, render, at) => (items.length ? list(newest(items, at), render) : none());

// --- a session's details open under its row: the wrapper's grid row grows from 0fr to 1fr, the
// content fades in a beat later, and the list scrolls so the row sits at its top. One row is open
// at a time; opening another closes the first in the same motion. Escape or a second click closes.
// On a poll the open row's text is rebuilt in place, with nothing replayed and no scroll. ---
function fillDetail(r, s, now) {
  const notes = last.board ? last.board.feed.filter((e) => e.kind === "note" && e.by === s.name) : [];
  const kept = new Map([...r.detail.querySelectorAll(".scroll")].map((b) => [b.closest("section").firstChild.firstChild.textContent, b.scrollTop])); // where each list was scrolled before this poll
  const col = (...kids) => el("div", { class: "ri-col" }, ...kids);
  const files = [...s.locks.map((l) => el("li", {}, el("b", {}, ...said(`${l} lock`)))), ...s.claims.map((c) => el("li", {}, ...said(c)))];
  const subs = newest(s.subagents, (u) => u.lastAt).map((u) => el("li", {}, name(u.description || u.type || "Subagent", "b"), u.description && u.type ? [" \u00b7 ", name(u.type)] : "", " \u00b7 ",
    el("span", { class: `st ${u.running ? "running" : "done"}`, text: u.running ? "Running" : "Finished" }), ` \u00b7 ${count(u.toolCount, "action")}`, u.cost != null ? ` \u00b7 ${usd(u.cost)}` : ""));
  if (s.subagentsTotal > s.subagents.length) subs.push(el("li", { class: "muted", text: `and ${s.subagentsTotal - s.subagents.length} more` }));
  r.detail.replaceChildren(el("div", { class: "ri-body" },
    el("p", { class: "ri-path" }, ...names([s.project, s.branch]), s.cwd ? [s.project || s.branch ? " \u00b7 " : "", ...said(s.cwd)] : []),
    el("p", { class: "ri-line" }, el("span", { class: `st-label c-${s.status}`, text: STATUS[s.status] }), el("span", {}, ...said(s.action || "No tool calls yet"))),
    el("div", { class: "ri-cols" },
      col(
        section("Task", el("p", {}, ...said(s.task || "No task line yet."))),
        section("Plan", el("p", { text: s.progress ? progressText(s.progress) : "No step N of M line yet." })),
        section("Cost", el("p", { text: `${usd(s.cost)} API-equivalent` + (s.startedAt ? `, ${dur(now - s.startedAt)} elapsed` : "") })),
        section("Prompt cache", s.cache ? el("p", { text: cacheLine(s.cache, now) }) : none("No requests yet.")),
        section("Locks and files", files.length ? list(files, (li) => li) : none(s.registered ? "None." : "Not registered on the board."), files.length),
        notes.length ? section("Notes", plain(notes, (n) => el("li", {}, ...said(n.text)), (n) => n.at), notes.length) : null),
      col(
        section("Subagents", subs.length ? list(subs, (li) => li) : none(), Math.max(s.subagentsTotal || 0, s.subagents.length)),
        section("Delegated", plain(s.delegations, (x) => el("li", {}, name(x.agentName, "b"), " ", name(x.description), " \u00b7 ", el("span", { class: `st ${x.status}`, text: delegStatus(x, now) }), x.cost != null ? ` \u00b7 ${usd(x.cost)}` : ""), (x) => x.startedAt), s.delegations.length),
        section("Handoffs", plain(s.handoffs, (h) => el("li", {}, el("b", {}, h.dir === "in" ? "From " : "To ", name(h.peer)), " ", ...said(h.text), ` \u00b7 ${ago(h.at, now)}`), (h) => h.at), s.handoffs.length)),
      col(
        section("Shipped", plain(s.prs, (p) => el("li", {}, link(p.url, `PR #${p.number}`), p.repo ? [" in ", name(p.repo)] : "", ` \u00b7 ${ago(p.at, now)}`), (p) => p.at), s.prs.length),
        section("Finished in the background", plain(s.completions, (c) => el("li", {}, el("span", { class: `st ${c.status}`, text: DONE[c.status] }), " ", ...said(c.text), ` \u00b7 ${ago(c.at, now)}`), (c) => c.at), s.completions.length),
        section("Timeline", s.events.length ? list(newest(s.events, (e) => e.at), (e) => el("li", {}, el("time", { text: clock(e.at) }), el("span", {}, ...said(e.label))), "timeline", "ol") : none("No tool calls yet."), s.events.length)))));
  for (const b of r.detail.querySelectorAll(".scroll")) {
    b.scrollTop = kept.get(b.closest("section").firstChild.firstChild.textContent) || 0;
    edge(b)();
  }
}

const setOpen = (r, on) => {
  r.li.classList.toggle("open", on);
  r.head.setAttribute("aria-expanded", String(on));
};
function toggleSession(id) {
  if (openId === id) closeSession();
  else openSession(id, false);
}
// From a Flow item, a map node or the Penthouse the page also moves so the row is in view, smoothly
// unless motion is reduced; the row's own click only unfolds it where it is.
export function openSession(id, scrollPage = true) {
  const s = last && last.sessions.find((x) => x.id === id);
  const r = rowsById.get(id);
  if (!s || !r) return closeSession();
  const prev = openId && openId !== id ? rowsById.get(openId) : null;
  if (prev) setOpen(prev, false);
  openId = id;
  fillDetail(r, s, Date.now());
  setOpen(r, true);
  const ul = $("sessions");
  ul.classList.add("has-open");
  const behavior = ms("slow") ? "smooth" : "auto";
  const inside = ul.scrollHeight > ul.clientHeight; // the list scrolls within its module
  if (inside) ul.scrollTo({ top: r.li.offsetTop, behavior });
  if (scrollPage) {
    const top = (inside ? ul : r.li).getBoundingClientRect().top;
    if (top < 72 || top > innerHeight * 0.6) scrollBy({ top: top - 80, behavior });
  }
}
export function closeSession() {
  if (!openId) return;
  const r = rowsById.get(openId);
  if (r) setOpen(r, false);
  openId = null;
  $("sessions").classList.remove("has-open");
}
addEventListener("keydown", (e) => e.key === "Escape" && closeSession());
