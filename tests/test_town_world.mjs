// Node unit tests for the mode-composed town world model (town_world.ts).
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
//
// This suite replaces the retired 9x5 grid town (four exits, pass-through
// building tunnels, full-depth doorway gaps). The town is one mode-composed
// scrolling street: a storefront catalog filtered per game mode, laid out
// left to right, with a solid facade band, a shallow bounded door threshold
// per facade, a street lane, and exactly two endpoint exits. See
// docs/THE_TOWN_ANALYSIS.md for the full design rationale.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  TOWN_AVATAR_RADIUS,
  TOWN_REFERENCE_VIEWPORT_WIDTH,
  TOWN_THRESHOLD_DEPTH,
  TOWN_STOREFRONT_CATALOG,
  TOWN_FACADE_GAP,
  TOWN_STREET_END_PADDING,
  DOOR_OPEN_RADIUS_PX,
  DOOR_CLOSE_RADIUS_PX,
  DOOR_ENTRY_BAND_PX,
  composeTownStreet,
  composeTownStreetForMode,
  townCapabilitiesForMode,
  facadeById,
} from "../src/ui/scenes/town_world.ts";
import {
  resolveTownWalk,
  isTownPointBlocked,
  computeOpenDoors,
  townDoorAtThreshold,
  townExitAt,
} from "../src/ui/scenes/town_collision.ts";

const R = TOWN_AVATAR_RADIUS;

/** The two current engine modes, plus the confirmed composition each must produce. */
const MODE_TABLE = [
  {
    mode: "beginner",
    expectedIds: ["mining", "energy", "farm", "corral", "pub"],
  },
  {
    mode: "standard",
    expectedIds: ["mining", "energy", "farm", "corral", "pub", "land"],
  },
];

//============================================
// Shared helpers
//============================================

/** Assert that a composed facade list preserves NES catalog order among its members. */
function assertNesOrder(facades) {
  const catalogOrder = TOWN_STOREFRONT_CATALOG.map((record) => record.id);
  let lastIndex = -1;
  for (const facade of facades) {
    const index = catalogOrder.indexOf(facade.id);
    assert.ok(index > lastIndex, `facade ${facade.id} is out of NES catalog order`);
    lastIndex = index;
  }
}

/**
 * Push the avatar due north (decreasing y) for a number of fixed-step frames
 * through resolveTownWalk, mimicking a held-Up rAF loop. Returns every
 * resolved position, oldest first.
 */
function pushNorthFrames(street, start, frames, stepPx, radius, openDoors) {
  const positions = [];
  let position = start;
  for (let index = 0; index < frames; index += 1) {
    const desired = { x: position.x, y: position.y - stepPx };
    position = resolveTownWalk(street, position, desired, radius, openDoors);
    positions.push(position);
  }
  return positions;
}

/**
 * Compute the expected world width for a facade id sequence from the
 * storefront catalog's own facadeWidth values plus the two layout spacing
 * constants (TOWN_FACADE_GAP, TOWN_STREET_END_PADDING). This recomputes from
 * the same inputs composeTownStreet uses instead of pinning today's derived
 * total, so it stays valid across facade-width or spacing retunes while still
 * catching an arithmetic bug in the composition's cursor math.
 */
function expectedWorldWidthFor(ids) {
  const totalFacadeWidth = ids.reduce((sum, id) => {
    const record = TOWN_STOREFRONT_CATALOG.find((entry) => entry.id === id);
    return sum + record.facadeWidth;
  }, 0);
  const totalGap = TOWN_FACADE_GAP * (ids.length - 1);
  return totalFacadeWidth + totalGap + 2 * TOWN_STREET_END_PADDING;
}

/** Grid resolution (px) for the reachability flood fill; a few px under the avatar radius. */
const FLOOD_STEP = 4;

/**
 * Flood-fill the passable points of a composed street from `start`, on a
 * FLOOD_STEP grid, treating a point as passable when the avatar centered
 * there is not blocked (every door closed).
 */
