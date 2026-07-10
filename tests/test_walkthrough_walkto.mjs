// Fake-page unit tests for the shared spatial walk helpers in
// tests/e2e/walkthrough_helpers.mjs. These cover the pure grid math
// (directionToward) and the walkTo control flow (arrival, stall classification,
// null-direction handling) without launching a browser: a fake "page" supplies
// just the handful of methods walkTo touches (page.$, page.keyboard.down/up,
// page.waitForTimeout). The real browser walk is exercised separately by the
// calibration harness and the targeted seed-33 town-entry run.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  TOWN_AVATAR,
  OVERWORLD_AVATAR,
  directionToward,
  walkTo,
  parseTranslateX,
  horizontalSeekKey,
  walkTownAvatarToDoor,
  walkOverworldAvatarToCell,
} from "./e2e/walkthrough_helpers.mjs";
import { firstStepAvoiding } from "./e2e/walkthrough_overworld.mjs";

//============================================
// Town street geometry mirrored from src/ui/scenes/zones.ts for the seek fakes:
// a 64px cell, door centers at col*64+32 for the left-to-right door order.
const CELL_PX = 64;
const DOOR_CENTERS = {
  corral: 96,
  "counter-food": 160,
  "counter-energy": 224,
  "counter-smithore": 288,
  "counter-crystite": 352,
  pub: 416,
  assay: 480,
};

//============================================
/**
 * The door whose 64px cell contains `x`, mirroring town_scene.tsx's per-frame
 * townDoorAt so a fake avatar's data-at-door tracks its pixel position.
 *
 * @param x - The avatar center x in town pixel space.
 * @returns The door id, or null in the gaps.
 */
function doorAtX(x) {
  for (const [door, center] of Object.entries(DOOR_CENTERS)) {
    if (x >= center - CELL_PX / 2 && x < center + CELL_PX / 2) {
      return door;
    }
  }
  return null;
}

//============================================
/**
 * Build a fake town page whose avatar moves along the street: each walk tap
 * (down, waitForTimeout(ms), up) advances the avatar `pxPerMs * ms` in the held
 * direction, and data-at-door tracks the resulting pixel column exactly like
 * town_scene.tsx. A `pxPerMs` above CELL_PX / tapMs reproduces the fast-speed
 * overshoot regime the seek must correct.
 *
 * @param startX - The avatar's starting center x.
 * @param pxPerMs - Pixels moved per real-ms of held key (0 = motionless).
 * @returns `{ page, state }` where state.x is the live avatar position.
 */
function townSeekFake(startX, pxPerMs) {
  const state = { x: startX, held: null, lastTapMs: 0 };
  const page = {
    async $(selector) {
      if (selector === TOWN_AVATAR) {
        return {
          async getAttribute(name) {
            if (name === "transform") {
              return `translate(${state.x} 0)`;
            }
            if (name === "data-at-door") {
              return doorAtX(state.x);
            }
            return null;
          },
        };
      }
      const marker = selector.match(/^\[data-door-for='(.+)'\] use$/);
      if (marker !== null) {
        const center = DOOR_CENTERS[marker[1]];
        if (center === undefined) {
          return null;
        }
        return {
          async getAttribute(name) {
            if (name === "x") {
              return String(center - 14);
            }
            if (name === "width") {
              return "28";
            }
            return null;
          },
        };
      }
      return null;
    },
    keyboard: {
      async down(key) {
        state.held = key;
      },
      async up() {
        if (state.held === "ArrowRight") {
          state.x += pxPerMs * state.lastTapMs;
        } else if (state.held === "ArrowLeft") {
          state.x -= pxPerMs * state.lastTapMs;
        }
        state.held = null;
      },
    },
    async waitForTimeout(ms) {
      state.lastTapMs = ms;
    },
  };
  return { page, state };
}

//============================================
/**
 * Build a fake avatar element handle whose `transform` attribute the caller
 * controls via a supplier, so a test can make the avatar "move" (changing
 * transform) or "stall" (constant transform) tap over tap.
 *
 * @param transformSupplier - `() => string | null` returning the current
 *   transform each read.
 * @returns A handle exposing the async getAttribute walkTo reads.
 */
function fakeAvatarHandle(transformSupplier) {
  return {
    async getAttribute(name) {
      if (name === "transform") {
        return transformSupplier();
      }
      return null;
    },
  };
}

//============================================
/**
 * Build a fake Playwright page exposing only what walkTo uses: a query that
 * returns the fake avatar handle, a no-op keyboard, and an instant timeout.
 *
 * @param handle - The fake avatar handle page.$ resolves to.
 * @returns A fake page object.
 */
