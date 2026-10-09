// Folds a transcript's per-request usage into API-equivalent cost and prompt-cache state.
// Rules (claude-api skill, shared/prompt-caching.md): a write costs 1.25x input (5 min TTL) or 2x
// (1 h); a read refreshes the timer; the lifetime runs from the START of the request. One response
// is written as several lines, so each message.id counts once, and a request starts at the
// timestamp of the row before its first line. Main transcripts repeat the same usage on every
// line; subagent transcripts grow output_tokens until the last line, so cost follows the latest
// line (adding only the difference) while the cache fields, identical on every line, fold once.
const { priceFor, costForUsage, WRITE_5M, WRITE_1H } = require("../pricing");
const TTL_5M = 5 * 60e3;
const TTL_1H = 60 * 60e3;
const BIG_WRITE = 20000; // smaller writes are normal turn-to-turn growth, not a rewrite
const COOLING_MS = 5 * 60e3;
const COOLING_PREFIX = 100000;

function newCache() {
  return { prevAt: null, curId: null, curCost: 0, last: null, ttl: null, reads: 0, inputs: 0, cost: 0, rewrites: [] };
}

function tokensOf(u) {
  const cc = u.cache_creation || {};
  let w5 = cc.ephemeral_5m_input_tokens;
  let w1 = cc.ephemeral_1h_input_tokens;
  if (w5 == null && w1 == null) {
    w5 = u.cache_creation_input_tokens || 0;
    w1 = 0;
  }
  return { input: u.input_tokens || 0, read: u.cache_read_input_tokens || 0, w5: w5 || 0, w1: w1 || 0 };
}

function foldCache(c, row) {
  if (row.isSidechain) return c;
  const at = Date.parse(row.timestamp);
  const m = row.type === "assistant" && row.message;
  if (m && m.usage && m.id && m.id !== c.curId) {
    const r = { start: c.prevAt != null ? c.prevAt : at, model: m.model, ...tokensOf(m.usage) };
    const write = r.w5 + r.w1;
    if (r.input + r.read + write > 0) {
      // A "<synthetic>" row carries an id and all-zero usage: no request was made, so the cache state stays.
      if (c.last && write > BIG_WRITE && write > r.read) {
        const p = priceFor(r.model);
        const extra = p ? (r.w5 * p.in * WRITE_5M + r.w1 * p.in * WRITE_1H - write * p.read) / 1e6 : 0;
        const cause = r.start - c.last.start > (c.ttl || TTL_5M) ? "expired" : "prefix-changed";
        c.rewrites.push({ at: r.start, cause, tokens: write, extra });
      }
      if (r.w1) c.ttl = TTL_1H;
      else if (r.w5) c.ttl = TTL_5M;
      c.reads += r.read;
      c.inputs += r.input + r.read + write;
      c.last = r;
    }
    c.curCost = costForUsage(r.model, m.usage).cost;
    c.cost += c.curCost;
    c.curId = m.id;
  } else if (m && m.usage && m.id && m.id === c.curId) {
    const cost = costForUsage(m.model, m.usage).cost;
    c.cost += cost - c.curCost;
    c.curCost = cost;
  }
  if (Number.isFinite(at)) c.prevAt = at;
  return c;
}

function cacheView(c, now) {
  const r = c.last;
  if (!r) return null;
  const p = priceFor(r.model);
  const ttl = c.ttl || TTL_5M;
  const expiresAt = r.start + ttl;
  const warm = now < expiresAt;
  const prefix = r.input + r.read + r.w5 + r.w1;
  const dayStart = Date.parse(new Date(now).toISOString().slice(0, 10)); // the UTC day, like Financials
  const today = c.rewrites.filter((x) => x.at >= dayStart);
  const sum = (cause) => {
    const l = today.filter((x) => x.cause === cause);
    return { count: l.length, extra: l.reduce((s, x) => s + x.extra, 0) };
  };
  return {
    state: warm ? "warm" : "cold",
    ttl,
    expiresAt,
    prefix,
    model: r.model,
    wakeCost: p ? (prefix * p.in * (ttl === TTL_1H ? WRITE_1H : WRITE_5M)) / 1e6 : null,
    warmCost: p ? (prefix * p.read) / 1e6 : null,
    hitRate: c.inputs ? c.reads / c.inputs : 0,
    cooling: warm && expiresAt - now < COOLING_MS && prefix >= COOLING_PREFIX,
    rewritesToday: { expired: sum("expired"), prefixChanged: sum("prefix-changed") },
  };
}

module.exports = { newCache, foldCache, cacheView, TTL_5M, TTL_1H };
