// Reads "step N of M" from a session's own replies (the output-shape rule makes sessions say it)
// into a progress bar and a projected finish. No plan declared means no bar, never an invented one.
const RE = /\bstep (\d+) of (\d+)\b/gi;

function newProgress() {
  return { n: 0, m: 0, n0: 0, startAt: null, at: null };
}

function foldProgress(p, row) {
  if (row.type !== "assistant" || row.isSidechain || !row.message || !Array.isArray(row.message.content)) return p;
  const at = Date.parse(row.timestamp);
  for (const b of row.message.content) {
    if (!b || b.type !== "text" || !b.text) continue;
    for (const [, a, z] of b.text.matchAll(RE)) {
      const n = +a;
      const m = +z;
      if (!m || n > m) continue;
      if (m !== p.m || n < p.n) {
        p.n0 = n; // a new plan starts the clock here
        p.startAt = at;
      }
      p.n = n;
      p.m = m;
      p.at = at;
    }
  }
  return p;
}

function progressView(p, now) {
  if (!p.m) return null;
  const done = p.n >= p.m;
  const rate = p.n > p.n0 ? (now - p.startAt) / (p.n - p.n0) : null; // ms per step so far
  return { step: p.n, of: p.m, pct: Math.round((100 * p.n) / p.m), finishAt: !done && rate ? Math.round(now + rate * (p.m - p.n)) : null, done };
}

module.exports = { newProgress, foldProgress, progressView };