function fakePage(handle) {
  return {
    async $() {
      return handle;
    },
    keyboard: {
      async down() {},
      async up() {},
    },
    async waitForTimeout() {},
  };
}

//============================================
/**
 * Build a fake walk report capturing every fail() call for assertions.
 *
 * @returns `{ fail, calls }` where calls records `{ kind, message }` entries.
 */
function fakeReport() {
  const calls = [];
  return {
    calls,
    fail(kind, message) {
      calls.push({ kind, message });
    },
  };
}

//============================================
test("directionToward steps columns before rows and returns null at the target", () => {
  assert.equal(directionToward({ row: 2, col: 3 }, { row: 2, col: 5 }), "ArrowRight");
  assert.equal(directionToward({ row: 2, col: 5 }, { row: 2, col: 3 }), "ArrowLeft");
  assert.equal(directionToward({ row: 4, col: 3 }, { row: 6, col: 3 }), "ArrowDown");
  assert.equal(directionToward({ row: 4, col: 3 }, { row: 1, col: 3 }), "ArrowUp");
  // Column mismatch wins even when a row also differs (one axis at a time).
  assert.equal(directionToward({ row: 4, col: 3 }, { row: 1, col: 5 }), "ArrowRight");
  assert.equal(directionToward({ row: 2, col: 3 }, { row: 2, col: 3 }), null);
});

//============================================
test("walkTo returns true once the predicate holds and never reports a stall", async () => {
  // Avatar transform advances every read, so no tap ever looks stalled.
  let ticks = 0;
  const page = fakePage(fakeAvatarHandle(() => `translate(${ticks++} 0)`));
  const report = fakeReport();
  // Predicate becomes true on its third check (after two taps of progress).
  let checks = 0;
  const predicate = async () => ++checks >= 3;

  const reached = await walkTo(page, "sel", predicate, "ArrowRight", 60, {
    report,
    tapMs: 0,
    stallTaps: 3,
  });

  assert.equal(reached, true);
  assert.equal(report.calls.length, 0);
});

//============================================
test("walkTo classifies a motionless avatar as walk_stall after stallTaps", async () => {
  // Constant transform: every tap snapshots identically, so the stall counter
  // climbs each tap.
  const page = fakePage(fakeAvatarHandle(() => "translate(0 0)"));
  const report = fakeReport();

  const reached = await walkTo(page, "sel", async () => false, "ArrowRight", 60, {
    report,
    tapMs: 0,
    stallTaps: 4,
  });

  assert.equal(reached, false);
  assert.equal(report.calls.length, 1);
  assert.equal(report.calls[0].kind, "walk_stall");
});

//============================================
test("walkTo treats a null direction-provider result as a stalled tap", async () => {
  const page = fakePage(fakeAvatarHandle(() => "translate(0 0)"));
  const report = fakeReport();
  // Provider never offers a step; predicate never holds -> stall classified.
  const provider = async () => null;

  const reached = await walkTo(page, "sel", async () => false, provider, 60, {
    report,
    tapMs: 0,
    stallTaps: 5,
  });

  assert.equal(reached, false);
  assert.equal(report.calls.length, 1);
  assert.equal(report.calls[0].kind, "walk_stall");
});

//============================================
test("walkTo without a report still returns false on stall (no throw)", async () => {
  const page = fakePage(fakeAvatarHandle(() => "translate(0 0)"));

  const reached = await walkTo(page, "sel", async () => false, "ArrowRight", 60, {
    tapMs: 0,
    stallTaps: 3,
  });

  assert.equal(reached, false);
});

//============================================
test("parseTranslateX reads the x of a translate transform and rejects the rest", () => {
  assert.equal(parseTranslateX("translate(288 160)"), 288);
  assert.equal(parseTranslateX("translate( -12.5  4 )"), -12.5);
  assert.equal(parseTranslateX(null), null);
  assert.equal(parseTranslateX("rotate(45)"), null);
});

//============================================
test("horizontalSeekKey steers toward the target and returns null when aligned", () => {
  assert.equal(horizontalSeekKey(96, 288), "ArrowRight");
  // Past the target: the key flips to walk back, which a fixed heading cannot.
  assert.equal(horizontalSeekKey(326, 288), "ArrowLeft");
  assert.equal(horizontalSeekKey(288, 288), null);
});

//============================================
test("walkTownAvatarToDoor corrects an overshoot past a mid-street door", async () => {
  // pxPerMs 0.64 at the default 120ms tap steps 76.8px -- over one 64px cell,
  // so a full tap sails past the target and must be walked back. This is the
  // exact fast-speed regime that stalled the counter-smithore walk.
  const { page, state } = townSeekFake(DOOR_CENTERS.corral, 0.64);
  const report = fakeReport();

  const reached = await walkTownAvatarToDoor(page, report, "counter-smithore");

  assert.equal(reached, true);
  assert.equal(report.calls.length, 0);
  // The corrected avatar ends inside the smithore cell, not sailed off east.
  assert.equal(doorAtX(state.x), "counter-smithore");
});

