// Node unit tests for the turn sequencer and land grant (turn.ts, land_grant.ts).
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyAction } from "../src/engine/game_state.ts";
import {
  createInitialGameState,
  canBuyMule,
  hasPlaceablePlot,
  enterDevelop,
} from "../src/engine/turn.ts";
import {
  advanceSweepCursor,
  isFreePlot,
  landGrantPickOrder,
  worstRankedClaimant,
} from "../src/engine/land_grant.ts";
import { createInitialStoreState } from "../src/engine/store.ts";
import {
  MULE_BASE_PRICE,
  DEVELOP_TICKS_FULL,
  DEVELOP_TICKS_MIN,
  DEVELOP_ORDER_REVERSAL_MULE_THRESHOLD,
  FOOD_REQUIREMENTS_BY_ROUND,
  STARTING_MONEY,
} from "../src/engine/constants.ts";

// Build a minimal player for enterDevelop's turn-order/timer tests, which
// only read `players` (money, goods), `store`, `plots`, and `round`.
function buildPlayer(id, overrides) {
  return {
    id,
    isHuman: id === 0,
    colorSlot: id,
    money: 1000,
    goods: { food: 10, energy: 10, smithore: 0, crystite: 0 },
    ...overrides,
  };
}

// Build a bare-bones round-N state (empty board, no land grant machinery)
// suitable for calling the exported `enterDevelop` directly, since it reads
// only `players`, `store`, `plots`, `round`, and (M6) the event fields -- not
// the current phase. The personal-event deck is intentionally empty so no
// event fires: these tests isolate the turn-order and food-timer mechanics
// from the event system (an empty deck makes `drawPersonalEvent` a no-op).
function buildRoundState(round, players, muleStock) {
  return {
    seed: 1,
    rngState: 1,
    mode: "beginner",
    round,
    phase: { kind: "title" },
    plots: [],
    players,
    store: { ...createInitialStoreState(), muleStock },
    colonyEventSchedule: [],
    colonyEventRngState: 1,
    playerEventDeck: [],
    playerEventCursor: 0,
    playerEventRngState: 1,
    eventHistory: [],
  };
}

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

// Drive the land grant with every player claiming one plot in pick order,
// then skip cleanly through any colony land-auction slots the round offers.
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
  return skipThroughLandAuctions(current);
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

test("land-grant sweep cursor seeds on a free plot and a tick advances it to the next free one", () => {
  const started = applyAction(createInitialGameState(1234), { type: "start_game" });
  assert.equal(started.phase.kind, "land_grant");
  const seeded = started.phase.payload;
  assert.ok(isFreePlot(started.plots, seeded.sweepRow, seeded.sweepCol));

  const ticked = applyAction(started, { type: "tick" });
  assert.equal(ticked.phase.kind, "land_grant");
  const advanced = ticked.phase.payload;
  assert.ok(isFreePlot(ticked.plots, advanced.sweepRow, advanced.sweepCol));
  // The cursor actually moved (the board has far more than one free plot).
  assert.ok(advanced.sweepRow !== seeded.sweepRow || advanced.sweepCol !== seeded.sweepCol);
});

test("advanceSweepCursor skips an owned plot and wraps past the last cell", () => {
  const started = applyAction(createInitialGameState(9), { type: "start_game" });
  const rows = started.plots.length;
  const cols = started.plots[0].length;
  const firstFree = firstClaimable(started);
  // Own the very next cell after the first free plot, so the sweep must skip
  // it to reach the next free one (proving skip-owned, not a plain +1 step).
  const plots = started.plots.map((row) => row.map((plot) => ({ ...plot })));
  plots[firstFree.row][firstFree.col + 1] = {
    ...plots[firstFree.row][firstFree.col + 1],
    owner: 0,
  };
  const next = advanceSweepCursor(plots, firstFree.row, firstFree.col);
  assert.ok(isFreePlot(plots, next.row, next.col));
  assert.ok(next.row !== firstFree.row || next.col !== firstFree.col + 1);

  // Wrap: from the last cell, the next free plot is found starting back at (0, 0).
  const wrapped = advanceSweepCursor(plots, rows - 1, cols - 1);
  assert.ok(isFreePlot(plots, wrapped.row, wrapped.col));
});

test("claim_current_plot claims the sweep cursor's plot and advances the picker", () => {
  const started = applyAction(createInitialGameState(1234), { type: "start_game" });
  const picker = started.phase.payload.pickOrder[0];
  const target = started.phase.payload;
  const claimed = applyAction(started, { type: "claim_current_plot", playerId: picker });
  assert.equal(claimed.plots[target.sweepRow][target.sweepCol].owner, picker);
  assert.equal(claimed.phase.payload.pickIndex, 1);
});

test("claim_current_plot out of turn throws", () => {
  const started = applyAction(createInitialGameState(1234), { type: "start_game" });
  const picker = started.phase.payload.pickOrder[0];
  const outOfTurn = picker === 0 ? 1 : 0;
  assert.throws(() => applyAction(started, { type: "claim_current_plot", playerId: outOfTurn }));
});

