// Node unit tests for the overworld placement driver
// (tests/e2e/walkthrough_overworld.mjs). Exercises the driver against a
// fake page (recording clicks/keypresses, no real browser) and fake
// projection/cell readers, proving: (a) the direction provider steps toward a
// target cell (columns before rows) and the arrival predicate fires on the
// target, (b) executePlaceMule verifies a placement through the projection and
// increments verifiedPlacements only when the plot gains a seat-0 M.U.L.E., and
// (c) the tick-budget guard ends the turn (end-turn click + truncatedTurns
// increment) without ever calling report.fail.
//
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  executePlaceMule,
  maybeTruncateTurn,
  planCommitsBudget,
  shouldTruncate,
  overworldArrived,
  overworldHeading,
  overworldObstacles,
  firstStepAvoiding,
  DEVELOP_TRUNCATE_RESERVE_TICKS,
} from "../tests/e2e/walkthrough_overworld.mjs";
import { createWalkReport } from "../tests/e2e/walkthrough_report.mjs";

// A fake page recording every click selector and keypress. waitForTimeout
// resolves immediately (no real timer), keeping tests fast. `cell` is the fake
// overworld avatar's current position, moved by the injected readCell/walk.
function fakePage() {
  const page = {
    clicks: [],
    keypresses: [],
    async click(selector) {
      page.clicks.push(selector);
    },
    keyboard: {
      async press(key) {
        page.keypresses.push(key);
      },
    },
    async waitForTimeout() {
      // no-op: tests drive progress through scripted readers, not elapsed time.
    },
  };
  return page;
}

// Build a develop projection whose plots grid is `plots` (a 2D array of Plot),
// with a develop payload carrying `ticksRemaining`.
function developProjection(plots, ticksRemaining) {
  return {
    state: {
      phase: { kind: "develop", payload: { activePlayer: 0, ticksRemaining } },
      plots,
      players: [{}, {}, {}, {}],
      round: 1,
    },
    phaseKind: "develop",
    activePlayerId: 0,
    humanMoney: 100,
    sweepRow: null,
    sweepCol: null,
  };
}

// A single empty owned plot grid: one row, one column, owner 0, no M.U.L.E.
function emptyOwnedPlots() {
  return [[{ terrain: "plain", owner: 0, muleOutfit: null }]];
}

//============================================
test("overworldHeading: steps columns before rows toward the target cell", async () => {
  const page = { cell: { row: 0, col: 0 } };
  const readCell = async (p) => p.cell;
  const heading = overworldHeading({ row: 2, col: 2 }, readCell);

  // From (0,0) the column is resolved first: right until col matches.
  assert.equal(await heading(page), "ArrowRight");
  page.cell = { row: 0, col: 2 };
  // Column matched; now the row is resolved: down until row matches.
  assert.equal(await heading(page), "ArrowDown");
  page.cell = { row: 2, col: 2 };
  // On the target cell there is no step to take.
  assert.equal(await heading(page), null);
});

//============================================
test("overworldHeading: null cell yields a null heading (stall signal)", async () => {
  const readCell = async () => null;
  const heading = overworldHeading({ row: 1, col: 1 }, readCell);
  assert.equal(await heading({}), null);
});

//============================================
// A 5x9 board with the town at (2, 4), mirroring the seed-33 geometry that
// exposed the town-reentry bug: the human's plot (0, 4) shares the town's
// column, so a naive columns-before-rows step from the town's west neighbor
// (2, 3) walks straight back onto the town cell.
function boardWithTownAt(townRow, townCol, rows = 5, cols = 9) {
  const plots = [];
  for (let row = 0; row < rows; row++) {
    const cells = [];
    for (let col = 0; col < cols; col++) {
      const terrain = row === townRow && col === townCol ? "town" : "plain";
      cells.push({ terrain, owner: null, muleOutfit: null });
    }
    plots.push(cells);
  }
  return plots;
}

//============================================
test("overworldObstacles: reports grid bounds and every town cell as blocked", () => {
  const state = { plots: boardWithTownAt(2, 4) };
  const { bounds, blocked } = overworldObstacles(state);
  assert.deepEqual(bounds, { rows: 5, cols: 9 });
  assert.equal(blocked.has("2,4"), true);
  assert.equal(blocked.has("0,4"), false);
  assert.equal(blocked.size, 1);
});

