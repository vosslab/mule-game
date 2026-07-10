// Node unit tests for the town collision geometry and clamp (town_layout.ts).
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
//
// These are the WP-3A acceptance gates as executable checks: every shop door is
// reachable from the spawn across the solid geometry, holding a diagonal into a
// wall slides the avatar along it (parallel coordinate strictly monotonic, no
// lock or oscillation), buildings are solid outside their doorway gaps, and the
// drawn footprints and solid walls never drift apart.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TOWN_AVATAR_RADIUS,
  TOWN_SOLID_RECTS,
  TOWN_COLLISION_BOUNDS,
  TOWN_STREET_TOP_Y,
  computeOpenDoors,
  isTownPointBlocked,
  resolveTownWalk,
  resolveTownWalkWithDoors,
  townBuildingFootprint,
  townCounterFootprint,
  townDoorAtEntry,
  townDoorwayGap,
} from "../src/ui/scenes/town_layout.ts";
import {
  TOWN_CELL_PX,
  TOWN_SPAWN_CELL,
  TOWN_DOOR_IDS,
  TOWN_EXITS,
  townDoorCenter,
  townExitCenter,
} from "../src/ui/scenes/zones.ts";
import { cellCenter } from "../src/ui/scenes/walker.ts";

const R = TOWN_AVATAR_RADIUS;
const SPAWN = cellCenter(TOWN_SPAWN_CELL, TOWN_CELL_PX);

//============================================
// Reachability: flood-fill the passable town from the spawn and confirm every
// door (and every edge exit) is reached, proving the solid geometry never walls
// off a shop or an exit.
//============================================

/** Grid resolution (px) for the reachability flood fill; a few px under radius. */
const FLOOD_STEP = 4;

/**
 * Flood-fill the passable points of the town from `start`, on a FLOOD_STEP grid,
 * treating a point as passable when the avatar centered there is not blocked.
 * Returns the set of visited "x,y" node keys.
 */
function floodReachable(start) {
  const key = (x, y) => `${x},${y}`;
  const visited = new Set();
  const queue = [start];
  visited.add(key(start.x, start.y));
  const width = TOWN_COLLISION_BOUNDS.width;
  const height = TOWN_COLLISION_BOUNDS.height;
  while (queue.length > 0) {
    const node = queue.pop();
    const neighbors = [
      { x: node.x + FLOOD_STEP, y: node.y },
      { x: node.x - FLOOD_STEP, y: node.y },
      { x: node.x, y: node.y + FLOOD_STEP },
      { x: node.x, y: node.y - FLOOD_STEP },
    ];
    for (const next of neighbors) {
      if (next.x < 0 || next.x > width || next.y < 0 || next.y > height) {
        continue;
      }
      const k = key(next.x, next.y);
      if (visited.has(k) || isTownPointBlocked(next, R)) {
        continue;
      }
      visited.add(k);
      queue.push(next);
    }
  }
  return visited;
}

/** Whether a target center is within one grid step of a reached node. */
function isReached(visited, target) {
  const snap = (v) => Math.round(v / FLOOD_STEP) * FLOOD_STEP;
  return visited.has(`${snap(target.x)},${snap(target.y)}`);
}

test("the spawn point is passable and every shop door is reachable from it", () => {
  assert.equal(isTownPointBlocked(SPAWN, R), false, "spawn must be walkable");
  const visited = floodReachable(SPAWN);
  for (const door of TOWN_DOOR_IDS) {
    const center = townDoorCenter(door);
    assert.equal(isTownPointBlocked(center, R), false, `${door} center must be walkable`);
    assert.ok(isReached(visited, center), `${door} is not reachable from the spawn`);
  }
});

test("every town edge exit stays reachable from the spawn", () => {
  const visited = floodReachable(SPAWN);
  for (const exit of TOWN_EXITS) {
    const center = townExitCenter(exit);
    assert.equal(isTownPointBlocked(center, R), false, `${exit} exit must be walkable`);
    assert.ok(isReached(visited, center), `${exit} exit is not reachable from the spawn`);
  }
});

//============================================
// Wall-slide: holding a diagonal into a wall slides the avatar along it.
//============================================

/**
 * Walk `frames` fixed diagonal steps from `start` through resolveTownWalk and
 * return the resolved positions, mimicking the rAF loop (each desired step is
 * the previous resolved position plus the per-frame delta).
 */
function walkDiagonal(start, delta, frames) {
  const positions = [];
  let position = start;
  for (let i = 0; i < frames; i++) {
    const desired = { x: position.x + delta.x, y: position.y + delta.y };
    position = resolveTownWalk(position, desired, R);
    positions.push(position);
  }
  return positions;
}

