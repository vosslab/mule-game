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
  OVERWORLD_AVATAR,
  directionToward,
  walkTo,
  walkOverworldAvatarToCell,
} from "./e2e/walkthrough_helpers.mjs";
import { firstStepAvoiding } from "./e2e/walkthrough_overworld.mjs";

//============================================
// Overworld grid geometry mirrored from src/ui/scenes/zones.ts for the seek
// fakes: a 64px cell.
const CELL_PX = 64;

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
