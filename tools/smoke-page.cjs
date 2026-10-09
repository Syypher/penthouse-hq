// Page checks in a real browser: no console errors, transcript text never becomes markup, the page
// stays light in a dark OS theme, the grid fills the window with the hero, the Live list and the Flow
// on the first screen, the chart scrubs and morphs, the Flow filters, a session's row opens under
// itself (from its own click and from a Flow item), stays open through a poll and folds on Escape,
// the two tabs are Dashboard and Penthouse with Financials a card on the Dashboard (a #financials
// bookmark lands on it), the room is built the first time the Penthouse tab shows and never on the
// Dashboard alone, fills the window below the header (and below the stale-data line when it shows) with
// no scroll, sleeps on the Dashboard and wakes on the next frame, the last tab is remembered unless the
// URL carries a hash, a hidden document polls nothing and a visible one polls at once, every poll renders
// (an identical payload included, so "elapsed" keeps time) but no payload is rendered into the hidden
// Dashboard and none is fed to the hidden room (the switch back renders the latest at once, from its first
// frame), a Streamer toggle re-masks the Live list's rows in place on either tab and renders nothing else
// into a hidden Dashboard, no frame after a Streamer press paints a real name (a row fading out, a quick
// round trip between the tabs and the way back included), a figure click opens its row even on a page
// opened at #penthouse whose Dashboard was never drawn, the team map's flowing dash pauses while the
// window is unfocused or the document hidden and runs again on focus, streamer mode masks the
// names (as labels and where they are written inside task text, paths, PR and conflict lines, the home
// folder's name in a cwd included, with a planted control that proves the scan sees it, and the room's
// name tags on the Penthouse tab), there is no sideways scroll at phone width, the server answers / and
// the vendored engine with the right types, a refresh that fails before the first index shows its
// error, and a room that cannot build says why (WebGL off, or not).
const http = require("http");
const { chromium } = require(process.env.HQ_PLAYWRIGHT || "playwright-core");
const BROWSER = process.env.HQ_BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const { handler } = require("../server");
const cfg = require("../hq.config.example.json");

