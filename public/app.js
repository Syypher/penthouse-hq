// Polls /api/hq and /api/stats every 3 s and routes the two tabs by hash: the underline slides to the
// tab, the old view fades out and the new one fades in. While the server is still indexing, a hairline
// under the header fills with its progress; no spinner, no shimmer. The page does only work that can be
// seen: nothing is fetched while the document is hidden, /api/stats feeds the Financials card so it is
// fetched only while the Dashboard shows, only the tab on screen is rendered, the team map's flowing dash
// pauses while HQ sits in the background, and the Penthouse's room is built the first time its tab shows.
import { renderDashboard, renderHeader, openSession, rowsDrawn, remask } from "./dashboard.js";
import { renderFinancials } from "./financials.js";
import { ms, animate, finished, underline } from "./motion.js";
import { streaming, setStreaming, onStreaming } from "./streamer.js";
import { clock } from "./format.js";

const $ = (id) => document.getElementById(id);
const TABS = ["dashboard", "penthouse"];
let accentSet = false, routeSeq = 0, tabLine = null;

// The last tab is remembered; a hash in the URL wins over it, and #financials (an old bookmark) is the
// Dashboard scrolled to its Financials card.
const remember = (tab) => { try { localStorage.setItem("hq.tab", tab); } catch {} };
const remembered = () => { try { const t = localStorage.getItem("hq.tab"); return TABS.includes(t) ? t : null; } catch { return null; } };
const tabOf = () => (location.hash === "#penthouse" ? "penthouse" : location.hash === "#dashboard" || location.hash === "#financials" ? "dashboard" : remembered() || "dashboard");
const showing = () => TABS.find((t) => !$("view-" + t).hidden);
let openAfterRoute = null; // a session picked in the room: its row lives on the Dashboard, which shows first

async function route() {
  const tab = tabOf();
  const seq = ++routeSeq;
  remember(tab);
  for (const t of TABS) {
    if (t === tab) $("tab-" + t).setAttribute("aria-current", "page");
    else $("tab-" + t).removeAttribute("aria-current");
  }
  if (!tabLine) tabLine = underline(document.querySelector(".tabs"));
  tabLine.to($("tab-" + tab));
  const from = showing();
  if (from !== tab) {
    if (seq > 1) await finished(animate($("view-" + from), [{ opacity: 1 }, { opacity: 0 }], ms("fast")));
    if (seq !== routeSeq) return; // the hash moved again meanwhile
    for (const t of TABS) $("view-" + t).hidden = t !== tab;
    if (seq > 1) animate($("view-" + tab), [{ opacity: 0, transform: "translateY(4px)" }, { opacity: 1, transform: "none" }], ms("mid"));
    show(); // the latest payload lands on the tab now, not at the next poll
    if (tab === "dashboard") tickStats();
  }
  if (tab === "dashboard" && openAfterRoute) {
    const id = openAfterRoute; // a session picked in the room: its row may not be drawn yet (a page opened on the Penthouse has none)
    openAfterRoute = null;
    rowsDrawn().then(() => openSession(id));
  }
  if (location.hash === "#financials") {
    await Promise.all([firstHq, firstStats]); // the card's place and its height are known once the grid and the card have drawn
    if (seq === routeSeq) $("financials").scrollIntoView({ behavior: ms("slow") ? "smooth" : "auto" });
  }
}

// The quiet indexing state: a 2 px line under the header that fills; a null hides it, and a
// missing total (no progress yet) sweeps it slowly instead.
function loadLine(pct) {
  const line = $("load-line");
  line.hidden = pct == null;
  line.classList.toggle("busy", pct === false);
  if (typeof pct === "number") line.style.width = pct + "%";
}

// A refresh that failed leaves the last good payload up (the server sends it again with `error`), so
// one quiet line under the header says so and names the data's time; the next good poll clears it.
// Before the first good index there is no data to keep, so the line carries the error's first line.
function staleLine(hq) {
  const line = $("stale");
  line.hidden = !(hq && hq.error);
  if (!line.hidden) line.textContent = hq.generatedAt ? `Last refresh failed; showing data from ${clock(hq.generatedAt)}` : `Refresh failed: ${String(hq.error).split("\n")[0]}`;
}

// The 3D room is built the first time the Penthouse tab shows, from the payload on screen then, and gets
// every payload after it while that tab shows (the latest one when the tab returns). Built once, it is
// kept: on the other tab #floor has no box, so the room sleeps (stage.js) and wakes on the next frame.
// A browser with WebGL off gets one sentence in its place, and any other failure to build says so and
// leaves the error in the console. A session picked in the room opens its row, which is on the Dashboard.
let floor = null;
function ensureFloor(data) {
  if (!floor)
    floor = import("./floor/main.js")
      .then((m) => m.mountFloor($("floor"), data, { openSession: (id) => { openAfterRoute = id; location.hash = "#dashboard"; } }))
      .catch((e) => {
        console.warn("HQ: the 3D floor could not load", e);
        let gl = null;
        try { gl = document.createElement("canvas").getContext("webgl2"); } catch {}
        $("floor").textContent = gl ? "The Penthouse could not load; the browser console says why." : "The Penthouse needs WebGL, which this browser has turned off.";
        return null;
      });
  floor.then((f) => f && f.update(data)).catch((e) => console.error("HQ: the Penthouse could not update", e));
}

