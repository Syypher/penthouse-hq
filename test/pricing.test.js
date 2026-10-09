const test = require("node:test");
const assert = require("node:assert/strict");
const { priceFor, costForUsage } = require("../pricing");

test("dated and suffixed model ids resolve by longest prefix", () => {
  assert.deepEqual(priceFor("claude-haiku-4-5-20251001"), priceFor("claude-haiku-4-5"));
  assert.equal(priceFor("claude-fable-5-1").read, 0.25);
  assert.equal(priceFor("claude-fable-5").read, 1); // not swallowed by fable-5-1
  assert.equal(priceFor("claude-opus-5-5").in, 4);
  assert.equal(priceFor("claude-opus-5-5[1m]").in, 4);
  assert.equal(priceFor("claude-opus-5").in, 5);
});

test("unknown Claude models fall back by family; other ids price as null", () => {
  assert.equal(priceFor("claude-opus-9-9").in, 5);
  assert.equal(priceFor("<synthetic>"), null);
});

test("cache reads bill at the model's read price", () => {
  const r = costForUsage("claude-opus-5-5", { cache_read_input_tokens: 1e6 });
  assert.equal(r.cost, 0.2);
  assert.equal(+r.cacheSaved.toFixed(6), 3.8); // $4 full input minus $0.20
});

test("1 h writes cost 2x input and 5 min writes 1.25x", () => {
  const r = costForUsage("claude-sonnet-5-5", { cache_creation: { ephemeral_5m_input_tokens: 1e6, ephemeral_1h_input_tokens: 1e6 } });
  assert.equal(r.cost, 2 * 1.25 + 2 * 2);
});