//============================================
test("walkTownAvatarToDoor reaches a mid-street door without overshoot at a safe speed", async () => {
  // pxPerMs 0.32 steps 38.4px per tap -- under a cell, so the seek arrives
  // straight without ever needing to reverse.
  const { page, state } = townSeekFake(DOOR_CENTERS.corral, 0.32);
  const report = fakeReport();

  const reached = await walkTownAvatarToDoor(page, report, "counter-energy");

  assert.equal(reached, true);
  assert.equal(report.calls.length, 0);
  assert.equal(doorAtX(state.x), "counter-energy");
});

//============================================
test("walkTownAvatarToDoor rejects a neighbor door and reports a stall when stuck", async () => {
  // Motionless avatar parked at the crystite door (a neighbor of the target):
  // the seek must not accept the wrong door, and with no movement possible it
  // classifies a walk_stall rather than returning true.
  const { page } = townSeekFake(DOOR_CENTERS["counter-crystite"], 0);
  const report = fakeReport();

  const reached = await walkTownAvatarToDoor(page, report, "counter-smithore", {
    budget: 40,
    stallTaps: 4,
  });

  assert.equal(reached, false);
  assert.equal(report.calls.length, 1);
  assert.equal(report.calls[0].kind, "walk_stall");
});

//============================================
test("walkTownAvatarToDoor returns immediately when already at the target door", async () => {
  const { page } = townSeekFake(DOOR_CENTERS["counter-smithore"], 0);
  const report = fakeReport();

  const reached = await walkTownAvatarToDoor(page, report, "counter-smithore");

  assert.equal(reached, true);
  assert.equal(report.calls.length, 0);
});

//============================================
/**
 * The grid cell a walker pixel position falls in, mirroring walker.ts
 * cellFromPosition (floor(px / 64) on each axis).
 *
 * @param x - The avatar center x in walker pixel space.
 * @param y - The avatar center y in walker pixel space.
 * @returns The `{ row, col }` cell.
 */
function cellAtXY(x, y) {
  return { row: Math.floor(y / CELL_PX), col: Math.floor(x / CELL_PX) };
}

//============================================
/**
 * Build a fake overworld page whose avatar moves on the 2D grid: each walk tap
 * (down, waitForTimeout(ms), up) advances the avatar `pxPerMs * ms` in the held
 * cardinal direction (axis-locked, like walker.ts under a single held key), and
 * data-cell-row/col track the resulting pixel cell exactly like
 * overworld_scene.tsx. A `pxPerMs` above CELL_PX / tapMs reproduces the
 * fast-speed regime where one tap steps more than a cell -- the overshoot the
 * seek must correct. The fake has no bounds clamp, so an overshoot past a target
 * row/col is corrected purely by the tap-halving, not by an edge wall.
 *
 * @param startCell - The avatar's starting `{ row, col }` cell (spawned centered).
 * @param pxPerMs - Pixels moved per real-ms of held key (0 = motionless).
 * @returns `{ page, state }` where state.x/state.y is the live avatar center.
 */
function overworldSeekFake(startCell, pxPerMs) {
  const state = {
    x: (startCell.col + 0.5) * CELL_PX,
    y: (startCell.row + 0.5) * CELL_PX,
    held: null,
    lastTapMs: 0,
  };
  const page = {
    async $(selector) {
      if (selector !== OVERWORLD_AVATAR) {
        return null;
      }
      return {
        async getAttribute(name) {
          if (name === "transform") {
            return `translate(${state.x} ${state.y})`;
          }
          if (name === "data-cell-row") {
            return String(Math.floor(state.y / CELL_PX));
          }
          if (name === "data-cell-col") {
            return String(Math.floor(state.x / CELL_PX));
          }
          return null;
        },
      };
    },
    keyboard: {
      async down(key) {
        state.held = key;
      },
      async up() {
        const dist = pxPerMs * state.lastTapMs;
        if (state.held === "ArrowRight") {
          state.x += dist;
        } else if (state.held === "ArrowLeft") {
          state.x -= dist;
        } else if (state.held === "ArrowDown") {
          state.y += dist;
        } else if (state.held === "ArrowUp") {
          state.y -= dist;
        }
        state.held = null;
      },
    },
    async waitForTimeout(ms) {
      state.lastTapMs = ms;
    },
  };
  return { page, state };
}

