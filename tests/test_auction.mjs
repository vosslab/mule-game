// Node unit tests for the tick-based goods-auction engine (auction.ts).
// Covers per-good bands from live store quotes, role auto-assignment from
// critical thresholds, the skip-when-no-trade-possible rule, per-good price
// steps, store and player trades, the crystite store-sink, the transfer-rate
// cooldown, and the idle-timeout window end.
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyAction } from "../src/engine/game_state.ts";
import { createInitialGameState } from "../src/engine/turn.ts";
import { AUCTION_STORE_ID, createAuctionPayload } from "../src/engine/auction.ts";
import { storeBuyQuote, storeSellQuote } from "../src/engine/store.ts";
import {
  AUCTION_IDLE_TIMEOUT,
  AUCTION_PRICE_STEP_BY_GOOD,
  AUCTION_QUIET_TICK_BUDGET,
} from "../src/engine/constants.ts";

// A round-1, post-start state whose players and store can be overridden before
// an auction payload is built from it. Land grant has not run, so the board is
// empty (no installed M.U.L.E.s -> energy critical is 1).
function baseState(seed) {
  return applyAction(createInitialGameState(seed), { type: "start_game" });
}

// Replace the four-player tuple with edited copies (money/goods overrides).
function withPlayers(state, overrides) {
  const players = state.players.map((player, index) => ({
    ...player,
    ...(overrides[index] ?? {}),
    goods: { ...player.goods, ...(overrides[index]?.goods ?? {}) },
  }));
  return { ...state, players };
}

// Build a live auction state for `good` from a base state, then optionally
// override the seated participants for a precise engine test. Forces the
// window live (not skipped) so the engine actually ticks.
function auctionOf(state, good, participantOverrides) {
  const payload = createAuctionPayload(state, good);
  let participants = payload.participants;
  if (participantOverrides !== undefined) {
    participants = participants.map((entry) => ({
      ...entry,
      ...(participantOverrides[entry.playerId] ?? {}),
    }));
  }
  return {
    ...state,
    phase: {
      kind: "auction",
      payload: { ...payload, participants, skipped: false, finished: false },
    },
  };
}

// Look up a participant entry by player id.
function participant(state, playerId) {
  return state.phase.payload.participants.find((entry) => entry.playerId === playerId);
}

// Total money held across all four players.
function totalMoney(state) {
  return state.players.reduce((sum, player) => sum + player.money, 0);
}

// Total units of a good across players plus the store stock.
function totalGoods(state, good) {
  const held = state.players.reduce((sum, player) => sum + player.goods[good], 0);
  return held + state.store.stock[good];
}

test("the food band is the store's live buy/sell quotes and holders auto-seat by role", () => {
  // Starting food 4 exceeds round-1 critical (3), so every player is a seller.
  const state = baseState(42);
  const payload = createAuctionPayload(state, "food");
  assert.equal(payload.good, "food");
  assert.equal(payload.priceFloor, storeBuyQuote(state.store, "food"));
  assert.equal(payload.priceCeiling, storeSellQuote(state.store, "food"));
  assert.equal(payload.storeBuyPrice, payload.priceFloor);
  assert.equal(payload.storeSellPrice, payload.priceCeiling);
  assert.ok(payload.priceFloor < payload.priceCeiling);
  assert.equal(payload.priceStep, AUCTION_PRICE_STEP_BY_GOOD.food);
  assert.equal(payload.ticksRemaining, AUCTION_QUIET_TICK_BUDGET);
  assert.equal(payload.skipped, false);
  for (const entry of payload.participants) {
    assert.equal(entry.role, "seller");
    // Sellers enter at the ceiling and walk down.
    assert.equal(entry.price, payload.priceCeiling);
    assert.equal(entry.intent, "down");
  }
});

test("a below-critical holder auto-seats as a buyer at the band floor", () => {
  const state = withPlayers(baseState(7), { 0: { goods: { food: 0 } } });
  const payload = createAuctionPayload(state, "food");
  const p0 = payload.participants.find((entry) => entry.playerId === 0);
  assert.equal(p0.role, "buyer");
  assert.equal(p0.price, payload.priceFloor);
  assert.equal(p0.intent, "up");
});

test("crystite uses a price step of 4 and is skipped when no crystite exists", () => {
  const state = baseState(3);
  const payload = createAuctionPayload(state, "crystite");
  assert.equal(payload.priceStep, 4);
  assert.equal(payload.priceStep, AUCTION_PRICE_STEP_BY_GOOD.crystite);
  // No player holds crystite and the store stocks none, so nothing can trade.
  assert.equal(payload.skipped, true);
  assert.equal(payload.finished, true);
});

