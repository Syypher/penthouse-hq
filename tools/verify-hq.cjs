// Final checks against the LIVE server: /api/hq latency, both tabs with the OS in light and in dark
// mode (the page must stay light in both) at desktop and phone width with no console errors, the
// hero scrub, and a watch on one session id: its
// status must change and one of its delegations must show Running and then Done in the flow.
// Usage: node tools/verify-hq.cjs <outDir> [sessionIdToWatch] [watchSeconds]
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require(process.env.HQ_PLAYWRIGHT || "playwright-core");
const BROWSER = process.env.HQ_BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const [OUT = ".", WATCH, SECS = "0"] = process.argv.slice(2);
const { port } = JSON.parse(fs.readFileSync(path.join(__dirname, "..", ".runtime.json"), "utf8"));
const base = `http://127.0.0.1:${port}`;
let failed = 0;
const check = (ok, msg) => { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) failed++; };
const getJson = (p) => new Promise((resolve, reject) => http.get(base + p, (res) => { let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve(JSON.parse(b))); }).on("error", reject));

(async () => {
  const times = [];
  for (let i = 0; i < 20; i++) { const t = Date.now(); await getJson("/api/hq"); times.push(Date.now() - t); }
  times.sort((a, b) => a - b);
  check(times[10] < 100, `/api/hq median ${times[10]} ms on the live server`);
  console.log(`info /api/hq max ${times[times.length - 1]} ms over ${times.length} requests (a refresh that blocks the event loop shows here, not in the median)`);
  const browser = await chromium.launch({ executablePath: BROWSER, headless: true, args: ["--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
  for (const scheme of ["light", "dark"])
    for (const [w, h, label] of [[1440, 900, "desktop"], [390, 844, "phone"]]) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, colorScheme: scheme });
      const errors = [];
      page.on("console", (m) => m.type() === "error" && !m.text().includes("X4122") && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base + "/#dashboard");
      await page.waitForSelector("#stats b", { timeout: 120000 });
      check((await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === "rgb(255, 255, 255)", `${label} ${scheme} OS theme: the page stays light`);
      const box = await page.locator("#hero .chart-wrap").boundingBox(); // the Dashboard's own hero; the Financials card has the second
      const total = await page.textContent("#hero .hero-num");
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
      check((await page.textContent("#hero .hero-num")) !== total, `${label} ${scheme}: scrubbing the hero moves the number (${total})`);
      await page.mouse.move(box.x + box.width / 2, box.y - 80);
      await page.waitForSelector("#financials .fin-grid", { timeout: 120000 }); // the Financials card, on the Dashboard since 2026-10-07 (3)
      await page.waitForTimeout(3000); // the headline's digit roll and the line's draw-in settle before the screenshot
      await page.screenshot({ path: path.join(OUT, `dashboard-${label}-${scheme}.png`), fullPage: true });
      check(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), `${label} ${scheme}: no sideways scroll on the Dashboard, the Financials card's live names included`);
      await page.goto(base + "/#penthouse");
      await page.waitForSelector("#floor .loading.done", { state: "attached", timeout: 120000 }); // the room builds the first time its tab shows
      await page.waitForTimeout(9000); // the floor's intro
      await page.screenshot({ path: path.join(OUT, `penthouse-${label}-${scheme}.png`) });
      check(!errors.length, `${label} ${scheme}: no console errors` + (errors.length ? ": " + errors.join(" | ") : ""));
      check(await page.evaluate(() => document.scrollingElement.scrollWidth <= innerWidth), `${label} ${scheme}: no sideways scroll on the Penthouse`);
      await page.close();
    }
  await browser.close();
  if (WATCH) {
    const seen = [];
    const deleg = new Map(); // startedAt -> statuses seen, in order
    for (let i = 0; i < +SECS / 3; i++) {
      const hq = await getJson("/api/hq");
      const s = hq.sessions.find((x) => x.id === WATCH);
      const st = s ? s.status : "absent";
      if (seen[seen.length - 1] !== st) { seen.push(st); console.log(new Date().toISOString(), WATCH.slice(0, 8), st); }
      for (const e of hq.flow.filter((x) => x.kind === "delegate" && x.sessionId === WATCH)) {
        const list = deleg.get(e.startedAt) || [];
        if (list[list.length - 1] !== e.status) { list.push(e.status); console.log(new Date().toISOString(), "delegation", JSON.stringify(e.text), e.status); }
        deleg.set(e.startedAt, list);
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    check(seen.length > 1, `status changed while watching: ${seen.join(" -> ")}`);
    check([...deleg.values()].some((l) => l.indexOf("running") >= 0 && l.indexOf("done") > l.indexOf("running")), "a delegation showed Running, then Done, in the flow");
  }
  process.exit(failed ? 1 : 0);
})();