function floodReachable(street, start, radius) {
  const key = (x, y) => `${x},${y}`;
  const visited = new Set();
  const queue = [start];
  visited.add(key(start.x, start.y));
  const noOpenDoors = new Set();
  while (queue.length > 0) {
    const node = queue.pop();
    const neighbors = [
      { x: node.x + FLOOD_STEP, y: node.y },
      { x: node.x - FLOOD_STEP, y: node.y },
      { x: node.x, y: node.y + FLOOD_STEP },
      { x: node.x, y: node.y - FLOOD_STEP },
    ];
    for (const next of neighbors) {
      if (next.x < 0 || next.x > street.worldWidth || next.y < 0 || next.y > street.worldHeight) {
        continue;
      }
      const k = key(next.x, next.y);
      if (visited.has(k) || isTownPointBlocked(street, next, radius, noOpenDoors)) {
        continue;
      }
      visited.add(k);
      queue.push(next);
    }
  }
  return visited;
}

/**
 * Whether a target center is within one flood-fill grid step of a reached
 * node. The flood fill only ever visits points offset from `start` by a
 * multiple of FLOOD_STEP in each axis, so the nearest grid node to `target`
 * is snapped RELATIVE TO `start` (not to an absolute origin) -- otherwise a
 * target whose offset from `start` is not itself a multiple of FLOOD_STEP
 * would never match any node the fill could possibly have visited.
 */
function isReached(visited, start, target) {
  const snapAxis = (startValue, targetValue) =>
    startValue + FLOOD_STEP * Math.round((targetValue - startValue) / FLOOD_STEP);
  const x = snapAxis(start.x, target.x);
  const y = snapAxis(start.y, target.y);
  return visited.has(`${x},${y}`);
}

//============================================
// Per-mode composition: presence AND absence, NES order, derived widths.
//============================================

test("composeTownStreetForMode composes the confirmed per-mode facade sequence, in NES order", () => {
  for (const row of MODE_TABLE) {
    const street = composeTownStreetForMode(row.mode);
    const ids = street.facades.map((facade) => facade.id);
    assert.deepEqual(ids, row.expectedIds, `${row.mode} composed the wrong facade sequence`);
    assertNesOrder(street.facades);
    assert.equal(
      street.worldWidth,
      expectedWorldWidthFor(row.expectedIds),
      `${row.mode} world width mismatch`,
    );

    // Absence: no current mode ever renders the Land Office beyond standard,
    // and no current mode ever renders the Assay Office (tournament-only).
    assert.equal(
      facadeById(street, "assay"),
      undefined,
      `${row.mode} must not compose an Assay Office (tournament-only, no engine mode yet)`,
    );
    if (row.mode === "beginner") {
      assert.equal(
        facadeById(street, "land"),
        undefined,
        "beginner must not compose a Land Office",
      );
    } else {
      assert.notEqual(
        facadeById(street, "land"),
        undefined,
        `${row.mode} must compose a Land Office`,
      );
    }

    // Every current mode's Mining panel offers only smithore (crystite is
    // tournament-only); this is a usable-feature check, not a filler facade.
    const mining = facadeById(street, "mining");
    assert.deepEqual(mining.outfitResources, ["smithore"], `${row.mode} mining outfits mismatch`);
  }
});

test("every composed street is wider than the reference viewport in every current mode", () => {
  for (const row of MODE_TABLE) {
    const street = composeTownStreetForMode(row.mode);
    assert.ok(
      street.worldWidth > TOWN_REFERENCE_VIEWPORT_WIDTH,
      `${row.mode} world (${street.worldWidth}px) does not exceed the viewport ` +
        `(${TOWN_REFERENCE_VIEWPORT_WIDTH}px); the camera would have nothing to scroll`,
    );
  }
});

//============================================
// Spawn and exits.
//============================================