//============================================
test("firstStepAvoiding: routes around the town instead of stepping onto it", () => {
  const { bounds, blocked } = overworldObstacles({ plots: boardWithTownAt(2, 4) });
  // From the town's west neighbor (2, 3) toward the plot (0, 4): a straight
  // columns-first step would go ArrowRight onto the town (2, 4); the BFS detours
  // upward (ArrowUp) so the avatar never re-enters the town scene.
  assert.equal(
    firstStepAvoiding({ row: 2, col: 3 }, { row: 0, col: 4 }, blocked, bounds),
    "ArrowUp",
  );
  // Once clear of the town's row, the column can be closed directly.
  assert.equal(
    firstStepAvoiding({ row: 0, col: 3 }, { row: 0, col: 4 }, blocked, bounds),
    "ArrowRight",
  );
});

//============================================
test("firstStepAvoiding: takes the straight step when nothing blocks it", () => {
  const { bounds, blocked } = overworldObstacles({ plots: boardWithTownAt(4, 8) });
  // No obstacle between (2, 3) and (0, 4): columns resolve first, exactly like
  // directionToward, so the BFS returns ArrowRight.
  assert.equal(
    firstStepAvoiding({ row: 2, col: 3 }, { row: 0, col: 4 }, blocked, bounds),
    "ArrowRight",
  );
  // Already on the target: no step.
  assert.equal(firstStepAvoiding({ row: 0, col: 4 }, { row: 0, col: 4 }, blocked, bounds), null);
});

//============================================
test("firstStepAvoiding: returns null when the target is walled off", () => {
  // Box the target cell (1, 1) in with blocked cells on all four sides so no
  // path exists; the walk treats a null step as a stall signal.
  const blocked = new Set(["0,1", "2,1", "1,0", "1,2"]);
  const step = firstStepAvoiding({ row: 3, col: 3 }, { row: 1, col: 1 }, blocked, {
    rows: 5,
    cols: 5,
  });
  assert.equal(step, null);
});

//============================================
test("overworldArrived: true only on the target cell", async () => {
  const page = { cell: { row: 1, col: 3 } };
  const readCell = async (p) => p.cell;
  const arrived = overworldArrived({ row: 1, col: 3 }, readCell);
  assert.equal(await arrived(page), true);
  page.cell = { row: 1, col: 2 };
  assert.equal(await arrived(page), false);
});

//============================================
test("executePlaceMule: verifies placement and increments verifiedPlacements", async () => {
  const page = fakePage();
  // The plot starts empty and owned by seat 0; the action key installs a
  // M.U.L.E. by flipping muleOutfit, which the projection then reflects.
  const plots = emptyOwnedPlots();
  const readProjection = async () => developProjection(plots, 40);
  page.keyboard.press = async (key) => {
    page.keypresses.push(key);
    plots[0][0] = { terrain: "plain", owner: 0, muleOutfit: "food" };
  };
  // A fake walk that "arrives" immediately (returns true without moving).
  const walk = async () => true;

  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  const ok = await executePlaceMule(
    page,
    report,
    { readProjection, walkToCell: walk },
    { row: 0, col: 0 },
  );

  assert.equal(ok, true);
  assert.deepEqual(page.keypresses, ["Enter"]);
  assert.equal(report.counters.verifiedPlacements, 1);
  assert.equal(report.hasFailed(), false);
});

//============================================
test("executePlaceMule: a no-op key never verifies and reports act_did_not_advance", async () => {
  const page = fakePage();
  // The plot stays empty (the key was a no-op: nothing carried, say), so the
  // projection never shows a placement and verification must fail.
  const plots = emptyOwnedPlots();
  const readProjection = async () => developProjection(plots, 40);
  const walk = async () => true;

  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  const ok = await executePlaceMule(
    page,
    report,
    {
      readProjection,
      walkToCell: walk,
      placeVerifyBudgetMs: 0,
    },
    { row: 0, col: 0 },
  );

  assert.equal(ok, false);
  assert.equal(report.counters.verifiedPlacements, 0);
  assert.equal(report.hasFailed(), true);
});

