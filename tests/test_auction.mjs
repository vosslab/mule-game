// Node unit tests for the tick-based auction engine (auction.ts).
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyAction } from "../src/engine/game_state.ts";
import { createInitialGameState } from "../src/engine/turn.ts";
import { AUCTION_STORE_ID } from "../src/engine/auction.ts";
import {
  AUCTION_TICKS,
  AUCTION_PRICE_STEP,
  AUCTION_PRICE_CEILING,
  AUCTION_PRICE_FLOOR,
  STORE_BASE_PRICE,
  AUCTION_STORE_SPREAD,
} from "../src/engine/constants.ts";

// Drive a fresh game to the auction phase for the given good. Every player
// passes the land grant and ends their develop turn, so no M.U.L.E.s are
// placed and players keep their starting money and (zero) goods.
function auctionState(seed, good) {
  let current = applyAction(createInitialGameState(seed), { type: "start_game" });
  while (current.phase.kind === "land_grant") {
    const payload = current.phase.payload;
    const picker = payload.pickOrder[payload.pickIndex];
    current = applyAction(current, { type: "pass", playerId: picker });
  }
  for (let i = 0; i < 4; i += 1) {
    current = applyAction(current, {
      type: "end_turn",
      playerId: current.phase.payload.activePlayer,
    });
  }
  // Production -> first good's auction.
  current = applyAction(current, { type: "tick" });
  while (current.phase.payload.good !== good) {
    current = applyAction(current, { type: "end_auction" });
  }
  return current;
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

// Look up a participant entry by player id.
function participant(state, playerId) {
  return state.phase.payload.participants.find((entry) => entry.playerId === playerId);
}

// Total money held across all four players.
function totalMoney(state) {
  return state.players.reduce((sum, player) => sum + player.money, 0);
}

// Total units of a good across players plus the store stock (invariant across
// every trade type: player-to-player, store-sell, and store-buy).
function totalGoods(state, good) {
  const held = state.players.reduce((sum, player) => sum + player.goods[good], 0);
  return held + state.store.stock[good];
}

test("initial auction payload seats every player out at the store band midpoint", () => {
  const state = auctionState(42, "food");
  const payload = state.phase.payload;
  assert.equal(payload.good, "food");
  assert.equal(payload.ticksRemaining, AUCTION_TICKS);
  assert.equal(payload.finished, false);
  assert.equal(payload.storeBuyPrice, STORE_BASE_PRICE.food - AUCTION_STORE_SPREAD);
  assert.equal(payload.storeSellPrice, STORE_BASE_PRICE.food + AUCTION_STORE_SPREAD);
  assert.equal(payload.participants.length, 4);
  const mid = Math.round((payload.storeBuyPrice + payload.storeSellPrice) / 2);
  for (const entry of payload.participants) {
    assert.equal(entry.role, "out");
    assert.equal(entry.intent, "hold");
    assert.equal(entry.price, mid);
  }
});

test("price moves up for a raising participant and down for a lowering one per tick", () => {
  let state = auctionState(1, "food");
  const start = participant(state, 0).price;
  state = applyAction(state, { type: "set_auction_role", playerId: 0, role: "buyer" });
  state = applyAction(state, { type: "set_auction_intent", playerId: 0, intent: "up" });
  state = applyAction(state, { type: "set_auction_role", playerId: 1, role: "seller" });
  state = applyAction(state, { type: "set_auction_intent", playerId: 1, intent: "down" });
  const ticked = applyAction(state, { type: "tick" });
  assert.equal(participant(ticked, 0).price, start + AUCTION_PRICE_STEP);
  assert.equal(participant(ticked, 1).price, start - AUCTION_PRICE_STEP);
});

test("prices clamp to the auction band and never escape it", () => {
  let state = auctionState(2, "food");
  const start = participant(state, 0).price;
  state = applyAction(state, { type: "set_auction_role", playerId: 0, role: "out" });
  state = applyAction(state, { type: "set_auction_intent", playerId: 0, intent: "up" });
  state = applyAction(state, { type: "set_auction_role", playerId: 3, role: "out" });
  state = applyAction(state, { type: "set_auction_intent", playerId: 3, intent: "down" });
  // Run the full auction window; an out participant never trades.
  for (let i = 0; i < AUCTION_TICKS; i += 1) {
    state = applyAction(state, { type: "tick" });
  }
  // The rising price stays within the ceiling; the falling price bottoms out
  // at the floor (it would have gone negative without clamping).
  const rising = participant(state, 0).price;
  const falling = participant(state, 3).price;
  assert.equal(rising, Math.min(start + AUCTION_TICKS * AUCTION_PRICE_STEP, AUCTION_PRICE_CEILING));
  assert.ok(rising <= AUCTION_PRICE_CEILING);
  assert.equal(falling, AUCTION_PRICE_FLOOR);
  assert.ok(falling >= AUCTION_PRICE_FLOOR);
});

test("a crossed buyer and seller trade one unit at the seller's ask, conserving money and goods", () => {
  let state = auctionState(3, "food");
  state = withPlayers(state, {
    0: { money: 1000, goods: { food: 0 } },
    1: { money: 0, goods: { food: 5 } },
  });
  const moneyBefore = totalMoney(state);
  const goodsBefore = totalGoods(state, "food");
  state = applyAction(state, { type: "set_auction_role", playerId: 0, role: "buyer" });
  state = applyAction(state, { type: "set_auction_role", playerId: 1, role: "seller" });
  // Both sit at the midpoint and hold, so they cross immediately at that price.
  const ask = participant(state, 1).price;
  state = applyAction(state, { type: "tick" });
  const trades = state.phase.payload.trades;
  assert.equal(trades.length, 1);
  assert.equal(trades[0].buyerId, 0);
  assert.equal(trades[0].sellerId, 1);
  assert.equal(trades[0].price, ask);
  assert.equal(trades[0].quantity, 1);
  assert.equal(state.players[0].goods.food, 1);
  assert.equal(state.players[1].goods.food, 4);
  assert.equal(state.players[0].money, 1000 - ask);
  assert.equal(state.players[1].money, ask);
  // Player-to-player trade conserves total money and total goods.
  assert.equal(totalMoney(state), moneyBefore);
  assert.equal(totalGoods(state, "food"), goodsBefore);
});

test("a lone buyer purchases from the store at the store sell price", () => {
  let state = auctionState(4, "food");
  state = withPlayers(state, { 0: { money: 1000, goods: { food: 0 } } });
  const goodsBefore = totalGoods(state, "food");
  const stockBefore = state.store.stock.food;
  const sellPrice = state.phase.payload.storeSellPrice;
  state = applyAction(state, { type: "set_auction_role", playerId: 0, role: "buyer" });
  state = applyAction(state, { type: "set_auction_intent", playerId: 0, intent: "up" });
  // Raise the bid until it reaches the store's sell price, then it lifts a unit.
  for (let i = 0; i < AUCTION_TICKS && state.phase.payload.trades.length === 0; i += 1) {
    state = applyAction(state, { type: "tick" });
  }
  const trades = state.phase.payload.trades;
  assert.equal(trades.length, 1);
  assert.equal(trades[0].sellerId, AUCTION_STORE_ID);
  assert.equal(trades[0].price, sellPrice);
  assert.equal(state.players[0].goods.food, 1);
  assert.equal(state.players[0].money, 1000 - sellPrice);
  assert.equal(state.store.stock.food, stockBefore - 1);
  // Store fills from stock: total goods stay conserved.
  assert.equal(totalGoods(state, "food"), goodsBefore);
});

test("a lone seller sells to the store at the store buy price", () => {
  let state = auctionState(5, "food");
  state = withPlayers(state, { 0: { money: 0, goods: { food: 5 } } });
  const goodsBefore = totalGoods(state, "food");
  const stockBefore = state.store.stock.food;
  const buyPrice = state.phase.payload.storeBuyPrice;
  state = applyAction(state, { type: "set_auction_role", playerId: 0, role: "seller" });
  state = applyAction(state, { type: "set_auction_intent", playerId: 0, intent: "down" });
  for (let i = 0; i < AUCTION_TICKS && state.phase.payload.trades.length === 0; i += 1) {
    state = applyAction(state, { type: "tick" });
  }
  const trades = state.phase.payload.trades;
  assert.equal(trades.length, 1);
  assert.equal(trades[0].buyerId, AUCTION_STORE_ID);
  assert.equal(trades[0].price, buyPrice);
  assert.equal(state.players[0].goods.food, 4);
  assert.equal(state.players[0].money, buyPrice);
  assert.equal(state.store.stock.food, stockBefore + 1);
  assert.equal(totalGoods(state, "food"), goodsBefore);
});

test("an all-out auction times out with no trade and then advances on end_auction", () => {
  let state = auctionState(6, "energy");
  for (let i = 0; i < AUCTION_TICKS; i += 1) {
    state = applyAction(state, { type: "tick" });
  }
  assert.equal(state.phase.payload.finished, true);
  assert.equal(state.phase.payload.ticksRemaining, 0);
  assert.equal(state.phase.payload.trades.length, 0);
  // Extra ticks past the timeout stay finished with no new trades.
  state = applyAction(state, { type: "tick" });
  assert.equal(state.phase.payload.trades.length, 0);
  // The driver dispatches end_auction; the sequencer moves to the next good.
  const advanced = applyAction(state, { type: "end_auction" });
  assert.equal(advanced.phase.payload.good, "smithore");
});

test("a zero-seller auction (only holding buyers) ends cleanly with no trade", () => {
  let state = auctionState(7, "food");
  state = withPlayers(state, { 0: { money: 1000 }, 1: { money: 1000 } });
  // Buyers sit at the midpoint below the store sell price and hold, so they
  // never cross the store's ask.
  state = applyAction(state, { type: "set_auction_role", playerId: 0, role: "buyer" });
  state = applyAction(state, { type: "set_auction_role", playerId: 1, role: "buyer" });
  for (let i = 0; i < AUCTION_TICKS; i += 1) {
    state = applyAction(state, { type: "tick" });
  }
  assert.equal(state.phase.payload.finished, true);
  assert.equal(state.phase.payload.trades.length, 0);
});

test("a zero-buyer auction (only holding sellers) ends cleanly with no trade", () => {
  let state = auctionState(8, "food");
  state = withPlayers(state, { 0: { goods: { food: 5 } }, 1: { goods: { food: 5 } } });
  // Sellers sit at the midpoint above the store buy price and hold.
  state = applyAction(state, { type: "set_auction_role", playerId: 0, role: "seller" });
  state = applyAction(state, { type: "set_auction_role", playerId: 1, role: "seller" });
  for (let i = 0; i < AUCTION_TICKS; i += 1) {
    state = applyAction(state, { type: "tick" });
  }
  assert.equal(state.phase.payload.finished, true);
  assert.equal(state.phase.payload.trades.length, 0);
});

test("fixed AI-vs-AI trace: streaming units at descending ask until the seller runs dry", () => {
  let state = auctionState(12345, "food");
  state = withPlayers(state, {
    0: { money: 1000, goods: { food: 0 } },
    1: { money: 0, goods: { food: 3 } },
  });
  const mid = participant(state, 0).price;
  // Scripted buyer walks its bid up; scripted seller walks its ask down.
  state = applyAction(state, { type: "set_auction_role", playerId: 0, role: "buyer" });
  state = applyAction(state, { type: "set_auction_intent", playerId: 0, intent: "up" });
  state = applyAction(state, { type: "set_auction_role", playerId: 1, role: "seller" });
  state = applyAction(state, { type: "set_auction_intent", playerId: 1, intent: "down" });

  // Tick 0: prices step to mid+1 / mid-1, cross, trade at the seller's ask mid-1.
  state = applyAction(state, { type: "tick" });
  assert.equal(participant(state, 0).price, mid + 1);
  assert.equal(participant(state, 1).price, mid - 1);
  assert.deepEqual(
    state.phase.payload.trades.map((trade) => trade.price),
    [mid - 1],
  );

  // Tick 1: mid+2 / mid-2, trade at mid-2.
  state = applyAction(state, { type: "tick" });
  assert.equal(participant(state, 0).price, mid + 2);
  assert.equal(participant(state, 1).price, mid - 2);
  assert.deepEqual(
    state.phase.payload.trades.map((trade) => trade.price),
    [mid - 1, mid - 2],
  );

  // Tick 2: mid+3 / mid-3, trade at mid-3; seller's third and last unit.
  state = applyAction(state, { type: "tick" });
  assert.deepEqual(
    state.phase.payload.trades.map((trade) => trade.price),
    [mid - 1, mid - 2, mid - 3],
  );

  // Tick 3: the seller is out of goods, so no further unit trades.
  state = applyAction(state, { type: "tick" });
  assert.equal(state.phase.payload.trades.length, 3);
  assert.equal(state.players[1].goods.food, 0);
  const proceeds = mid - 1 + (mid - 2) + (mid - 3);
  assert.equal(state.players[1].money, proceeds);
  assert.equal(state.players[0].money, 1000 - proceeds);
  assert.equal(state.players[0].goods.food, 3);
});