test("worstRankedClaimant picks the lowest-scoring candidate, ties to the highest id", () => {
  const state = createInitialGameState(1234);
  const poorer = {
    ...state,
    players: state.players.map((p) => (p.id === 1 ? { ...p, money: p.money - 500 } : p)),
  };
  assert.equal(worstRankedClaimant([0, 1], poorer), 1);
  // A genuine tie breaks toward the highest player id (worst-ranked by
  // rankOrder's own ascending-id tie-break, mirroring worstRanked in
  // land_auction.ts).
  assert.equal(worstRankedClaimant([2, 3], state), 3);
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
  assert.equal(current.phase.payload.good, "smithore");

  // Goods auction in planet_mule's fixed order smithore, crystite, food, energy.
  current = applyAction(current, { type: "end_auction" });
  assert.equal(current.phase.payload.good, "crystite");
  current = applyAction(current, { type: "end_auction" });
  assert.equal(current.phase.payload.good, "food");
  current = applyAction(current, { type: "end_auction" });
  assert.equal(current.phase.payload.good, "energy");

  // After energy the next round begins with a fresh land grant.
  current = applyAction(current, { type: "end_auction" });
  assert.equal(current.phase.kind, "land_grant");
  assert.equal(current.round, 2);
  // Round 2 uses the reversed snake order.
  assert.deepEqual(current.phase.payload.pickOrder, [3, 2, 1, 0]);
});

