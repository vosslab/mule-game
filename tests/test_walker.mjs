// Node unit tests for the overworld avatar kinematics (walker.ts).
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  WALKER_CELL_PX,
  MOUNTAIN_SLOWDOWN_FACTOR,
  directionFromKeys,
  slowdownForTerrain,
  clampToBounds,
  cellFromPosition,
  stepPosition,
  stepTowFollower,
  cellCenter,
  manhattanDistance,
} from "../src/ui/scenes/walker.ts";

const NO_KEYS = { up: false, down: false, left: false, right: false };

test("directionFromKeys returns the zero vector when idle", () => {
  assert.deepEqual(directionFromKeys(NO_KEYS), { x: 0, y: 0 });
});

test("directionFromKeys returns unit cardinal directions", () => {
  assert.deepEqual(directionFromKeys({ ...NO_KEYS, right: true }), { x: 1, y: 0 });
  assert.deepEqual(directionFromKeys({ ...NO_KEYS, up: true }), { x: 0, y: -1 });
});

test("directionFromKeys cancels opposing keys", () => {
  assert.deepEqual(directionFromKeys({ up: true, down: true, left: false, right: false }), {
    x: 0,
    y: 0,
  });
});

test("directionFromKeys normalizes a diagonal to unit length", () => {
  const dir = directionFromKeys({ up: true, down: false, left: false, right: true });
  assert.ok(Math.abs(Math.hypot(dir.x, dir.y) - 1) < 1e-9);
  assert.ok(dir.x > 0 && dir.y < 0);
});

test("slowdownForTerrain slows only mountains", () => {
  assert.equal(slowdownForTerrain("plain"), 1);
  assert.equal(slowdownForTerrain("river"), 1);
  assert.equal(slowdownForTerrain("town"), 1);
  assert.equal(slowdownForTerrain("mountain1"), MOUNTAIN_SLOWDOWN_FACTOR);
  assert.equal(slowdownForTerrain("mountain3"), MOUNTAIN_SLOWDOWN_FACTOR);
});

test("clampToBounds keeps the avatar within the margin on every edge", () => {
  const bounds = { width: 100, height: 80 };
  assert.deepEqual(clampToBounds({ x: -10, y: -10 }, bounds, 5), { x: 5, y: 5 });
  assert.deepEqual(clampToBounds({ x: 200, y: 200 }, bounds, 5), { x: 95, y: 75 });
  assert.deepEqual(clampToBounds({ x: 50, y: 40 }, bounds, 5), { x: 50, y: 40 });
});

test("cellFromPosition derives the grid cell by flooring px / cell size", () => {
  assert.deepEqual(cellFromPosition({ x: 0, y: 0 }, WALKER_CELL_PX), { row: 0, col: 0 });
  // A point inside the second column, third row.
  const point = { x: WALKER_CELL_PX * 1.5, y: WALKER_CELL_PX * 2.5 };
  assert.deepEqual(cellFromPosition(point, WALKER_CELL_PX), { row: 2, col: 1 });
});

test("cellCenter and cellFromPosition round-trip", () => {
  const cell = { row: 3, col: 4 };
  assert.deepEqual(cellFromPosition(cellCenter(cell)), cell);
});

test("stepPosition moves by speed * dt on open terrain", () => {
  const bounds = { width: 1000, height: 1000 };
  const next = stepPosition({ x: 100, y: 100 }, { x: 1, y: 0 }, 80, 1, 0.5, bounds, 0);
  assert.ok(Math.abs(next.x - 140) < 1e-9);
  assert.equal(next.y, 100);
});

test("stepPosition applies the terrain slowdown factor", () => {
  const bounds = { width: 1000, height: 1000 };
  const openStep = stepPosition({ x: 100, y: 100 }, { x: 1, y: 0 }, 80, 1, 1, bounds, 0);
  const slowStep = stepPosition(
    { x: 100, y: 100 },
    { x: 1, y: 0 },
    80,
    MOUNTAIN_SLOWDOWN_FACTOR,
    1,
    bounds,
    0,
  );
  const openDelta = openStep.x - 100;
  const slowDelta = slowStep.x - 100;
  assert.ok(Math.abs(slowDelta - openDelta * MOUNTAIN_SLOWDOWN_FACTOR) < 1e-9);
});

test("stepPosition clamps a move that would leave the board", () => {
  const bounds = { width: 100, height: 100 };
  const next = stepPosition({ x: 95, y: 50 }, { x: 1, y: 0 }, 80, 1, 1, bounds, 8);
  assert.equal(next.x, 92); // width - margin
});

test("stepTowFollower holds its slack when the leader is close", () => {
  const follower = { x: 100, y: 100 };
  const leader = { x: 120, y: 100 }; // 20px < followDistance 40
  assert.deepEqual(stepTowFollower(follower, leader, 1, 40, 80), follower);
});

test("stepTowFollower converges to exactly followDistance behind a fixed leader", () => {
  const leader = { x: 500, y: 100 };
  let follower = { x: 100, y: 100 }; // starts 400px away
  let previousDistance = Number.POSITIVE_INFINITY;
  // 1000 frames at 80px/s * (1/60)s ~= 1.33px/frame closes the 360px gap well
  // before the loop ends, so the follower settles at the slack distance.
  for (let i = 0; i < 1000; i++) {
    follower = stepTowFollower(follower, leader, 1 / 60, 40, 80);
    const distance = Math.hypot(leader.x - follower.x, leader.y - follower.y);
    // Never overshoots inside the slack, and never moves away from the leader.
    assert.ok(distance >= 40 - 1e-9, `follower crossed inside the slack: ${distance}`);
    assert.ok(distance <= previousDistance + 1e-9, `follower moved away: ${distance}`);
    previousDistance = distance;
  }
  assert.ok(
    Math.abs(previousDistance - 40) < 1e-6,
    `follower did not settle at the slack distance: ${previousDistance}`,
  );
});

test("manhattanDistance is zero for the same cell", () => {
  assert.equal(manhattanDistance({ row: 3, col: 4 }, { row: 3, col: 4 }), 0);
});

test("manhattanDistance is 1 for each of the four orthogonal neighbors", () => {
  const center = { row: 3, col: 4 };
  assert.equal(manhattanDistance(center, { row: 2, col: 4 }), 1);
  assert.equal(manhattanDistance(center, { row: 4, col: 4 }), 1);
  assert.equal(manhattanDistance(center, { row: 3, col: 3 }), 1);
  assert.equal(manhattanDistance(center, { row: 3, col: 5 }), 1);
});

test("manhattanDistance is 2 for a diagonal neighbor (not adjacent)", () => {
  assert.equal(manhattanDistance({ row: 3, col: 4 }, { row: 2, col: 3 }), 2);
});
