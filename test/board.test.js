const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createBoard, boardView, clean } = require("../lib/board");
const A = "aaaaaaaa-0000-0000-0000-000000000001";
const B = "bbbbbbbb-0000-0000-0000-000000000002";
const OLD = "cccccccc-0000-0000-0000-000000000003";
let tick = 1790000000;
function write(fp, reg) {
  fs.writeFileSync(fp, typeof reg === "string" ? reg : JSON.stringify(reg));
  tick += 10;
  fs.utimesSync(fp, tick, tick); // a distinct mtime per write
}
const reg = (locks = {}) => ({
  sessions: { [A]: { id: A, name: "alpha" }, [B]: { id: B, name: "beta" }, [OLD]: { id: OLD, name: "old", endedAt: 1 } },
  claims: [
    { repo: "r", path: "src/App.tsx", session: A, at: 1 },
    { repo: "r", path: "src/App.tsx", session: B, at: 2 },
    { repo: "r", path: "x.md", session: OLD, at: 3 },
  ],
  locks,
  notes: [{ at: 5, by: "alpha", text: "first" }, { at: 9, by: "beta", text: "PR 263 merged >/dev/null 2>" }],
});
const file = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hq-board-")), "registry.json");

test("a missing registry is null", () => {
  assert.equal(createBoard(path.join(os.tmpdir(), "nope-hq", "registry.json")).read(0), null);
  assert.equal(boardView(null, []), null);
});

test("claims of live sessions only, and a conflict when two live sessions hold one file", () => {
  const fp = file();
  write(fp, reg());
  const v = boardView(createBoard(fp).read(0), [A, B]);
  assert.equal(v.claims.length, 2);
  assert.deepEqual(v.conflicts, [{ repo: "r", path: "src/App.tsx", sessions: ["alpha", "beta"] }]);
});

test("notes come newest first with the shell redirect stripped", () => {
  const fp = file();
  write(fp, reg());
  const v = boardView(createBoard(fp).read(0), [A]);
  assert.equal(v.notes[0].text, "PR 263 merged");
  assert.equal(clean("done >/dev/null 2>&1"), "done");
});

test("lock changes between reads land in the feed", () => {
  const fp = file();
  const board = createBoard(fp);
  write(fp, reg());
  board.read(100);
  write(fp, reg({ merge: { name: "merge", session: A, at: 200 } }));
  board.read(200);
  write(fp, reg());
  const v = boardView(board.read(300), [A]);
  assert.deepEqual(v.feed.slice(0, 2).map((e) => `${e.by} ${e.text}`), ["alpha released the merge lock", "alpha took the merge lock"]);
});

test("a half-written registry keeps the last good copy", () => {
  const fp = file();
  const board = createBoard(fp);
  write(fp, reg());
  board.read(0);
  write(fp, '{"sessions": {');
  assert.equal(boardView(board.read(1), [A, B]).conflicts.length, 1);
});
