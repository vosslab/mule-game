// Unit tests for the spatial auction scene's pure motion helpers.
//
// These cover the DOM-free math the scene relies on: mapping a band price to a
// track y (floor at the bottom, ceiling at the top, clamped, zero-width safe)
// and easing a value toward a target one frame at a time (capped step, snap
// within epsilon). Run via `node --import tsx --test tests/test_auction_tween.mjs`.

import test from "node:test";
import assert from "node:assert/strict";

import { priceToTrackY, easeToward } from "../src/ui/scenes/auction_tween.ts";

test("priceToTrackY: floor sits at the bottom, ceiling at the top", () => {
  assert.equal(priceToTrackY(10, 10, 50, 400), 400);
  assert.equal(priceToTrackY(50, 10, 50, 400), 0);
});

test("priceToTrackY: midband price maps to the track midpoint", () => {
  assert.equal(priceToTrackY(30, 10, 50, 400), 200);
});

test("priceToTrackY: out-of-band prices clamp onto the track", () => {
  assert.equal(priceToTrackY(-5, 10, 50, 400), 400);
  assert.equal(priceToTrackY(999, 10, 50, 400), 0);
});

test("priceToTrackY: a zero-width band centers rather than dividing by zero", () => {
  assert.equal(priceToTrackY(20, 20, 20, 400), 200);
});

test("easeToward: moves a fraction of the way toward the target", () => {
  // dt * rate = 0.1 * 5 = 0.5, so halfway from 0 to 100.
  assert.equal(easeToward(0, 100, 0.1, 5, 0.4), 50);
});

test("easeToward: a long frame caps the step at the full distance", () => {
  // dt * rate = 1 * 100 = 100, capped to 1, so it reaches the target exactly.
  assert.equal(easeToward(0, 100, 1, 100, 0.4), 100);
});

test("easeToward: snaps to the target once within epsilon", () => {
  assert.equal(easeToward(99.9, 100, 0.016, 11, 0.4), 100);
});