test("the corral spawn sits at the corral facade's door center, in the street lane", () => {
  for (const row of MODE_TABLE) {
    const street = composeTownStreetForMode(row.mode);
    const corral = facadeById(street, "corral");
    assert.equal(street.spawn.x, corral.doorCenterX, `${row.mode} spawn x is not the corral door`);
    assert.equal(street.spawn.y, street.streetLaneY, `${row.mode} spawn y is not the street lane`);
  }
});

test("every composed street exposes exactly two endpoint exits, left and right", () => {
  for (const row of MODE_TABLE) {
    const street = composeTownStreetForMode(row.mode);
    assert.equal(street.exits.length, 2, `${row.mode} must expose exactly two exits`);
    const sides = street.exits.map((exit) => exit.side).sort();
    assert.deepEqual(sides, ["left", "right"], `${row.mode} exits must be left and right`);

    // Each exit zone is detectable at its own center; the street middle is not an exit.
    for (const exit of street.exits) {
      const center = {
        x: exit.rect.x + exit.rect.width / 2,
        y: exit.rect.y + exit.rect.height / 2,
      };
      assert.equal(townExitAt(street, center), exit.side, `${row.mode} ${exit.side} exit center`);
    }
    const middle = { x: street.worldWidth / 2, y: street.streetLaneY };
    assert.equal(townExitAt(street, middle), null, `${row.mode} street middle must not be an exit`);
  }
});

//============================================
// Reachability: every facade's street-level door position is reachable from
// spawn, and the flood fill never crosses into the solid facade band.
//============================================

test("every composed facade's street-level door is reachable from spawn along the street lane", () => {
  for (const row of MODE_TABLE) {
    const street = composeTownStreetForMode(row.mode);
    assert.equal(
      isTownPointBlocked(street, street.spawn, R, new Set()),
      false,
      `${row.mode} spawn must be walkable`,
    );
    const visited = floodReachable(street, street.spawn, R);
    for (const facade of street.facades) {
      const doorStreetSide = { x: facade.doorCenterX, y: street.facadeBottomY + R };
      assert.ok(
        isReached(visited, street.spawn, doorStreetSide),
        `${row.mode} ${facade.id} door is not reachable from spawn along the street`,
      );
    }
  }
});

test("the flood fill from spawn never crosses into the solid facade band", () => {
  for (const row of MODE_TABLE) {
    const street = composeTownStreetForMode(row.mode);
    const visited = floodReachable(street, street.spawn, R);
    for (const key of visited) {
      const parts = key.split(",");
      const y = Number(parts[1]);
      assert.ok(
        y >= street.facadeBottomY,
        `${row.mode} flood fill reached a point north of the street (y=${y}), ` + "behind a facade",
      );
    }
  }
});

//============================================
// Collision: solid jambs, closed doors, and bounded open doors.
//============================================

test("holding north against a facade jamb keeps the avatar pinned at the street edge", () => {
  // A non-door offset within a facade's width (well clear of its door span):
  // repeated north pushes must stall at the street edge and never creep deeper.
  const street = composeTownStreetForMode("beginner");
  const facade = facadeById(street, "energy");
  const jambX = facade.facadeRect.x + 10;
  const start = { x: jambX, y: street.streetLaneY };
  const positions = pushNorthFrames(street, start, 40, 10, R, new Set());

  let previous = start.y;
  for (const point of positions) {
    assert.ok(point.y <= previous + 1e-9, `y moved backward (oscillation): ${point.y}`);
    previous = point.y;
  }
  const settled = positions[positions.length - 1].y;
  const expectedFace = street.facadeBottomY + R;
  assert.ok(
    Math.abs(settled - expectedFace) < 1e-9,
    `did not settle flush on the street edge: ${settled}, expected ${expectedFace}`,
  );
  // The last several frames must be identical: depth stays constant once stalled.
  const tail = positions.slice(-5).map((point) => point.y);
  assert.ok(
    tail.every((y) => Math.abs(y - settled) < 1e-9),
    "inner depth kept changing frame over frame instead of holding constant",
  );
});

