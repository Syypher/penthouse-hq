// The floor in a real browser against the real server: it builds with no console errors, real mouse
// clicks walk the boss to the desk and back, every agent turned green walks to its own desk without
// crossing another, turned red they all leave, a running delegation draws one arc, streamer mode and
// full screen mask every name and task (tags, desk screens, the panel), the header's Streamer button
// drives the same state, the phone panel fits its box, and the room sleeps on the Dashboard tab or in a
// hidden tab, wakes where it left off and throttles unfocused. The room lives on the Penthouse tab, where
// every page here opens. The page's data is an invented fixture stubbed over /api/hq and /api/stats (as smoke-page does),
// so the check never reads this machine's own sessions; each scenario swaps the fixture's floor so the
// page's own poll agrees with it. Its floor comes from hq.config.example.json with the mockup's mix of
// working and idle agents and invented live sessions; it survives a missing boss model. The desks for agents
// that are not subagents (a heartbeat file, a named live session) take their floor from the real lib/hq.js over
// a world of invented files, so the seating the page shows is the server's own.
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { chromium } = require(process.env.HQ_PLAYWRIGHT || "playwright-core");
const BROWSER = process.env.HQ_BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const { handler } = require("../server");
const cfg = require("../hq.config.example.json");
const OUT = process.argv[2] || require("os").tmpdir();
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) failed++; };

const now = Date.now();
const SLOT = 15 * 60e3;
const end = Math.floor(now / SLOT) * SLOT;
const session = (id, status, extra = {}) => ({
  id, name: id, title: null, project: "proj", cwd: "C:/work/proj", branch: "main", task: "Wire the floor to the page", status, action: "Editing App.tsx",
  startedAt: now - 600e3, lastAt: now - 5e3, toolCount: 12, cost: 1.23, progress: { step: 2, of: 5, pct: 40, finishAt: now + 900e3, done: false },
  cache: { state: "warm", ttl: 3600e3, expiresAt: now + 1200e3, prefix: 300000, wakeCost: 2.4, warmCost: 0.06, hitRate: 0.9, cooling: false, rewritesToday: { expired: { count: 0, extra: 0 }, prefixChanged: { count: 0, extra: 0 } } },
  subagents: [{ id: "x1", type: "seo-technical", description: "Audit the sitemap", running: true, cost: 0.4, cache: null, toolCount: 7, lastAt: now - 5e3 }], subagentsTotal: 1,
  locks: [], claims: ["src/App.tsx"], events: [{ at: now - 5e3, tool: "Edit", label: "Editing App.tsx" }], registered: true, avatar: 0,
  spark: Array.from({ length: 30 }, (_, i) => i % 4),
  delegations: [{ id: "tu_1", startedAt: now - 120e3, doneAt: null, status: "running", type: "seo-technical", agentId: "seo", agentName: "SEO/AEO Officer", description: "Audit the sitemap", cost: 0.4 }],
  handoffs: [{ at: now - 60e3, dir: "in", peer: "lantern", text: "Take the hero" }],
  prs: [{ at: now - 300e3, number: 263, url: "https://github.com/o/r/pull/263", repo: "o/r" }],
  completions: [{ at: now - 200e3, status: "done", text: 'Agent "Audit the sitemap" finished' }],
  ...extra,
});
const WORKING = new Set(["engineer", "qa", "bughunter", "seo", "support", "infra"]); // the mockup's in-session agents
const FIXTURE = {
  generatedAt: now, appName: "HQ",
  vitals: { liveSessions: 2, subagentsRunning: 1, toolCallsToday: 420, spendToday: 12.5, planUsd: 200, filesClaimed: 2, conflicts: 0 },
  pill: { working: 2, needsYou: 0, conflicts: 0 },
  sessions: [session("orchard", "working"), session("lantern", "thinking", { avatar: 1, progress: null, subagents: [], subagentsTotal: 0, delegations: [], handoffs: [], prs: [], completions: [] })],
  board: { conflicts: [], locks: [], feed: [{ at: now - 60e3, kind: "note", by: "orchard", text: "Took the merge lock" }] },
  activity: {
    slots: Array.from({ length: 672 }, (_, i) => ({ t: end - (671 - i) * SLOT, tools: i % 7, cost: 0.1 })),
    days: Array.from({ length: 30 }, (_, i) => ({ date: new Date(now - (29 - i) * 864e5).toISOString().slice(0, 10), tools: 100 + i, cost: 5 })),
  },
  flow: [
    { at: now - 60e3, kind: "handoff", from: "lantern", to: "orchard", sessionId: "orchard", text: "Take the hero" },
    { at: now - 120e3, kind: "delegate", from: "orchard", to: "SEO/AEO Officer", agentId: "seo", sessionId: "orchard", text: "Audit the sitemap", status: "running", startedAt: now - 120e3, doneAt: null },
    { at: now - 200e3, kind: "done", from: "orchard", sessionId: "orchard", text: 'Agent "Audit the sitemap" finished', status: "done" },
  ],
  team: {
    nodes: [{ id: "s:orchard", label: "orchard", kind: "session", status: "working", sessionId: "orchard" }, { id: "a:seo", label: "SEO/AEO Officer", kind: "agent", color: "#ffa31a" }, { id: "p:lantern", label: "lantern", kind: "peer" }],
    edges: [{ from: "s:orchard", to: "a:seo", kind: "delegate", count: 3, lastAt: now - 120e3, active: true }, { from: "p:lantern", to: "s:orchard", kind: "handoff", count: 1, lastAt: now - 60e3, active: true }],
  },
  floor: {
    departments: cfg.departments, owner: cfg.owner, accent: cfg.accent, sessionAvatars: cfg.sessionAvatars, links: [{ from: "orchard", to: "seo" }],
    agents: cfg.agents.map((a) => ({ id: a.id, name: a.name, dept: a.dept, hangout: a.hangout, look: a.look, avatar: a.avatar, working: WORKING.has(a.id), doing: WORKING.has(a.id) ? "Audit the sitemap" : null, forSession: WORKING.has(a.id) ? "orchard" : null })),
    sessions: [
      { id: "orchard", name: "orchard", status: "working", working: true, action: "Editing App.tsx", avatar: 0 },
      { id: "lantern", name: "lantern", status: "thinking", working: true, action: "Editing App.tsx", avatar: 1 },
    ],
  },
};
const STATS = {
  generatedAt: new Date(now).toISOString(), plan: 200,
  totals: { cost: 812.4, tokens: 21e6, cacheSaved: 310.2 },
  today: 12.5, monthToDate: 52.5, projMonth: 157.5, savedVsApi: -147.5, toolsToday: 420,
  byProject: [{ project: "orchard", cost: 40, tokens: 1.2e6 }, { project: "lantern", cost: 12.5, tokens: 3e5 }],
  byModel: [{ model: "claude-opus-4-1", cost: 30, tokens: 4e5 }],
  byTool: [{ name: "Edit", count: 120, cost: 3.2 }],
  active: null,
  activity: FIXTURE.activity,
};
// A world for the desks: SEO/AEO Officer reads a heartbeat file, Social and Content follows live sessions named
// smoke-vis-*, and two sessions work now, smoke-vis-fixer (matched) and smoke-free (not). The heartbeat's text plants
// a name the page must never draw while streaming. floor() is one server refresh: the payload's floor, as served.
const { createHq } = require("../lib/hq");
const { createBoard } = require("../lib/board");
const { T0, asst, tool, jsonl } = require("../test/helpers");
const PLANTED = "Zephyrine Quillfeather";
function deskWorld() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hq-smoke-desks-"));
  const proj = path.join(root, "projects", "p1");
  fs.mkdirSync(proj, { recursive: true });
  const MATCHED = "eeeeeeee-0000-0000-0000-000000000005", FREE = "ffffffff-0000-0000-0000-000000000006";
  const index = { mains: [], subMtime: {}, subs: [] };
  for (const [id, file] of [[MATCHED, "plan.md"], [FREE, "notes.md"]]) {
    const fp = path.join(proj, id + ".jsonl");
    fs.writeFileSync(fp, jsonl([asst({ sec: Math.round((Date.now() - T0) / 1000), content: [tool("Edit", { file_path: "C:/work/" + file })] })])); // a tool running now: working
    index.mains.push({ fp, sessionId: id, mtimeMs: Date.now(), project: "p1" });
  }
  const reg = path.join(root, "registry.json");
  fs.writeFileSync(reg, JSON.stringify({ sessions: { [MATCHED]: { id: MATCHED, name: "smoke-vis-fixer" }, [FREE]: { id: FREE, name: "smoke-free" } }, claims: [], locks: {}, notes: [] }));
  const beat = path.join(root, "seo.json");
  const config = JSON.parse(JSON.stringify(cfg));
  config.agents.find((a) => a.id === "seo").heartbeat = beat;
  config.agents.find((a) => a.id === "social").sessions = ["smoke-vis-*"];
  const hq = createHq({ config, board: createBoard(reg) });
  const write = (fields) => {
    fs.writeFileSync(beat + ".tmp", JSON.stringify({ agent: "seo", status: "working", task: `Email ${PLANTED} the citation list`, startedAt: new Date(Date.now() - 4 * 60e3).toISOString(), endedAt: null, summary: [`${PLANTED} asked for the list`, "Sent 3 citations"], ...fields }));
    fs.renameSync(beat + ".tmp", beat); // as its owner writes it
  };
  const floor = async () => { await hq.update(index, null, Date.now()); return hq.payload().floor; };
  return { write, floor, MATCHED, FREE };
}