test("a window with no seller and no below-critical buyer is skipped", () => {
  // Everyone exactly at food critical (3): nobody sells, nobody needs to buy.
  const state = withPlayers(baseState(9), {
    0: { goods: { food: 3 } },
    1: { goods: { food: 3 } },
    2: { goods: { food: 3 } },
    3: { goods: { food: 3 } },
  });
  const payload = createAuctionPayload(state, "food");
  assert.equal(payload.skipped, true);
});

test("a below-critical buyer with store stock keeps the window live", () => {
  const state = withPlayers(baseState(9), {
    0: { goods: { food: 0 } },
    1: { goods: { food: 3 } },
    2: { goods: { food: 3 } },
    3: { goods: { food: 3 } },
  });
  const payload = createAuctionPayload(state, "food");
  assert.equal(payload.skipped, false);
});

test("crossed buyer and seller trade one unit at the seller's ask, conserving money and goods", () => {
  let state = withPlayers(baseState(3), {
    0: { money: 1000, goods: { food: 0 } },
    1: { money: 0, goods: { food: 5 } },
  });
  const mid = Math.round(
    (storeBuyQuote(state.store, "food") + storeSellQuote(state.store, "food")) / 2,
  );
  // Seat a buyer and a seller crossing at the midpoint, others out.
  state = auctionOf(state, "food", {
    0: { role: "buyer", price: mid, intent: "hold" },
    1: { role: "seller", price: mid, intent: "hold" },
    2: { role: "out", intent: "hold" },
    3: { role: "out", intent: "hold" },
  });
  const moneyBefore = totalMoney(state);
  const goodsBefore = totalGoods(state, "food");
  state = applyAction(state, { type: "tick" });
  const trades = state.phase.payload.trades;
  assert.equal(trades.length, 1);
  assert.equal(trades[0].buyerId, 0);
  assert.equal(trades[0].sellerId, 1);
  assert.equal(trades[0].price, mid);
  assert.equal(state.players[0].goods.food, 1);
  assert.equal(state.players[1].goods.food, 4);
  assert.equal(totalMoney(state), moneyBefore);
  assert.equal(totalGoods(state, "food"), goodsBefore);
});

test("a lone buyer purchases from the store at the store sell price", () => {
  let state = withPlayers(baseState(4), { 0: { money: 1000, goods: { food: 0 } } });
  const goodsBefore = totalGoods(state, "food");
  const stockBefore = state.store.stock.food;
  state = auctionOf(state, "food", {
    0: { role: "buyer", intent: "up" },
    1: { role: "out", intent: "hold" },
    2: { role: "out", intent: "hold" },
    3: { role: "out", intent: "hold" },
  });
  const sellPrice = state.phase.payload.storeSellPrice;
  for (let i = 0; i < 100 && state.phase.payload.trades.length === 0; i += 1) {
    state = applyAction(state, { type: "tick" });
  }
  const trades = state.phase.payload.trades;
  assert.equal(trades.length, 1);
  assert.equal(trades[0].sellerId, AUCTION_STORE_ID);
  assert.equal(trades[0].price, sellPrice);
  assert.equal(state.players[0].goods.food, 1);
  assert.equal(state.store.stock.food, stockBefore - 1);
  assert.equal(totalGoods(state, "food"), goodsBefore);
});

test("a lone seller sells to the store at the store buy price", () => {
  let state = withPlayers(baseState(5), { 0: { money: 0, goods: { food: 5 } } });
  const goodsBefore = totalGoods(state, "food");
  const stockBefore = state.store.stock.food;
  state = auctionOf(state, "food", {
    0: { role: "seller", intent: "down" },
    1: { role: "out", intent: "hold" },
    2: { role: "out", intent: "hold" },
    3: { role: "out", intent: "hold" },
  });
  const buyPrice = state.phase.payload.storeBuyPrice;
  for (let i = 0; i < 100 && state.phase.payload.trades.length === 0; i += 1) {
    state = applyAction(state, { type: "tick" });
  }
  const trades = state.phase.payload.trades;
  assert.equal(trades.length, 1);
  assert.equal(trades[0].buyerId, AUCTION_STORE_ID);
  assert.equal(trades[0].price, buyPrice);
  assert.equal(state.players[0].goods.food, 4);
  assert.equal(state.store.stock.food, stockBefore + 1);
  assert.equal(totalGoods(state, "food"), goodsBefore);
});

test("crystite sold to the store is sunk: store crystite stock stays zero", () => {
  let state = withPlayers(baseState(6), { 0: { money: 0, goods: { crystite: 4 } } });
  assert.equal(state.store.stock.crystite, 0);
  state = auctionOf(state, "crystite", {
    0: { role: "seller", intent: "down" },
    1: { role: "out", intent: "hold" },
    2: { role: "out", intent: "hold" },
    3: { role: "out", intent: "hold" },
  });
  for (let i = 0; i < 100 && state.phase.payload.trades.length === 0; i += 1) {
    state = applyAction(state, { type: "tick" });
  }
  const trades = state.phase.payload.trades;
  assert.equal(trades.length, 1);
  assert.equal(trades[0].buyerId, AUCTION_STORE_ID);
  // The player parted with a crystite unit for money, but the store did not gain it.
  assert.equal(state.players[0].goods.crystite, 3);
  assert.equal(state.store.stock.crystite, 0);
});