const now = Date.now();
const SLOT = 15 * 60e3;
const end = Math.floor(now / SLOT) * SLOT;
const evil = '<img src=x onerror="window.__pwned=1">';
const session = (id, status, extra = {}) => ({
  id, name: id, title: null, project: "quarry", cwd: "C:/x", branch: "main", task: evil, status, action: "Editing App.tsx",
  startedAt: now - 600e3, lastAt: now - 5e3, toolCount: 12, cost: 1.23, progress: { step: 2, of: 5, pct: 40, finishAt: now + 900e3, done: false },
  cache: { state: "warm", ttl: 3600e3, expiresAt: now + 1200e3, prefix: 300000, wakeCost: 2.4, warmCost: 0.06, hitRate: 0.9, cooling: false, rewritesToday: { expired: { count: 0, extra: 0 }, prefixChanged: { count: 0, extra: 0 } } },
  subagents: [{ id: "x1", type: "seo-technical", description: "Audit the sitemap", running: true, cost: 0.4, cache: null, toolCount: 7, lastAt: now - 5e3 }], subagentsTotal: 1,
  locks: [], claims: ["src/App.tsx"], events: [{ at: now - 5e3, tool: "Edit", label: "Editing App.tsx" }], registered: true, avatar: 0,
  spark: Array.from({ length: 30 }, (_, i) => i % 4),
  delegations: [{ id: "tu_1", startedAt: now - 120e3, doneAt: null, status: "running", type: "seo-technical", agentId: "seo", agentName: "SEO/AEO Officer", description: "Audit the sitemap", cost: 0.4 }],
  handoffs: [{ at: now - 60e3, dir: "in", peer: "beta", text: evil }],
  prs: [{ at: now - 300e3, number: 263, url: "https://github.com/o/r/pull/263", repo: "o/r" }],
  completions: [{ at: now - 200e3, status: "done", text: 'Agent "Audit the sitemap" finished' }],
  ...extra,
});
const FIXTURE = {
  generatedAt: now, appName: "HQ", homeName: "homeuser", // the server names the home folder; the page masks it while streaming
  vitals: { liveSessions: 2, subagentsRunning: 1, toolCallsToday: 420, spendToday: 12.5, planUsd: 200, filesClaimed: 3, conflicts: 1 },
  pill: { working: 1, needsYou: 1, conflicts: 1 },
  // alpha's task quotes beta by name, names a floor agent nobody delegated to (Bug Hunter) and says "another session"
  // (a placeholder, not a name); its folder sits under the home folder and ends in its project name; a claimed path
  // runs through .claude/ beside a subagent of the built-in type claude. While streaming the names are masked in
  // place and the rest stays readable
  sessions: [session("alpha", "needs-you", {
    task: `Finish the hero after beta ships its PR, ask Bug Hunter to review, then tell another session ${evil}`, cwd: "C:/Users/homeuser/work/quarry",
    subagents: [{ id: "x1", type: "seo-technical", description: "Audit the sitemap", running: true, cost: 0.4, cache: null, toolCount: 7, lastAt: now - 5e3 }, { id: "x2", type: "claude", description: "Check the hooks", running: false, cost: 0.1, cache: null, toolCount: 3, lastAt: now - 50e3 }], subagentsTotal: 2,
    claims: ["src/App.tsx", ".claude/hooks/guard.js"],
    handoffs: [{ at: now - 60e3, dir: "in", peer: "beta", text: evil }, { at: now - 90e3, dir: "out", peer: "another session", text: "Sent the hero spec on" }],
    // the action line names beta's real branch "Plan" (a generic word, but a real name here), a floor agent in other
    // capitals, and gamma, an ended session known only from its old note on the board
    action: "Rebasing Plan for bug hunter after gamma's note",
  }), session("beta", "working", { branch: "Plan", progress: null, subagents: [], subagentsTotal: 0 })],
  board: { conflicts: [{ repo: "o/r", path: "src/App.tsx", sessions: ["alpha", "beta"] }], locks: [], feed: [{ at: now - 60e3, kind: "note", by: "alpha", text: evil }, { at: now - 2 * 864e5, kind: "note", by: "gamma", text: "Took the merge lock" }] },
  activity: {
    slots: Array.from({ length: 672 }, (_, i) => ({ t: end - (671 - i) * SLOT, tools: i % 7, cost: 0.1 })),
    days: Array.from({ length: 30 }, (_, i) => ({ date: new Date(now - (29 - i) * 864e5).toISOString().slice(0, 10), tools: 100 + i, cost: 5 })),
  },
  flow: [
    { at: now - 60e3, kind: "handoff", from: "beta", to: "alpha", sessionId: "alpha", text: evil },
    { at: now - 90e3, kind: "handoff", from: "alpha", to: "another session", sessionId: "alpha", text: "Sent the hero spec on" },
    { at: now - 120e3, kind: "delegate", from: "alpha", to: "SEO/AEO Officer", agentId: "seo", sessionId: "alpha", text: "Audit the sitemap", status: "running", startedAt: now - 120e3, doneAt: null },
    { at: now - 200e3, kind: "done", from: "alpha", sessionId: "alpha", text: 'Agent "Audit the sitemap" finished', status: "done" },
    { at: now - 300e3, kind: "pr", from: "alpha", sessionId: "alpha", text: "Opened PR #263 in o/r", url: "https://github.com/o/r/pull/263" },
  ],
  team: {
    nodes: [{ id: "s:alpha", label: evil, kind: "session", status: "needs-you", sessionId: "alpha" }, { id: "a:seo", label: "SEO/AEO Officer", kind: "agent", color: "#ffa31a" }, { id: "p:beta", label: "beta", kind: "peer" }],
    edges: [{ from: "s:alpha", to: "a:seo", kind: "delegate", count: 3, lastAt: now - 120e3, active: true }, { from: "p:beta", to: "s:alpha", kind: "handoff", count: 1, lastAt: now - 60e3, active: true }],
  },
  floor: {
    departments: cfg.departments, owner: cfg.owner, accent: cfg.accent, sessionAvatars: cfg.sessionAvatars, links: [],
    agents: cfg.agents.map((a) => ({ id: a.id, name: a.name, dept: a.dept, hangout: a.hangout, look: a.look, avatar: a.avatar, working: false, doing: null, forSession: null })),
    sessions: [{ id: "alpha", name: "alpha", status: "needs-you", working: true, action: "Editing App.tsx", avatar: 0 }], // seated in the room, so its figure can open its row on the Dashboard
  },
};
// /api/stats, stubbed like /api/hq so the Financials card never reads this machine's own index: invented
// projects and agent labels, two tools, three models, the session fixture's activity. statsBody swaps in a variant.
const STATS = {
  generatedAt: new Date(now).toISOString(), plan: 200,
  totals: { cost: 812.4, tokens: 21e6, cacheSaved: 310.2 },
  today: 12.5, monthToDate: 52.5, projMonth: 157.5, savedVsApi: -147.5, toolsToday: 420,
  byProject: [{ project: "orchard", cost: 40, tokens: 1.2e6 }, { project: "lantern", cost: 12.5, tokens: 3e5 }],
  byModel: [{ model: "claude-opus-4-1", cost: 30, tokens: 4e5 }, { model: "claude-sonnet-4-5", cost: 15, tokens: 8e5 }, { model: "claude-haiku-4-5", cost: 5, tokens: 3e5 }],
  byTool: [{ name: "Edit", count: 120, cost: 3.2 }, { name: "mcp__playwright__browser_click", count: 40, cost: 1.1 }],
  active: {
    sessionId: "0123456789abcdef", project: "orchard",
    agents: [{ label: "main thread", out: 52000, fin: 9000, cread: 410000, cwrite: 30000, tools: 320, cost: 9.8 }, { label: "Audit the sitemap", out: 8000, fin: 2000, cread: 60000, cwrite: 5000, tools: 40, cost: 1.2 }],
    total: { out: 60000, fin: 11000, cread: 470000, cwrite: 35000, tools: 360, cost: 11 },
  },
  activity: FIXTURE.activity,
};
let statsBody = STATS;
let hqBody = FIXTURE; // the Streamer control swaps in a variant without the home folder's name
const LINE = () => document.querySelector(".chart-wrap .chart path:not(.base)").getAttribute("d");
const FINITE = () => document.getAnimations().filter((a) => a.effect.getTiming().iterations !== Infinity).length; // the flowing edges run forever by design
// DOM mutations under #view-dashboard over a window: while the Penthouse tab shows, a changed payload must cause none
const MUTATIONS = (ms) => new Promise((res) => { let n = 0; const mo = new MutationObserver((rs) => { n += rs.length; }); mo.observe(document.getElementById("view-dashboard"), { subtree: true, childList: true, attributes: true, characterData: true }); setTimeout(() => { mo.disconnect(); res(n); }, ms); });
// the same count over a window that starts with a click on the header's Streamer button, split into the Live list (the rows'
// in-place re-mask, the one render a hidden Dashboard takes) and everything else under the view
const TOGGLE = (ms) => new Promise((res) => { const n = { rows: 0, rest: 0 }, rows = document.getElementById("sessions"); const mo = new MutationObserver((rs) => { for (const r of rs) n[rows.contains(r.target) ? "rows" : "rest"]++; }); mo.observe(document.getElementById("view-dashboard"), { subtree: true, childList: true, attributes: true, characterData: true }); document.getElementById("streamer-top").click(); setTimeout(() => { mo.disconnect(); res(n); }, ms); });
// the names Streamer must keep off the Dashboard (the fixture's sessions, project, agent and the card's projects and agents)
const STREAMED = ["alpha", "beta", "quarry", "orchard", "lantern", "SEO/AEO Officer", "main thread"];
// Streamer pressed while a render that removes beta's row runs: the press lands the moment beta's row starts to fade out,
// then every frame for 0.6 s is read for a real name under the Dashboard
const PRESS_DURING_FADE = (NAMES) => new Promise((res) => {
  const v = document.getElementById("view-dashboard"), out = { pressed: false, frames: 0, leaks: [] };
  const li = [...document.querySelectorAll(".row-item")].find((n) => n.querySelector(".ri-name span").textContent === "beta");
  if (!li) return res(out);
  const t0 = performance.now();
  const wait = () => {
    if (!li.getAnimations().some((a) => a.playState === "running")) return performance.now() - t0 < 8000 ? requestAnimationFrame(wait) : res(out);
    document.getElementById("streamer-top").click();
    out.pressed = true;
    const p0 = performance.now();
    const tick = () => {
      out.frames++;
      const seen = NAMES.filter((n) => v.innerText.includes(n));
      if (seen.length) out.leaks.push(Math.round(performance.now() - p0) + " ms " + seen.join("/"));
      if (performance.now() - p0 < 600) requestAnimationFrame(tick); else res(out);
    };
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(wait);
});
// the document hidden, as smoke-floor does it: the native descriptors are kept on window.__native for the restore
const HIDE = () => { window.__native = { visibilityState: Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState"), hidden: Object.getOwnPropertyDescriptor(Document.prototype, "hidden") }; Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get: () => "hidden" }); Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); };
const SHOW = () => { Object.defineProperty(Document.prototype, "visibilityState", window.__native.visibilityState); Object.defineProperty(Document.prototype, "hidden", window.__native.hidden); document.dispatchEvent(new Event("visibilitychange")); };

(async () => {
  const server = http.createServer(handler).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: BROWSER, headless: true, args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
  const errors = [];
  let failed = 0;
  const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) failed++; };
  const openName = (page) => page.evaluate(() => { const o = document.querySelectorAll(".row-item.open"); return o.length === 1 ? o[0].querySelector(".ri-name").firstChild.textContent : null; });
  // the page's rendered text and its aria-label/title pairs
  const pageText = (page) => page.evaluate(() => ({ t: document.body.innerText, attrs: [...document.querySelectorAll("[aria-label], [title]")].map((n) => [n.getAttribute("aria-label") || "", n.getAttribute("title") || ""]) }));
  const current = (page) => page.evaluate(() => [...document.querySelectorAll(".tabs a")].find((a) => a.getAttribute("aria-current") === "page")?.id || null);
  const indicator = (page) => page.evaluate(() => { const i = document.querySelector(".tabs .ind"); return i ? i.style.transform + "|" + i.style.width : ""; });
  // the server itself: the page and the vendored engine (Task 7) answer with the right types
  const head = (p) => new Promise((resolve) => http.get(base + p, (r) => { r.resume(); resolve({ status: r.statusCode, type: r.headers["content-type"] || "" }); }));
  const home = await head("/"), three = await head("/vendor/three/build/three.module.js");
  check(home.status === 200 && home.type.startsWith("text/html"), `GET / answers 200 text/html (${home.status} ${home.type})`);
  check(three.status === 200 && three.type.startsWith("text/javascript"), `GET /vendor/three/build/three.module.js answers 200 text/javascript (${three.status} ${three.type})`);
  try {
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: "dark" }); // the page must stay light whatever the OS theme
      page.on("console", (m) => m.type() === "error" && !m.text().includes("X4122") && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      // the room's modules and WebGL contexts are counted from the start: the Dashboard alone must ask for none
      const floorJs = [];
      page.on("request", (r) => /\/public\/floor\/[^?]*\.js$/.test(r.url()) && floorJs.push(r.url()));
      await page.addInitScript(() => { window.__gl = 0; const orig = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...a) { if (/webgl/.test(type)) window.__gl++; return orig.call(this, type, ...a); }; });
      // the stubs stamp a fresh generatedAt on every answer, as the live server does on every refresh; hqFrozen, when
      // set, is served byte for byte instead (an identical payload, generatedAt included)
      const api = { hq: 0, stats: 0 };
      let hqFrozen = null;
      const stub = async (p) => {
        await p.route("**/api/hq", (r) => { api.hq++; r.fulfill({ contentType: "application/json", body: hqFrozen || JSON.stringify({ ...hqBody, generatedAt: Date.now() }) }); });
        await p.route("**/api/stats", (r) => { api.stats++; r.fulfill({ contentType: "application/json", body: JSON.stringify({ ...statsBody, generatedAt: new Date().toISOString() }) }); });
      };
      await stub(page);
      await page.goto(base + "/#dashboard");
      await page.waitForSelector(".row-item");
      await page.waitForSelector("#financials .fin-grid", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1200); // the modules settle and the line draws in
      check(await page.evaluate(() => !window.__pwned && !document.querySelector("img")), `${w}px: transcript text stays text`);
      check((await page.textContent("#flow")).includes("<img src=x"), `${w}px: the raw text is shown verbatim`);
      check(!/\bnull\b|undefined/.test(await page.textContent("main")), `${w}px: no "null" or "undefined" printed on the page`);
      check(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), `${w}px: no sideways scroll`);
      check((await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(255, 255, 255)", `${w}px: the body stays white in a dark OS theme`);
      if (w === 1440) {
        check(await page.evaluate(() => document.querySelector(".grid").getBoundingClientRect().width >= innerWidth * 0.85), `${w}px: the grid fills the window`);
        check(await page.evaluate(() => ["hero", "sessions", "flow"].every((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })), `${w}px: the hero, the Live list and the Flow sit in the first screen`);
      }
      // the layout: two tabs, and Financials a card on the Dashboard after the grid, showing /api/stats' figures
      check((await page.evaluate(() => [...document.querySelectorAll(".tabs a")].map((a) => a.textContent).join(","))) === "Dashboard,Penthouse" && (await current(page)) === "tab-dashboard", `${w}px: two tabs, Dashboard then Penthouse, the Dashboard current`);
      check(await page.evaluate(() => { const c = document.querySelector("#view-dashboard > #financials.mod"); return !!c && c.firstElementChild.tagName === "H2" && c.firstElementChild.textContent === "Financials" && !!c.querySelector(".fin-grid") && !document.getElementById("view-financials") && c.getBoundingClientRect().top >= document.querySelector(".grid").getBoundingClientRect().bottom; }), `${w}px: Financials is a card on the Dashboard after the grid, with no Financials view left`);
      check((await page.textContent("#financials", { timeout: 3000 }).catch(() => "")).includes("API-equivalent spend") && /^\$[\d,]+\.\d\d$/.test(await page.textContent("#financials .fin-hero .hero-num", { timeout: 3000 }).catch(() => "")), `${w}px: the card renders with its spend headline a dollar amount`);
      check(await page.evaluate(() => { const c = document.getElementById("financials"); if (!c) return false; const kv = (k) => { const n = [...c.querySelectorAll(".kv")].find((x) => x.firstChild.textContent === k); return n ? n.lastChild.textContent : ""; }; const t = c.innerText; return c.querySelector(".big").textContent === "$53 this month" && kv("Today") === "$12.50" && kv("All time") === "$812" && c.querySelector(".fin-hero .hero-num").textContent === "$9.60" && t.includes("orchard") && t.includes("lantern") && t.includes("playwright__browser_click") && t.includes("opus-4-1"); }), `${w}px: the card shows the figures /api/stats returns (month to date $53, today $12.50, all time $812, the fixture's names), not the machine's index`);
      check(!floorJs.length && (await page.evaluate(() => window.__gl === 0 && !document.querySelector("#floor canvas"))), `${w}px: on the Dashboard alone no floor module is requested and no WebGL context is made (${floorJs.length} floor modules fetched)`);
      const box = await page.locator(".chart-wrap >> nth=0").boundingBox();
      const total = await page.textContent(".hero-num >> nth=0");
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
      check((await page.textContent(".hero-num >> nth=0")) !== total, `${w}px: scrubbing the chart moves the headline`);
      await page.mouse.move(box.x + box.width / 2, box.y - 80);
      check((await page.textContent(".hero-num >> nth=0")) === total, `${w}px: leaving the chart restores it`);
      const d0 = await page.evaluate(LINE);
      await page.click('#hero .ranges button:has-text("1M")');
      const dMid = await page.evaluate(() => new Promise((r) => setTimeout(() => r(document.querySelector(".chart-wrap .chart path:not(.base)").getAttribute("d")), 140)));
      check((await page.textContent(".hero-num >> nth=0")) !== total, `${w}px: the 1M range redraws the headline`);
      await page.waitForTimeout(600);
      const d1 = await page.evaluate(LINE);
      check(dMid !== d0 && dMid !== d1 && d0 !== d1, `${w}px: the range switch morphs the line (a mid-frame differs from both ends)`);
      await page.click('#flow .filters button:has-text("Handoffs")');
      check(await page.evaluate(() => { const r = [...document.querySelectorAll("#flow .fl")]; return r.length > 0 && r.every((n) => n.classList.contains("fl-handoff")); }), `${w}px: the Handoffs filter shows only handoffs`);
      await page.click('#flow .filters button:has-text("All")'); // the streamer checks below read the PR line in the Flow
      check((await page.locator("#team svg .edge.active").count()) === 2, `${w}px: the team map draws both running links`);
      // the flowing dash pauses while HQ sits in the background (the window unfocused or the document hidden), as the
      // room slows down, and runs again on focus; focused, it flows as it always has
      const dash = () => page.evaluate(() => { const e = document.querySelector("#team svg .edge.active"); if (!e) return "no edge"; const s = getComputedStyle(e); return s.animationName + " " + s.animationPlayState; });
      const plays = [await dash()];
      await page.evaluate(() => dispatchEvent(new Event("blur")));
      plays.push(await dash());
      await page.evaluate(() => dispatchEvent(new Event("focus")));
      plays.push(await dash());
      await page.evaluate(HIDE);
      plays.push(await dash());
      await page.evaluate(SHOW);
      plays.push(await dash());
      check(plays.join(",") === "flowing running,flowing paused,flowing running,flowing paused,flowing running", `${w}px: the flowing dash pauses when the window loses focus or the document hides, and runs again on focus (focused, blurred, focused, hidden, shown: ${plays.join(", ")})`);
      check(await page.evaluate(() => { const s = document.querySelector("#team svg").getBoundingClientRect(); const t = [...document.querySelectorAll("#team .node text")]; return t.length === 3 && t.every((n) => { const r = n.getBoundingClientRect(); return r.left >= s.left - 0.5 && r.right <= s.right + 0.5 && r.top >= s.top - 0.5 && r.bottom <= s.bottom + 0.5; }); }), `${w}px: every map label sits inside the map`);
      const stats = await page.evaluate(() => [...document.querySelectorAll("#stats > span")].map((s) => s.textContent.trim()));
      check(stats.includes("1 subagent running") && stats.includes("2 live") && stats.includes("420 actions today") && stats.includes("3 files claimed, 1 in conflict"), `${w}px: a count's noun agrees with its number (${stats.join(", ")})`);
      await page.click(".row-item >> nth=0 >> .ri-head");
      await page.waitForTimeout(700);
      check(await page.evaluate(() => { const li = document.querySelector(".row-item.open"); return !!li && li.querySelector(".ri-head").getAttribute("aria-expanded") === "true" && li.querySelector(".ri-head").getAttribute("aria-controls") === li.querySelector(".ri-more").id && li.querySelector(".ri-more").getBoundingClientRect().height > 100; }), `${w}px: the row opens under itself`);
      check((await page.textContent(".row-item.open .ri-detail")).includes("SEO/AEO Officer"), `${w}px: the open row lists the delegation`);
      check(!/\bnull\b|undefined/.test(await page.textContent(".row-item.open .ri-detail")), `${w}px: the details print no "null" or "undefined"`);
      hqBody = { ...FIXTURE, pill: { ...FIXTURE.pill, working: 2 } }; // the next poll carries a change, so it is rendered while the row is open
      await page.waitForTimeout(3500); // a poll lands while the row is open
      check((await openName(page)) === "alpha" && (await page.evaluate(FINITE)) === 0 && (await page.textContent("#pill")).startsWith("2 working"), `${w}px: a poll that changes the pill keeps the row open and starts no animation`);
      hqBody = FIXTURE;
      await page.keyboard.press("Escape");
      await page.waitForTimeout(600);
      check(await page.evaluate(() => !document.querySelector(".row-item.open")), `${w}px: Escape closes it`);
      await page.click('#flow .fl[role="button"] >> nth=0');
      await page.waitForTimeout(1000);
      check((await openName(page)) === "alpha" && (await page.evaluate(() => { const r = document.querySelector(".row-item.open .ri-head").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })), `${w}px: a Flow item opens its session's row, in view`);
      await page.keyboard.press("Escape");
      await page.click("#streamer-top");
      const s1 = await pageText(page), a1 = s1.attrs.map(([l, t]) => l + t).join(" ");
      check(!s1.t.includes("alpha") && !s1.t.includes("SEO/AEO Officer") && !a1.includes("alpha") && (await page.evaluate(() => document.querySelectorAll(".masked").length)) > 5, `${w}px: streamer mode masks every name and title at once`);
      // privacy: with Streamer on, the card's active session project, its two agent labels and the two Cost by
      // project rows (5 names) are masked in place the moment it is switched on, titles included
      check(await page.evaluate(() => { const v = document.getElementById("financials"); if (!v) return false; const t = v.innerText, a = [...v.querySelectorAll("[aria-label], [title]")].map((n) => (n.getAttribute("aria-label") || "") + (n.getAttribute("title") || "")).join(" "); return !t.includes("orchard") && !t.includes("lantern") && !t.includes("main thread") && !a.includes("orchard") && v.querySelectorAll(".row .label > .masked").length === 2 && v.querySelectorAll(".agents > .masked").length === 2 && v.querySelectorAll(".masked").length === 5; }), `${w}px: streamer mode masks the Financials project and agent names at once`);
      await page.click("#streamer-top");
      check((await page.textContent("main")).includes("alpha") && (await page.evaluate(() => document.querySelectorAll(".masked").length)) === 0 && (await page.evaluate(() => { const v = document.getElementById("financials"); return !!v && v.innerText.includes("orchard") && v.innerText.includes("main thread"); })), `${w}px: and shows them again, the card's names included`);
      // the amended spec: with a row open, a name written inside free text (the task line, the folder path,
      // the PR and conflict lines, a finished subagent's title) is masked in place and the rest stays
      await page.click(".row-item >> nth=0 >> .ri-head");
      await page.waitForTimeout(700);
      await page.click("#streamer-top");
      // the project is "quarry", not a word the page prints itself (the Financials card's "Cost by project" holds "proj")
      const NAMES = ["alpha", "beta", "quarry", "main", "o/r", "SEO/AEO Officer", "seo-technical", "Audit the sitemap", "Bug Hunter", "Check the hooks", "homeuser"];
      const s2 = await pageText(page), a2 = s2.attrs.map(([l, t]) => l + " " + t).join(" ");
      const leaked = NAMES.filter((n) => s2.t.includes(n) || a2.includes(n));
      check((await page.evaluate(() => !!document.querySelector(".row-item.open"))) && !leaked.length, `${w}px: with the row open, streamer mode masks names inside the task line (a session, a floor agent), the folder path (the home folder's name included), the PR and conflict lines` + (leaked.length ? ` (leaked: ${leaked.join(", ")})` : ""));
      check(await page.evaluate(() => { const t = document.body.innerText; return t.includes("Finish the hero after") && t.includes("ships its PR") && t.includes("then tell another session") && t.includes(".claude/hooks/guard.js") && t.includes("src/App.tsx") && t.includes("C:/Users/") && t.includes("/work/") && t.includes("Opened PR #263 in"); }), `${w}px: the rest of the task line ("another session" included), a .claude/ path, the rest of the folder path, the PR line and the conflict's file path stay visible`);
      check(await page.evaluate(() => ![...document.querySelectorAll("a[href]")].some((a) => a.href.includes("github.com"))), `${w}px: PR links carry no href while streaming`);
      const actionLine = () => page.evaluate(() => document.querySelector(".row-item.open .ri-line").innerText);
      const masking = await actionLine();
      check(!/Plan|bug hunter|gamma/.test(masking) && masking.includes("Rebasing") && masking.includes("'s note"), `${w}px: a real branch named like a generic word, a name in other capitals and an ended session from the board are masked in the action line (${masking.replace(/\s+/g, " ")})`);
      await page.click("#streamer-top");
      check((await actionLine()).includes("Rebasing Plan for bug hunter after gamma's note"), `${w}px: and the action line reads in full again`);
      check((await page.evaluate(() => { const t = document.body.innerText; return t.includes("Finish the hero after beta ships") && t.includes("ask Bug Hunter to review") && t.includes("C:/Users/homeuser/work/quarry") && t.includes("Opened PR #263 in o/r") && t.includes("src/App.tsx (alpha, beta)") && !document.querySelector(".masked"); })) && (await page.locator('a[href="https://github.com/o/r/pull/263"]').count()) > 0, `${w}px: and shows them again, with the links back`);
      await page.keyboard.press("Escape");
      // an old bookmark: a fresh load of #financials opens the Dashboard with the Financials card scrolled into view
      await page.goto("about:blank");
      await page.goto(base + "/#financials");
      await page.waitForSelector("#financials .fin-grid", { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500); // the first paint, then the scroll
      // in view means its top sits under the header in the window's top third, not a heading peeking in at the bottom
      const cardTop = await page.evaluate(() => { const c = document.getElementById("financials"); if (!c || document.getElementById("view-dashboard").hidden || !(scrollY > 0)) return null; return Math.round(c.getBoundingClientRect().top); });
      check((await current(page)) === "tab-dashboard" && cardTop !== null && cardTop >= 56 && cardTop <= h / 3, `${w}px: a #financials bookmark opens the Dashboard with the Financials card scrolled into view (its top at ${cardTop} px, under the 56 px header, bar ${Math.round(h / 3)})`);
      // the first switch to Penthouse builds the room, which fills the width and the window below the header; the
      // underline slides to the tab, and the tab is remembered
      const ind0 = await indicator(page);
      await page.click("#tab-penthouse", { timeout: 5000 }).catch(() => {});
      await page.waitForSelector("#floor .loading.done", { state: "attached", timeout: 120000 }).catch(() => {});
      await page.waitForTimeout(700);
      check(floorJs.some((u) => u.endsWith("/public/floor/main.js")) && (await page.evaluate(() => { const f = document.getElementById("floor"), v = document.getElementById("view-penthouse"); if (!f || !v) return false; const r = f.getBoundingClientRect(); return window.__gl >= 1 && !!f.querySelector("canvas") && !v.hidden && document.getElementById("view-dashboard").hidden && Math.round(r.left) === 0 && Math.round(r.width) === innerWidth && Math.round(r.top) === 56 && Math.round(r.bottom) === innerHeight && document.scrollingElement.scrollWidth <= innerWidth; })), `${w}px: the first switch to Penthouse builds the room, which fills the width and the window below the header, with no sideways scroll`);
      check(await page.evaluate(() => !document.getElementById("pent-eye") && !document.getElementById("pent-expand") && !document.querySelector(".penthouse, .mod-head") && !!document.querySelector("#floor #streamer") && !!document.querySelector("#floor #expand")), `${w}px: the Penthouse tab is the room alone (no section header, eye or Expand), its own bar keeping Streamer and Full screen`);
      const ind1 = await indicator(page);
      check((await current(page)) === "tab-penthouse" && ind1 !== ind0 && ind1.endsWith("|" + (await page.evaluate(() => (document.getElementById("tab-penthouse") || {}).offsetWidth + "px"))), `${w}px: the underline slides to the Penthouse tab`);
      check(await page.evaluate(() => { try { return localStorage.getItem("hq.tab") === "penthouse"; } catch { return false; } }), `${w}px: the Penthouse tab is remembered`);
      // on the Penthouse tab /api/hq keeps polling and /api/stats stops; streamer mode masks the room's name tags
      const a0 = { ...api };
      await page.waitForTimeout(4000);
      check(api.hq > a0.hq && api.stats === a0.stats, `${w}px: on the Penthouse tab /api/hq is polled and /api/stats is not (${api.hq - a0.hq} hq, ${api.stats - a0.stats} stats in 4 s)`);
      // the room fills exactly the space under the header and whatever sits under it: with the stale-data line showing
      // (a refresh that failed, the last data kept) the room starts under that line and ends at the window's bottom, and
      // the page does not scroll
      hqBody = { ...FIXTURE, error: "Error: boom at refresh" };
      await page.waitForFunction(() => !document.getElementById("stale").hidden, null, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(300); // the room's resize lands
      const fit = await page.evaluate(() => { const s = document.getElementById("stale"), f = document.getElementById("floor").getBoundingClientRect(); return { stale: !s.hidden, under: Math.round(s.getBoundingClientRect().bottom), top: Math.round(f.top), bottom: Math.round(f.bottom), ih: innerHeight, over: document.scrollingElement.scrollHeight - innerHeight, wide: document.scrollingElement.scrollWidth <= innerWidth }; });
      hqBody = FIXTURE;
      await page.waitForFunction(() => document.getElementById("stale").hidden, null, { timeout: 8000 }).catch(() => {});
      check(fit.stale && fit.under > 56 && fit.top === fit.under && fit.bottom === fit.ih && fit.over <= 0 && fit.wide, `${w}px: with the stale-data line showing, the room starts under it (top ${fit.top}, the line ending at ${fit.under}) and ends at the window's bottom (${fit.bottom} of ${fit.ih}), and the page does not scroll (${fit.over} px over)`);
      await page.waitForSelector("#floor .tag", { timeout: 15000 }).catch(() => {});
      // a Streamer toggle on the Penthouse tab masks the room's tags at once and, in the hidden Dashboard, only re-masks the
      // Live list's rows in place (the named exception: text only, nothing measured); the team map, hero, Flow and card see
      // no DOM mutation for 3 s from the click (their tab's return renders them)
      const toggled = await page.evaluate(TOGGLE, 3000);
      const tags = await page.evaluate(() => { const t = [...document.querySelectorAll("#floor .tag span")]; return { n: t.length, masked: t.filter((s) => s.classList.contains("masked")).length, leak: document.body.innerText.includes("alpha") }; });
      check(tags.n > 0 && tags.masked === tags.n && !tags.leak, `${w}px: on the Penthouse tab streamer mode masks every name tag (${tags.masked} of ${tags.n})`);
      check(toggled.rest === 0 && toggled.rows > 0, `${w}px: a Streamer toggle on the Penthouse tab re-masks the hidden Live list's rows in place and renders nothing else into the hidden Dashboard or its card (${toggled.rows} row mutations, ${toggled.rest} elsewhere, within 3 s of the click)`);
      // with Streamer still on, a changed payload (a new figure, and beta's session ended) is not rendered into the hidden
      // Dashboard (no DOM mutation under it across a poll). The switch back renders it at once, the new figure on screen in
      // the task that unhides the view, and no frame of the way back paints a name unmasked, though beta's row fades out
      // first and the other rows are drawn after it. Nor is the way back blank: the view is visible in its first frame and
      // its fade has begun within 150 ms, though beta's row is still leaving
      hqBody = { ...FIXTURE, vitals: { ...FIXTURE.vitals, toolCallsToday: 421 }, sessions: FIXTURE.sessions.filter((s) => s.id !== "beta") };
      const unseen = await page.evaluate(MUTATIONS, 4000);
      const back = await page.evaluate((NAMES) => new Promise((res) => {
        const v = document.getElementById("view-dashboard");
        const out = { stats: "", leaks: [], frames: 0, firstVis: "", shownMs: -1 };
        const mo = new MutationObserver(() => {
          if (v.hidden) return;
          mo.disconnect();
          out.stats = document.getElementById("stats").textContent;
          const t0 = performance.now();
          const tick = () => {
            out.frames++;
            const cs = getComputedStyle(v), o = parseFloat(cs.opacity), seen = NAMES.filter((n) => v.innerText.includes(n));
            if (out.frames === 1) out.firstVis = cs.visibility;
            if (out.shownMs < 0 && cs.visibility === "visible" && o > 0) out.shownMs = Math.round(performance.now() - t0);
            if (o > 0 && seen.length) out.leaks.push(o.toFixed(2) + " " + seen.join("/"));
            if (performance.now() - t0 < 900) requestAnimationFrame(tick); else res(out);
          };
          requestAnimationFrame(tick);
        });
        mo.observe(v, { attributes: true, attributeFilter: ["hidden"] });
        location.hash = "#dashboard";
        setTimeout(() => res(out), 5000);
      }), STREAMED);
      check(unseen === 0 && back.stats.includes("421 actions today"), `${w}px: on the Penthouse tab a changed payload is not rendered into the hidden Dashboard (${unseen} mutations over 4 s); switching back renders it at once ("${back.stats.includes("421") ? "421" : "no"} actions today" as the view unhides)`);
      check(back.frames > 5 && !back.leaks.length && (await page.evaluate(() => document.querySelectorAll("#view-dashboard .masked").length)) > 5, `${w}px: switching back with Streamer on, no frame paints a name unmasked, the card's included, though an ended session's row fades out first (${back.frames} frames over 0.9 s, ${back.leaks.length ? "leaked " + back.leaks.slice(0, 3).join(", ") : "none leaked"})`);
      check(back.firstVis === "visible" && back.shownMs >= 0 && back.shownMs <= 150, `${w}px: the Dashboard shows from its first frame after the switch, with no blank while an ended session's row leaves (visibility ${back.firstVis || "none"} in frame 1, fading in from ${back.shownMs} ms)`);
      hqBody = FIXTURE;
      await page.click("#streamer-top"); // off again, on the Dashboard
      // a live session's figure opens its row, which lives on the Dashboard now: the page switches tabs and opens it
      await page.evaluate(() => { location.hash = "#penthouse"; });
      await page.waitForTimeout(1500);
      await page.evaluate(() => { const t = [...document.querySelectorAll("#floor .tag")].find((b) => b.querySelector("span").textContent === "alpha"); if (t) t.click(); });
      await page.waitForTimeout(1200);
      check((await openName(page)) === "alpha" && (await current(page)) === "tab-dashboard" && (await page.evaluate(() => !document.getElementById("view-dashboard").hidden)), `${w}px: clicking a session's figure in the room switches to the Dashboard and opens its row`);
      await page.keyboard.press("Escape");
      // back on the Dashboard the room draws nothing (the frame count of smoke-floor); switching to Penthouse again shows it
      // on the next frame, with no "Building" text
      const counting = await page.evaluate(async () => {
        try {
          const core = await import("/public/floor/core.js");
          const n = window.__nap = { renders: 0, rafs: 0, live: new Set(), tick: 0, renderTick: -1 };
          const render = core.composer.render;
          core.composer.render = function () { n.renders++; if (n.renderTick < 0) n.renderTick = n.tick; return render.apply(this, arguments); };
          const raf = window.requestAnimationFrame, cancel = window.cancelAnimationFrame;
          window.requestAnimationFrame = function (cb) { if (cb.name !== "frame") return raf.call(window, cb); const id = raf.call(window, (t) => { n.live.delete(id); cb(t); }); n.rafs++; n.live.add(id); return id; };
          window.cancelAnimationFrame = function (id) { n.live.delete(id); return cancel.call(window, id); };
          return true;
        } catch { return false; }
      });
      await page.waitForTimeout(500);
      await page.evaluate(() => { if (window.__nap) { window.__nap.renders = 0; window.__nap.rafs = 0; } });
      await page.waitForTimeout(2000);
      const asleep = await page.evaluate(() => (window.__nap ? { renders: window.__nap.renders, rafs: window.__nap.rafs, pending: window.__nap.live.size } : { renders: -1, rafs: -1, pending: -1 }));
      check(counting && asleep.renders === 0 && asleep.rafs === 0 && asleep.pending === 0, `${w}px: back on the Dashboard the room draws nothing and asks for no animation frame over 2 s (${asleep.renders} drawn, ${asleep.rafs} asked for, ${asleep.pending} pending)`);
      const woke = await page.evaluate(() => new Promise((res) => {
        const n = window.__nap, view = document.getElementById("view-penthouse");
        if (!n || !view) return res({ frame: -1 });
        const mo = new MutationObserver(() => { // the count starts the moment the view is unhidden, after the Dashboard's fade
          if (view.hidden) return;
          mo.disconnect();
          n.tick = 0; n.renderTick = -1; const before = n.renders;
          let on = true; const tick = () => { n.tick++; if (on) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
          const loading = document.querySelector("#floor .loading");
          const done = !!loading && loading.classList.contains("done") && getComputedStyle(loading).opacity === "0";
          const look = () => { if (n.renders > before || n.tick > 10) { on = false; res({ frame: n.renderTick, done }); } else setTimeout(look, 5); }; look();
        });
        mo.observe(view, { attributes: true, attributeFilter: ["hidden"] });
        location.hash = "#penthouse";
      }));
      check(woke.frame >= 1 && woke.frame <= 2 && woke.done, `${w}px: switching to Penthouse again shows the room on the next frame (frame ${woke.frame}) with the "Building" text long gone`);
      // the remembered tab survives a reload (a URL with no hash); a hash wins over it. The old eye's "off" left in
      // localStorage is no longer read (the room builds anyway) and is not deleted
      await page.evaluate(() => { try { localStorage.setItem("hq.penthouse", "off"); } catch {} });
      await page.goto(base + "/");
      await page.waitForSelector("#view-penthouse:not([hidden])", { timeout: 15000 }).catch(() => {});
      await page.waitForSelector("#floor canvas", { state: "attached", timeout: 120000 }).catch(() => {});
      check((await current(page)) === "tab-penthouse" && (await page.evaluate(() => !window.__nap && !!document.getElementById("view-penthouse") && !document.getElementById("view-penthouse").hidden && !!document.querySelector("#floor canvas") && localStorage.getItem("hq.penthouse") === "off")), `${w}px: the remembered tab survives a reload (a fresh document, a URL with no hash: the Penthouse opens and builds, an old hq.penthouse "off" ignored and kept)`);
      await page.evaluate(() => { try { localStorage.removeItem("hq.penthouse"); } catch {} }); // so the old code would build its room on the visit below
      await page.goto("about:blank");
      const before = floorJs.length;
      await page.goto(base + "/#dashboard");
      await page.waitForSelector(".row-item");
      await page.waitForTimeout(1500);
      check((await current(page)) === "tab-dashboard" && floorJs.length === before && (await page.evaluate(() => !document.getElementById("view-dashboard").hidden && !document.querySelector("#floor canvas"))), `${w}px: a hash wins over the remembered tab, and this Dashboard visit builds no room`);
      // the document hidden (minimized, another browser tab): no /api request over 10 s; visible again: one at once
      await page.evaluate(HIDE);
      await page.waitForTimeout(300);
      const h0 = { ...api };
      await page.waitForTimeout(10000);
      const hiddenHits = api.hq - h0.hq + api.stats - h0.stats;
      const h1 = { ...api };
      await page.evaluate(SHOW);
      await page.waitForTimeout(400);
      check(hiddenHits === 0 && api.hq > h1.hq && api.stats > h1.stats, `${w}px: with the document hidden no /api request is made over 10 s (${hiddenHits}); visible again, the page polls at once (${api.hq - h1.hq} hq, ${api.stats - h1.stats} stats within 400 ms)`);
      // every poll renders, an identical payload included, so the "elapsed" and "ago" labels keep time: the same bytes
      // (generatedAt too) served on two polls move alpha's "elapsed" on by the seconds between them
      const t0 = Date.now();
      hqFrozen = JSON.stringify({ ...FIXTURE, generatedAt: t0, sessions: FIXTURE.sessions.map((s) => (s.id === "alpha" ? { ...s, startedAt: t0 - 5e3 } : s)) });
      const elapsedAfterPoll = async () => {
        const n = api.hq;
        for (let i = 0; i < 120 && api.hq === n; i++) await page.waitForTimeout(50);
        await page.waitForTimeout(400); // the poll's render lands
        return page.evaluate(() => { const r = [...document.querySelectorAll(".row-item")].find((li) => li.querySelector(".ri-name span").textContent === "alpha"); const m = r && /\d+s elapsed/.exec(r.querySelector(".ri-meta").textContent); return m ? m[0] : ""; });
      };
      const e1 = await elapsedAfterPoll(), e2 = await elapsedAfterPoll();
      hqFrozen = null;
      check(!!e1 && !!e2 && parseInt(e2, 10) > parseInt(e1, 10), `${w}px: an identical payload served on two polls is rendered again, so a session's "elapsed" keeps time ("${e1}", then "${e2}")`);
      // the scan's positive control: the same page served without the home folder's name must leak it from the cwd,
      // which proves the scan above can see a home folder name inside a path
      hqBody = { ...FIXTURE, homeName: null };
      await page.reload();
      await page.waitForSelector(".row-item");
      await page.click(".row-item >> nth=0 >> .ri-head");
      await page.waitForTimeout(700);
      await page.click("#streamer-top");
      const control = await pageText(page);
      check(control.t.includes("homeuser") && (await page.evaluate(() => !!document.querySelector(".row-item.open"))), `${w}px: control: served without homeName, the scan does see the home folder's name in the cwd`);
      await page.click("#streamer-top");
      hqBody = FIXTURE;
      await page.keyboard.press("Escape");
      // an empty model mix says so like its siblings and draws no bar
      statsBody = { ...STATS, byModel: [] };
      await page.reload();
      await page.waitForSelector("#financials .fin-grid", { timeout: 15000 }).catch(() => {});
      check(await page.evaluate(() => { const p = [...document.querySelectorAll("#financials .panel")].find((n) => n.firstChild.textContent === "Model mix (by cost)"); return !!p && p.textContent.includes("No data.") && !p.querySelector(".mm"); }), `${w}px: an empty model mix says "No data." and draws no bar`);
      statsBody = STATS;
      await page.close();
      // a page opened on the Penthouse (the remembered tab of someone who lives in the room), its Dashboard never drawn: a
      // click on a session's figure switches to the Dashboard with that session's row open and in view
      const fresh = await browser.newPage({ viewport: { width: w, height: h } });
      fresh.on("console", (m) => m.type() === "error" && !m.text().includes("X4122") && errors.push(m.text()));
      fresh.on("pageerror", (e) => errors.push(e.message));
      await stub(fresh);
      await fresh.goto(base + "/?debug#penthouse"); // ?debug exposes the room's state (window.__hqFloor) for the feeding check below
      await fresh.waitForSelector("#floor .loading.done", { state: "attached", timeout: 120000 }).catch(() => {});
      // the agents' tags come with the room; a session's tag comes with the room's first update, so wait for alpha's own
      await fresh.waitForFunction(() => [...document.querySelectorAll("#floor .tag span")].some((s) => s.textContent === "alpha"), null, { timeout: 15000 }).catch(() => {});
      const rowsBefore = await fresh.evaluate(() => document.querySelectorAll(".row-item").length);
      await fresh.evaluate(() => { const t = [...document.querySelectorAll("#floor .tag")].find((b) => b.querySelector("span").textContent === "alpha"); if (t) t.click(); });
      await fresh.waitForTimeout(1500); // the fade, the row's unfolding and the scroll to it
      const opened = await fresh.evaluate(() => { const li = document.querySelector(".row-item.open"); if (!li || document.getElementById("view-dashboard").hidden) return null; const r = li.querySelector(".ri-head").getBoundingClientRect(); return { name: li.querySelector(".ri-name span").textContent, top: Math.round(r.top), bottom: Math.round(r.bottom) }; });
      check(rowsBefore === 0 && !!opened && opened.name === "alpha" && opened.top >= 56 && opened.bottom <= h, `${w}px: on a page opened at #penthouse (${rowsBefore} rows drawn), clicking a session's figure switches to the Dashboard with its row open and in view (${opened ? `${opened.name}, ${opened.top} to ${opened.bottom} px` : "no row open"})`);
      // the room is fed only while its own tab shows and gets the latest payload as it returns: an agent put to work while
      // the Dashboard shows is unchanged in the room across a poll, and at work in the first frame of the Penthouse's return
      await fresh.evaluate(() => { location.hash = "#dashboard"; }); // already there unless the click above failed
      await fresh.waitForTimeout(800);
      const agent = FIXTURE.floor.agents[0].id;
      const doing = (id) => { const P = window.__hqFloor && window.__hqFloor.npcs.find((x) => x.agent.id === id); return P ? String(P.agent.doing) : "no room"; };
      hqBody = { ...FIXTURE, floor: { ...FIXTURE.floor, agents: FIXTURE.floor.agents.map((a, i) => (i === 0 ? { ...a, working: true, doing: "Fed probe" } : a)) } };
      const p0 = api.hq;
      for (let i = 0; i < 120 && api.hq === p0; i++) await fresh.waitForTimeout(50);
      await fresh.waitForTimeout(400); // that poll lands
      const whileAway = await fresh.evaluate(doing, agent);
      const onReturn = await fresh.evaluate((id) => new Promise((res) => {
        const v = document.getElementById("view-penthouse");
        const read = () => { const P = window.__hqFloor && window.__hqFloor.npcs.find((x) => x.agent.id === id); return P ? String(P.agent.doing) : "no room"; };
        const mo = new MutationObserver(() => { if (v.hidden) return; mo.disconnect(); requestAnimationFrame(() => res(read())); });
        mo.observe(v, { attributes: true, attributeFilter: ["hidden"] });
        location.hash = "#penthouse";
        setTimeout(() => res("timeout"), 5000);
      }), agent);
      hqBody = FIXTURE;
      check(whileAway !== "no room" && whileAway !== "Fed probe" && onReturn === "Fed probe", `${w}px: the room is fed only while its tab shows (an agent put to work on the Dashboard reads "${whileAway}" in the room across a poll) and gets the latest payload as its tab returns ("${onReturn}" in the first frame)`);
      // a Dashboard, Penthouse, Dashboard round trip with Streamer pressed in between, while the first return's render still
      // runs (beta's session ended while the Penthouse showed, so its row fades out and the kept rows wait about 0.4 s): the
      // second return shows the Dashboard before that render ends, and from the press on no frame paints a real name
      hqBody = { ...FIXTURE, sessions: FIXTURE.sessions.filter((s) => s.id !== "beta") };
      const p1 = api.hq;
      for (let i = 0; i < 120 && api.hq === p1; i++) await fresh.waitForTimeout(50);
      await fresh.waitForTimeout(400); // that poll lands while the Penthouse shows
      const trip = await fresh.evaluate((NAMES) => new Promise((res) => {
        const v = document.getElementById("view-dashboard"), out = { frames: 0, shown: 0, leaks: [] };
        location.hash = "#dashboard";
        setTimeout(() => { location.hash = "#penthouse"; }, 180);
        setTimeout(() => {
          document.getElementById("streamer-top").click();
          const p0 = performance.now();
          const tick = () => {
            out.frames++;
            const cs = getComputedStyle(v), painted = !v.hidden && cs.visibility === "visible" && parseFloat(cs.opacity) > 0;
            const seen = painted ? NAMES.filter((n) => v.innerText.includes(n)) : [];
            if (painted) out.shown++;
            if (seen.length) out.leaks.push(Math.round(performance.now() - p0) + " ms " + seen.join("/"));
            if (performance.now() - p0 < 1400) requestAnimationFrame(tick); else res(out);
          };
          requestAnimationFrame(tick);
          setTimeout(() => { location.hash = "#dashboard"; }, 5);
        }, 345);
      }), STREAMED);
      hqBody = FIXTURE;
      check(trip.frames > 10 && trip.shown > 0 && !trip.leaks.length, `${w}px: a Dashboard, Penthouse, Dashboard round trip with Streamer pressed in between, an ended session's row still leaving, paints no real name in any frame from the press on (${trip.frames} frames, ${trip.shown} with the Dashboard on screen, ${trip.leaks.length ? "leaked " + trip.leaks.slice(0, 3).join(", ") : "none leaked"})`);
      await fresh.click("#streamer-top"); // off again, on the Dashboard
      // Streamer pressed on the Dashboard while a render that removes beta's row runs (its row fading out, the kept rows
      // waiting their turn on the row queue): no frame after the press paints a real name
      await fresh.waitForFunction(() => [...document.querySelectorAll(".row-item .ri-name span")].some((s) => s.textContent === "beta") && !document.getElementById("sessions").getAnimations({ subtree: true }).some((a) => a.playState === "running"), null, { timeout: 10000 }).catch(() => {});
      hqBody = { ...FIXTURE, sessions: FIXTURE.sessions.filter((s) => s.id !== "beta") };
      const fading = await fresh.evaluate(PRESS_DURING_FADE, STREAMED);
      hqBody = FIXTURE;
      check(fading.pressed && fading.frames > 5 && !fading.leaks.length, `${w}px: Streamer pressed on the Dashboard while an ended session's row fades out paints no real name in any frame after the press (${fading.pressed ? fading.frames + " frames over 0.6 s" : "the fade was never seen"}, ${fading.leaks.length ? "leaked " + fading.leaks.slice(0, 3).join(", ") : "none leaked"})`);
      await fresh.click("#streamer-top"); // off again
      await fresh.close();
    }
    // a refresh that fails before the first index: the Dashboard says so with the error's first line, never a stuck
    // "Indexing your history" (Minor 4)
    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const failing = JSON.stringify({ building: true, progress: { done: 0, total: 0 }, error: "Error: boom at refresh\n    at refresh (server.js:30)" });
      await page.route("**/api/hq", (r) => r.fulfill({ contentType: "application/json", body: failing }));
      await page.route("**/api/stats", (r) => r.fulfill({ contentType: "application/json", body: failing }));
      await page.goto(base + "/#dashboard");
      await page.waitForFunction(() => !document.getElementById("stale").hidden, null, { timeout: 15000 }).catch(() => {});
      const pill = await page.textContent("#pill");
      const stale = await page.evaluate(() => (document.getElementById("stale").hidden ? "" : document.getElementById("stale").textContent));
      check(pill === "Refresh failed" && stale.includes("boom at refresh") && !stale.includes("server.js:30"), `a refresh that fails while building shows its first line on the Dashboard (pill "${pill}", line "${stale}")`);
      await page.close();
    }
    // a room that cannot build (on the Penthouse tab, where it is built): "needs WebGL" only when WebGL2 is really
    // unavailable, "could not load" for anything else, and the console keeps the error either way (Minor 6)
    for (const [label, setup, want] of [
      ["without WebGL2", (p) => p.addInitScript(() => { const orig = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...a) { return type === "webgl2" ? null : orig.call(this, type, ...a); }; }), "needs WebGL"],
      ["with a floor module that fails to load", (p) => p.route("**/public/floor/scene.js", (r) => r.abort()), "could not load"],
    ]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const warned = [];
      page.on("console", (m) => m.type() === "warning" && warned.push(m.text()));
      await setup(page);
      await page.route("**/api/hq", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(FIXTURE) }));
      await page.route("**/api/stats", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(STATS) }));
      await page.goto(base + "/#penthouse");
      await page.waitForFunction(() => /Penthouse (needs|could not)/.test(document.getElementById("floor").textContent), null, { timeout: 60000 }).catch(() => {});
      const text = (await page.textContent("#floor")).trim();
      check(text.includes(want) && warned.some((t) => t.startsWith("HQ: the 3D floor could not load")), `${label}: the room's place says "${want}" and the console keeps the error (got "${text.slice(0, 70)}")`);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  check(!errors.length, "no console errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  process.exit(failed ? 1 : 0);
})();
