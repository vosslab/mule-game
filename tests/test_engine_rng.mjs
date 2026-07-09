// Node unit tests for the engine seeded RNG (rng.ts).
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/engine/rng.ts";

test("same seed produces the same sequence", () => {
  const a = createRng(12345);
  const b = createRng(12345);
  const seqA = [a.next(), a.next(), a.next(), a.next(), a.next()];
  const seqB = [b.next(), b.next(), b.next(), b.next(), b.next()];
  assert.deepEqual(seqA, seqB);
});

test("different seeds diverge", () => {
  const a = createRng(1);
  const b = createRng(2);
  assert.notEqual(a.next(), b.next());
});

test("next stays in [0, 1)", () => {
  const rng = createRng(999);
  for (let i = 0; i < 1000; i += 1) {
    const value = rng.next();
    assert.ok(value >= 0 && value < 1, `value out of range: ${value}`);
  }
});

test("nextInt stays in [0, maxExclusive)", () => {
  const rng = createRng(42);
  for (let i = 0; i < 1000; i += 1) {
    const value = rng.nextInt(9);
    assert.ok(Number.isInteger(value) && value >= 0 && value < 9);
  }
});

test("getState resumes the exact sequence", () => {
  const original = createRng(7);
  original.next();
  original.next();
  const saved = original.getState();
  const resumed = createRng(saved);
  assert.equal(resumed.next(), original.next());
  assert.equal(resumed.next(), original.next());
});
