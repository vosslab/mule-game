// Node unit tests for the turn sequencer and land grant (turn.ts, land_grant.ts).
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyAction } from "../src/engine/game_state.ts";
import { createInitialGameState, canBuyMule, hasPlaceablePlot } from "../src/engine/turn.ts";
import { landGrantPickOrder } from "../src/engine/land_grant.ts";
import {
  MULE_BASE_PRICE,
  DEVELOP_TICKS_PER_TURN,
  STARTING_MONEY,
} from "../src/engine/constants.ts";

// Find the first plot a player can legally claim (unowned, not the town).
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

// Find an owned plot with no installed M.U.L.E. for the given player.
function firstOwnedEmpty(state, playerId) {
  for (let row = 0; row < state.plots.length; row += 1) {
    const plotRow = state.plots[row];
    for (let col = 0; col < plotRow.length; col += 1) {
      const plot = plotRow[col];
      if (plot.owner === playerId && plot.muleOutfit === null) {
        return { row, col };
      }
    }
  }
  throw new Error("no owned empty plot");
}

// Drive the land grant with every player claiming one plot in pick order.
function claimThroughLandGrant(state) {
  let current = state;
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
  return current;
}

test("start_game moves title to land_grant", () => {
  const state = createInitialGameState(1234);
  assert.equal(state.phase.kind, "title");
  const started = applyAction(state, { type: "start_game" });
  assert.equal(started.phase.kind, "land_grant");
  assert.equal(started.round, 1);
});

test("snake order reverses on even rounds", () => {
  assert.deepEqual(landGrantPickOrder(1, 4), [0, 1, 2, 3]);
  assert.deepEqual(landGrantPickOrder(2, 4), [3, 2, 1, 0]);
  assert.deepEqual(landGrantPickOrder(3, 4), [0, 1, 2, 3]);
});

test("full phase cycle: land_grant -> develop x4 -> production -> auction goods order -> next round", () => {
  const started = applyAction(createInitialGameState(42), { type: "start_game" });
  const afterGrant = claimThroughLandGrant(started);
  assert.equal(afterGrant.phase.kind, "develop");
  assert.equal(afterGrant.phase.payload.activePlayer, 0);

  // Each player ends their develop turn in id order 0..3.
  let current = afterGrant;
  for (let playerId = 0; playerId < 4; playerId += 1) {
    assert.equal(current.phase.kind, "develop");
    assert.equal(current.phase.payload.activePlayer, playerId);
    current = applyAction(current, { type: "end_turn", playerId });
  }
  // After the last develop turn we land in production.
  assert.equal(current.phase.kind, "production");
  assert.equal(current.phase.payload.yields.length, 4);

  // A tick advances production to the first good's auction.
  current = applyAction(current, { type: "tick" });
  assert.equal(current.phase.kind, "auction");
  assert.equal(current.phase.payload.good, "food");

  // Goods auction in fixed order food, energy, smithore.
  current = applyAction(current, { type: "end_auction" });
  assert.equal(current.phase.payload.good, "energy");
  current = applyAction(current, { type: "end_auction" });
  assert.equal(current.phase.payload.good, "smithore");

  // After smithore the next round begins with a fresh land grant.
  current = applyAction(current, { type: "end_auction" });
  assert.equal(current.phase.kind, "land_grant");
  assert.equal(current.round, 2);
  // Round 2 uses the reversed snake order.
  assert.deepEqual(current.phase.payload.pickOrder, [3, 2, 1, 0]);
});

test("pass is allowed during land grant", () => {
  const started = applyAction(createInitialGameState(7), { type: "start_game" });
  let current = started;
  // Every player passes; land grant still completes into develop.
  for (let i = 0; i < 4; i += 1) {
    const picker = current.phase.payload.pickOrder[current.phase.payload.pickIndex];
    current = applyAction(current, { type: "pass", playerId: picker });
  }
  assert.equal(current.phase.kind, "develop");
  // No plots were claimed.
  const owned = current.plots.flat().filter((plot) => plot.owner !== null);
  assert.equal(owned.length, 0);
});

test("buy, outfit, and place a M.U.L.E. within the tick budget", () => {
  const started = applyAction(createInitialGameState(99), { type: "start_game" });
  const afterGrant = claimThroughLandGrant(started);
  assert.equal(afterGrant.phase.payload.activePlayer, 0);
  assert.ok(canBuyMule(afterGrant, 0));

  const bought = applyAction(afterGrant, { type: "buy_mule", playerId: 0 });
  assert.equal(bought.phase.payload.carriedMule, "unoutfitted");
  assert.equal(bought.players[0].money, STARTING_MONEY - MULE_BASE_PRICE);

  const outfitted = applyAction(bought, { type: "outfit_mule", playerId: 0, resource: "food" });
  assert.equal(outfitted.phase.payload.carriedMule, "food");

  const spot = firstOwnedEmpty(outfitted, 0);
  const placed = applyAction(outfitted, {
    type: "place_mule",
    playerId: 0,
    row: spot.row,
    col: spot.col,
  });
  assert.equal(placed.phase.payload.carriedMule, "none");
  assert.equal(placed.plots[spot.row][spot.col].muleOutfit, "food");
});

