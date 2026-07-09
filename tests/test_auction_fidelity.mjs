// Node fidelity tests for the goods-auction rules: role
// auto-assignment at exact critical boundaries, per-good band derivation, the
// crystite store-only-buyer sink and its post-auction zeroing, the idle timeout,
// the quiet-tick (slow/pause) countdown semantics, the transfer-rate cooldown
// progression, the crystite price step of 4, and the negative-economy invariant
// (a buyer can never spend below zero).
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyAction } from "../src/engine/game_state.ts";
import { createInitialGameState } from "../src/engine/turn.ts";
import { createAuctionPayload, auctionTick } from "../src/engine/auction.ts";
import { storeBuyQuote, storeSellQuote } from "../src/engine/store.ts";
import { FOOD_REQUIREMENTS_BY_ROUND } from "../src/engine/constants.ts";

function baseState(seed) {
  return applyAction(createInitialGameState(seed), { type: "start_game" });
}

function withPlayers(state, overrides) {
  const players = state.players.map((player, index) => ({
    ...player,
    ...(overrides[index] ?? {}),
    goods: { ...player.goods, ...(overrides[index]?.goods ?? {}) },
  }));
  return { ...state, players };
}

// Install a non-energy (powered) M.U.L.E. on plot (row,col) owned by playerId.
function withPoweredMule(state, playerId, row, col) {
  const plots = state.plots.map((plotRow, r) =>
    plotRow.map((plot, c) =>
      r === row && c === col ? { ...plot, owner: playerId, muleOutfit: "food" } : plot,
    ),
  );
  return { ...state, plots };
}

function roleOf(payload, playerId) {
  return payload.participants.find((entry) => entry.playerId === playerId).role;
}

function liveAuction(state, good, participantOverrides) {
  const payload = createAuctionPayload(state, good);
  const participants = payload.participants.map((entry) => ({
    ...entry,
    ...(participantOverrides?.[entry.playerId] ?? {}),
  }));
  return {
    ...state,
    phase: {
      kind: "auction",
      payload: { ...payload, participants, skipped: false, finished: false },
    },
  };
}

test("food role auto-assigns at the exact critical boundary (buyer at critical, seller above)", () => {
  const critical = FOOD_REQUIREMENTS_BY_ROUND[1]; // round 1 food critical
  const state = withPlayers(baseState(1), {
    0: { goods: { food: critical } },
    1: { goods: { food: critical + 1 } },
    2: { goods: { food: critical - 1 } },
    3: { goods: { food: critical } },
  });
  const payload = createAuctionPayload(state, "food");
  assert.equal(roleOf(payload, 0), "buyer"); // exactly at critical -> buyer
  assert.equal(roleOf(payload, 1), "seller"); // above critical -> seller
  assert.equal(roleOf(payload, 2), "buyer"); // below critical -> buyer
});

test("food critical is one round ahead: round 4's auction anticipates round 5's requirement", () => {
  // Round 4's own auction reads FOOD_REQUIREMENTS_BY_ROUND[min(4 + 1, 12)],
  // the table's first step up (3 -> 4), not round 4's own develop-turn value.
  const critical = FOOD_REQUIREMENTS_BY_ROUND[5];
  const state = {
    ...withPlayers(baseState(1), {
      0: { goods: { food: critical } },
      1: { goods: { food: critical + 1 } },
      2: { goods: { food: critical - 1 } },
    }),
    round: 4,
  };
  const payload = createAuctionPayload(state, "food");
  assert.equal(roleOf(payload, 0), "buyer"); // exactly at critical -> buyer
  assert.equal(roleOf(payload, 1), "seller"); // above critical -> seller
  assert.equal(roleOf(payload, 2), "buyer"); // below critical -> buyer
});

test("food critical is one round ahead: round 8's auction anticipates round 9's requirement", () => {
  // Round 8's own auction reads FOOD_REQUIREMENTS_BY_ROUND[min(8 + 1, 12)],
  // the table's second step up (4 -> 5), not round 8's own develop-turn value.
  const critical = FOOD_REQUIREMENTS_BY_ROUND[9];
  const state = {
    ...withPlayers(baseState(1), {
      0: { goods: { food: critical } },
      1: { goods: { food: critical + 1 } },
      2: { goods: { food: critical - 1 } },
    }),
    round: 8,
  };
  const payload = createAuctionPayload(state, "food");
  assert.equal(roleOf(payload, 0), "buyer"); // exactly at critical -> buyer
  assert.equal(roleOf(payload, 1), "seller"); // above critical -> seller
  assert.equal(roleOf(payload, 2), "buyer"); // below critical -> buyer
});