//============================================
test("executePlaceMule: a stalled walk never presses the action key", async () => {
  const page = fakePage();
  const plots = emptyOwnedPlots();
  const readProjection = async () => developProjection(plots, 40);
  // A fake walk that reports a stall (as walkOverworldAvatarToCell does when it
  // gives up).
  const walk = async () => false;

  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  const ok = await executePlaceMule(
    page,
    report,
    { readProjection, walkToCell: walk },
    { row: 0, col: 0 },
  );

  assert.equal(ok, false);
  assert.deepEqual(page.keypresses, []);
  assert.equal(report.counters.verifiedPlacements, 0);
});

//============================================
test("shouldTruncate: true at or below the reserve, false above it and off-phase", () => {
  const developState = (ticks) => developProjection(emptyOwnedPlots(), ticks).state;
  assert.equal(shouldTruncate(developState(DEVELOP_TRUNCATE_RESERVE_TICKS)), true);
  assert.equal(shouldTruncate(developState(DEVELOP_TRUNCATE_RESERVE_TICKS - 1)), true);
  assert.equal(shouldTruncate(developState(DEVELOP_TRUNCATE_RESERVE_TICKS + 1)), false);
  // A custom reserve override is honored.
  assert.equal(shouldTruncate(developState(9), 10), true);
  // Off-phase states have nothing to truncate.
  assert.equal(shouldTruncate({ phase: { kind: "auction", payload: {} } }), false);
});

//============================================
test("planCommitsBudget: true for buy/outfit/place, false for turn-ending kinds", () => {
  // Budget-committing acquisition gestures the reserve guards.
  assert.equal(planCommitsBudget({ kind: "buy_mule" }), true);
  assert.equal(planCommitsBudget({ kind: "outfit_mule", resource: "food" }), true);
  assert.equal(planCommitsBudget({ kind: "place_mule", row: 0, col: 0 }), true);
  // Natural turn ends and free opportunistic skips are never truncations.
  assert.equal(planCommitsBudget({ kind: "gamble_pub" }), false);
  assert.equal(planCommitsBudget({ kind: "end_turn" }), false);
  assert.equal(planCommitsBudget({ kind: "hunt_wampus", opportunistic: true }), false);
  assert.equal(
    planCommitsBudget({ kind: "assay_plot", row: 0, col: 0, opportunistic: true }),
    false,
  );
});

//============================================
test("maybeTruncateTurn: low ticks + committing plan end the turn and count a truncation, no fail", async () => {
  const page = fakePage();
  const state = developProjection(emptyOwnedPlots(), 2).state;
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });

  const truncated = await maybeTruncateTurn(page, report, {}, { kind: "buy_mule" }, state);

  assert.equal(truncated, true);
  assert.deepEqual(page.clicks, ['[data-action="develop-end-turn"]']);
  assert.equal(report.counters.truncatedTurns, 1);
  assert.equal(report.hasFailed(), false);
});

//============================================
test("maybeTruncateTurn: low ticks + turn-ending gamble ends the turn but is not counted", async () => {
  const page = fakePage();
  const state = developProjection(emptyOwnedPlots(), 2).state;
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });

  const truncated = await maybeTruncateTurn(page, report, {}, { kind: "gamble_pub" }, state);

  // The turn ends at the budget floor (same end-turn click, same gameplay as a
  // committing truncation), but a plan that was going to end the turn anyway is
  // the natural close, not a truncation, so the counter stays put.
  assert.equal(truncated, true);
  assert.deepEqual(page.clicks, ['[data-action="develop-end-turn"]']);
  assert.equal(report.counters.truncatedTurns, 0);
  assert.equal(report.hasFailed(), false);
});

//============================================
test("maybeTruncateTurn: ample ticks leave the turn running", async () => {
  const page = fakePage();
  const state = developProjection(emptyOwnedPlots(), 40).state;
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });

  const truncated = await maybeTruncateTurn(page, report, {}, { kind: "buy_mule" }, state);

  assert.equal(truncated, false);
  assert.deepEqual(page.clicks, []);
  assert.equal(report.counters.truncatedTurns, 0);
});
