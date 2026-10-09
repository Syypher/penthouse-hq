// Times /api/hq on real data: one refresh, then 20 requests; prints the median in ms.
// Exits 1 when the last body is not a payload (still building, or the refresh failed).
const http = require("http");
const { handler, refresh } = require("../server");
(async () => {
  await refresh();
  await refresh(); // the second pass is the warm, incremental one
  const server = http.createServer(handler).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const times = [];
  const bodies = [];
  for (let i = 0; i < 20; i++) {
    const t = process.hrtime.bigint();
    await new Promise((resolve, reject) =>
      http.get({ host: "127.0.0.1", port: server.address().port, path: "/api/hq" }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          bodies.push(body);
          resolve();
        });
      }).on("error", reject)
    );
    times.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  server.close();
  const last = JSON.parse(bodies[bodies.length - 1]);
  if (last.building || last.error) {
    console.error("/api/hq is not a payload: " + (last.error || "still building after two refreshes"));
    process.exit(1);
  }
  times.sort((a, b) => a - b);
  const median = times[10];
  console.log(`/api/hq median ${median.toFixed(1)} ms, max ${times[19].toFixed(1)} ms (${bodies[19].length} bytes, ${last.sessions.length} sessions)`);
  process.exit(median < 100 ? 0 : 1);
})();