test("a closed door blocks; pushing north into it stalls at the street edge like any jamb", () => {
  const street = composeTownStreetForMode("beginner");
  const facade = facadeById(street, "corral");
  const start = { x: facade.doorCenterX, y: street.streetLaneY };
  const positions = pushNorthFrames(street, start, 40, 10, R, new Set());
  const settled = positions[positions.length - 1].y;
  const expectedFace = street.facadeBottomY + R;
  assert.ok(
    Math.abs(settled - expectedFace) < 1e-9,
    `closed door let the avatar past the street edge: ${settled}`,
  );
});

test("an open door bounds entry at the threshold's back wall, no further", () => {
  const street = composeTownStreetForMode("beginner");
  const facade = facadeById(street, "corral");
  const start = { x: facade.doorCenterX, y: street.streetLaneY };
  const openDoors = new Set([facade.id]);
  const positions = pushNorthFrames(street, start, 40, 10, R, openDoors);
  const settled = positions[positions.length - 1].y;
  const thresholdTopY = street.facadeBottomY - TOWN_THRESHOLD_DEPTH;
  const expectedBackWall = thresholdTopY + R;

  // Bounded: goes deeper than a closed door (past the street edge into the
  // notch), but never past the notch's own back wall into the solid facade.
  assert.ok(
    settled < street.facadeBottomY,
    `open door should admit the avatar past the street edge: ${settled}`,
  );
  assert.ok(
    Math.abs(settled - expectedBackWall) < 1e-9,
    `open door did not bound at the threshold back wall: ${settled}, expected ${expectedBackWall}`,
  );
});

//============================================
// Door state: open-on-approach hysteresis, close on retreat.
//============================================

test("doors open on approach, stay open through the hysteresis band, and close far away", () => {
  const street = composeTownStreetForMode("beginner");
  const facade = facadeById(street, "corral");
  const doorCenter = { x: facade.doorCenterX, y: street.streetTopY };

  // Far from every door: nothing is open. (Comfortably past the close radius.)
  const farOffset = DOOR_CLOSE_RADIUS_PX + 44;
  const far = computeOpenDoors(street, { x: doorCenter.x, y: doorCenter.y + farOffset }, new Set());
  assert.equal(far.size, 0, "no door should be open when the avatar is far from all of them");

  // Standing on the door's street-level center: it opens.
  const near = computeOpenDoors(street, doorCenter, new Set());
  assert.ok(near.has(facade.id), "the door should open when the avatar stands on it");

  // In the hysteresis band (past open radius, within close radius): a closed
  // door stays closed, an already-open door stays open.
  const bandedOffset = (DOOR_OPEN_RADIUS_PX + DOOR_CLOSE_RADIUS_PX) / 2;
  const banded = { x: doorCenter.x, y: doorCenter.y + bandedOffset };
  assert.equal(
    computeOpenDoors(street, banded, new Set()).has(facade.id),
    false,
    "the door should not open fresh from outside its open radius",
  );
  assert.ok(
    computeOpenDoors(street, banded, new Set([facade.id])).has(facade.id),
    "the door should stay open within its close radius (hysteresis)",
  );
});

//============================================
// Entry: reaching the inner threshold fires exactly once, and re-arms.
//============================================

test("entering an open threshold latches entry exactly once, and re-arms after leaving", () => {
  for (const row of MODE_TABLE) {
    const street = composeTownStreetForMode(row.mode);
    const facade = facadeById(street, "corral");
    const insidePoint = {
      x: facade.doorCenterX,
      y: street.facadeBottomY - TOWN_THRESHOLD_DEPTH / 2,
    };
    const outsidePoint = { x: facade.doorCenterX, y: street.streetLaneY };

    let latched = false;
    let entryCount = 0;
    function frame(pos) {
      const hit = townDoorAtThreshold(street, pos);
      if (hit === facade.id && !latched) {
        entryCount += 1;
        latched = true;
      } else if (hit !== facade.id) {
        latched = false;
      }
    }

    frame(outsidePoint); // street-side: no entry
    frame(insidePoint); // crosses in: fires once
    frame(insidePoint); // stays inside: latched, no re-fire
    frame(insidePoint);
    frame(outsidePoint); // leaves: re-arms
    frame(insidePoint); // crosses in again: fires again

    assert.equal(entryCount, 2, `${row.mode} entry should fire exactly once per occupancy`);
  }
});

