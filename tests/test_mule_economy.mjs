// Node unit tests for the M.U.L.E. stock/price economy (store.ts `rebuildMules`,
// `computeMulePurchaseCost`, `applyMulePurchase`) and the turn.ts `buy_mule`
// negative-economy invariants.
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyAction } from "../src/engine/game_state.ts";
import { createInitialGameState, canBuyMule } from "../src/engine/turn.ts";
import {
  applyMulePurchase,
  computeMulePurchaseCost,
  createInitialStoreState,
  rebuildMules,
} from "../src/engine/store.ts";
import {
  MULE_PRICE_FLOOR_STEP,
  MULE_PRICE_SMITHORE_MULT,
  MULE_STOCK_CAP,
  SMITHORE_PER_MULE,
} from "../src/engine/constants.ts";

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

// Drive a fresh started game through the land grant (every player claims one
// plot) into the develop phase for the first player in turn order.
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

//============================================
// rebuildMules: rebuild math, cap, price coupling
//============================================

test("rebuild converts smithore to mules up to the deficit, spending SMITHORE_PER_MULE per mule", () => {
  const base = createInitialStoreState();
  const store = {
    ...base,
    muleStock: MULE_STOCK_CAP - 4,
    stock: { ...base.stock, smithore: 20 },
    prices: { ...base.prices, smithore: 60 },
  };
  const rebuilt = rebuildMules(store);
  assert.equal(rebuilt.muleStock, MULE_STOCK_CAP);
  assert.equal(rebuilt.stock.smithore, 20 - 4 * SMITHORE_PER_MULE);
});

test("rebuild floors smithore spend to an even multiple when smithore-limited (odd stock)", () => {
  const base = createInitialStoreState();
  const store = {
    ...base,
    muleStock: 0,
    stock: { ...base.stock, smithore: 7 },
    prices: { ...base.prices, smithore: 60 },
  };
  const rebuilt = rebuildMules(store);
  // 7 smithore is odd; the lone leftover unit is never spent: floor(7/2)*2 = 6
  // spent, building 3 mules, leaving 1 smithore in stock.
  assert.equal(rebuilt.muleStock, 3);
  assert.equal(rebuilt.stock.smithore, 1);
});

test("rebuild is a no-op on stock once muleStock is already at MULE_STOCK_CAP", () => {
  const base = createInitialStoreState();
  const store = {
    ...base,
    muleStock: MULE_STOCK_CAP,
    stock: { ...base.stock, smithore: 10 },
    prices: { ...base.prices, smithore: 60 },
  };
  const rebuilt = rebuildMules(store);
  assert.equal(rebuilt.muleStock, MULE_STOCK_CAP);
  assert.equal(rebuilt.stock.smithore, 10);
  // The mule price still recomputes even when nothing is built (planet_mule's
  // Shop.buildMules sets mulePrice unconditionally, not gated on units built).
  assert.equal(rebuilt.mulePrice, 120);
});

test("mule price is MULE_PRICE_SMITHORE_MULT times the smithore price, floored to MULE_PRICE_FLOOR_STEP", () => {
  const base = createInitialStoreState();
  const store = { ...base, prices: { ...base.prices, smithore: 57 } };
  const rebuilt = rebuildMules(store);
  const raw = 57 * MULE_PRICE_SMITHORE_MULT;
  assert.equal(rebuilt.mulePrice, raw - (raw % MULE_PRICE_FLOOR_STEP));
  assert.equal(rebuilt.mulePrice, 110);
});

test("computeMulePurchaseCost is the store's live mule price plus the outfit cost", () => {
  const base = createInitialStoreState();
  const store = { ...base, mulePrice: 130 };
  assert.equal(computeMulePurchaseCost(store, "food"), 130 + 25);
});

test("applyMulePurchase decrements muleStock by exactly one", () => {
  const base = createInitialStoreState();
  const decremented = applyMulePurchase(base);
  assert.equal(decremented.muleStock, base.muleStock - 1);
});

//============================================
// buy_mule: stock-0 rejection and negative-economy invariants
//============================================

test("buy_mule is rejected (throws) when the store is out of M.U.L.E. stock", () => {
  const started = applyAction(createInitialGameState(101), { type: "start_game" });
  const afterGrant = claimThroughLandGrant(started);
  const active = afterGrant.phase.payload.activePlayer;
  const outOfStock = { ...afterGrant, store: { ...afterGrant.store, muleStock: 0 } };
  assert.equal(canBuyMule(outOfStock, active), false);
  assert.throws(() => applyAction(outOfStock, { type: "buy_mule", playerId: active }));
});

test("buy_mule at exact affordability succeeds and never drives money negative", () => {
  const started = applyAction(createInitialGameState(102), { type: "start_game" });
  const afterGrant = claimThroughLandGrant(started);
  const active = afterGrant.phase.payload.activePlayer;
  const exact = {
    ...afterGrant,
    players: afterGrant.players.map((player) =>
      player.id === active ? { ...player, money: afterGrant.store.mulePrice } : player,
    ),
  };
  assert.equal(canBuyMule(exact, active), true);
  const bought = applyAction(exact, { type: "buy_mule", playerId: active });
  assert.equal(bought.players[active].money, 0);
  assert.equal(bought.store.muleStock, afterGrant.store.muleStock - 1);
});

test("buy_mule one dollar short of the price is rejected (throws), money unchanged", () => {
  const started = applyAction(createInitialGameState(103), { type: "start_game" });
  const afterGrant = claimThroughLandGrant(started);
  const active = afterGrant.phase.payload.activePlayer;
  const oneShort = {
    ...afterGrant,
    players: afterGrant.players.map((player) =>
      player.id === active ? { ...player, money: afterGrant.store.mulePrice - 1 } : player,
    ),
  };
  assert.equal(canBuyMule(oneShort, active), false);
  assert.throws(() => applyAction(oneShort, { type: "buy_mule", playerId: active }));
});

test("outfit_mule at exact affordability succeeds and never drives money negative", () => {
  const started = applyAction(createInitialGameState(104), { type: "start_game" });
  const afterGrant = claimThroughLandGrant(started);
  const active = afterGrant.phase.payload.activePlayer;
  const bought = applyAction(afterGrant, { type: "buy_mule", playerId: active });
  const outfitCost = 25; // food outfit cost, constants.ts OUTFIT_COST.food
  const exact = {
    ...bought,
    players: bought.players.map((player) =>
      player.id === active ? { ...player, money: outfitCost } : player,
    ),
  };
  const outfitted = applyAction(exact, { type: "outfit_mule", playerId: active, resource: "food" });
  assert.equal(outfitted.players[active].money, 0);
});

test("outfit_mule one dollar short of the outfit cost is rejected (throws)", () => {
  const started = applyAction(createInitialGameState(105), { type: "start_game" });
  const afterGrant = claimThroughLandGrant(started);
  const active = afterGrant.phase.payload.activePlayer;
  const bought = applyAction(afterGrant, { type: "buy_mule", playerId: active });
  const outfitCost = 25;
  const oneShort = {
    ...bought,
    players: bought.players.map((player) =>
      player.id === active ? { ...player, money: outfitCost - 1 } : player,
    ),
  };
  assert.throws(() =>
    applyAction(oneShort, { type: "outfit_mule", playerId: active, resource: "food" }),
  );
});
