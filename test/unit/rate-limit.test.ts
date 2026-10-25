import { test } from "node:test";
import assert from "node:assert/strict";
import { RateLimiter } from "../../src/lib/rate-limit.ts";

test("the limiter allows up to the limit, then refuses", () => {
  const limiter = new RateLimiter(2, 1_000);
  const start = 1_000_000;

  assert.equal(limiter.take("a", start).allowed, true);
  assert.equal(limiter.take("a", start).allowed, true);

  const refused = limiter.take("a", start);
  assert.equal(refused.allowed, false);
  assert.equal(refused.retryAfterSeconds, 1);
});

test("clients are counted separately", () => {
  const limiter = new RateLimiter(1, 1_000);
  const start = 1_000_000;

  assert.equal(limiter.take("a", start).allowed, true);
  assert.equal(limiter.take("a", start).allowed, false);
  assert.equal(limiter.take("b", start).allowed, true);
});

test("a new window refills the count", () => {
  const limiter = new RateLimiter(1, 1_000);
  const start = 1_000_000;

  assert.equal(limiter.take("a", start).allowed, true);
  assert.equal(limiter.take("a", start + 999).allowed, false);
  assert.equal(limiter.take("a", start + 1_000).allowed, true);
});

test("a limit of zero disables the limiter", () => {
  const limiter = new RateLimiter(0, 1_000);
  for (let i = 0; i < 100; i += 1) {
    assert.equal(limiter.take("a", 1_000_000).allowed, true);
  }
});
