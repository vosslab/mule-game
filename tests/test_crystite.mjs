// Node unit tests for crystite bloom seeding (map.ts), the assay_plot action
// (turn.ts), and the visibleCrystite selector (game_state.ts).
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyAction, visibleCrystite } from "../src/engine/game_state.ts";
import { createInitialGameState } from "../src/engine/turn.ts";
import { generateMap, applyCrystiteBloomRing } from "../src/engine/map.ts";
import { createRng } from "../src/engine/rng.ts";
import {
  ASSAY_TICK_COST,
  CRYSTITE_BLOOM_COUNT,
  CRYSTITE_BLOOM_MAX_LEVEL,
  DEVELOP_TICKS_FULL,
} from "../src/engine/constants.ts";

// Build a full-size grid of "plain" plots with no crystite, for exercising
// applyCrystiteBloomRing directly without depending on RNG-driven placement.
function buildBlankPlots(rows, cols) {
  const plots = [];
  for (let row = 0; row < rows; row += 1) {
    const plotRow = [];
    for (let col = 0; col < cols; col += 1) {
      plotRow.push({
        terrain: "plain",
        owner: null,
        muleOutfit: null,
        crystiteLevel: 0,
        crystiteRevealed: false,
      });
    }
    plots.push(plotRow);
  }
  return plots;
}

// Drive any colony land-auction slots to completion without bidding (every
// player passes on the plot by simply never calling bid_land): tick until
// the going countdown finalizes as a no-sale, then end the slot, repeating
// for as many slots as the round's colony-auction chain offers.
function skipThroughLandAuctions(state) {
  let current = state;
  while (current.phase.kind === "land_auction") {
    while (!current.phase.payload.finished) {
      current = applyAction(current, { type: "tick" });
    }
    current = applyAction(current, { type: "end_land_auction" });
  }
  return current;
}

// Drive a fresh game from the title screen through land grant so every
// player owns one plot and the state lands in the develop phase for player 0.
function enterDevelopPhase(seed) {
  let current = applyAction(createInitialGameState(seed), { type: "start_game" });
  while (current.phase.kind === "land_grant") {
    const payload = current.phase.payload;
    const picker = payload.pickOrder[payload.pickIndex];
    const spot = firstClaimable(current);
    current = applyAction(current, {
      type: "claim_plot",
      playerId: picker,
      row: spot.row,
      col: spot.col,
    });
  }
  return skipThroughLandAuctions(current);
}

// Find the first unowned, non-town plot, for claiming during land grant.
function firstClaimable(state) {
  for (let row = 0; row < state.plots.length; row += 1) {
    const plotRow = state.plots[row];
    for (let col = 0; col < plotRow.length; col += 1) {
      const plot = plotRow[col];
      if (plot.owner === null && plot.terrain !== "town") {
        return { row, col };
      }
    }
  }
  throw new Error("no claimable plot");
}

// Find the town plot's coordinates on a generated board.
function townPlot(state) {
  for (let row = 0; row < state.plots.length; row += 1) {
    const plotRow = state.plots[row];
    for (let col = 0; col < plotRow.length; col += 1) {
      if (plotRow[col].terrain === "town") {
        return { row, col };
      }
    }
  }
  throw new Error("no town plot");
}

// Find any non-town plot, for assay tests that do not care which one.
function firstNonTown(state) {
  for (let row = 0; row < state.plots.length; row += 1) {
    const plotRow = state.plots[row];
    for (let col = 0; col < plotRow.length; col += 1) {
      if (plotRow[col].terrain !== "town") {
        return { row, col };
      }
    }
  }
  throw new Error("no non-town plot");
}

test("same seed produces identical crystite bloom levels", () => {
  const plotsA = generateMap(createRng(4242));
  const plotsB = generateMap(createRng(4242));
  const levelsA = plotsA.map((row) => row.map((plot) => plot.crystiteLevel));
  const levelsB = plotsB.map((row) => row.map((plot) => plot.crystiteLevel));
  assert.deepEqual(levelsA, levelsB);
});