test("energy critical is the powered-M.U.L.E. count plus one", () => {
  // Player 0 owns one powered (non-energy) M.U.L.E., so energy critical is 2.
  let state = baseState(2);
  state = withPoweredMule(state, 0, 0, 0);
  const atCritical = withPlayers(state, { 0: { goods: { energy: 2 } } });
  const aboveCritical = withPlayers(state, { 0: { goods: { energy: 3 } } });
  assert.equal(roleOf(createAuctionPayload(atCritical, "energy"), 0), "buyer");
  assert.equal(roleOf(createAuctionPayload(aboveCritical, "energy"), 0), "seller");
});

test("smithore and crystite are never critical: any holder sells, a non-holder buys", () => {
  const state = withPlayers(baseState(3), {
    0: { goods: { smithore: 1, crystite: 0 } },
    1: { goods: { smithore: 0, crystite: 1 } },
  });
  const smithore = createAuctionPayload(state, "smithore");
  const crystite = createAuctionPayload(state, "crystite");
  assert.equal(roleOf(smithore, 0), "seller"); // holds 1 > 0
  assert.equal(roleOf(smithore, 1), "buyer"); // holds 0
  assert.equal(roleOf(crystite, 1), "seller"); // holds 1 > 0
  assert.equal(roleOf(crystite, 0), "buyer"); // holds 0
});

test("each good's band is exactly the store's live buy/sell quotes", () => {
  const state = withPlayers(baseState(4), {
    0: { goods: { smithore: 5, crystite: 5 } },
  });
  for (const good of ["food", "energy", "smithore", "crystite"]) {
    const payload = createAuctionPayload(state, good);
    assert.equal(payload.priceFloor, storeBuyQuote(state.store, good), `${good} floor`);
    assert.equal(payload.priceCeiling, storeSellQuote(state.store, good), `${good} ceiling`);
  }
});

test("the crystite store-sink holds through end_auction: store crystite stays zero", () => {
  // Drive to the crystite auction with player 0 holding crystite to sell.
  let state = withPlayers(baseState(5), { 0: { money: 0, goods: { crystite: 3 } } });
  state = liveAuction(state, "crystite", {
    0: { role: "seller", intent: "down" },
    1: { role: "out", intent: "hold" },
    2: { role: "out", intent: "hold" },
    3: { role: "out", intent: "hold" },
  });
  for (let i = 0; i < 100 && !state.phase.payload.finished; i += 1) {
    state = applyAction(state, { type: "tick" });
  }
  assert.ok(state.phase.payload.trades.length >= 1);
  assert.equal(state.store.stock.crystite, 0);
  // end_auction zeroes crystite explicitly even if a unit had accumulated.
  const seeded = {
    ...state,
    store: { ...state.store, stock: { ...state.store.stock, crystite: 9 } },
  };
  const advanced = applyAction(seeded, { type: "end_auction" });
  assert.equal(advanced.store.stock.crystite, 0);
});