test("diagonal into a horizontal wall face slides sideways, parallel axis monotonic", () => {
  // Start just south of the store's west counters, holding up-and-right into
  // their south face. The up component must stall at the wall while the right
  // component keeps moving, frame over frame.
  const start = { x: 120, y: 172 };
  const positions = walkDiagonal(start, { x: 4, y: -4 }, 20);
  let previous = start;
  for (const point of positions) {
    // Parallel (x) coordinate is strictly monotonic: no position lock.
    assert.ok(point.x > previous.x, `x did not advance: ${previous.x} -> ${point.x}`);
    // Blocked (y) coordinate never oscillates and never enters the wall.
    assert.ok(point.y <= previous.y + 1e-9, `y moved backward (oscillation): ${point.y}`);
    assert.ok(point.y >= 150 - 1e-9, `y crossed into the wall: ${point.y}`);
    previous = point;
  }
  // The avatar came to rest flush against the wall face (expanded bottom = 150).
  assert.ok(Math.abs(previous.y - 150) < 1e-9, `did not settle on the wall face: ${previous.y}`);
});

test("diagonal into a vertical wall face slides along it, parallel axis monotonic", () => {
  // Start inside the corral doorway, holding up-and-right into the doorway's
  // east jamb. The right component stalls at the jamb; the up component keeps
  // sliding.
  const start = { x: 90, y: 120 };
  const positions = walkDiagonal(start, { x: 4, y: -4 }, 20);
  let previous = start;
  for (const point of positions) {
    // Parallel (y) coordinate is strictly monotonic.
    assert.ok(point.y < previous.y, `y did not advance: ${previous.y} -> ${point.y}`);
    // Blocked (x) coordinate never oscillates and never enters the jamb.
    assert.ok(point.x >= previous.x - 1e-9, `x moved backward (oscillation): ${point.x}`);
    assert.ok(point.x <= 107 + 1e-9, `x crossed into the east jamb: ${point.x}`);
    previous = point;
  }
});

//============================================
// Solid outside doorway gaps; street stays open.
//============================================

test("a building is solid on its jambs but open through its doorway gap", () => {
  // The corral's left jamb blocks; a point centered in its doorway does not.
  const leftJamb = townBuildingFootprint("corral");
  const jambCenter = { x: leftJamb.x + 8, y: leftJamb.y + leftJamb.height / 2 };
  assert.equal(isTownPointBlocked(jambCenter, R), true, "corral jamb must be solid");

  const doorway = townDoorwayGap("corral");
  const doorwayCenter = { x: doorway.x + doorway.width / 2, y: doorway.y + doorway.height / 2 };
  assert.equal(isTownPointBlocked(doorwayCenter, R), false, "corral doorway must be passable");
});

test("a solid store counter blocks, but the central smithore bay stays open", () => {
  const food = townCounterFootprint("counter-food");
  const foodCenter = { x: food.x + food.width / 2, y: food.y + food.height / 2 };
  assert.equal(isTownPointBlocked(foodCenter, R), true, "food counter podium must be solid");

  // The smithore bay is the store's walk-in doorway, aligned with the north
  // exit corridor, so a point in it is passable rather than a solid podium.
  const smithore = townCounterFootprint("counter-smithore");
  const smithoreCenter = {
    x: smithore.x + smithore.width / 2,
    y: smithore.y + smithore.height / 2,
  };
  assert.equal(isTownPointBlocked(smithoreCenter, R), false, "smithore bay must be passable");
});

test("walking along the open street is unaffected by collision", () => {
  // A pure east move along the street row returns the full desired step: the
  // street is fully open, so the clamp changes nothing there.
  const from = townDoorCenter("corral");
  const desired = { x: from.x + TOWN_CELL_PX, y: from.y };
  assert.deepEqual(resolveTownWalk(from, desired, R), desired);
});

//============================================
// No drift: every solid wall lies inside a drawn building footprint.
//============================================

test("every solid wall rect lies within a drawn building footprint", () => {
  const footprints = [
    townBuildingFootprint("corral"),
    townBuildingFootprint("pub"),
    townBuildingFootprint("assay"),
    townCounterFootprint("counter-food"),
    townCounterFootprint("counter-energy"),
    townCounterFootprint("counter-smithore"),
    townCounterFootprint("counter-crystite"),
  ];
  const within = (inner, outer) =>
    inner.x >= outer.x - 1e-9 &&
    inner.y >= outer.y - 1e-9 &&
    inner.x + inner.width <= outer.x + outer.width + 1e-9 &&
    inner.y + inner.height <= outer.y + outer.height + 1e-9;
  for (const wall of TOWN_SOLID_RECTS) {
    const drawnBehind = footprints.some((fp) => within(wall, fp));
    assert.ok(drawnBehind, `solid wall has no drawn building behind it: ${JSON.stringify(wall)}`);
  }
});