test("timer expiry loses an unplaced M.U.L.E. and ends the develop turn", () => {
  const started = applyAction(createInitialGameState(555), { type: "start_game" });
  const afterGrant = claimThroughLandGrant(started);
  // Player 0 buys and outfits but never places.
  let current = applyAction(afterGrant, { type: "buy_mule", playerId: 0 });
  current = applyAction(current, { type: "outfit_mule", playerId: 0, resource: "energy" });
  assert.equal(current.phase.payload.carriedMule, "energy");

  // Tick until the budget expires; the turn should pass to player 1.
  for (let i = 0; i < DEVELOP_TICKS_PER_TURN; i += 1) {
    current = applyAction(current, { type: "tick" });
  }
  assert.equal(current.phase.kind, "develop");
  assert.equal(current.phase.payload.activePlayer, 1);
  // No M.U.L.E. was installed on any plot owned by player 0.
  const installed = current.plots
    .flat()
    .filter((plot) => plot.owner === 0 && plot.muleOutfit !== null);
  assert.equal(installed.length, 0);
});

test("cancel_placement keeps the carried M.U.L.E. in tow", () => {
  const started = applyAction(createInitialGameState(2468), { type: "start_game" });
  const afterGrant = claimThroughLandGrant(started);
  let current = applyAction(afterGrant, { type: "buy_mule", playerId: 0 });
  current = applyAction(current, { type: "outfit_mule", playerId: 0, resource: "smithore" });
  const cancelled = applyAction(current, { type: "cancel_placement", playerId: 0 });
  assert.equal(cancelled.phase.payload.carriedMule, "smithore");
  // The player can still place it afterward.
  const spot = firstOwnedEmpty(cancelled, 0);
  const placed = applyAction(cancelled, {
    type: "place_mule",
    playerId: 0,
    row: spot.row,
    col: spot.col,
  });
  assert.equal(placed.plots[spot.row][spot.col].muleOutfit, "smithore");
});

test("a broke player can still end their develop turn", () => {
  const started = applyAction(createInitialGameState(31337), { type: "start_game" });
  const afterGrant = claimThroughLandGrant(started);
  // Drain player 0's money so no M.U.L.E. is affordable, then confirm end_turn works.
  const broke = {
    ...afterGrant,
    players: [
      { ...afterGrant.players[0], money: 0 },
      afterGrant.players[1],
      afterGrant.players[2],
      afterGrant.players[3],
    ],
  };
  assert.equal(canBuyMule(broke, 0), false);
  const ended = applyAction(broke, { type: "end_turn", playerId: 0 });
  assert.equal(ended.phase.kind, "develop");
  assert.equal(ended.phase.payload.activePlayer, 1);
});

test("out-of-turn actions throw", () => {
  const started = applyAction(createInitialGameState(11), { type: "start_game" });
  const afterGrant = claimThroughLandGrant(started);
  // Player 2 tries to act during player 0's turn.
  assert.throws(() => applyAction(afterGrant, { type: "end_turn", playerId: 2 }));
});

test("full game runs to scoring after the final round", () => {
  let current = applyAction(createInitialGameState(808), { type: "start_game" });
  // Play every round to completion without any placements.
  for (let safety = 0; safety < 100 && current.phase.kind !== "scoring"; safety += 1) {
    const phase = current.phase.kind;
    if (phase === "land_grant") {
      const picker = current.phase.payload.pickOrder[current.phase.payload.pickIndex];
      current = applyAction(current, { type: "pass", playerId: picker });
    } else if (phase === "develop") {
      current = applyAction(current, {
        type: "end_turn",
        playerId: current.phase.payload.activePlayer,
      });
    } else if (phase === "production") {
      current = applyAction(current, { type: "tick" });
    } else if (phase === "auction") {
      current = applyAction(current, { type: "end_auction" });
    }
  }
  assert.equal(current.phase.kind, "scoring");
  assert.equal(current.phase.payload.scores.length, 4);
  assert.ok(current.phase.payload.winnerIndex >= 0 && current.phase.payload.winnerIndex < 4);
  // hasPlaceablePlot is exercised as a query helper.
  assert.equal(typeof hasPlaceablePlot(current, 0), "boolean");
});
