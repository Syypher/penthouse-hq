const test = require("node:test");
const assert = require("node:assert/strict");
const { newProgress, foldProgress, progressView } = require("../lib/progress");
const { T0, asst, user, text } = require("./helpers");
const fold = (rows) => rows.reduce((p, r) => foldProgress(p, r), newProgress());

test("reads the latest step and projects the finish from the pace since the plan started", () => {
  const p = fold([
    asst({ sec: 0, content: [text("Step 1 of 5 done, next is the API.")] }),
    asst({ sec: 600, content: [text("step 3 of 5 done, next is the page")] }),
  ]);
  const now = T0 + 600e3;
  assert.deepEqual(progressView(p, now), { step: 3, of: 5, pct: 60, finishAt: now + 600e3, done: false });
});

test("a new plan restarts the clock", () => {
  const p = fold([asst({ sec: 0, content: [text("step 4 of 4 done")] }), asst({ sec: 50, content: [text("step 1 of 3 done")] })]);
  const v = progressView(p, T0 + 60e3);
  assert.equal(v.of, 3);
  assert.equal(v.finishAt, null); // no pace yet on the new plan
});

test("a finished plan is done with no projection", () => {
  const p = fold([asst({ sec: 0, content: [text("step 2 of 5")] }), asst({ sec: 90, content: [text("step 5 of 5 done")] })]);
  assert.deepEqual(progressView(p, T0 + 100e3), { step: 5, of: 5, pct: 100, finishAt: null, done: true });
});

test("ignores N above M, user text and sidechain replies; no plan is null", () => {
  const p = fold([
    asst({ sec: 0, content: [text("step 7 of 5")] }),
    user({ sec: 1, text: "step 2 of 9" }),
    asst({ sec: 2, sidechain: true, content: [text("step 1 of 2")] }),
  ]);
  assert.equal(progressView(p, T0), null);
});
