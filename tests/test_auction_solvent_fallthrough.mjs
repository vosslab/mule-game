// Node reducer-level regression tests pinning selectTrade's fallthrough
// invariant in auction.ts: a trade executes iff at least one crossed,
// non-store-to-store, solvent pair exists. The old matcher considered only
// the single best bid/best ask pair, so an insolvent top bidder or an
// out-of-goods top seller collapsed the whole tick to "nothing crossed" and
// blocked every solvent trade behind it. These tests seat exactly that
// failure shape (invalid offer ranked first, valid offer ranked second) and
// assert the valid trade still executes, on both the buyer side and the
// seller side, and with both a player and the store as the fallback
// counterparty.
//
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyAction } from "../src/engine/game_state.ts";
import { createInitialGameState } from "../src/engine/turn.ts";
import { createAuctionPayload, AUCTION_STORE_ID } from "../src/engine/auction.ts";

// A round-1, post-start state. Land grant has not run, so the board is empty.
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

// Force the energy good's store stock and band, so the store's bid (floor)
// and ask (ceiling) sit at known values in every scenario below.
function withEnergyBand(state, stock, floor, ceiling) {
  const store = {
    ...state.store,
    stock: { ...state.store.stock, energy: stock },
    buyPrice: { ...state.store.buyPrice, energy: floor },
    sellPrice: { ...state.store.sellPrice, energy: ceiling },
  };
  return { ...state, store };
}

// Build a live (non-skipped) energy auction window with each participant's
// role, price, and intent fully overridden, ignoring the auto-assigned role
// from critical thresholds. `playerOverrides` seeds player money/goods;
// `participantOverrides` seeds the participants array by playerId.
function buildEnergyWindow(seed, stock, floor, ceiling, playerOverrides, participantOverrides) {
  let state = withPlayers(baseState(seed), playerOverrides);
  state = withEnergyBand(state, stock, floor, ceiling);
  const payload = createAuctionPayload(state, "energy");
  const participants = payload.participants.map((entry) => ({
    ...entry,
    ...participantOverrides[entry.playerId],
    intent: "hold",
  }));
  return {
    ...state,
    phase: {
      kind: "auction",
      payload: { ...payload, participants, skipped: false, finished: false },
    },
  };
}

// Advance one tick and return the resulting payload.
function tickOnce(state) {
  const next = applyAction(state, { type: "tick" });
  return next.phase.payload;
}

test("buyer-side: insolvent top bidder falls through to a solvent player-pair trade", () => {
  // Bids ranked best-first: player0 (40, insolvent) > player1 (35, solvent) >
  // store (10, the band floor). Only ask is a stocked player seller, so the
  // store never participates in the executed trade; this is the "one crossed,
  // solvent pair" case with a player on both sides.
  const start = buildEnergyWindow(
    3,
    0,
    10,
    45,
    {
      0: { money: 5, goods: { energy: 0 } },
      1: { money: 100, goods: { energy: 0 } },
      2: { money: 100, goods: { energy: 5 } },
    },
    {
      0: { role: "buyer", price: 40 },
      1: { role: "buyer", price: 35 },
      2: { role: "seller", price: 30 },
      3: { role: "out" },
    },
  );
  const payload = tickOnce(start);
  assert.equal(payload.trades.length, 1);
  const trade = payload.trades[0];
  assert.equal(trade.buyerId, 1, "the solvent second bidder must trade, not the insolvent top bid");
  assert.equal(trade.sellerId, 2);
  assert.equal(trade.price, 30);
});

test("buyer-side: insolvent top bidder falls through to a solvent store-ask trade", () => {
  // Same bid ranking (insolvent top, solvent second, store bid last), but no
  // player seller: the only ask is the store's standing offer. The solvent
  // second bidder must still trade, against the store this time.
  const start = buildEnergyWindow(
    3,
    1,
    10,
    30,
    {
      0: { money: 5, goods: { energy: 0 } },
      1: { money: 100, goods: { energy: 0 } },
    },
    {
      0: { role: "buyer", price: 35 },
      1: { role: "buyer", price: 32 },
      2: { role: "out" },
      3: { role: "out" },
    },
  );
  const payload = tickOnce(start);
  assert.equal(payload.trades.length, 1);
  const trade = payload.trades[0];
  assert.equal(trade.buyerId, 1, "the solvent second bidder must trade, not the insolvent top bid");
  assert.equal(trade.sellerId, AUCTION_STORE_ID);
  assert.equal(trade.price, 30);
});