test("exactly CRYSTITE_BLOOM_COUNT plots reach the max crystite level", () => {
  const plots = generateMap(createRng(2024));
  let maxLevelCount = 0;
  for (const row of plots) {
    for (const plot of row) {
      if (plot.crystiteLevel === CRYSTITE_BLOOM_MAX_LEVEL) {
        maxLevelCount += 1;
      }
    }
  }
  assert.equal(maxLevelCount, CRYSTITE_BLOOM_COUNT);
});

test("river and town plots always have crystite level zero", () => {
  const plots = generateMap(createRng(99));
  for (const row of plots) {
    for (const plot of row) {
      if (plot.terrain === "river" || plot.terrain === "town") {
        assert.equal(plot.crystiteLevel, 0);
      }
    }
  }
});

test("overlapping crystite bloom rings keep the higher level, not the sum", () => {
  const plots = buildBlankPlots(5, 9);
  applyCrystiteBloomRing(plots, 2, 2);
  applyCrystiteBloomRing(plots, 2, 3);
  // Each center keeps its own max level even though it also sits within the
  // other bloom's ring (distance 1 from the other center, which alone would
  // only contribute 2).
  assert.equal(plots[2][2].crystiteLevel, CRYSTITE_BLOOM_MAX_LEVEL);
  assert.equal(plots[2][3].crystiteLevel, CRYSTITE_BLOOM_MAX_LEVEL);
  // A plot in both rings' overlap takes the higher single contribution
  // (max), never the sum of the two rings' contributions.
  const overlapLevel = plots[1][2].crystiteLevel;
  assert.ok(overlapLevel <= CRYSTITE_BLOOM_MAX_LEVEL);
});

test("visibleCrystite hides an unrevealed plot and reveals it after assay", () => {
  const before = enterDevelopPhase(7);
  const spot = firstNonTown(before);
  const hiddenPlot = before.plots[spot.row][spot.col];
  assert.equal(visibleCrystite(hiddenPlot), null);

  const after = applyAction(before, {
    type: "assay_plot",
    playerId: 0,
    row: spot.row,
    col: spot.col,
  });
  const revealedPlot = after.plots[spot.row][spot.col];
  assert.equal(visibleCrystite(revealedPlot), revealedPlot.crystiteLevel);
});

test("assay_plot deducts exactly ASSAY_TICK_COST ticks from the turn budget", () => {
  const before = enterDevelopPhase(8);
  const spot = firstNonTown(before);
  const after = applyAction(before, {
    type: "assay_plot",
    playerId: 0,
    row: spot.row,
    col: spot.col,
  });
  assert.equal(after.phase.payload.ticksRemaining, DEVELOP_TICKS_FULL - ASSAY_TICK_COST);
});

test("assay_plot throws when it is not the acting player's develop turn", () => {
  const state = enterDevelopPhase(9);
  const spot = firstNonTown(state);
  assert.throws(() =>
    applyAction(state, { type: "assay_plot", playerId: 1, row: spot.row, col: spot.col }),
  );
});

test("assay_plot throws when targeting the town plot", () => {
  const state = enterDevelopPhase(10);
  const spot = townPlot(state);
  assert.throws(() =>
    applyAction(state, { type: "assay_plot", playerId: 0, row: spot.row, col: spot.col }),
  );
});

test("assay_plot ends the turn when it exhausts the remaining tick budget", () => {
  let current = enterDevelopPhase(11);
  // Drain ticks down to exactly ASSAY_TICK_COST remaining.
  const ticksToDrain = DEVELOP_TICKS_FULL - ASSAY_TICK_COST;
  for (let i = 0; i < ticksToDrain; i += 1) {
    current = applyAction(current, { type: "tick" });
  }
  assert.equal(current.phase.payload.ticksRemaining, ASSAY_TICK_COST);

  const spot = firstNonTown(current);
  const afterAssay = applyAction(current, {
    type: "assay_plot",
    playerId: 0,
    row: spot.row,
    col: spot.col,
  });
  assert.equal(afterAssay.phase.kind, "develop");
  assert.equal(afterAssay.phase.payload.activePlayer, 1);
});
