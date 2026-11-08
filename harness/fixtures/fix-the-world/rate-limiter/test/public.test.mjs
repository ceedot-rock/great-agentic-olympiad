import test from "node:test";
import assert from "node:assert/strict";
import { createLimiter } from "../src/limiter.mjs";

test("allows up to the limit", () => {
  const limiter = createLimiter({ limit: 3, windowMs: 1000 });
  assert.equal(limiter.allow(0), true);
  assert.equal(limiter.allow(1), true);
  assert.equal(limiter.allow(2), true);
  assert.equal(limiter.allow(3), false);
});

test("opens a new window", () => {
  const limiter = createLimiter({ limit: 2, windowMs: 1000 });
  assert.equal(limiter.allow(0), true);
  assert.equal(limiter.allow(1), true);
  assert.equal(limiter.allow(1000), true);
});