test("crystite prices step by 4 and clamp to the band", () => {
  // Give one player crystite so the crystite window is live (has a seller).
  let state = withPlayers(baseState(2), { 0: { goods: { crystite: 6 } } });
  const built = createAuctionPayload(state, "crystite");
  const floor = built.priceFloor;
  // Seat a seller two steps above the floor; it walks down by 4 per tick and
  // clamps at the floor rather than passing it.
  state = auctionOf(state, "crystite", {
    0: { role: "seller", price: floor + 5, intent: "down" },
    1: { role: "out", intent: "hold" },
    2: { role: "out", intent: "hold" },
    3: { role: "out", intent: "hold" },
  });
  const ticked = applyAction(state, { type: "tick" });
  // floor + 5 - 4 = floor + 1 (still one step of 4 above the floor).
  assert.equal(participant(ticked, 0).price, floor + 1);
  const twice = applyAction(ticked, { type: "tick" });
  assert.equal(participant(twice, 0).price, floor);
  assert.ok(participant(twice, 0).price >= floor);
});

test("the transfer-rate cooldown throttles successive units below one per tick", () => {
  let state = withPlayers(baseState(8), {
    0: { money: 100000, goods: { food: 0 } },
    1: { money: 0, goods: { food: 6 } },
  });
  const mid = Math.round(
    (storeBuyQuote(state.store, "food") + storeSellQuote(state.store, "food")) / 2,
  );
  state = auctionOf(state, "food", {
    0: { role: "buyer", price: mid, intent: "hold" },
    1: { role: "seller", price: mid, intent: "hold" },
    2: { role: "out", intent: "hold" },
    3: { role: "out", intent: "hold" },
  });
  for (let i = 0; i < 6; i += 1) {
    if (state.phase.kind === "auction" && !state.phase.payload.finished) {
      state = applyAction(state, { type: "tick" });
    }
  }
  const traded = state.phase.payload.trades.length;
  // A cooldown after each unit means six ticks cannot stream six units.
  assert.ok(traded > 0, "at least one unit trades");
  assert.ok(traded < 6, `cooldown throttles the stream, got ${traded} in 6 ticks`);
});

test("an idle window (nobody trades or moves) ends at the idle timeout", () => {
  let state = withPlayers(baseState(11), { 0: { goods: { food: 0 } } });
  // Everyone out and holding: no movement, no trade -> quiet ticks accrue.
  state = auctionOf(state, "food", {
    0: { role: "out", intent: "hold" },
    1: { role: "out", intent: "hold" },
    2: { role: "out", intent: "hold" },
    3: { role: "out", intent: "hold" },
  });
  for (let i = 0; i < AUCTION_IDLE_TIMEOUT; i += 1) {
    assert.equal(state.phase.payload.finished, false);
    state = applyAction(state, { type: "tick" });
  }
  assert.equal(state.phase.payload.finished, true);
  assert.equal(state.phase.payload.idleTicks, AUCTION_IDLE_TIMEOUT);
  assert.equal(state.phase.payload.trades.length, 0);
});

test("end_auction advances to the next good in planet_mule order", () => {
  // Drive to the first (smithore) auction, then step the good chain.
  let state = baseState(6);
  while (state.phase.kind === "land_grant") {
    const payload = state.phase.payload;
    state = applyAction(state, { type: "pass", playerId: payload.pickOrder[payload.pickIndex] });
  }
  // Skip cleanly through any colony land-auction slots (no bidding) before
  // develop, the same way land_grant's snake order was passed through above.
  while (state.phase.kind === "land_auction") {
    while (!state.phase.payload.finished) {
      state = applyAction(state, { type: "tick" });
    }
    state = applyAction(state, { type: "end_land_auction" });
  }
  for (let i = 0; i < 4; i += 1) {
    state = applyAction(state, { type: "end_turn", playerId: state.phase.payload.activePlayer });
  }
  state = applyAction(state, { type: "tick" });
  assert.equal(state.phase.payload.good, "smithore");
  state = applyAction(state, { type: "end_auction" });
  assert.equal(state.phase.payload.good, "crystite");
  state = applyAction(state, { type: "end_auction" });
  assert.equal(state.phase.payload.good, "food");
  state = applyAction(state, { type: "end_auction" });
  assert.equal(state.phase.payload.good, "energy");
});
