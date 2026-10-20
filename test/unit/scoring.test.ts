import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bestPickId,
  capabilityRetention,
  compareForLeaderboard,
  isRankable,
  isVerified,
  paretoIds,
  refusalRate,
  scoreOf,
  type ScoreInput,
} from "../../src/core/scoring.ts";

function input(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    id: "rcp_1",
    kl: 0.1,
    refusals: 1,
    refusalTotal: 100,
    confidence: "medium",
    downloadsAllTime: 100,
    lastModified: "2026-01-01",
    verification: "verified",
    ...overrides,
  };
}

test("the refusal rate is the refusals over the total", () => {
  assert.equal(refusalRate(1, 100), 0.01);
  assert.equal(refusalRate(0, 0), null);
  assert.equal(refusalRate(5, 0), null);
  assert.equal(refusalRate(-1, 100), null);
  assert.equal(refusalRate(200, 100), 1);
});

test("capability retention falls smoothly as the divergence grows", () => {
  assert.equal(capabilityRetention(0), 1);
  assert.ok(Math.abs(capabilityRetention(1) - 0.5) < 1e-9);
  assert.ok(Math.abs(capabilityRetention(9) - 0.1) < 1e-9);
  assert.equal(capabilityRetention(-1), null);
  assert.equal(capabilityRetention(null), null);
});

test("a card with no pair is not rankable and has no score", () => {
  const row = input({ kl: null, confidence: "none" });
  assert.equal(isRankable(row), false);
  assert.equal(scoreOf(row), null);
});

test("a card with no confidence is not rankable", () => {
  assert.equal(isRankable(input({ confidence: "none" })), false);
});

test("a card whose refusals exceed the total is not rankable", () => {
  assert.equal(isRankable(input({ refusals: 120 })), false);
});

test("the score is bounded and rewards both a low divergence and few refusals", () => {
  const good = scoreOf(input({ kl: 0.01, refusals: 0, refusalTotal: 100 }));
  const bad = scoreOf(input({ kl: 5, refusals: 50, refusalTotal: 100 }));
  assert.ok(good && bad);
  assert.ok(good.quality > bad.quality);
  assert.ok(good.quality <= 100);
  assert.ok(bad.quality >= 0);
});

test("corroboration outranks score in the leaderboard order", () => {
  const fabricated = input({
    id: "rcp_fabricated",
    kl: 0,
    refusals: 0,
    refusalTotal: 100,
    score: undefined as never,
    verification: "unverified",
  });
  const measured = input({ id: "rcp_measured", kl: 0.5, refusals: 10, refusalTotal: 100 });
  const order = [fabricated, measured].sort(compareForLeaderboard);
  assert.equal(order[0].id, "rcp_measured");
});

test("no sort direction can place an unverified row first", () => {
  const rows = [
    input({ id: "a", verification: "unverified" }),
    input({ id: "b", verification: "unverified" }),
    input({ id: "c", verification: "verified" }),
  ];
  const order = [...rows].sort(compareForLeaderboard);
  assert.equal(order[0].verification, "verified");
});

test("the pareto frontier keeps the points nothing else dominates", () => {
  const rows = [
    input({ id: "low-kl-high-refusal", kl: 0.01, refusals: 20, refusalTotal: 100 }),
    input({ id: "high-kl-low-refusal", kl: 1, refusals: 0, refusalTotal: 100 }),
    input({ id: "dominated", kl: 2, refusals: 30, refusalTotal: 100 }),
  ];
  const frontier = paretoIds(rows);
  assert.ok(frontier.has("low-kl-high-refusal"));
  assert.ok(frontier.has("high-kl-low-refusal"));
  assert.ok(!frontier.has("dominated"));
});

test("a cohort with nothing corroborated elects no best pick", () => {
  const rows = [
    input({ id: "a", verification: "unverified" }),
    input({ id: "b", verification: "unverified" }),
  ];
  assert.equal(bestPickId(rows), null);
});

test("the best pick is the corroborated row with the strongest score", () => {
  const rows = [
    input({ id: "a", verification: "unverified", kl: 0.001 }),
    input({ id: "b", verification: "verified", kl: 0.5 }),
  ];
  assert.equal(bestPickId(rows), "b");
});

test("verification is a property of corroboration, not of the score", () => {
  assert.equal(isVerified(input({ verification: "verified" })), true);
  assert.equal(isVerified(input({ verification: "publisher" })), true);
  assert.equal(isVerified(input({ verification: "unverified" })), false);
});
