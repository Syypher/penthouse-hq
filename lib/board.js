// Reads the coordination registry (optional; a missing file means no board) and turns it into
// live claims, conflicts, locks, notes, and a feed that includes lock changes seen between reads.
const fs = require("fs");

// Tasks and notes written from a shell sometimes keep a trailing redirect; it is noise on screen.
const clean = (t) => String(t || "").replace(/\s*>\s*\/dev\/null[\s\S]*$/, "").trim();

function createBoard(file) {
  let mtime = -1;
  let reg = null;
  let seen = null;
  const lockEvents = [];
  function read(now = Date.now()) {
    let st;
    try {
      st = fs.statSync(file);
    } catch {
      return null;
    }
    if (st.mtimeMs !== mtime) {
      try {
        reg = JSON.parse(fs.readFileSync(file, "utf8"));
        mtime = st.mtimeMs;
      } catch {
        if (!reg) return null; // half-written on the first read: try again next refresh
      }
      const locks = reg.locks || {};
      if (seen) {
        for (const k in locks)
          if (!seen[k] || seen[k].session !== locks[k].session) lockEvents.push({ at: locks[k].at || now, kind: "lock", lock: k, session: locks[k].session });
        for (const k in seen) if (!locks[k]) lockEvents.push({ at: now, kind: "unlock", lock: k, session: seen[k].session });
        lockEvents.splice(0, Math.max(0, lockEvents.length - 50));
      }
      seen = locks;
    }
    return { sessions: reg.sessions || {}, claims: reg.claims || [], locks: reg.locks || {}, notes: reg.notes || [], lockEvents };
  }
  return { read };
}

function boardView(snap, liveIds) {
  if (!snap) return null;
  const nameOf = (id) => (snap.sessions[id] && snap.sessions[id].name) || (/^[0-9a-f-]{36}$/.test(id) ? String(id).slice(0, 8) : String(id));
  const live = new Set(liveIds);
  const claims = snap.claims.filter((c) => live.has(c.session)).map((c) => ({ repo: c.repo, path: c.path, session: c.session, sessionName: nameOf(c.session), at: c.at }));
  const holders = new Map();
  for (const c of claims) {
    const k = c.repo + "\n" + c.path;
    if (!holders.has(k)) holders.set(k, new Set());
    holders.get(k).add(c.session);
  }
  const conflicts = [...holders]
    .filter(([, s]) => s.size > 1)
    .map(([k, s]) => ({ repo: k.split("\n")[0], path: k.split("\n")[1], sessions: [...s].map(nameOf) }));
  const locks = Object.entries(snap.locks).map(([name, l]) => ({ name, session: l.session, sessionName: nameOf(l.session), at: l.at }));
  const notes = snap.notes.slice(-30).reverse().map((n) => ({ at: n.at, by: n.by, text: clean(n.text) }));
  const feed = [
    ...notes.map((n) => ({ at: n.at, kind: "note", by: n.by, text: n.text })),
    ...snap.lockEvents.map((e) => ({ at: e.at, kind: e.kind, by: nameOf(e.session), text: `${e.kind === "lock" ? "took" : "released"} the ${e.lock} lock` })),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 40);
  return { claims, conflicts, locks, notes, feed };
}

module.exports = { createBoard, boardView, clean };
