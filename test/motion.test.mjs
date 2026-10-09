import test from "node:test";
import assert from "node:assert/strict";
import { cubicBezier, easingOf, resample, mix, same, rollPlan, numberOf, flipDeltas } from "../public/motion.js";

const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} is not within ${eps} of ${b}`);

test("the easing curve starts at 0, ends at 1, and leads like the CSS token", () => {
  const ease = cubicBezier(0.2, 0.8, 0.2, 1);
  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
  assert.ok(ease(0.25) > 0.6, "most of the move happens early");
  assert.ok(ease(0.5) > ease(0.25) && ease(0.75) > ease(0.5), "it never goes backwards");
  near(cubicBezier(0, 0, 1, 1)(0.3), 0.3); // the identity curve is linear
  assert.equal(easingOf("cubic-bezier(.2,.8,.2,1)")(1), 1);
  assert.equal(easingOf("ease")(0.4), 0.4); // anything but a bezier falls back to linear
});

test("resampling keeps the ends and interpolates between, so two lines can be mixed", () => {
  assert.deepEqual(resample([0, 10], 3), [0, 5, 10]);
  assert.deepEqual(resample([0, 10, 0], 5), [0, 5, 10, 5, 0]);
  assert.deepEqual(resample([4], 3), [4, 4, 4]);
  assert.deepEqual(resample([], 2), [0, 0]);
  assert.deepEqual(mix([0, 10], [10, 0], 0.5), [5, 5]);
  assert.ok(same([1, 2], [1, 2]) && !same([1, 2], [1, 3]) && !same([1], [1, 1]));
});

test("the digit roll changes only the characters that differ, aligned from the right", () => {
  const p = rollPlan("1,284", "1,297");
  assert.deepEqual(p.map((x) => x.ch).join(""), "1,297");
  assert.deepEqual(p.map((x) => x.changed), [false, false, false, true, true]);
  assert.deepEqual(p.map((x) => x.out), ["1", ",", "2", "8", "4"]);
  assert.deepEqual(p.map((x) => x.delay), [0, 0, 0, 20, 0]); // the rightmost changed digit moves first
  const grow = rollPlan("999", "1,000");
  assert.deepEqual(grow.map((x) => x.out), ["", "", "9", "9", "9"]);
  assert.ok(grow.every((x) => x.changed));
  assert.deepEqual(rollPlan(undefined, "-").map((x) => [x.ch, x.changed]), [["-", true]]);
  assert.equal(numberOf("$1,234.50"), 1234.5);
  assert.equal(numberOf("-"), null);
});

test("FLIP deltas are the distance each kept row has to glide from", () => {
  const before = new Map([["a", 0], ["b", 80], ["c", 160]]);
  const after = new Map([["c", 0], ["a", 80], ["b", 160], ["d", 240]]);
  assert.deepEqual([...flipDeltas(before, after)], [["c", 160], ["a", -80], ["b", -80]]);
});
