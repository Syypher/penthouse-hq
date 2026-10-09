const test = require("node:test");
const assert = require("node:assert/strict");
const { newCache, foldCache, cacheView } = require("../lib/cache");
const { T0, asst, user } = require("./helpers");
const fold = (rows) => rows.reduce((c, r) => foldCache(c, r), newCache());
const w1h = (w, read = 0) => ({ input_tokens: 0, output_tokens: 0, cache_read_input_tokens: read, cache_creation: { ephemeral_1h_input_tokens: w, ephemeral_5m_input_tokens: 0 } });
const w5m = (w) => ({ input_tokens: 0, output_tokens: 0, cache_creation: { ephemeral_5m_input_tokens: w, ephemeral_1h_input_tokens: 0 } });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("warm with a countdown on the 1 h TTL read from the write breakdown", () => {
  const c = fold([user({ sec: 0 }), asst({ sec: 5, id: "m1", usage: w1h(300000) })]);
  const v = cacheView(c, T0 + 10 * 60e3);
  assert.equal(v.state, "warm");
  assert.equal(v.ttl, 3600e3);
  assert.equal(v.expiresAt, T0 + 3600e3); // the lifetime runs from the request's start
  assert.equal(v.prefix, 300000);
  near(v.wakeCost, 2.4); // 300k x $4 x 2
  near(v.warmCost, 0.06); // 300k x $0.20
});

test("cold after its TTL; 5 min TTL when only 5 min writes happen", () => {
  const c = fold([user({ sec: 0 }), asst({ sec: 2, id: "m1", usage: w5m(50000) })]);
  const v = cacheView(c, T0 + 6 * 60e3);
  assert.equal(v.ttl, 300e3);
  assert.equal(v.state, "cold");
  assert.equal(v.expiresAt, T0 + 300e3);
});

test("a big write after a long gap is an expired rewrite; without a gap it is a prefix change", () => {
  const c = fold([
    user({ sec: 0 }), asst({ sec: 5, id: "m1", usage: w1h(300000) }),
    user({ sec: 3700 }), asst({ sec: 3705, id: "m2", usage: w1h(300000) }),
    user({ sec: 3710 }), asst({ sec: 3712, id: "m3", usage: w1h(300000) }),
  ]);
  const v = cacheView(c, T0 + 3800e3);
  assert.equal(v.rewritesToday.expired.count, 1);
  near(v.rewritesToday.expired.extra, 2.34); // $2.40 write minus the $0.06 read it replaced
  assert.equal(v.rewritesToday.prefixChanged.count, 1);
});

test("the lines of one response count once; the first request is never a rewrite", () => {
  const c = fold([user({ sec: 0 }), asst({ sec: 1, id: "m1", usage: w1h(300000) }), asst({ sec: 1, id: "m1", usage: w1h(300000) })]);
  near(c.cost, 2.4);
  assert.equal(c.rewrites.length, 0);
});

test("a response whose output grows over its lines is billed at its latest line, once", () => {
  const c = fold([user({ sec: 0 }), asst({ sec: 1, id: "m1", usage: { output_tokens: 7 } }), asst({ sec: 2, id: "m1", usage: { output_tokens: 1e6 } })]);
  near(c.cost, 20); // Opus 5.5 output is $20/MTok; subagent transcripts only write the final count on the last line
});

test("hit rate and the cooling warning", () => {
  const c = fold([user({ sec: 0 }), asst({ sec: 1, id: "m1", usage: w1h(100000) }), user({ sec: 10 }), asst({ sec: 11, id: "m2", usage: { cache_read_input_tokens: 100000 } })]);
  const end = T0 + 10e3 + 3600e3; // the read at 10 s restarted the 1 h lifetime
  assert.equal(cacheView(c, end - 240e3).hitRate, 0.5);
  assert.equal(cacheView(c, end - 240e3).cooling, true); // 4 min left
  assert.equal(cacheView(c, T0 + 20e3).cooling, false); // 59 min left
});

test("a synthetic row with no usage leaves the cache view as it was", () => {
  const rows = [user({ sec: 0 }), asst({ sec: 5, id: "m1", usage: w1h(300000) })];
  const syn = asst({ sec: 60, id: "syn", model: "<synthetic>", usage: { input_tokens: 0, output_tokens: 0 } });
  const before = cacheView(fold(rows), T0 + 10 * 60e3);
  const after = cacheView(fold([...rows, syn]), T0 + 10 * 60e3);
  assert.deepEqual(after, before);
  assert.equal(after.state, "warm");
  assert.equal(after.prefix, 300000);
  assert.equal(after.model, "claude-opus-5-5");
  assert.equal(after.expiresAt, T0 + 3600e3);
  near(after.wakeCost, 2.4);
  assert.deepEqual(after.rewritesToday, { expired: { count: 0, extra: 0 }, prefixChanged: { count: 0, extra: 0 } });
});