test("the quiet-tick countdown pauses on movement and on a transaction, decrements only when idle", () => {
  const mid = (state) =>
    Math.round((storeBuyQuote(state.store, "food") + storeSellQuote(state.store, "food")) / 2);

  // Movement tick: a walking participant does not spend the countdown.
  let moving = withPlayers(baseState(6), { 0: { money: 1000, goods: { food: 0 } } });
  moving = liveAuction(moving, "food", {
    0: { role: "buyer", intent: "up" },
    1: { role: "out", intent: "hold" },
    2: { role: "out", intent: "hold" },
    3: { role: "out", intent: "hold" },
  });
  const budget = moving.phase.payload.ticksRemaining;
  const afterMove = applyAction(moving, { type: "tick" });
  assert.equal(afterMove.phase.payload.ticksRemaining, budget, "movement pauses the countdown");
  assert.equal(afterMove.phase.payload.idleTicks, 0);

  // Transaction tick: a trade also pauses the countdown.
  let trading = withPlayers(baseState(6), {
    0: { money: 1000, goods: { food: 0 } },
    1: { money: 0, goods: { food: 4 } },
  });
  const price = mid(trading);
  trading = liveAuction(trading, "food", {
    0: { role: "buyer", price, intent: "hold" },
    1: { role: "seller", price, intent: "hold" },
    2: { role: "out", intent: "hold" },
    3: { role: "out", intent: "hold" },
  });
  const tradeBudget = trading.phase.payload.ticksRemaining;
  const afterTrade = applyAction(trading, { type: "tick" });
  assert.equal(afterTrade.phase.payload.trades.length, 1);
  assert.equal(
    afterTrade.phase.payload.ticksRemaining,
    tradeBudget,
    "a trade pauses the countdown",
  );

  // Quiet tick: nobody moves, nobody trades -> the countdown spends one.
  let idle = liveAuction(withPlayers(baseState(6), {}), "food", {
    0: { role: "out", intent: "hold" },
    1: { role: "out", intent: "hold" },
    2: { role: "out", intent: "hold" },
    3: { role: "out", intent: "hold" },
  });
  const idleBudget = idle.phase.payload.ticksRemaining;
  const afterIdle = applyAction(idle, { type: "tick" });
  assert.equal(afterIdle.phase.payload.ticksRemaining, idleBudget - 1, "a quiet tick spends one");
  assert.equal(afterIdle.phase.payload.idleTicks, 1);
});

test("the transfer-rate cooldown gaps successive units (never two trades on adjacent ticks)", () => {
  let state = withPlayers(baseState(7), {
    0: { money: 100000, goods: { food: 0 } },
    1: { money: 0, goods: { food: 8 } },
  });
  const price = Math.round(
    (storeBuyQuote(state.store, "food") + storeSellQuote(state.store, "food")) / 2,
  );
  state = liveAuction(state, "food", {
    0: { role: "buyer", price, intent: "hold" },
    1: { role: "seller", price, intent: "hold" },
    2: { role: "out", intent: "hold" },
    3: { role: "out", intent: "hold" },
  });
  const tradeTicks = [];
  for (let i = 0; i < 12; i += 1) {
    if (state.phase.kind !== "auction" || state.phase.payload.finished) {
      break;
    }
    const before = state.phase.payload.trades.length;
    state = applyAction(state, { type: "tick" });
    if (state.phase.payload.trades.length > before) {
      tradeTicks.push(i);
    }
  }
  assert.ok(tradeTicks.length >= 2, "several units trade over the window");
  // No two trades on consecutive ticks: the cooldown always intervenes.
  for (let i = 1; i < tradeTicks.length; i += 1) {
    assert.ok(tradeTicks[i] - tradeTicks[i - 1] >= 2, "a cooldown gap separates units");
  }
});

test("negative-economy invariant: a buyer that cannot pay does not trade and never goes below zero", () => {
  let state = withPlayers(baseState(8), {
    0: { money: 5, goods: { food: 0 } },
    1: { money: 0, goods: { food: 4 } },
  });
  const price = Math.round(
    (storeBuyQuote(state.store, "food") + storeSellQuote(state.store, "food")) / 2,
  );
  // Buyer bid meets the seller ask, but the buyer holds only $5.
  state = liveAuction(state, "food", {
    0: { role: "buyer", price, intent: "hold" },
    1: { role: "seller", price, intent: "hold" },
    2: { role: "out", intent: "hold" },
    3: { role: "out", intent: "hold" },
  });
  assert.ok(price > 5, "the crossing price exceeds the buyer's cash for a real test");
  for (let i = 0; i < 20; i += 1) {
    if (state.phase.kind !== "auction" || state.phase.payload.finished) {
      break;
    }
    state = applyAction(state, { type: "tick" });
    for (const player of state.players) {
      assert.ok(player.money >= 0, `player ${player.id} money went negative`);
    }
  }
  assert.equal(state.phase.payload.trades.length, 0);
  assert.equal(state.players[0].money, 5);
});

test("auctionTick is a no-op on a finished window", () => {
  let state = liveAuction(withPlayers(baseState(9), {}), "food", {
    0: { role: "out", intent: "hold" },
    1: { role: "out", intent: "hold" },
    2: { role: "out", intent: "hold" },
    3: { role: "out", intent: "hold" },
  });
  const finished = {
    ...state,
    phase: { kind: "auction", payload: { ...state.phase.payload, finished: true } },
  };
  const after = auctionTick(finished);
  assert.deepEqual(after, finished);
});
