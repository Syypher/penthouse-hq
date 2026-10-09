const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const path = require("path");
const { handler, refresh, staticPath } = require("../server");
const ROOT = path.join(__dirname, "..");

function get(server, url, method = "GET", headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: server.address().port, path: url, method, headers }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode, type: res.headers["content-type"], allow: res.headers.allow, cache: res.headers["cache-control"], body }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("static paths stay inside their roots", () => {
  assert.equal(staticPath("/vendor/three/build/three.module.js"), path.join(ROOT, "vendor", "three", "build", "three.module.js"));
  assert.equal(staticPath("/vendor/../hq.config.json"), null);
  assert.equal(staticPath("/vendor/%2e%2e/hq.config.json"), null);
  assert.equal(staticPath("/public/%E0%A4%A"), null); // malformed escape
  assert.equal(staticPath("/hq.config.json"), null);
  assert.equal(staticPath("/vendor/..%5c..%5chq.config.json"), null); // encoded backslashes
  assert.equal(staticPath("/vendor/x%00.js"), null); // NUL byte
  assert.equal(staticPath("/public2/x.js"), null); // a sibling prefix is not a root
  assert.equal(staticPath("/vendor//etc/passwd"), null); // absolute path after the root
  assert.equal(staticPath("/vendor/C:/Windows/win.ini"), null); // drive-absolute path after the root
});

test("GET only, the API answers before the first index, unknown paths 404", async () => {
  const server = http.createServer(handler).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    const post = await get(server, "/api/hq", "POST");
    assert.equal(post.status, 405);
    assert.equal(post.allow, "GET, HEAD");
    const hq = await get(server, "/api/hq");
    assert.equal(hq.status, 200);
    assert.equal(JSON.parse(hq.body).building, true);
    assert.equal((await get(server, "/vendor/../hq.config.json")).status, 404);
    assert.equal((await get(server, "/vendor/../hq.config.json?x=1")).status, 404); // the query string is not part of the path
    assert.equal((await get(server, "/nope")).status, 404);
  } finally {
    server.close();
  }
});

test("the pinned engine and the assets folder may be cached for an hour; the page, its modules and the APIs never", async () => {
  const server = http.createServer(handler).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    assert.equal((await get(server, "/vendor/three/build/three.module.js", "HEAD")).cache, "max-age=3600");
    assert.equal((await get(server, "/assets/README.md", "HEAD")).cache, "max-age=3600");
    for (const p of ["/", "/public/app.js", "/api/hq", "/api/stats", "/api/assets"]) assert.equal((await get(server, p)).cache, "no-store", p);
    assert.equal((await get(server, "/api/assets")).status, 200);
  } finally {
    server.close();
  }
});

test("a page on another domain that resolves to 127.0.0.1 is refused (DNS rebinding)", async () => {
  const server = http.createServer(handler).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const port = server.address().port;
  try {
    assert.equal((await get(server, "/api/hq", "GET", { Host: "evil.example:" + port })).status, 403);
    assert.equal((await get(server, "/", "GET", { Host: "127.0.0.1.evil.example" })).status, 403);
    assert.equal((await get(server, "/api/hq", "GET", { Host: "localhost:" + port })).status, 200);
    assert.equal((await get(server, "/api/hq", "GET", { Host: "LOCALHOST:" + port })).status, 200);
  } finally {
    server.close();
  }
});

// Last on purpose: a good refresh flips the module to ready, and the tests above want the pre-index stub.
test("a refresh that throws is logged and reaches /api/hq; the next good refresh clears it", async () => {
  const server = http.createServer(handler).listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const logged = [];
  const orig = console.error;
  console.error = (e) => logged.push(e);
  try {
    await refresh(async () => { throw new Error("boom-1"); });
    let body = JSON.parse((await get(server, "/api/hq")).body);
    assert.equal(body.building, true);
    assert.match(body.error, /boom-1/);
    await refresh(async () => ({ mains: [], subMtime: {}, subs: [] }));
    body = JSON.parse((await get(server, "/api/hq")).body);
    assert.equal(body.error, undefined);
    assert.ok(Array.isArray(body.sessions));
    assert.equal(body.homeName, path.basename(require("os").homedir())); // the page masks the home folder's name while streaming
    await refresh(async () => { throw new Error("boom-2"); });
    body = JSON.parse((await get(server, "/api/hq")).body);
    assert.ok(Array.isArray(body.sessions)); // the last good payload stays
    assert.match(body.error, /boom-2/);
    assert.equal(logged.length, 2);
  } finally {
    console.error = orig;
    server.close();
  }
});
