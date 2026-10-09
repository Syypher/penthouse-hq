const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { newCursor, readNew, fileId, CHUNK } = require("../lib/tail");
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hq-tail-")), "t.jsonl");

test("a half-written last line waits until it is complete", () => {
  const fp = tmp();
  fs.writeFileSync(fp, '{"a":1}\n{"b":');
  let r = readNew(fp, newCursor());
  assert.deepEqual(r.lines, ['{"a":1}']);
  fs.appendFileSync(fp, "2}\n");
  r = readNew(fp, r.cursor);
  assert.deepEqual(r.lines, ['{"b":2}']);
});

test("a character split across two reads survives", () => {
  const fp = tmp();
  const bytes = Buffer.from('{"t":"caf\u00e9"}\n', "utf8");
  fs.writeFileSync(fp, bytes.subarray(0, 10)); // bytes 9 and 10 are the two-byte character: stop between them
  let r = readNew(fp, newCursor());
  assert.deepEqual(r.lines, []);
  fs.appendFileSync(fp, bytes.subarray(10));
  r = readNew(fp, r.cursor);
  assert.equal(JSON.parse(r.lines[0]).t, "caf\u00e9");
});

test("a file that shrank is read again from the start", () => {
  const fp = tmp();
  fs.writeFileSync(fp, '{"a":1}\n{"b":2}\n');
  const first = readNew(fp, newCursor());
  fs.writeFileSync(fp, '{"c":3}\n');
  const r = readNew(fp, first.cursor);
  assert.equal(r.reset, true);
  assert.deepEqual(r.lines, ['{"c":3}']);
});

test("a file replaced by a larger one is read again from the start", () => {
  const fp = tmp();
  fs.writeFileSync(fp, '{"a":1}\n{"b":2}\n');
  const first = readNew(fp, newCursor());
  const swap = fp + ".swap";
  fs.writeFileSync(swap, '{"c":3}\n{"d":4}\n{"e":5}\n'); // 24 bytes over the 16 already read
  fs.renameSync(swap, fp);
  const r = readNew(fp, first.cursor);
  assert.equal(r.reset, true);
  assert.deepEqual(r.lines, ['{"c":3}', '{"d":4}', '{"e":5}']);
});

test("a missing file yields nothing and does not throw", () => {
  assert.deepEqual(readNew(path.join(os.tmpdir(), "nope-hq.jsonl"), newCursor()).lines, []);
});

test("lines can come back exactly as written, and a read that could not happen says so", () => {
  const fp = tmp();
  fs.writeFileSync(fp, ' {"a":1}\u00a0\n\n{"b":2}\n{"c":');
  const raw = readNew(fp, newCursor(), CHUNK, { trim: false });
  assert.deepEqual(raw.lines, [' {"a":1}\u00a0', "", '{"b":2}']); // the edges JSON.parse would reject are kept
  assert.deepEqual(readNew(fp, newCursor()).lines, ['{"a":1}', '{"b":2}']); // the default still trims and drops empty lines
  assert.equal(raw.failed, undefined);
  assert.equal(readNew(path.join(os.tmpdir(), "nope-hq.jsonl"), newCursor()).failed, true);
  assert.equal(fileId(fs.statSync(fp)), raw.cursor.id);
});

test("with a guard, a file rewritten in place before the read offset is read again from the start", () => {
  const fp = tmp();
  fs.writeFileSync(fp, '{"a":1}\n{"b":2}\n{"c":');
  const first = readNew(fp, newCursor(), CHUNK, { guard: 4 });
  assert.equal(first.cursor.check.toString(), ':2}\n'); // the last 4 bytes before the end of the last complete line
  fs.appendFileSync(fp, "3}\n");
  const appended = readNew(fp, first.cursor, CHUNK, { guard: 4 });
  assert.deepEqual([appended.reset, appended.lines], [false, ['{"c":3}']]);
  fs.writeFileSync(fp, '{"x":9}\n{"y":8}\n{"z":7}\n{"w":6}\n'); // same file, new bytes, larger than before
  const rewritten = readNew(fp, first.cursor, CHUNK, { guard: 4 });
  assert.deepEqual([rewritten.reset, rewritten.lines], [true, ['{"x":9}', '{"y":8}', '{"z":7}', '{"w":6}']]);
  assert.deepEqual(readNew(fp, first.cursor).lines, ['{"c":7}', '{"w":6}']); // without a guard nothing is checked: the old partial line is spliced onto new bytes
});

test("a read is capped at its chunk; a line split across the boundary is folded once, intact", () => {
  const fp = tmp();
  const rows = Array.from({ length: 50 }, (_, i) => JSON.stringify({ i, pad: "x".repeat(17 + (i % 5)) }));
  fs.writeFileSync(fp, rows.join("\n") + "\n");
  const size = fs.statSync(fp).size;
  let cursor = newCursor(), lines = [], calls = 0;
  for (;;) {
    const r = readNew(fp, cursor, 100);
    calls++;
    lines.push(...r.lines);
    cursor = r.cursor;
    if (!r.more) break;
  }
  assert.equal(calls, Math.ceil(size / 100));
  assert.deepEqual(lines, rows);
  assert.equal(cursor.pos, size);
  assert.deepEqual(readNew(fp, cursor, 100).lines, []);
  const whole = readNew(fp, newCursor());
  assert.deepEqual(whole.lines, rows);
  assert.equal(whole.more, false);
});

test("a transcript larger than the default chunk is read in several calls and folds the same as one read", () => {
  const fp = tmp();
  const row = JSON.stringify({ t: "x".repeat(90) }); // 99 bytes with its newline
  const N = 90000; // 8.9 MB, several chunks
  fs.writeFileSync(fp, (row + "\n").repeat(N));
  let cursor = newCursor(), n = 0, calls = 0, bad = 0;
  for (;;) {
    const r = readNew(fp, cursor);
    calls++;
    n += r.lines.length;
    for (const l of r.lines) if (l !== row) bad++;
    cursor = r.cursor;
    if (!r.more) break;
  }
  assert.equal(calls, Math.ceil((N * 99) / CHUNK));
  assert.ok(calls > 1);
  assert.equal(n, N);
  assert.equal(bad, 0);
  assert.equal(cursor.pos, fs.statSync(fp).size);
});