// The latest payloads and who has not seen them: the Dashboard and its Financials card are rendered and the
// room fed only while their tab shows, so the tab that returns gets the latest at once and the hidden one
// costs nothing. A Streamer toggle counts as new for the Dashboard and the card: it re-renders them now if
// they show, and on their return if not (the room masks its own tags). One exception: the toggle re-masks
// the Live list's rows in place on either tab (remask, dashboard.js), text only, so no frame after the press
// carries a real name while the rows' own queue is busy.
let lastHq = null, hqStale = false, floorStale = false, lastStats = null, statsStale = false;
function show() {
  const tab = showing();
  if (tab === "dashboard" && hqStale) {
    hqStale = false;
    renderDashboard(lastHq);
  }
  if (tab === "dashboard" && statsStale) {
    statsStale = false;
    renderFinancials($("fin"), lastStats);
  }
  if (tab === "penthouse" && lastHq && (floorStale || !floor)) {
    floorStale = false;
    ensureFloor(lastHq.floor);
  }
}

// Every poll renders the tab on screen, an identical payload included: the "elapsed" and "ago" labels are
// worked out from the clock when they are drawn, so they keep time only while the page draws them.
// firstHq and firstStats settle on the first render of each, which the #financials scroll waits for.
let firstHqReady, firstStatsReady;
const firstHq = new Promise((r) => { firstHqReady = r; });
const firstStats = new Promise((r) => { firstStatsReady = r; });

async function tickHq() {
  let hq;
  try {
    const r = await fetch("/api/hq", { cache: "no-store" });
    hq = await r.json();
  } catch {
    $("pill").textContent = "Waiting for the server";
    loadLine(false);
    return;
  }
  if (hq.building) {
    const pct = hq.progress.total ? Math.round((100 * hq.progress.done) / hq.progress.total) : 0;
    $("pill").textContent = hq.error ? "Refresh failed" : `Indexing your history, ${pct}%`;
    loadLine(hq.error ? null : hq.progress.total ? pct : false);
    staleLine(hq);
    return;
  }
  loadLine(null);
  staleLine(hq);
  renderHeader(hq);
  if (!accentSet && hq.floor.accent) {
    document.documentElement.style.setProperty("--accent", hq.floor.accent);
    accentSet = true;
  }
  lastHq = hq;
  hqStale = floorStale = true;
  show();
  firstHqReady();
}

// The try covers only the fetch and its parse: a render exception reaches the console, so a bug on
// real data never reads as a server outage.
async function tickStats() {
  if (showing() !== "dashboard") return;
  let s;
  try {
    const r = await fetch("/api/stats", { cache: "no-store" });
    s = await r.json();
  } catch {
    $("pill").textContent = "Waiting for the server";
    return;
  }
  lastStats = s;
  statsStale = true;
  show(); // a response that lands after a switch to the Penthouse waits for the Dashboard's return
  firstStatsReady();
}

// Streamer mode from the header: names and titles across the page show as one blurred mask. The
// Penthouse foot bar drives the same module, so the two buttons stay in sync.
const streamBtn = $("streamer-top");
const syncStreamer = (on) => streamBtn.setAttribute("aria-pressed", String(on));
streamBtn.addEventListener("click", () => setStreaming(!streaming()));
onStreaming(syncStreamer);
onStreaming(() => { remask(); hqStale = !!lastHq; statsStale = !!lastStats; show(); }); // the rows now on either tab, the rest now on the tab on screen
syncStreamer(streaming()); // still on after a reload in the middle of a recording

// The team map's flowing dash is nearly all the Dashboard costs at rest, so, like the room's slow frames, it
// pauses while HQ sits in the background (the window unfocused or the document hidden): one class on the root,
// which app.css turns into a paused animation. Focused, it flows as always.
let focused = document.hasFocus();
const away = () => document.documentElement.classList.toggle("away", !focused || document.visibilityState !== "visible");
addEventListener("focus", () => { focused = true; away(); });
addEventListener("blur", () => { focused = false; away(); });
document.addEventListener("visibilitychange", away);
away();

// The polls: every 3 s while the document is visible, none while it is hidden (minimized, behind
// another tab), and one at once when it shows again.
let timer = 0;
function poll() {
  if (document.visibilityState !== "visible") return;
  tickHq();
  tickStats();
}
function restart() {
  clearInterval(timer);
  timer = setInterval(poll, 3000);
  poll();
}
document.addEventListener("visibilitychange", () => (document.visibilityState === "visible" ? restart() : clearInterval(timer)));
addEventListener("hashchange", route);
route();
restart();