//============================================
// Regression: a quality review found the entry zone's height, DOOR_ENTRY_BAND_PX,
// read south from the notch top with no cap, overshooting the notch's own back
// edge by (DOOR_ENTRY_BAND_PX - TOWN_THRESHOLD_DEPTH) px into the street lane --
// an avatar simply walking the street lane past an open door fired the walk-in
// entry gesture prematurely. The fix caps the entry zone at the notch's own
// depth. This test samples the exact street-lane band the old bug reached and
// confirms it no longer triggers, alongside a positive check that a point truly
// inside the notch still does (the boundary moved, it did not vanish).
//============================================

test("open-door entry zone never overshoots the notch into the street lane", () => {
  const overshootPx = DOOR_ENTRY_BAND_PX - TOWN_THRESHOLD_DEPTH;

  for (const row of MODE_TABLE) {
    const street = composeTownStreetForMode(row.mode);
    const facade = facadeById(street, "corral");

    // Positive: a point inside the notch (north of facadeBottomY, within the
    // notch depth) must still trigger entry.
    const insidePoint = {
      x: facade.doorCenterX,
      y: street.facadeBottomY - TOWN_THRESHOLD_DEPTH / 2,
    };
    assert.equal(
      townDoorAtThreshold(street, insidePoint),
      facade.id,
      `${row.mode} a point inside the notch must still trigger entry`,
    );

    // Negative regression: the street edge itself, the first point the old
    // unbounded band reached past the notch, must not trigger entry.
    const streetEdgePoint = { x: facade.doorCenterX, y: street.facadeBottomY };
    assert.equal(
      townDoorAtThreshold(street, streetEdgePoint),
      null,
      `${row.mode} the street edge (y=${street.facadeBottomY}) must not trigger entry`,
    );

    // Negative regression: the deepest point the old unbounded band would have
    // reached into the street lane before its own (uncapped) height ran out.
    // Skipped when tuned so DOOR_ENTRY_BAND_PX no longer exceeds
    // TOWN_THRESHOLD_DEPTH -- there is no overshoot band left to sample.
    if (overshootPx > 0) {
      const deepestOvershootY = street.facadeBottomY + overshootPx - 1;
      const deepestOvershootPoint = { x: facade.doorCenterX, y: deepestOvershootY };
      assert.equal(
        townDoorAtThreshold(street, deepestOvershootPoint),
        null,
        `${row.mode} a point ${overshootPx - 1}px south of the street edge (old overshoot band) ` +
          "must not trigger entry",
      );
    }
  }
});

//============================================
// Standing invariant: adjacent composed door centers stay outside twice the
// door-open radius. computeOpenDoors opens only the single nearest door within
// DOOR_OPEN_RADIUS_PX of the avatar; if two doors ever sat within 2x that
// radius of each other, both could become "nearest" from some approach angle
// and the door-open tie-break would need real logic instead of relying on
// separation. Today's facade widths plus TOWN_FACADE_GAP guarantee the gap.
//============================================

test("adjacent door centers stay outside twice the door-open radius", () => {
  for (const row of MODE_TABLE) {
    const street = composeTownStreetForMode(row.mode);
    const centers = street.facades.map((facade) => facade.doorCenterX);
    for (let index = 1; index < centers.length; index += 1) {
      const gap = centers[index] - centers[index - 1];
      assert.ok(
        gap > 2 * DOOR_OPEN_RADIUS_PX,
        `${row.mode} doors at x=${centers[index - 1]} and x=${centers[index]} are only ${gap}px ` +
          `apart, within 2x the open radius (${2 * DOOR_OPEN_RADIUS_PX}px)`,
      );
    }
  }
});