// the floor the stub serves right now; a scenario swaps it and pushes it to the page at once, the next poll repeats it
let floorBody = FIXTURE.floor;
const polls = new Map(); // page -> its own polls of /api/hq so far, so a check can see one land
const setFloor = (page, f) => { floorBody = f; return page.evaluate(async (f) => (await import("/public/floor/live.js")).updateFloor(f), f); };

// a model that parses but carries none of its clips: the loader's callback fails after its await (Minor 9)
const CLIPLESS = JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [] }] });
// The room fills its tab below the 56 px header, so a 792 px tall window gives it the 1440 x 736 box it had at 46vh of the
// 1600 px window these checks used before the layout of 2026-10-07 (3): the same pixels to draw, the same framing
async function open(browser, base, { blockModel = false, clipless = false, viewport = { width: 1440, height: 792 }, init = null, waitFloor = true, speed = 4 } = {}) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  // the browser's own "Failed to load resource" line for the model this run blocks on purpose is not a floor error
  const ownStub = (m) => blockModel && m.location().url.endsWith("/assets/boss.glb");
  page.on("console", (m) => (m.type() === "error" || (m.type() === "warning" && !m.text().startsWith("HQ: boss model"))) && !m.text().includes("X4122") && !m.text().includes("GPU stall") && !ownStub(m) && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  await page.route("**/api/hq", (r) => { polls.set(page, (polls.get(page) || 0) + 1); return r.fulfill({ contentType: "application/json", body: JSON.stringify({ ...FIXTURE, floor: floorBody }) }); });
  await page.route("**/api/stats", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify(STATS) }));
  // the broken-model runs need the page to try the model, so the server is made to say one exists
  if (blockModel || clipless) await page.route("**/api/assets", (r) => r.fulfill({ contentType: "application/json", body: JSON.stringify({ boss: true }) }));
  if (blockModel) await page.route("**/assets/boss.glb", (r) => r.fulfill({ status: 404, body: "" }));
  if (clipless) await page.route("**/assets/boss.glb", (r) => r.fulfill({ contentType: "model/gltf+json", body: CLIPLESS }));
  if (init) await page.addInitScript(init);
  await page.goto(base + "/?debug&speed=" + speed + "#penthouse");
  if (waitFloor) await page.waitForFunction(() => window.__hqFloor && document.querySelector("#floor .loading.done"), null, { timeout: 120000 });
  return { page, errors };
}
// screen position of a world point, for real mouse clicks
const screenOf = (page, p) => page.evaluate(([x, y, z]) => {
  const F = window.__hqFloor, v = F.camera.position.clone().set(x, y, z).project(F.camera), r = document.querySelector("#floor canvas").getBoundingClientRect();
  return [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
}, p);

(async () => {
  const srv = http.createServer(handler).listen(0, "127.0.0.1");
  await new Promise((r) => srv.once("listening", r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  const browser = await chromium.launch({ executablePath: BROWSER, headless: true, args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
  try {
    // the Penthouse never blocks the page while its shaders compile (Task 12 fix round 1): from navigation until the
    // room's canvas exists and its first frame has drawn, plus 5 s, no single main-thread task runs longer than 2 s.
    // It goes first on purpose: the browser's shader cache is cold only for the first page of a run that builds the room
    const cold = await open(browser, base, { waitFloor: false, init: () => { window.__long = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: "longtask", buffered: true }); window.__longOn = true; } catch {} } });
    await cold.page.waitForSelector("#floor canvas", { state: "attached", timeout: 180000 });
    await cold.page.waitForSelector("#floor .loading.done", { state: "attached", timeout: 180000 });
    await cold.page.waitForTimeout(5000);
    const { longOn, longest, tasks } = await cold.page.evaluate(() => ({ longOn: !!window.__longOn, longest: Math.max(0, ...window.__long.map((e) => e[1])), tasks: window.__long.filter((e) => e[1] > 500).map((e) => `${e[1]} ms at ${(e[0] / 1000).toFixed(1)} s`).join(", ") }));
    // an observer that never installed saw nothing, which is not a pass (fix round 2); every task over 500 ms is named by its
    // start so a slow run says which step it was
    check(longOn && longest <= 2000, longOn ? `the Penthouse never blocks the page while its shaders compile (longest main-thread task ${longest} ms, bar 2,000 ms${tasks ? "; over 500 ms: " + tasks : ""})` : "the long-task observer did not install, so the blocking check could not run");
    check(!cold.errors.length, "and no console errors while it compiles" + (cold.errors.length ? ": " + cold.errors.join(" | ") : ""));
    await cold.page.close();
    const { page, errors } = await open(browser, base);
    await page.locator("#floor").scrollIntoViewIfNeeded();
    await page.waitForTimeout(8000); // the intro flight
    const hasModel = fs.existsSync(path.join(__dirname, "..", "assets", "boss.glb")); // optional (assets/README.md)
    check((await page.evaluate(() => !!window.__hqFloor.fig.model)) === hasModel, hasModel ? "the boss model loaded" : "no boss model installed, so the built-in figure stays");
    check((await page.evaluate(() => getComputedStyle(document.querySelector("#floor .title")).letterSpacing)) === "normal", "the floor's title keeps its own tracking, not the page brand's");
    // at its normal height the room does not look its programs up again every frame (fix round 2, ruling 1): three.js draws a
    // transparent double-sided material twice and re-keys its program before each pass unless forceSinglePass is set, and
    // that re-keying was the lag the owner saw. Over 60 frames with the camera at rest, at most 30 lookups a frame.
    const lookups = await page.evaluate(async () => {
      const mats = new Set();
      window.__hqFloor.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) mats.add(m); });
      let keys = 0; const undo = [];
      for (const m of mats) { const k = m.customProgramCacheKey; m.customProgramCacheKey = function () { keys++; return k.call(this); }; undo.push(() => { m.customProgramCacheKey = k; }); }
      await new Promise((res) => { let n = 0; const step = () => (++n < 60 ? requestAnimationFrame(step) : res()); requestAnimationFrame(step); });
      for (const u of undo) u();
      return Math.round(keys / 60);
    });
    check(lookups <= 30, `at its normal height the room looks up at most 30 programs a frame (${lookups} a frame over 60 frames)`);
    await page.screenshot({ path: OUT + "/floor-boss.png" });
    await page.evaluate(() => { const F = window.__hqFloor; F.camera.position.set(5.5, 2.6, 1.6); F.controls.target.set(-.3, 1.0, -3.4); });
    await page.waitForTimeout(800);
    let [x, y] = await screenOf(page, [0, 0.8, -5.0]); // the jet desk
    await page.mouse.click(x, y);
    await page.waitForFunction(() => window.__hqFloor.boss.state === "desk", null, { timeout: 60000 });
    check(true, "a click on the desk seats the boss");
    await page.evaluate(() => { const F = window.__hqFloor; F.camera.position.set(5.5, 2.6, 1.6); F.controls.target.set(-.3, 1.0, -3.4); });
    await page.waitForTimeout(800);
    [x, y] = await screenOf(page, [1.2, 0.76, 0.3]); // the table top, clear of the boss
    await page.mouse.click(x, y);
    await page.waitForFunction(() => window.__hqFloor.boss.state === "stage", null, { timeout: 60000 });
    check(true, "a click on the table puts him back on it");
    // every job agent green: each walks to its own desk without passing through another desk
    const all = FIXTURE.floor;
    const green = { ...all, agents: all.agents.map((a) => ({ ...a, working: true, doing: "Smoke test" })) };
    await setFloor(page, green);
    const report = await page.evaluate(async () => {
      const F = window.__hqFloor, { DESKS } = await import("/public/floor/rooms.js");
      const hits = new Set(); let seated = 0;
      for (let i = 0; i < 900; i++) { // 90 s of samples
        await new Promise((r) => setTimeout(r, 100));
        for (const P of F.npcs) {
          if (P.state !== "walk") continue;
          for (const D of DESKS) {
            if (D === P.desk) continue;
            const dx = P.root.position.x - D.x, dz = P.root.position.z - D.z, c = Math.cos(-D.yaw), s = Math.sin(-D.yaw);
            const lx = dx * c - dz * s, lz = dx * s + dz * c;
            if (Math.abs(lx) < D.w / 2 + .12 && Math.abs(lz) < .4 + .12) hits.add(`${P.agent.id} through ${D.key}`);
          }
        }
        seated = F.npcs.filter((P) => P.spot === P.desk?.key && P.state === "do").length;
        if (seated === F.npcs.length) break;
      }
      return { hits: [...hits], seated, total: F.npcs.length };
    });
    check(report.seated === report.total, `every agent reached its desk (${report.seated} of ${report.total})`);
    check(!report.hits.length, "no walk passed through a desk" + (report.hits.length ? ": " + report.hits.join(", ") : ""));
    await page.evaluate(() => { const F = window.__hqFloor; F.camera.position.set(.01, 30, 2.5); F.controls.target.set(0, 0, 2.4); });
    await page.waitForTimeout(800);
    await page.screenshot({ path: OUT + "/floor-all-green.png" });
    await setFloor(page, { ...all, agents: all.agents.map((a) => ({ ...a, working: false, doing: null })) });
    await page.waitForTimeout(20000);
    check(await page.evaluate(() => window.__hqFloor.npcs.filter((P) => !P.agent.live).every((P) => !P.desk || P.spot !== P.desk.key)), "red agents leave their desks");
    // a running delegation draws one arc from the session's desk to the agent's desk, and it goes when the work ends
    const smokeSession = { id: "smoke-s", name: "smoke", status: "working", working: true, action: "Smoke test", avatar: 0 };
    const arcs = async (links) => {
      await setFloor(page, { ...all, sessions: [smokeSession], links });
      return page.evaluate(async () => (await import("/public/floor/links.js")).linkCount());
    };
    check((await arcs([{ from: "smoke-s", to: all.agents[0].id }])) === 1, "a running delegation draws one arc");
    await page.evaluate(() => { const F = window.__hqFloor; F.camera.position.set(-1.7, 3.5, -2.5); F.controls.target.set(.3, 1.1, 6.5); });
    await page.waitForTimeout(800);
    await page.screenshot({ path: OUT + "/floor-arc.png" });
    check((await arcs([])) === 0, "the arc goes when the delegation ends");
    // a session that starts and ends leaves no GPU texture behind: its three screens go with it (fix round 1, ruling 1)
    const textures = () => page.evaluate(() => window.__hqFloor.renderer.info.memory.textures);
    const sessionsOf = (sessions) => setFloor(page, { ...all, sessions, links: [] });
    await sessionsOf([]); await page.waitForTimeout(700);
    const texBase = await textures();
    let texSeated = 0;
    for (let i = 0; i < 5; i++) {
      await sessionsOf([smokeSession]); await page.waitForTimeout(700);
      if (!i) texSeated = await textures();
      await sessionsOf([]); await page.waitForTimeout(700);
    }
    const texAfter = await textures();
    check(texSeated > texBase && texAfter === texBase, `a session that starts and ends 5 times leaves no texture behind (${texBase} with none, ${texSeated} with one seated, ${texAfter} after 5 starts and ends)`);
    await sessionsOf([smokeSession]); await page.waitForTimeout(700); // seated again for the streamer checks below
    // streamer mode: no name or task shows in the tags, the desk screens or the panel, and full screen turns it on
    const MASK = await page.evaluate(async () => (await import("/public/streamer.js")).MASK);
    const streaming = () => page.evaluate(async () => (await import("/public/streamer.js")).streaming());
    const tagTexts = () => page.evaluate(() => [...document.querySelectorAll("#floor .tag span")].map((s) => s.textContent));
    await page.click("#streamer");
    const masked = await tagTexts();
    check(masked.length > 0 && masked.every((t) => t === MASK), `streamer mode masks every name tag (${masked.length})`);
    await page.evaluate(() => document.querySelector("#floor .tag").click());
    const secret = [all.owner.name, ...all.agents.map((a) => a.name), smokeSession.name, smokeSession.action];
    const seen = await page.evaluate(() => document.querySelector("#floor .labels").innerText + "\n" + document.querySelector("#floor #panel").innerText);
    const leaks = secret.filter((s) => s && seen.includes(s));
    check(!leaks.length, "no name or task shows in the tags or the panel" + (leaks.length ? ": " + leaks.join(", ") : ""));
    check(await page.evaluate(() => document.querySelector("#floor #panel").classList.contains("open") && document.querySelector("#floor #p-name").classList.contains("masked")), "the panel is open with its name masked");
    await page.evaluate(() => { const F = window.__hqFloor; F.camera.position.set(-1.7, 3.5, -2.5); F.controls.target.set(.3, 1.1, 6.5); }); // the live desks and the rooms' away screens in frame
    await page.waitForTimeout(800);
    await page.screenshot({ path: OUT + "/floor-streamer.png" });
    await page.click("#streamer");
    check((await tagTexts()).every((t) => t !== MASK), "turning it off brings every name back");
    await page.click("#expand");
    await page.waitForFunction(() => document.fullscreenElement || document.querySelector("#floor.expanded"));
    check(await streaming(), "going full screen turns streamer mode on");
    check(await page.evaluate(() => { const r = document.querySelector("#floor canvas").getBoundingClientRect(); return Math.round(r.width) === innerWidth && Math.round(r.height) === innerHeight; }), "the floor fills the screen");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: OUT + "/floor-full-screen.png" });
    await page.click("#expand");
    await page.waitForFunction(() => !document.fullscreenElement && !document.querySelector("#floor.expanded"));
    check(!(await streaming()), "leaving full screen puts streamer mode back off");
    // the header's Streamer button (Task 8) drives the same module as the foot bar's: tags and panel mask from either
    await page.click("#streamer-top");
    check((await streaming()) && (await page.evaluate(() => document.getElementById("streamer").getAttribute("aria-pressed"))) === "true" && (await tagTexts()).every((t) => t === MASK), "the header's Streamer button masks the floor's name tags too");
    await page.evaluate(() => document.querySelector("#floor .tag").click());
    const seenTop = await page.evaluate(() => document.querySelector("#floor .labels").innerText + "\n" + document.querySelector("#floor #panel").innerText);
    const leaksTop = secret.filter((s) => s && seenTop.includes(s));
    check(!leaksTop.length, "and the panel" + (leaksTop.length ? ": " + leaksTop.join(", ") : ""));
    await page.click("#streamer-top");
    check(!(await streaming()) && (await tagTexts()).every((t) => t !== MASK), "turning it off from the header brings every name back");
    // desks for agents that are not subagents: the server's own floor over deskWorld's files
    const desks = deskWorld();
    desks.write({});
    const deskFloor = await desks.floor();
    const social = deskFloor.agents.find((a) => a.id === "social"), seo = deskFloor.agents.find((a) => a.id === "seo");
    check(deskFloor.sessions.map((s) => s.id).join() === desks.FREE && social.working && social.source === "session" && seo.working && seo.source === "heartbeat",
      `the server puts SEO/AEO Officer to work from its heartbeat and Social and Content from smoke-vis-fixer, which takes no live seat (live seats asked for: ${deskFloor.sessions.map((s) => s.name).join(", ")})`);
    // every canvas text drawn from here on (the desk monitors' titles among them), for the planted-name scans: a draw made
    // while Streamer is on goes to __drawn, one made while it is off to __drawnOff (the controls), so a desk screen that
    // steps between a scan's clear and its toggle is never counted as a leak, and the first frame after the toggle is
    await page.evaluate(async () => {
      const { streaming } = await import("/public/streamer.js");
      window.__drawn = []; window.__drawnOff = [];
      const f = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t, ...a) { (streaming() ? window.__drawn : window.__drawnOff).push(String(t)); return f.call(this, t, ...a); };
    });
    const clearDrawn = () => page.evaluate(() => { window.__drawn = []; window.__drawnOff = []; });
    await setFloor(page, deskFloor);
    // seated: at its own desk, typing; an agent the floor never sent to work says so at once
    const seated = (id) => page.evaluate(async (id) => {
      for (let i = 0; i < 900; i++) {
        const P = window.__hqFloor.npcs.find((x) => x.agent.id === id);
        if (!P || !P.goingToWork) return false;
        if (P.spot === P.desk.key && P.state === "do") return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    }, id);
    const seoSeated = await seated("seo");
    check(seoSeated, "an agent with a working heartbeat walks to its own desk and sits");
    check(await seated("social"), "an agent whose named session works walks to its own desk and sits");
    const seats = await page.evaluate(async () => { const { LIVE_SLOTS } = await import("/public/floor/rooms.js"); return { owners: LIVE_SLOTS.filter((D) => D.owner).map((D) => D.owner.agent.sessionId), figures: window.__hqFloor.npcs.filter((P) => P.agent.live).map((P) => P.agent.sessionId) }; });
    check(seats.owners.join() === desks.FREE && seats.figures.join() === desks.FREE, `the matched session leaves its live seat empty and has no second figure; the other session keeps its seat (seats held: ${seats.owners.length}, figures: ${seats.figures.length})`);
    const seoName = cfg.agents.find((a) => a.id === "seo").name;
    await page.evaluate((n) => { const t = [...document.querySelectorAll("#floor .tag")].find((b) => b.querySelector("span").textContent === n); if (t) t.click(); }, seoName);
    const panelText = () => page.evaluate(() => document.querySelector("#floor #panel").innerText);
    let txt = await panelText();
    check(txt.includes("Working") && txt.includes(`Email ${PLANTED} the citation list`) && txt.includes(`${PLANTED} asked for the list`) && txt.includes("Sent 3 citations") && /Updated \d+m ago/.test(txt),
      `its panel shows its status, task, summary lines and when it last updated (${txt.replace(/\s+/g, " ").slice(0, 160)})`);
    check(await page.evaluate((n) => window.__drawnOff.some((t) => t.includes(n.toUpperCase())), PLANTED), "control: with Streamer off its desk monitor's title draws the heartbeat's task, planted name and all");
    // a closed panel keeps none of its text: closed with Streamer off, then Streamer on, the planted name is nowhere in the
    // document (the floor's DOM stays there on both tabs) and the panel holds no name or status
    const inDoc = () => page.evaluate((n) => document.documentElement.textContent.includes(n), PLANTED);
    const openTag = (n) => page.evaluate((n) => { const t = [...document.querySelectorAll("#floor .tag")].find((b) => b.querySelector("span").textContent === n); if (t) t.click(); return !!t; }, n);
    check(await inDoc(), "control: with its panel open and Streamer off, the planted name is in the document");
    await page.click("#close");
    await page.click("#streamer");
    const closed = await page.evaluate((n) => ({ inDoc: document.documentElement.textContent.includes(n), name: document.querySelector("#floor #p-name").textContent, status: document.querySelector("#floor #p-status").textContent }), PLANTED);
    check(await streaming() && !closed.inDoc && !closed.name && !closed.status, `its panel closed with Streamer off, then Streamer on: the planted name is nowhere in the document, the panel holds no name or status (${JSON.stringify(closed)})`);
    await page.click("#streamer");
    // the next panel opened is an agent with no status: the heartbeat's block is emptied, not just hidden
    const plainName = cfg.agents.find((a) => a.id === "billing").name; // no heartbeat, no sessions
    await openTag(seoName);
    const plainOpened = await openTag(plainName);
    const plain = await page.evaluate(() => ({ hidden: document.querySelector("#floor #p-beat").hidden, task: document.querySelector("#floor #p-task").textContent, lines: document.querySelectorAll("#floor #p-sum li").length }));
    check(plainOpened && !(await inDoc()) && plain.hidden && !plain.task && !plain.lines, `opening an agent with no status next leaves none of the heartbeat's text in the document (${JSON.stringify(plain)})`);
    await openTag(seoName);
    // a poll that changes nothing leaves the open panel's status, task and summary alone (the panel is an aria-live region)
    const polled = polls.get(page) || 0;
    const churn = await page.evaluate(async () => {
      let n = 0;
      const o = new MutationObserver((m) => { n += m.length; });
      for (const id of ["p-status", "p-task", "p-sum"]) o.observe(document.querySelector("#floor #" + id), { childList: true, characterData: true, subtree: true });
      await new Promise((r) => setTimeout(r, 3500));
      o.disconnect();
      return n;
    });
    const landed = (polls.get(page) || 0) - polled;
    check(landed > 0 && churn === 0, `a poll that changes nothing leaves the open panel's status, task and summary as they are (polls: ${landed}, changes: ${churn})`);
    // while streaming the planted name is in no text, label or canvas anywhere on the page (both tabs' views are in the
    // document), the panel's task and summary are the mask, whole, and a poll that lands meanwhile changes none of it
    const leakScan = () => page.evaluate((n) => {
      const low = n.toLowerCase(), labels = [...document.querySelectorAll("[aria-label], [title]")].map((e) => (e.getAttribute("aria-label") || "") + (e.getAttribute("title") || "")).join(" ");
      return { dom: document.documentElement.textContent.toLowerCase().includes(low) || labels.toLowerCase().includes(low), drawn: window.__drawn.filter((t) => t.toLowerCase().includes(low)).length,
        task: document.querySelector("#floor #p-task")?.textContent ?? null, lines: [...document.querySelectorAll("#floor #p-sum li")].map((l) => l.textContent) };
    }, PLANTED);
    const allMasked = (s) => !s.dom && !s.drawn && s.task === MASK && s.lines.length === 1 && s.lines[0] === MASK;
    const why = (s) => `(in the page: ${s.dom}, canvas draws: ${s.drawn}, task "${s.task}", ${s.lines.length} summary line(s))`;
    for (const [how, on, off] of [
      ["the room's Streamer button", () => page.click("#streamer"), () => page.click("#streamer")],
      ["the header's Streamer button", () => page.click("#streamer-top"), () => page.click("#streamer-top")],
    ]) {
      await clearDrawn();
      await on();
      await page.waitForTimeout(3500); // the page's own poll lands while streaming
      const s = await leakScan();
      check(allMasked(s), `Streamer from ${how}: no heartbeat task or summary text anywhere on the page or on a desk monitor, the panel shows the mask ${why(s)}`);
      await off();
      txt = await panelText();
      check(txt.includes(PLANTED), `control: with Streamer off again the panel shows the planted name`);
    }
    await page.click("#streamer-top");
    await page.evaluate(() => { location.hash = "#dashboard"; });
    await page.waitForTimeout(3500);
    const dash = await leakScan();
    check(!dash.dom, "on the Dashboard tab with Streamer on, the planted name is nowhere in the document");
    await page.evaluate(() => { location.hash = "#penthouse"; });
    await page.waitForTimeout(1500);
    await page.click("#streamer-top");
    await clearDrawn();
    await page.click("#expand");
    await page.waitForFunction(() => document.fullscreenElement || document.querySelector("#floor.expanded"));
    await page.waitForTimeout(3500);
    const fullScan = await leakScan();
    check(await streaming() && allMasked(fullScan), `full screen: no heartbeat task or summary text on the page or a desk monitor, the panel shows the mask ${why(fullScan)}`);
    await page.click("#expand");
    await page.waitForFunction(() => !document.fullscreenElement && !document.querySelector("#floor.expanded"));
    await page.screenshot({ path: OUT + "/floor-desks.png" });
    // the file switched to idle sends the agent away from its desk; failed shows its task as Failed, the figure red
    const away = (id) => page.evaluate(async (id) => {
      for (let i = 0; i < 300; i++) {
        const P = window.__hqFloor.npcs.find((x) => x.agent.id === id);
        if (P && !P.goingToWork && P.spot !== P.desk.key) return true;
        await new Promise((r) => setTimeout(r, 100));
      }
      return false;
    }, id);
    const status = () => page.evaluate(() => ({ status: document.querySelector("#floor #p-status").textContent, task: document.querySelector("#floor #p-task")?.textContent ?? null, dot: document.querySelector("#floor #p-dot").className }));
    desks.write({ status: "idle", task: "shift ended (exit 0)", endedAt: new Date().toISOString() });
    await setFloor(page, await desks.floor());
    const idlePanel = await status();
    check(seoSeated && (await away("seo")), "switching the heartbeat file to idle sends the agent away from its desk");
    check(idlePanel.status.startsWith("Idle") && idlePanel.task === "shift ended (exit 0)", `and its open panel follows (status "${idlePanel.status}", task "${idlePanel.task}")`);
    desks.write({ status: "failed", task: "shift ended (exit 1)", endedAt: new Date().toISOString() });
    await setFloor(page, await desks.floor());
    const failedPanel = await status();
    check(failedPanel.status === "Failed" && failedPanel.task === "shift ended (exit 1)" && failedPanel.dot.includes("d-idle") && (await page.evaluate(() => !window.__hqFloor.npcs.find((x) => x.agent.id === "seo").goingToWork)),
      `a failed heartbeat shows its task with the status "Failed" and the figure stays idle, red (status "${failedPanel.status}", dot "${failedPanel.dot}")`);
    await page.evaluate(async () => (await import("/public/floor/stage.js")).deselect());
    check(!errors.length, "no console errors" + (errors.length ? ": " + errors.join(" | ") : ""));
    await page.close();
    floorBody = FIXTURE.floor;
    const fallback = await open(browser, base, { blockModel: true });
    await fallback.page.waitForTimeout(3000);
    check(await fallback.page.evaluate(() => !window.__hqFloor.fig.model && window.__hqFloor.boss.body.visible), "with no model the built-in boss shows");
    check(!fallback.errors.length, "and still no console errors" + (fallback.errors.length ? ": " + fallback.errors.join(" | ") : ""));
    await fallback.page.close();
    // a model that parses but fails after the loader's await (no clips) lands on the same warning, never a page error
    const broken = await open(browser, base, { clipless: true });
    await broken.page.waitForTimeout(3000);
    check(await broken.page.evaluate(() => !window.__hqFloor.fig.model && !window.__hqFloor.fig.mixer && window.__hqFloor.boss.body.visible), "a model without its clips leaves the built-in boss in place, with no half-loaded figure");
    check(!broken.errors.length, "and raises no page error, only the warning" + (broken.errors.length ? ": " + broken.errors.join(" | ") : ""));
    await broken.page.close();
    // a phone: the panel opens inside the room's box, its top in view, and the floor's own controls show
    const phone = await open(browser, base, { viewport: { width: 390, height: 844 } });
    await phone.page.locator("#floor").scrollIntoViewIfNeeded();
    await phone.page.waitForTimeout(2500);
    await phone.page.evaluate(() => document.querySelector("#floor .tag").click());
    await phone.page.waitForTimeout(800);
    const fit = await phone.page.evaluate(() => {
      const f = document.getElementById("floor").getBoundingClientRect(), p = document.querySelector("#floor #panel").getBoundingClientRect(), x = document.querySelector("#floor #close").getBoundingClientRect();
      return { open: document.querySelector("#floor #panel").classList.contains("open"), inside: p.top >= f.top && p.bottom <= f.bottom + 0.5 && x.top >= f.top, ctls: document.querySelector("#floor .ctls").getBoundingClientRect().height > 0, panel: [Math.round(p.top), Math.round(p.bottom)], floor: [Math.round(f.top), Math.round(f.bottom)] };
    });
    check(fit.open && fit.inside, `390px: the panel sits inside the room's box with its close button in view (panel ${fit.panel.join("..")} in floor ${fit.floor.join("..")})`);
    check(fit.ctls, "390px: the Streamer and Full screen controls show");
    // the name tags (CSS2D labels, each with its own z-index) stay behind the open panel
    const cover = await phone.page.evaluate(() => {
      const p = document.querySelector("#floor #panel").getBoundingClientRect();
      const mid = [...document.querySelectorAll("#floor .tag")].map((t) => t.getBoundingClientRect()).map((r) => [r.left + r.width / 2, r.top + r.height / 2]).filter(([x, y]) => x > p.left && x < p.right && y > p.top && y < p.bottom);
      return { n: mid.length, over: mid.filter(([x, y]) => { const e = document.elementFromPoint(x, y); return !(e && e.closest("#panel")); }).length };
    });
    check(cover.n > 0 && cover.over === 0, `390px: the open panel covers the ${cover.n} tags behind it (${cover.over} show through)`);
    await phone.page.screenshot({ path: OUT + "/floor-phone-panel.png" });
    check(!phone.errors.length, "and no console errors on the phone" + (phone.errors.length ? ": " + phone.errors.join(" | ") : ""));
    await phone.page.close();
    // the validated maximum with everyone idle: 5 rooms of 5 agents plus 4 sessions take all 29 hangouts, so the first
    // expiring timer finds no free spot; the room must keep running (fix round 1, ruling 2). Invented names only.
    const maxFloor = {
      departments: cfg.departments, owner: cfg.owner, accent: cfg.accent, sessionAvatars: cfg.sessionAvatars, links: [],
      agents: cfg.departments.flatMap((d, di) => Array.from({ length: 5 }, (_, i) => { const src = cfg.agents[(di * 5 + i) % cfg.agents.length]; return { id: `drill-${di}-${i}`, name: `Drill ${di + 1}-${i + 1}`, dept: d.name, look: src.look, avatar: src.avatar, working: false, doing: null, forSession: null }; })),
      sessions: Array.from({ length: 4 }, (_, i) => ({ id: `drill-s${i}`, name: `drill${i}`, status: "idle", working: false, action: null, avatar: i % cfg.sessionAvatars.length })),
    };
    floorBody = maxFloor;
    const full = await open(browser, base, { viewport: { width: 1440, height: 900 } });
    await full.page.locator("#floor").scrollIntoViewIfNeeded();
    await full.page.waitForTimeout(12000); // 48 s of floor time at speed 4: the first timers have long expired
    const frames = () => full.page.evaluate(() => window.__hqFloor.renderer.info.render.frame);
    const f1 = await frames(); await full.page.waitForTimeout(1000); const f2 = await frames();
    const people = await full.page.evaluate(() => window.__hqFloor.npcs.length);
    check(people === 29 && f2 > f1 && !full.errors.length, `the full floor (25 agents and 4 sessions, all idle) keeps running once every hangout is taken (${people} people, frames ${f1} then ${f2})` + (full.errors.length ? ": " + full.errors.join(" | ") : ""));
    await full.page.close();
    floorBody = FIXTURE.floor;
    // the Penthouse sleeps like a game (owner ask 2026-10-07): on the Dashboard tab (its view hidden, so #floor has no box)
    // or in a hidden tab it draws nothing and asks for no animation frame; it wakes on the next frame with every figure where
    // it was; in a window that lost focus it draws 10 frames a second at real speed, unless it is full screen. Each sleep
    // starts with the boss mid-walk, so a room that keeps running while "asleep" moves him and shows. The room fills its tab's
    // window, so it can never be scrolled out of view (the out-of-view case went with the layout of 2026-10-07 (3)). Headless,
    // document.hasFocus() is true and a second page in front hides nothing, so the hidden tab is document.visibilityState
    // overridden plus its event. A wake takes the counter's start, so the Dashboard's fade out counts for nothing: the tab
    // wake starts the counter the moment the Penthouse view is unhidden.
    const nap = await open(browser, base, { viewport: { width: 1440, height: 640 }, speed: 1 });
    await nap.page.locator("#floor").scrollIntoViewIfNeeded();
    await nap.page.waitForTimeout(8000); // the intro flight
    await nap.page.evaluate(async () => {
      const core = await import("/public/floor/core.js");
      const n = window.__nap = { renders: 0, rafs: 0, live: new Set(), tick: 0, renderTick: 0, bossAt: null, now: core.now, clockLast: 0, clockAt: 0 }; // frames drawn, animation frames the room asked for, the ones still pending, the room's clock at the last draw and at the first after a wake
      const render = core.composer.render;
      core.composer.render = function () { n.renders++; if (n.renderTick < 0) { n.renderTick = n.tick; n.bossAt = window.__hqFloor.boss.root.position.toArray(); n.clockAt = n.now(); } n.clockLast = n.now(); return render.apply(this, arguments); };
      const raf = window.requestAnimationFrame, cancel = window.cancelAnimationFrame;
      window.requestAnimationFrame = function (cb) {
        if (cb.name !== "frame") return raf.call(window, cb);
        const id = raf.call(window, (t) => { n.live.delete(id); cb(t); });
        n.rafs++; n.live.add(id); return id;
      };
      window.cancelAnimationFrame = function (id) { n.live.delete(id); return cancel.call(window, id); };
      const native = { visibilityState: Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState"), hidden: Object.getOwnPropertyDescriptor(Document.prototype, "hidden") };
      n.sleep = {
        "the Dashboard tab": () => { location.hash = "#dashboard"; },
        "the tab hidden": () => { Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get: () => "hidden" }); Object.defineProperty(Document.prototype, "hidden", { configurable: true, get: () => true }); document.dispatchEvent(new Event("visibilitychange")); },
      };
      n.wake = { // each takes the counter's start: before a trigger that wakes the room at once, or the moment the tab's view is unhidden
        "the Dashboard tab": (start) => new Promise((res) => { const v = document.getElementById("view-penthouse"); const mo = new MutationObserver(() => { if (v.hidden) return; mo.disconnect(); start(); res(); }); mo.observe(v, { attributes: true, attributeFilter: ["hidden"] }); location.hash = "#penthouse"; }),
        "the tab hidden": (start) => { start(); Object.defineProperty(Document.prototype, "visibilityState", native.visibilityState); Object.defineProperty(Document.prototype, "hidden", native.hidden); document.dispatchEvent(new Event("visibilitychange")); },
      };
    });
    const sample = async (ms) => {
      await nap.page.evaluate(() => { window.__nap.renders = 0; window.__nap.rafs = 0; });
      await nap.page.waitForTimeout(ms);
      return nap.page.evaluate((ms) => ({ renders: window.__nap.renders, rafs: window.__nap.rafs, pending: window.__nap.live.size, fps: Math.round(window.__nap.renders / (ms / 1000)) }), ms);
    };
    const awake = await sample(3000);
    check(awake.fps >= 15 && awake.rafs > 0, `awake, focused and in view the room draws at full rate (${awake.fps} frames a second, bar 15, clear of the throttle's 10; ${awake.rafs} animation frames asked for; the counter keys on the loop's name, so a zero here would blind the sleep checks)`);
    const bossAt = () => nap.page.evaluate(() => window.__hqFloor.boss.root.position.toArray());
    const walk = async () => { // the boss sets off for the other end of his walk, once he is at rest
      await nap.page.waitForFunction(() => window.__hqFloor.boss.state === "stage" || window.__hqFloor.boss.state === "desk", null, { timeout: 60000 });
      await nap.page.evaluate(() => window.__hqFloor.bossGo(window.__hqFloor.boss.goal === "desk" ? "stage" : "desk"));
      await nap.page.waitForFunction(() => window.__hqFloor.boss.state === "walk", null, { timeout: 10000 });
    };
    const settled = {
      "the Dashboard tab": async () => { await nap.page.waitForFunction(() => document.getElementById("view-penthouse").hidden, null, { timeout: 5000 }); await nap.page.waitForTimeout(200); },
      "the tab hidden": () => nap.page.waitForTimeout(100),
    };
    for (const state of Object.keys(settled)) {
      await walk();
      await nap.page.evaluate((state) => window.__nap.sleep[state](), state);
      await settled[state]();
      const before = await bossAt();
      const asleep = await sample(3000);
      check(asleep.renders === 0 && asleep.rafs === 0 && asleep.pending === 0, `${state}: the room draws nothing and asks for no animation frame over 3 s (${asleep.renders} drawn, ${asleep.rafs} asked for, ${asleep.pending} pending)`);
      // the wake: a counter frame requested before the room's wake runs ahead of the room's in every frame, so the frame the
      // room first draws in is the counter's value at that draw, and the boss's position and the room's clock at that draw
      // are read there too (not after, where the page's own poll can hold the reader past a second frame); one frame's step
      // is 1 m/s over .05 s, and the clock, against its reading at the last draw before the sleep (none happens in between,
      // the check above), may move a frame or two across the 3 s, never 3 s
      const woke = await nap.page.evaluate(async (state) => {
        const n = window.__nap, before = n.renders, clockBefore = n.clockLast;
        let on = true;
        const start = () => { n.tick = 0; n.renderTick = -1; const tick = () => { n.tick++; if (on) requestAnimationFrame(tick); }; requestAnimationFrame(tick); };
        await n.wake[state](start);
        await new Promise((res) => { const look = () => (n.renders > before || n.tick > 10 ? res() : setTimeout(look, 5)); look(); });
        on = false;
        return { frame: n.renderTick, boss: n.bossAt || window.__hqFloor.boss.root.position.toArray(), clock: (n.renderTick < 0 ? n.now() : n.clockAt) - clockBefore };
      }, state);
      const moved = Math.hypot(...woke.boss.map((v, i) => v - before[i]));
      check(woke.frame >= 1 && woke.frame <= 2 && moved <= 0.06 && woke.clock < 0.3, `${state}: awake again, the room draws within 2 frames (frame ${woke.frame}), the boss is where he was (moved ${moved.toFixed(3)} m, a frame's step is under 0.05) and the room's clock stood still (${woke.clock.toFixed(3)} s across the 3 s sleep)`);
    }
    // a window that lost focus, not full screen: 10 frames a second, and a 30 s camera flight still covers 3 s in 3 s
    const flight = () => nap.page.evaluate(async () => { const S = await import("/public/floor/stage.js"); return S.tween ? S.tween.t * 30 : 30; });
    await nap.page.evaluate(async () => { (await import("/public/floor/stage.js")).flyTo("top", 30); dispatchEvent(new Event("blur")); });
    const flown1 = await flight(); const blurred = await sample(3000); const flown2 = await flight();
    check(blurred.fps >= 8 && blurred.fps <= 12, `the window blurred, not full screen: about 10 frames a second (${blurred.fps})`);
    check(Math.abs(flown2 - flown1 - 3) <= 0.45, `and motion keeps real speed at that rate (the camera flight covered ${(flown2 - flown1).toFixed(2)} s of its 30 in 3 s)`);
    await nap.page.evaluate(() => dispatchEvent(new Event("focus")));
    const refocused = await sample(3000);
    check(refocused.fps >= 15, `focus back: full rate again (${refocused.fps} frames a second)`);
    await nap.page.click("#expand");
    await nap.page.waitForFunction(() => document.fullscreenElement || document.querySelector("#floor.expanded"));
    await nap.page.evaluate(() => dispatchEvent(new Event("blur")));
    const fullBlurred = await sample(3000);
    check(fullBlurred.fps >= 15, `full screen and blurred (a recording with another app focused): full rate (${fullBlurred.fps} frames a second)`);
    await nap.page.click("#expand");
    await nap.page.waitForFunction(() => !document.fullscreenElement && !document.querySelector("#floor.expanded"));
    await nap.page.evaluate(() => dispatchEvent(new Event("focus")));
    // a rally ends from frame() on the room's clock (so a sleep mid-rally holds it): the button is back 4.6 s on
    await nap.page.click("#rally"); await nap.page.waitForTimeout(5200);
    check(await nap.page.evaluate(() => !document.getElementById("rally").disabled), "a rally ends from the frame loop on the room's clock (the button is back 4.6 s on)");
    // main-thread time over 10 s (CDP Performance.getMetrics, TaskDuration): awake on the Penthouse tab, then asleep on the
    // Dashboard tab. The page's own 3 s polls and the Dashboard's own drawing are in the second (the Dashboard renders while
    // it shows, the room did not), so the bar is half: a room that never sleeps reads the same asleep as awake
    const cdp = await nap.page.context().newCDPSession(nap.page);
    await cdp.send("Performance.enable");
    const taskTime = async () => (await cdp.send("Performance.getMetrics")).metrics.find((m) => m.name === "TaskDuration").value;
    const over10 = async () => { const t0 = await taskTime(); await nap.page.waitForTimeout(10000); return (await taskTime()) - t0; };
    await nap.page.waitForTimeout(500);
    const cpuAwake = await over10();
    await nap.page.evaluate(() => { location.hash = "#dashboard"; });
    await nap.page.waitForFunction(() => document.getElementById("view-penthouse").hidden, null, { timeout: 5000 }); await nap.page.waitForTimeout(300);
    const cpuAsleep = await over10();
    check(cpuAsleep < cpuAwake / 2, `asleep on the Dashboard tab, the main thread works under half of awake (task time in 10 s: ${cpuAwake.toFixed(2)} s awake, ${cpuAsleep.toFixed(2)} s on the Dashboard tab, the page's own polls and the Dashboard's drawing included)`);
    check(!nap.errors.length, "and no console errors through the sleep checks" + (nap.errors.length ? ": " + nap.errors.join(" | ") : ""));
    await nap.page.close();
  } catch (e) {
    check(false, String(e));
  } finally {
    await browser.close();
    srv.close();
  }
  process.exit(failed ? 1 : 0);
})();
