// API list prices per 1M tokens, from the claude-api skill (shared/models.md, read 2026-10-05):
// in = base input, out = output, read = cache read. Writes cost base input x1.25 (5 min TTL) or x2 (1 h).
// Opus 5 reads are implied by the skill ("Opus 5.5 reads are 60% lower" than Opus 5); 4.x reads are 0.1x input.
const PRICES = {
  "claude-fable-5-1": { in: 10, out: 50, read: 0.25 },
  "claude-fable-5": { in: 10, out: 50, read: 1 },
  "claude-mythos-5": { in: 10, out: 50, read: 1 },
  "claude-opus-5-5": { in: 4, out: 20, read: 0.2 },
  "claude-opus-5": { in: 5, out: 25, read: 0.5 },
  "claude-sonnet-5-5": { in: 2, out: 10, read: 0.2 },
  "claude-sonnet-5": { in: 2, out: 10, read: 0.2 },
  "claude-opus-4-8": { in: 5, out: 25, read: 0.5 },
  "claude-opus-4-7": { in: 5, out: 25, read: 0.5 },
  "claude-opus-4-6": { in: 5, out: 25, read: 0.5 },
  "claude-opus-4-5": { in: 5, out: 25, read: 0.5 },
  "claude-sonnet-4-6": { in: 3, out: 15, read: 0.3 },
  "claude-sonnet-4-5": { in: 3, out: 15, read: 0.3 },
  "claude-haiku-4-5": { in: 1, out: 5, read: 0.1 },
};
const WRITE_5M = 1.25;
const WRITE_1H = 2;
const IDS = Object.keys(PRICES).sort((a, b) => b.length - a.length); // longest prefix first

function priceFor(model) {
  if (!model) return null;
  const id = IDS.find((k) => model === k || model.startsWith(k + "-") || model.startsWith(k + "["));
  if (id) return PRICES[id];
  // best-effort family fallback for unseen ids
  const fam = (inp, out) => ({ in: inp, out, read: inp * 0.1 });
  if (model.includes("opus")) return fam(5, 25);
  if (model.includes("sonnet")) return fam(3, 15);
  if (model.includes("haiku")) return fam(1, 5);
  if (model.includes("fable") || model.includes("mythos")) return fam(10, 50);
  return null;
}

// API-equivalent cost (and cache savings) for one usage object.
function costForUsage(model, u) {
  const p = priceFor(model);
  if (!p || !u) return { cost: 0, tokens: 0, cacheSaved: 0, unknownModel: !p };
  const inTok = u.input_tokens || 0;
  const outTok = u.output_tokens || 0;
  const readTok = u.cache_read_input_tokens || 0;
  const cc = u.cache_creation || {};
  let w5 = cc.ephemeral_5m_input_tokens;
  let w1 = cc.ephemeral_1h_input_tokens;
  if (w5 == null && w1 == null) {
    // no breakdown: treat all cache writes as 5 min (the common case)
    w5 = u.cache_creation_input_tokens || 0;
    w1 = 0;
  } else {
    w5 = w5 || 0;
    w1 = w1 || 0;
  }
  const cost = (inTok * p.in + outTok * p.out + readTok * p.read + w5 * p.in * WRITE_5M + w1 * p.in * WRITE_1H) / 1e6;
  // Reads would have cost full input; writes cost a premium over it.
  const cacheSaved = (readTok * (p.in - p.read) - w5 * p.in * (WRITE_5M - 1) - w1 * p.in * (WRITE_1H - 1)) / 1e6;
  const tokens = inTok + outTok + readTok + w5 + w1;
  return { cost, tokens, cacheSaved, unknownModel: false };
}

module.exports = { costForUsage, priceFor, PRICES, WRITE_5M, WRITE_1H };
