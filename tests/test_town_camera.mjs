// Node unit tests for the pure town camera (town_camera.ts).
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
//
// town_world.ts composes a street wider than the viewport, so the
// camera translates the composed street through a world-space-x -> offset
// function. This suite pins the soft-zone follow behavior, both clamps, the
// worldWidth <= viewportWidth no-scroll case, and determinism -- the
// contract the scene cutover and the browser tests build against.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TOWN_CAMERA_SOFT_ZONE_START,
  TOWN_CAMERA_SOFT_ZONE_END,
  townCameraOffset,
} from "../src/ui/scenes/town_camera.ts";

import {
  TOWN_REFERENCE_VIEWPORT_WIDTH,
  composeTownStreetForMode,
} from "../src/ui/scenes/town_world.ts";

/** A representative viewport width, distinct from the reference constant. */
const VIEWPORT_WIDTH = 480;

//============================================
// Soft-zone follow: while unclamped, the avatar's on-screen position sits
// inside the middle-third band, and moving the avatar moves the camera 1:1.
//============================================

test("while the camera is unclamped, the avatar stays inside the middle-third soft zone", () => {
  const worldWidth = 4000;
  // Comfortably clear of both world edges so the camera is never clamped.
  const samples = [worldWidth / 2 - 300, worldWidth / 2, worldWidth / 2 + 300];
  const softZoneLeftPx = TOWN_CAMERA_SOFT_ZONE_START * VIEWPORT_WIDTH;
  const softZoneRightPx = TOWN_CAMERA_SOFT_ZONE_END * VIEWPORT_WIDTH;

  for (const avatarWorldX of samples) {
    const offset = townCameraOffset(avatarWorldX, worldWidth, VIEWPORT_WIDTH);
    const avatarScreenX = avatarWorldX - offset;
    assert.ok(
      avatarScreenX >= softZoneLeftPx && avatarScreenX <= softZoneRightPx,
      `avatar at world x=${avatarWorldX} rendered at screen x=${avatarScreenX}, ` +
        `outside the soft zone [${softZoneLeftPx}, ${softZoneRightPx}]`,
    );
  }
});

test("moving the avatar within the unclamped interior moves the camera 1:1", () => {
  const worldWidth = 4000;
  const step = 25;
  const first = townCameraOffset(worldWidth / 2, worldWidth, VIEWPORT_WIDTH);
  const second = townCameraOffset(worldWidth / 2 + step, worldWidth, VIEWPORT_WIDTH);
  assert.equal(second - first, step, "unclamped camera must track avatar movement 1:1");
});

//============================================
// Left and right clamps: the offset never scrolls past either world end.
//============================================

test("the camera clamps at the left world edge to offset 0", () => {
  const worldWidth = 4000;
  // Even far past the left edge (a negative or zero avatar x), offset floors at 0.
  for (const avatarWorldX of [-500, 0, 50]) {
    const offset = townCameraOffset(avatarWorldX, worldWidth, VIEWPORT_WIDTH);
    assert.equal(offset, 0, `avatar at world x=${avatarWorldX} must clamp offset to 0`);
  }
});

test("the camera clamps at the right world edge to worldWidth - viewportWidth", () => {
  const worldWidth = 4000;
  const expectedMax = worldWidth - VIEWPORT_WIDTH;
  // Even far past the right edge, offset ceilings at worldWidth - viewportWidth.
  for (const avatarWorldX of [worldWidth, worldWidth + 500, worldWidth * 2]) {
    const offset = townCameraOffset(avatarWorldX, worldWidth, VIEWPORT_WIDTH);
    assert.equal(offset, expectedMax, `avatar at world x=${avatarWorldX} must clamp offset to max`);
  }
});

//============================================
// No-scroll case: worldWidth <= viewportWidth is a valid case, not an error.
//============================================

test("the offset is always 0 when the composed world fits inside the viewport", () => {
  const narrowWorldWidth = VIEWPORT_WIDTH - 50;
  for (const avatarWorldX of [
    -100,
    0,
    narrowWorldWidth / 2,
    narrowWorldWidth,
    narrowWorldWidth + 100,
  ]) {
    const offset = townCameraOffset(avatarWorldX, narrowWorldWidth, VIEWPORT_WIDTH);
    assert.equal(
      offset,
      0,
      `worldWidth <= viewportWidth must never scroll (avatar x=${avatarWorldX})`,
    );
  }
});

test("the offset is always 0 when the world exactly equals the viewport width", () => {
  const offset = townCameraOffset(VIEWPORT_WIDTH / 2, VIEWPORT_WIDTH, VIEWPORT_WIDTH);
  assert.equal(offset, 0, "an exact-fit world must not scroll");
});

//============================================
// Determinism: same inputs always produce the same output, no hidden state.
//============================================

test("townCameraOffset is a pure, deterministic function of its inputs", () => {
  const worldWidth = 4000;
  const avatarWorldX = 1234.5;
  const first = townCameraOffset(avatarWorldX, worldWidth, VIEWPORT_WIDTH);
  const second = townCameraOffset(avatarWorldX, worldWidth, VIEWPORT_WIDTH);
  assert.equal(first, second, "repeated calls with identical inputs must return identical offsets");

  // Calling with unrelated inputs in between must not leak any state.
  townCameraOffset(-999, 100, 50);
  const third = townCameraOffset(avatarWorldX, worldWidth, VIEWPORT_WIDTH);
  assert.equal(third, first, "an intervening unrelated call must not affect a later result");
});

//============================================
// Integration: real per-mode composed widths from town_world.ts, sampled
// across the full street, always produce an offset inside the valid clamp
// range -- this is the exact contract the scene cutover depends on.
//============================================

test("across every current mode's composed street, the offset always stays within the clamp range", () => {
  const modes = ["beginner", "standard"];
  for (const mode of modes) {
    const street = composeTownStreetForMode(mode);
    const maxOffset = Math.max(0, street.worldWidth - TOWN_REFERENCE_VIEWPORT_WIDTH);
    const sampleXs = [0, street.worldWidth / 4, street.spawn.x, street.worldWidth];
    for (const avatarWorldX of sampleXs) {
      const offset = townCameraOffset(
        avatarWorldX,
        street.worldWidth,
        TOWN_REFERENCE_VIEWPORT_WIDTH,
      );
      assert.ok(
        offset >= 0 && offset <= maxOffset,
        `${mode}: offset ${offset} out of range [0, ${maxOffset}] for avatar x=${avatarWorldX}`,
      );
    }
  }
});
