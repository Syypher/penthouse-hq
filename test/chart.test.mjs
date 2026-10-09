import test from "node:test";
import assert from "node:assert/strict";
import { pathFor, cumulative, nearestIndex } from "../public/chart.js";

test("cumulative sums", () => assert.deepEqual(cumulative([1, 0, 2]), [1, 1, 3]));

test("the path spans the box with the highest value at the top", () => {
  assert.equal(pathFor([0, 10], 100, 50), "M0.00,42.00L100.00,8.00");
  assert.equal(pathFor([5, 5], 100, 50), "M0.00,25.00L100.00,25.00");
  assert.equal(pathFor([], 100, 50), "");
});

test("the scrubber picks the nearest point and stays in range", () => {
  assert.equal(nearestIndex(-5, 100, 11), 0);
  assert.equal(nearestIndex(54, 100, 11), 5);
  assert.equal(nearestIndex(500, 100, 11), 10);
});