test("seller-side: an out-of-goods top ask falls through to a stocked player-pair trade", () => {
  // Asks ranked best-first: player1 (15, out of goods) > player2 (18, stocked).
  // The single buyer crosses both, so canExecute must skip the invalid ask
  // and land the trade on the stocked second seller.
  const start = buildEnergyWindow(
    3,
    0,
    10,
    45,
    {
      0: { money: 100, goods: { energy: 0 } },
      1: { money: 100, goods: { energy: 0 } },
      2: { money: 100, goods: { energy: 5 } },
    },
    {
      0: { role: "buyer", price: 25 },
      1: { role: "seller", price: 15 },
      2: { role: "seller", price: 18 },
      3: { role: "out" },
    },
  );
  const payload = tickOnce(start);
  assert.equal(payload.trades.length, 1);
  const trade = payload.trades[0];
  assert.equal(trade.buyerId, 0);
  assert.equal(
    trade.sellerId,
    2,
    "the stocked second seller must trade, not the out-of-goods top ask",
  );
  assert.equal(trade.price, 18);
});

test("seller-side: an out-of-goods top ask falls through to the store's stocked ask", () => {
  // Same invalid-top-ask shape, but the fallback ask is the store's standing
  // offer rather than a player: the only player seller is out of goods, and
  // the store is the sole stocked counterparty.
  const start = buildEnergyWindow(
    3,
    1,
    10,
    18,
    {
      0: { money: 100, goods: { energy: 0 } },
      1: { money: 100, goods: { energy: 0 } },
    },
    {
      0: { role: "buyer", price: 25 },
      1: { role: "seller", price: 15 },
      2: { role: "out" },
      3: { role: "out" },
    },
  );
  const payload = tickOnce(start);
  assert.equal(payload.trades.length, 1);
  const trade = payload.trades[0];
  assert.equal(trade.buyerId, 0);
  assert.equal(
    trade.sellerId,
    AUCTION_STORE_ID,
    "the store's stocked ask must trade, not the out-of-goods player",
  );
  assert.equal(trade.price, 18);
});

test("equivalence: a solvent top bid and top ask trade exactly like the old single-best matcher", () => {
  // No fallthrough needed: the single best bid and single best ask are
  // already solvent, so the new bid-major/ask-minor scan must reproduce the
  // old "maximize bid, minimize ask" outcome on its first comparison.
  const start = buildEnergyWindow(
    3,
    0,
    10,
    45,
    {
      0: { money: 100, goods: { energy: 0 } },
      1: { money: 100, goods: { energy: 5 } },
    },
    {
      0: { role: "buyer", price: 30 },
      1: { role: "seller", price: 20 },
      2: { role: "out" },
      3: { role: "out" },
    },
  );
  const payload = tickOnce(start);
  assert.equal(payload.trades.length, 1);
  const trade = payload.trades[0];
  assert.equal(trade.buyerId, 0);
  assert.equal(trade.sellerId, 1);
  assert.equal(trade.price, 20);
});

test("tie-break: an equal-price lowest-id bid exhausts every ask before the scan moves on", () => {
  // player0 and player1 both bid 30 (tied); player0 (lower id) ranks first.
  // The cheapest ask (20) is invalid (out of goods), the next ask (25) is
  // stocked. Strict lexicographic order (bid price desc, bid id asc, ask
  // price asc, ask id asc) means the scan must finish walking player0's asks
  // -- landing on the pricier stocked ask -- before ever considering player1.
  const start = buildEnergyWindow(
    3,
    0,
    10,
    45,
    {
      0: { money: 100, goods: { energy: 0 } },
      1: { money: 100, goods: { energy: 0 } },
      2: { money: 100, goods: { energy: 0 } },
      3: { money: 100, goods: { energy: 5 } },
    },
    {
      0: { role: "buyer", price: 30 },
      1: { role: "buyer", price: 30 },
      2: { role: "seller", price: 20 },
      3: { role: "seller", price: 25 },
    },
  );
  const payload = tickOnce(start);
  assert.equal(payload.trades.length, 1);
  const trade = payload.trades[0];
  assert.equal(trade.buyerId, 0, "the lower-id tied bid must be the one that trades");
  assert.equal(
    trade.sellerId,
    3,
    "the scan must fall through to the stocked seller before moving bids",
  );
  assert.equal(trade.price, 25);
});
