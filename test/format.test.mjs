import test from "node:test";
import assert from "node:assert/strict";
import { usd, tokens, dur, countdown, num, dayLabel, count, noun } from "../public/format.js";

test("money, tokens, durations, counts, countdowns and days", () => {
  assert.equal(usd(1234.5), "$1,234.50");
  assert.equal(usd(null), "-");
  assert.equal(tokens(1530000), "1.5M");
  assert.equal(dur(59e3), "59s");
  assert.equal(dur(61e3), "1m");
  assert.equal(dur(3725e3), "1h 2m");
  assert.equal(countdown(65e3), "1:05");
  assert.equal(num(1284.4), "1,284");
  assert.equal(num(null), "-");
  assert.equal(dayLabel("2026-10-05"), "Oct 5");
});

test("a count's noun agrees with its number", () => {
  assert.equal(count(1, "subagent"), "1 subagent");
  assert.equal(count(2, "subagent"), "2 subagents");
  assert.equal(count(0, "conflict"), "0 conflicts");
  assert.equal(count(1840, "action"), "1,840 actions");
  assert.equal(count(1, "file conflict"), "1 file conflict");
  assert.equal(count(null, "action"), "- actions");
  assert.equal(noun(1, "lock"), "lock");
  assert.equal(noun(3, "lock"), "locks");
});