//============================================
// Purity: composition is a deterministic function of capability flags only,
// with no camera, viewport, or hidden mutable state feeding in.
//============================================

test("composeTownStreet is a pure, deterministic function of capability flags", () => {
  const caps = townCapabilitiesForMode("standard");
  const first = composeTownStreet(caps);
  const second = composeTownStreet(caps);
  assert.deepEqual(first, second, "composing the same flags twice must yield equal streets");

  // Mutating a caller's copy of the returned facade list must not leak into a
  // fresh composition; there is no shared mutable module state to corrupt.
  const leaked = first.facades.slice();
  leaked.push(leaked[0]);
  const third = composeTownStreet(caps);
  assert.deepEqual(third, first, "a caller mutating its own array must not affect composition");
});

//============================================
// Catalog-level property test: composition is total over the capability
// flags, not just the two current modes -- a future mode composes a valid
// street with no code change to this module.
//============================================

test("composeTownStreet composes a valid street for any capability-flag combination", () => {
  const combinations = [
    { landOfficeVisible: false, assayVisible: false, miningOutfits: [] },
    { landOfficeVisible: true, assayVisible: true, miningOutfits: ["smithore", "crystite"] },
    { landOfficeVisible: true, assayVisible: false, miningOutfits: ["smithore"] },
    { landOfficeVisible: false, assayVisible: true, miningOutfits: ["smithore"] },
  ];
  for (const caps of combinations) {
    const street = composeTownStreet(caps);
    assertNesOrder(street.facades);

    // The five always-available facades are present in every combination.
    for (const id of ["mining", "energy", "farm", "corral", "pub"]) {
      assert.notEqual(facadeById(street, id), undefined, `always-available facade missing: ${id}`);
    }
    assert.equal(
      facadeById(street, "land") !== undefined,
      caps.landOfficeVisible,
      "Land Office presence must match its capability flag",
    );
    assert.equal(
      facadeById(street, "assay") !== undefined,
      caps.assayVisible,
      "Assay Office presence must match its capability flag",
    );
    assert.deepEqual(facadeById(street, "mining").outfitResources, caps.miningOutfits);

    assert.ok(street.worldWidth > TOWN_REFERENCE_VIEWPORT_WIDTH, "world must exceed the viewport");
    assert.equal(street.exits.length, 2, "every composed street exposes exactly two exits");
    assert.ok(Number.isFinite(street.spawn.x) && Number.isFinite(street.spawn.y), "spawn defined");
  }
});

//============================================
// Negative regression: the retired 9x5 grid town modeled buildings as
// pass-through tunnels -- a full-depth doorway gap let the avatar walk clean
// through several storefronts and out the far side. This test samples many x
// positions across every composed facade, in every current mode, and holds
// north far past the old building's depth; the avatar must never cross north
// of the street.
//============================================

test("town: the avatar cannot walk through or behind any storefront", () => {
  const OLD_BUILDING_DEPTH_PX = 200; // comfortably deeper than the old 9x5 footprint
  const STEP_PX = 10;
  const FRAMES = Math.ceil(OLD_BUILDING_DEPTH_PX / STEP_PX) + 5;
  const SAMPLE_FRACTIONS = [0.05, 0.25, 0.5, 0.75, 0.95];

  for (const row of MODE_TABLE) {
    const street = composeTownStreetForMode(row.mode);
    for (const facade of street.facades) {
      for (const fraction of SAMPLE_FRACTIONS) {
        const x = facade.facadeRect.x + fraction * facade.facadeRect.width;
        const start = { x, y: street.streetLaneY };
        const positions = pushNorthFrames(street, start, FRAMES, STEP_PX, R, new Set());
        const settled = positions[positions.length - 1].y;
        assert.ok(
          settled >= street.facadeBottomY,
          `${row.mode} ${facade.id} at x=${x.toFixed(1)} let the avatar cross north of the ` +
            `street (y=${settled}); the old 9x5 model's full-depth doorway gaps did exactly this`,
        );
      }
    }
  }
});