//============================================
test("walkOverworldAvatarToCell corrects a >1-cell overshoot and lands on the target cell", async () => {
  // pxPerMs 0.64 at the default 120ms tap steps 76.8px -- over one 64px cell, so
  // a full tap sails past the target cell and, without correction, oscillates
  // around it forever (the place_mule walk stall). Both axes must converge.
  const { page, state } = overworldSeekFake({ row: 3, col: 0 }, 0.64);
  const report = fakeReport();

  const reached = await walkOverworldAvatarToCell(page, report, { row: 0, col: 4 });

  assert.equal(reached, true);
  assert.equal(report.calls.length, 0);
  // The corrected avatar ends inside the target cell, not oscillating past it.
  assert.deepEqual(cellAtXY(state.x, state.y), { row: 0, col: 4 });
});

//============================================
test("walkOverworldAvatarToCell reaches the target without overshoot at a safe speed", async () => {
  // pxPerMs 0.32 steps 38.4px per tap -- under a cell, so the seek arrives
  // straight on both axes without ever needing to reverse.
  const { page, state } = overworldSeekFake({ row: 5, col: 6 }, 0.32);
  const report = fakeReport();

  const reached = await walkOverworldAvatarToCell(page, report, { row: 2, col: 1 });

  assert.equal(reached, true);
  assert.equal(report.calls.length, 0);
  assert.deepEqual(cellAtXY(state.x, state.y), { row: 2, col: 1 });
});

//============================================
test("walkOverworldAvatarToCell returns immediately when already on the target cell", async () => {
  const { page } = overworldSeekFake({ row: 2, col: 4 }, 0);
  const report = fakeReport();

  const reached = await walkOverworldAvatarToCell(page, report, { row: 2, col: 4 });

  assert.equal(reached, true);
  assert.equal(report.calls.length, 0);
});

//============================================
test("walkOverworldAvatarToCell reports a stall when the avatar cannot move", async () => {
  // Motionless avatar one cell from the target: no tap changes its snapshot, so
  // the seek classifies a walk_stall rather than spinning the whole budget.
  const { page } = overworldSeekFake({ row: 0, col: 0 }, 0);
  const report = fakeReport();

  const reached = await walkOverworldAvatarToCell(
    page,
    report,
    { row: 0, col: 3 },
    {
      stallTaps: 4,
    },
  );

  assert.equal(reached, false);
  assert.equal(report.calls.length, 1);
  assert.equal(report.calls[0].kind, "walk_stall");
});

//============================================
test("walkOverworldAvatarToCell reports a stall when the avatar node has vanished", async () => {
  // page.$ resolves null (the scene unmounted): the seek reports the vanish as a
  // walk_stall failure rather than reading a fabricated cell.
  const page = {
    async $() {
      return null;
    },
    keyboard: { async down() {}, async up() {} },
    async waitForTimeout() {},
  };
  const report = fakeReport();

  const reached = await walkOverworldAvatarToCell(page, report, { row: 1, col: 1 });

  assert.equal(reached, false);
  assert.equal(report.calls.length, 1);
  assert.equal(report.calls[0].kind, "walk_stall");
});

//============================================
test("walkOverworldAvatarToCell routes around a blocked cell via the injected nextStep", async () => {
  // Seed-33 geometry: town at (2, 4), avatar exits west to (2, 3), target plot
  // (0, 4) shares the town's column. A straight step would re-enter the town;
  // firstStepAvoiding detours the avatar around it.
  const { page, state } = overworldSeekFake({ row: 2, col: 3 }, 0.32);
  const report = fakeReport();
  const blocked = new Set(["2,4"]);
  const bounds = { rows: 5, cols: 9 };
  const target = { row: 0, col: 4 };
  const visited = [];
  const nextStep = (current) => {
    visited.push(`${current.row},${current.col}`);
    return firstStepAvoiding(current, target, blocked, bounds);
  };

  const reached = await walkOverworldAvatarToCell(page, report, target, { nextStep });

  assert.equal(reached, true);
  assert.equal(report.calls.length, 0);
  assert.deepEqual(cellAtXY(state.x, state.y), target);
  // The avatar was never routed onto the blocked town cell.
  assert.equal(visited.includes("2,4"), false);
});

//============================================
test("walkOverworldAvatarToCell reports a stall when the injected nextStep offers no step", async () => {
  const { page } = overworldSeekFake({ row: 1, col: 1 }, 0.32);
  const report = fakeReport();

  const reached = await walkOverworldAvatarToCell(
    page,
    report,
    { row: 0, col: 0 },
    {
      nextStep: () => null,
      stallTaps: 3,
    },
  );

  assert.equal(reached, false);
  assert.equal(report.calls.length, 1);
  assert.equal(report.calls[0].kind, "walk_stall");
});
