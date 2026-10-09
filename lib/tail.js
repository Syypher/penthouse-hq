// Reads only the bytes appended to a file since the last call, in whole lines. A line still
// being written stays in `rest` (as bytes, so a split character survives) until it ends.
// One call reads at most `limit` bytes and says whether more remain, so the first read of a
// 300 MB transcript is many short reads, never one buffer and one string the size of the file.
// Folding one chunk blocks the event loop for its length: measured on a 107 MB transcript
// (2026-10-06), 8 MB chunks block up to 53 ms and 2 MB chunks 18 ms, at the same total CPU.
const fs = require("fs");

const CHUNK = 2 * 1024 * 1024;

function newCursor() {
  return { pos: 0, rest: Buffer.alloc(0), id: null, check: Buffer.alloc(0) };
}

// Which file the cursor was reading. The inode changes when a file is replaced, whatever the new
// size; birth time is the fallback only where ino is 0, since NTFS tunneling can hand a file
// recreated under the same name its predecessor's creation time.
const fileId = (st) => (st.ino ? "i" + st.ino : "b" + st.birthtimeMs);

// `trim: false` hands the lines back exactly as written, empty ones included, for a caller that must parse
// them as a whole read of the file would. `guard: n` keeps in `cursor.check` the last n bytes before the end
// of the last complete line, and the next call reads them back in the same open handle before reading on:
// if they changed, the file was rewritten in place, and it is read again from the start (`reset`). `failed`
// marks a call that could not stat or read the file.
function readNew(fp, cursor = newCursor(), limit = CHUNK, { trim = true, guard = 0 } = {}) {
  let st;
  try {
    st = fs.statSync(fp);
  } catch {
    return { lines: [], cursor, reset: false, more: false, failed: true };
  }
  const prev = cursor;
  const id = fileId(st);
  let reset = false;
  if ((cursor.id != null && cursor.id !== id) || st.size < cursor.pos) {
    cursor = newCursor(); // truncated or replaced: start over
    reset = true;
  }
  if (st.size === cursor.pos) return { lines: [], cursor: { pos: cursor.pos, rest: cursor.rest, id, check: cursor.check }, reset, more: false };
  let buf;
  let n = 0;
  try {
    const fd = fs.openSync(fp, "r");
    try {
      if (guard && cursor.check.length) {
        const had = Buffer.alloc(cursor.check.length);
        const k = fs.readSync(fd, had, 0, had.length, cursor.pos - cursor.rest.length - had.length);
        if (k !== had.length || !had.equals(cursor.check)) {
          cursor = newCursor(); // rewritten in place: start over
          reset = true;
        }
      }
      buf = Buffer.alloc(Math.min(st.size - cursor.pos, limit));
      n = fs.readSync(fd, buf, 0, buf.length, cursor.pos);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return { lines: [], cursor: prev, reset: false, more: false, failed: true }; // deleted or locked between stat and open: retry next call
  }
  const got = buf.subarray(0, n); // a shrink between stat and read leaves fewer bytes than stat promised
  const all = cursor.rest.length ? Buffer.concat([cursor.rest, got]) : got;
  const cut = all.lastIndexOf(0x0a);
  const done = cut < 0 ? "" : all.subarray(0, cut).toString("utf8");
  const rest = Buffer.from(cut < 0 ? all : all.subarray(cut + 1));
  const end = cut + 1; // bytes of `all` up to and including its last newline
  const check = !guard || !end ? cursor.check : Buffer.from(end >= guard ? all.subarray(end - guard, end) : Buffer.concat([cursor.check, all.subarray(0, end)]).subarray(-guard));
  const lines = !done ? [] : trim ? done.split("\n").map((l) => l.trim()).filter(Boolean) : done.split("\n");
  return { lines, cursor: { pos: cursor.pos + n, rest, id, check }, reset, more: n > 0 && cursor.pos + n < st.size };
}

module.exports = { newCursor, readNew, fileId, CHUNK };