//============================================
// Doors: closed doors are solid, open doors let the avatar walk in (WP-3B).
//============================================

const R2 = TOWN_AVATAR_RADIUS;

test("a closed pass-through door is solid; an open one lets the avatar walk in", () => {
  // Start on the corral door cell (street) and walk straight north into the
  // doorway. With the door closed, the panel filling the gap stops the avatar
  // flush at its expanded south face; with it open, the avatar passes through.
  const doorCenter = townDoorCenter("corral");
  const from = { x: doorCenter.x, y: doorCenter.y };
  const desired = { x: doorCenter.x, y: TOWN_STREET_TOP_Y - 8 };

  const closed = resolveTownWalkWithDoors(from, desired, R2, new Set());
  assert.ok(
    closed.y > TOWN_STREET_TOP_Y,
    `closed corral door let the avatar cross the street top: ${closed.y}`,
  );

  const open = resolveTownWalkWithDoors(from, desired, R2, new Set(["corral"]));
  assert.deepEqual(open, desired, "open corral door should let the avatar walk in unobstructed");
});

test("closed-door collision matches resolveTownWalk when no doors are given closed", () => {
  // With every pass-through door open, resolveTownWalkWithDoors adds no panels,
  // so it must agree with the permanent-walls-only resolveTownWalk everywhere.
  const from = { x: 120, y: 172 };
  const desired = { x: 124, y: 168 };
  const openAll = new Set(["corral", "pub", "assay"]);
  assert.deepEqual(
    resolveTownWalkWithDoors(from, desired, R2, openAll),
    resolveTownWalk(from, desired, R2),
  );
});

test("doors open on approach and stay open through the hysteresis band", () => {
  const corral = townDoorCenter("corral");

  // Far from every door: nothing is open.
  const far = computeOpenDoors({ x: corral.x, y: corral.y + 140 }, new Set());
  assert.equal(far.size, 0, "no door should be open when the avatar is far from all of them");

  // Standing on the corral door: it is open.
  const near = computeOpenDoors(corral, new Set());
  assert.ok(near.has("corral"), "corral should open when the avatar stands on it");

  // In the hysteresis band (past open radius, within close radius): a closed
  // door stays closed, an already-open door stays open.
  const banded = { x: corral.x, y: corral.y + 60 };
  assert.equal(
    computeOpenDoors(banded, new Set()).has("corral"),
    false,
    "corral should not open from outside its open radius",
  );
  assert.ok(
    computeOpenDoors(banded, new Set(["corral"])).has("corral"),
    "corral should stay open within its close radius (hysteresis)",
  );
});

test("a pass-through door is held open while the avatar is inside its doorway", () => {
  // Deep inside the corral doorway column, well past the close radius: the
  // inside-hold keeps the door open so it never closes onto or traps the avatar.
  const corral = townDoorCenter("corral");
  const inside = { x: corral.x, y: TOWN_STREET_TOP_Y - 60 };
  assert.ok(
    computeOpenDoors(inside, new Set()).has("corral"),
    "corral should stay open while the avatar is inside its doorway column",
  );
});

test("walking into an open doorway enters the shop; walking the street does not", () => {
  const corral = townDoorCenter("corral");

  // North of the street top in the corral doorway column: entered.
  assert.equal(
    townDoorAtEntry({ x: corral.x, y: TOWN_STREET_TOP_Y - 8 }),
    "corral",
    "crossing north through the corral doorway should register as entry",
  );

  // Walking the open street at a solid counter's center: not entered.
  const food = townDoorCenter("counter-food");
  assert.equal(
    townDoorAtEntry({ x: food.x, y: food.y }),
    null,
    "walking the street past a counter must not enter it",
  );
});

test("pressing north into a solid counter enters it; the smithore bay is a walk-in", () => {
  // Pressed flush against the food podium (its expanded south face): entered.
  const food = townDoorCenter("counter-food");
  const podiumFace = TOWN_STREET_TOP_Y + R2;
  assert.equal(
    townDoorAtEntry({ x: food.x, y: podiumFace }),
    "counter-food",
    "pressing north into the food counter should register as entry",
  );

  // The passable smithore bay is entered by walking north into it, like a
  // pass-through building (its scene-side carry gate is tested in the browser).
  const smithore = townDoorCenter("counter-smithore");
  assert.equal(
    townDoorAtEntry({ x: smithore.x, y: TOWN_STREET_TOP_Y - 8 }),
    "counter-smithore",
    "walking north into the smithore bay should register as entry",
  );
});