test("pass is allowed during land grant", () => {
  const started = applyAction(createInitialGameState(7), { type: "start_game" });
  let current = started;
  // Every player passes; land grant still completes (a colony land-auction
  // slot may follow, since no plot is owned yet -- skip through it).
  for (let i = 0; i < 4; i += 1) {
    const picker = current.phase.payload.pickOrder[current.phase.payload.pickIndex];
    current = applyAction(current, { type: "pass", playerId: picker });
  }
  current = skipThroughLandAuctions(current);
  assert.equal(current.phase.kind, "develop");
  // No plots were claimed by the land grant (a land-auction sale, skipped
  // above without bidding, cannot have claimed one either).
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
  for (let i = 0; i < DEVELOP_TICKS_FULL; i += 1) {
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
    } else if (phase === "land_auction") {
      current = skipThroughLandAuctions(current);
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

// ============================================================
// Food-scaled develop timer
// ============================================================

// Player 0 carries overwhelming money in every food-timer test below, so it
// always ranks first (`computeTurnQueue` sorts by score, and goods -- food
// included -- count toward score) regardless of the low food value under
// test; this isolates the timer formula from the turn-order formula, which
// has its own dedicated tests further down.
const DOMINANT_MONEY = 999999;

test("a fully-fed player at develop-turn start gets DEVELOP_TICKS_FULL and pays exactly the requirement", () => {
  const required = FOOD_REQUIREMENTS_BY_ROUND[2]; // round 2's requirement (3)
  const players = [
    buildPlayer(0, {
      money: DOMINANT_MONEY,
      goods: { food: 10, energy: 5, smithore: 0, crystite: 0 },
    }),
    buildPlayer(1),
    buildPlayer(2),
    buildPlayer(3),
  ];
  const state = buildRoundState(2, players, 14);
  const entered = enterDevelop(state);
  assert.equal(entered.phase.payload.activePlayer, 0);
  assert.equal(entered.phase.payload.ticksRemaining, DEVELOP_TICKS_FULL);
  assert.equal(entered.players[0].goods.food, 10 - required);
});

test("a food-short player gets a tick budget scaled between DEVELOP_TICKS_MIN and DEVELOP_TICKS_FULL", () => {
  const required = FOOD_REQUIREMENTS_BY_ROUND[2]; // round 2's requirement (3)
  const foodHave = 1;
  const players = [
    buildPlayer(0, {
      money: DOMINANT_MONEY,
      goods: { food: foodHave, energy: 5, smithore: 0, crystite: 0 },
    }),
    buildPlayer(1),
    buildPlayer(2),
    buildPlayer(3),
  ];
  const state = buildRoundState(2, players, 14);
  const entered = enterDevelop(state);
  assert.equal(entered.phase.payload.activePlayer, 0);
  const f = foodHave / required;
  const expectedTicks = Math.round(f * DEVELOP_TICKS_FULL + (1 - f) * DEVELOP_TICKS_MIN);
  assert.equal(entered.phase.payload.ticksRemaining, expectedTicks);
  assert.ok(entered.phase.payload.ticksRemaining > DEVELOP_TICKS_MIN);
  assert.ok(entered.phase.payload.ticksRemaining < DEVELOP_TICKS_FULL);
  // A short player consumes everything they have, not the full requirement.
  assert.equal(entered.players[0].goods.food, 0);
});

test("a player with zero food gets exactly DEVELOP_TICKS_MIN, the floor", () => {
  const players = [
    buildPlayer(0, {
      money: DOMINANT_MONEY,
      goods: { food: 0, energy: 5, smithore: 0, crystite: 0 },
    }),
    buildPlayer(1),
    buildPlayer(2),
    buildPlayer(3),
  ];
  const state = buildRoundState(2, players, 14);
  const entered = enterDevelop(state);
  assert.equal(entered.phase.payload.activePlayer, 0);
  assert.equal(entered.phase.payload.ticksRemaining, DEVELOP_TICKS_MIN);
  assert.equal(entered.players[0].goods.food, 0);
});

test("round 1 already requires food, matching PM's foodRequirements[1] = 3 (1-based getRound())", () => {
  const required = FOOD_REQUIREMENTS_BY_ROUND[1]; // round 1's requirement (3)
  const players = [
    buildPlayer(0, {
      money: DOMINANT_MONEY,
      goods: { food: 10, energy: 5, smithore: 0, crystite: 0 },
    }),
    buildPlayer(1),
    buildPlayer(2),
    buildPlayer(3),
  ];
  const state = buildRoundState(1, players, 14);
  const entered = enterDevelop(state);
  assert.equal(entered.phase.payload.activePlayer, 0);
  assert.equal(entered.phase.payload.ticksRemaining, DEVELOP_TICKS_FULL);
  assert.equal(entered.players[0].goods.food, 10 - required);
});

test("a zero-food player in round 1 is short and gets a scaled-down tick budget, not a free full turn", () => {
  const players = [
    buildPlayer(0, {
      money: DOMINANT_MONEY,
      goods: { food: 0, energy: 5, smithore: 0, crystite: 0 },
    }),
    buildPlayer(1),
    buildPlayer(2),
    buildPlayer(3),
  ];
  const state = buildRoundState(1, players, 14);
  const entered = enterDevelop(state);
  assert.equal(entered.phase.payload.activePlayer, 0);
  assert.equal(entered.phase.payload.ticksRemaining, DEVELOP_TICKS_MIN);
  assert.equal(entered.players[0].goods.food, 0);
});

// ============================================================
// Rank-ordered turn queue with mule-shortage reversal
// ============================================================

test("tied players run develop turns in ascending player-id order when mules are plentiful", () => {
  const players = [buildPlayer(0), buildPlayer(1), buildPlayer(2), buildPlayer(3)];
  const state = buildRoundState(2, players, DEVELOP_ORDER_REVERSAL_MULE_THRESHOLD + 1);
  const entered = enterDevelop(state);
  assert.deepEqual(entered.phase.payload.turnQueue, [0, 1, 2, 3]);
  assert.equal(entered.phase.payload.activePlayer, 0);
});

test("develop order reverses to descending player id at the mule-shortage threshold", () => {
  const players = [buildPlayer(0), buildPlayer(1), buildPlayer(2), buildPlayer(3)];
  const state = buildRoundState(2, players, DEVELOP_ORDER_REVERSAL_MULE_THRESHOLD);
  const entered = enterDevelop(state);
  assert.deepEqual(entered.phase.payload.turnQueue, [3, 2, 1, 0]);
  assert.equal(entered.phase.payload.activePlayer, 3);
});

test("develop order stays normal one mule above the reversal threshold", () => {
  const players = [buildPlayer(0), buildPlayer(1), buildPlayer(2), buildPlayer(3)];
  const state = buildRoundState(2, players, DEVELOP_ORDER_REVERSAL_MULE_THRESHOLD + 1);
  const entered = enterDevelop(state);
  assert.deepEqual(entered.phase.payload.turnQueue, [0, 1, 2, 3]);
});

test("mid-game rank exposure: the highest-money player goes first when mules are plentiful", () => {
  const players = [
    buildPlayer(0, { money: 500 }),
    buildPlayer(1, { money: 500 }),
    buildPlayer(2, { money: 5000 }),
    buildPlayer(3, { money: 500 }),
  ];
  const state = buildRoundState(2, players, 14);
  const entered = enterDevelop(state);
  assert.deepEqual(entered.phase.payload.turnQueue, [2, 0, 1, 3]);
  assert.equal(entered.phase.payload.activePlayer, 2);
});

test("mid-game rank exposure reversed: the highest-money player goes last on mule shortage", () => {
  const players = [
    buildPlayer(0, { money: 500 }),
    buildPlayer(1, { money: 500 }),
    buildPlayer(2, { money: 5000 }),
    buildPlayer(3, { money: 500 }),
  ];
  const state = buildRoundState(2, players, DEVELOP_ORDER_REVERSAL_MULE_THRESHOLD);
  const entered = enterDevelop(state);
  assert.deepEqual(entered.phase.payload.turnQueue, [3, 1, 0, 2]);
  assert.equal(entered.phase.payload.activePlayer, 3);
});
