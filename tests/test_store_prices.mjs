// Node unit tests for the dynamic store pricing engine (store.ts):
// per-good quote derivation, the supply/demand recalc at fixed
// ratios, clamp and floor edges, crystite's floored random draw,
// average-trade-price feedback, store-food halving, and determinism per seed.
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { createInitialGameState } from "../src/engine/turn.ts";
import { applyAction } from "../src/engine/game_state.ts";
import { createRng } from "../src/engine/rng.ts";
import {
  applyAverageTradePrice,
  applySellToStore,
  computeColonyStats,
  createInitialStoreState,
  deriveGoodQuote,
  spoilStoreFood,
  updateStoreForNewRound,
} from "../src/engine/store.ts";
import {
  STORE_PRICE_CEILING,
  STORE_SELL_SPREAD_BY_GOOD,
  STORE_STOCK_CAP,
} from "../src/engine/constants.ts";

// A deterministic Rng stub: next() returns a fixed value so normalDistributed
// (sum of 12 draws minus 6) is predictable, and nextInt(max) floors that value
// scaled to the range. With value 0.5: normalDistributed = 12*0.5 - 6 = 0 (zero
// smithore jitter) and nextInt(100) = 50.
function stubRng(value) {
  return {
    next: () => value,
    nextInt: (max) => Math.floor(value * max),
    getState: () => 0,
  };
}

// Build a store with overridden base prices (buy/sell re-derived), starting
// from the real initial store so stock and mule count are realistic.
function storeWithPrices(priceOverrides) {
  const base = createInitialStoreState();
  const prices = { ...base.prices, ...priceOverrides };
  // Re-derive buy/sell for the overridden prices by round-tripping through
  // updateStoreForNewRound is overkill; deriveGoodQuote per good is cleaner.
  const buyPrice = { ...base.buyPrice };
  const sellPrice = { ...base.sellPrice };
  for (const good of Object.keys(priceOverrides)) {
    const quote = deriveGoodQuote(good, priceOverrides[good]);
    prices[good] = quote.price;
    buyPrice[good] = quote.buyPrice;
    sellPrice[good] = quote.sellPrice;
  }
  return { ...base, prices, buyPrice, sellPrice };
}

//============================================
// deriveGoodQuote: per-good spread and clamp/floor edges
//============================================

test("food quote: price - 15 buy, +35 sell, at the planet_mule initial base", () => {
  const quote = deriveGoodQuote("food", 30);
  assert.deepEqual(quote, { price: 30, buyPrice: 15, sellPrice: 50 });
});

test("energy quote: price - 15 buy, +35 sell", () => {
  const quote = deriveGoodQuote("energy", 25);
  assert.deepEqual(quote, { price: 25, buyPrice: 10, sellPrice: 45 });
});

test("smithore quote: buy equals base (no margin), +35 sell", () => {
  const quote = deriveGoodQuote("smithore", 50);
  assert.deepEqual(quote, { price: 50, buyPrice: 50, sellPrice: 85 });
});

test("food and energy clamp to their per-good price floor", () => {
  assert.equal(deriveGoodQuote("food", 5).price, 30);
  assert.equal(deriveGoodQuote("energy", 1).price, 25);
  assert.equal(deriveGoodQuote("smithore", 3).price, 20);
});

test("every good clamps to the shared ceiling", () => {
  assert.equal(deriveGoodQuote("food", 999).price, STORE_PRICE_CEILING);
  assert.equal(deriveGoodQuote("energy", 999).price, STORE_PRICE_CEILING);
  assert.equal(deriveGoodQuote("smithore", 999).price, STORE_PRICE_CEILING);
});

test("the raw price is rounded before clamping", () => {
  // 30.6 rounds to 31, in-band, so buy 16 / sell 51.
  assert.deepEqual(deriveGoodQuote("food", 30.6), { price: 31, buyPrice: 16, sellPrice: 51 });
});

//============================================
// crystite: floored to a multiple of 4, unclamped, +140 spread
//============================================

test("crystite floors to a multiple of 4 and is not band-clamped", () => {
  // 50 -> 48 (50 - 50%4). Above the ceiling stays unclamped: 999 -> 996.
  assert.deepEqual(deriveGoodQuote("crystite", 50), { price: 48, buyPrice: 48, sellPrice: 188 });
  assert.equal(deriveGoodQuote("crystite", 999).price, 996);
  assert.equal(deriveGoodQuote("crystite", 149).price % 4, 0);
});

test("crystite sell spread is 140 over buy", () => {
  const quote = deriveGoodQuote("crystite", 148);
  assert.equal(quote.sellPrice - quote.buyPrice, STORE_SELL_SPREAD_BY_GOOD.crystite);
});

//============================================
// updateStoreForNewRound: supply/demand factor at fixed ratios
//============================================

test("balanced food demand and supply reprices to the full base (factor 1.0)", () => {
  const store = storeWithPrices({ food: 100 });
  const stats = {
    foodSupply: 10,
    foodNeed: 10,
    energySupply: 10,
    energyNeed: 10,
    muleSupply: 8,
    muleNeed: 8,
  };
  const next = updateStoreForNewRound(store, stats, stubRng(0.5));
  // factor = 0.25 + 0.75 * (10/10) = 1.0 -> price stays 100.
  assert.equal(next.prices.food, 100);
  assert.equal(next.buyPrice.food, 85);
  assert.equal(next.sellPrice.food, 120);
});

test("a food glut (zero demand) drops the factor to 0.25 and clamps at the floor", () => {
  const store = storeWithPrices({ food: 100 });
  const stats = {
    foodSupply: 10,
    foodNeed: 0,
    energySupply: 10,
    energyNeed: 10,
    muleSupply: 8,
    muleNeed: 8,
  };
  const next = updateStoreForNewRound(store, stats, stubRng(0.5));
  // factor = 0.25 -> raw 25 -> clamp up to the food floor 30.
  assert.equal(next.prices.food, 30);
});

test("energy scarcity raises the price by the demand/supply factor", () => {
  const store = storeWithPrices({ energy: 40 });
  const stats = {
    foodSupply: 10,
    foodNeed: 10,
    energySupply: 10,
    energyNeed: 20,
    muleSupply: 8,
    muleNeed: 8,
  };
  const next = updateStoreForNewRound(store, stats, stubRng(0.5));
  // factor = 0.25 + 0.75 * (20/10) = 1.75 -> raw 70.
  assert.equal(next.prices.energy, 70);
  assert.equal(next.buyPrice.energy, 55);
  assert.equal(next.sellPrice.energy, 90);
});

test("smithore clamps its ratio to [0.25, 3.0] before applying the factor", () => {
  const store = storeWithPrices({ smithore: 50 });
  // muleNeed/muleSupply = 100 clamps to 3.0 -> factor 2.5 -> 50*2.5 = 125.
  const scarce = updateStoreForNewRound(
    store,
    { foodSupply: 1, foodNeed: 1, energySupply: 1, energyNeed: 1, muleSupply: 1, muleNeed: 100 },
    stubRng(0.5),
  );
  assert.equal(scarce.prices.smithore, 125);
});

test("smithore floors its post-factor price at 50 before jitter", () => {
  const store = storeWithPrices({ smithore: 50 });
  // ratio 0 clamps to 0.25 -> factor 0.4375 -> 50*0.4375 = 21.875 -> round 22
  // -> floored up to 50; zero jitter from the stub leaves it at 50.
  const glut = updateStoreForNewRound(
    store,
    { foodSupply: 1, foodNeed: 1, energySupply: 1, energyNeed: 1, muleSupply: 100, muleNeed: 0 },
    stubRng(0.5),
  );
  assert.equal(glut.prices.smithore, 50);
});

test("crystite reprices from a fresh floored random draw, ignoring the old price", () => {
  const store = storeWithPrices({ crystite: 200 });
  const stats = {
    foodSupply: 10,
    foodNeed: 10,
    energySupply: 10,
    energyNeed: 10,
    muleSupply: 8,
    muleNeed: 8,
  };
  // nextInt(100) = 50 -> raw 50 + 50 = 100 -> already a multiple of 4.
  const next = updateStoreForNewRound(store, stats, stubRng(0.5));
  assert.equal(next.prices.crystite, 100);
  assert.equal(next.sellPrice.crystite, 240);
});

//============================================
// determinism
//============================================

test("same seed and inputs produce identical recomputed prices", () => {
  const store = createInitialStoreState();
  const stats = {
    foodSupply: 7,
    foodNeed: 12,
    energySupply: 9,
    energyNeed: 5,
    muleSupply: 6,
    muleNeed: 4,
  };
  const first = updateStoreForNewRound(store, stats, createRng(4242));
  const second = updateStoreForNewRound(store, stats, createRng(4242));
  assert.deepEqual(first.prices, second.prices);
  assert.deepEqual(first.buyPrice, second.buyPrice);
  assert.deepEqual(first.sellPrice, second.sellPrice);
});

//============================================
// average-trade-price feedback
//============================================

test("average trade price becomes the good's next base price", () => {
  const store = storeWithPrices({ food: 100 });
  const trades = [
    { tick: 0, buyerId: 0, sellerId: 1, price: 40, quantity: 1 },
    { tick: 1, buyerId: 0, sellerId: 1, price: 44, quantity: 1 },
  ];
  const fed = applyAverageTradePrice(store, "food", trades);
  // avg = floor((40 + 44) / 2) = 42 -> food base 42, buy 27, sell 62.
  assert.equal(fed.prices.food, 42);
  assert.equal(fed.buyPrice.food, 27);
  assert.equal(fed.sellPrice.food, 62);
  // Other goods are untouched.
  assert.equal(fed.prices.energy, store.prices.energy);
});

test("a dead auction (no trades) leaves the price untouched", () => {
  const store = storeWithPrices({ food: 100 });
  const fed = applyAverageTradePrice(store, "food", []);
  assert.equal(fed, store);
});

//============================================
// store food spoilage
//============================================

test("store food halves each round, but a lone unit survives", () => {
  const store = createInitialStoreState();
  const eight = { ...store, stock: { ...store.stock, food: 8 } };
  assert.equal(spoilStoreFood(eight).stock.food, 4);
  const three = { ...store, stock: { ...store.stock, food: 3 } };
  assert.equal(spoilStoreFood(three).stock.food, 1);
  const one = { ...store, stock: { ...store.stock, food: 1 } };
  assert.equal(spoilStoreFood(one).stock.food, 1);
  const zero = { ...store, stock: { ...store.stock, food: 0 } };
  assert.equal(spoilStoreFood(zero), zero);
});

test("selling to the store caps its stock at STORE_STOCK_CAP", () => {
  const store = {
    ...createInitialStoreState(),
    stock: { food: 250, energy: 0, smithore: 0, crystite: 0 },
  };
  // 250 + 10 would be 260, but the store caps at 255.
  assert.equal(applySellToStore(store, "food", 10).stock.food, STORE_STOCK_CAP);
  // A normal sale well below the cap is unaffected.
  assert.equal(applySellToStore(createInitialStoreState(), "food", 3).stock.food, 11);
});

//============================================
// computeColonyStats: supply and demand from the whole game state
//============================================

test("colony stats sum store and player holdings for supply and count mule needs", () => {
  const players = [
    {
      id: 0,
      isHuman: true,
      colorSlot: 0,
      money: 0,
      goods: { food: 3, energy: 1, smithore: 0, crystite: 0 },
    },
    {
      id: 1,
      isHuman: false,
      colorSlot: 1,
      money: 0,
      goods: { food: 2, energy: 4, smithore: 0, crystite: 0 },
    },
  ];
  const plots = [
    [
      { terrain: "plain", owner: 0, muleOutfit: "food", crystiteLevel: 0, crystiteRevealed: false },
      {
        terrain: "plain",
        owner: 1,
        muleOutfit: "energy",
        crystiteLevel: 0,
        crystiteRevealed: false,
      },
      {
        terrain: "plain",
        owner: null,
        muleOutfit: null,
        crystiteLevel: 0,
        crystiteRevealed: false,
      },
      { terrain: "town", owner: null, muleOutfit: null, crystiteLevel: 0, crystiteRevealed: false },
    ],
    [
      { terrain: "plain", owner: 0, muleOutfit: null, crystiteLevel: 0, crystiteRevealed: false },
      {
        terrain: "mountain1",
        owner: null,
        muleOutfit: null,
        crystiteLevel: 0,
        crystiteRevealed: false,
      },
    ],
  ];
  const store = {
    ...createInitialStoreState(),
    stock: { food: 8, energy: 8, smithore: 6, crystite: 0 },
    muleStock: 14,
  };
  const stats = computeColonyStats(players, plots, store, 2);

  // Food supply = store 8 + players (3 + 2) = 13; food need = 2 players * req[2]=3 = 6.
  assert.equal(stats.foodSupply, 13);
  assert.equal(stats.foodNeed, 6);
  // Energy supply = store 8 + players (1 + 4) = 13; one non-energy mule (food)
  // plus one per player = 1 + 2 = 3.
  assert.equal(stats.energySupply, 13);
  assert.equal(stats.energyNeed, 3);
  // Mule supply = 14 mules + floor(6/2) = 17. Free lands (excluding town) = 2,
  // owned-undeveloped = 1; min(2, 2 players) + 1 = 3.
  assert.equal(stats.muleSupply, 17);
  assert.equal(stats.muleNeed, 3);
});

//============================================
// integration: prices move across a round boundary in the real engine
//============================================

test("a played round advances into fresh in-band store prices with halved store food", () => {
  let state = applyAction(createInitialGameState(2026), { type: "start_game" });
  const foodStockBefore = state.store.stock.food;
  // Drive round 1 with no trades: pass the land grant, end every develop turn,
  // tick production, and end each good's auction untouched.
  for (let safety = 0; safety < 200 && state.round === 1; safety += 1) {
    const phase = state.phase.kind;
    if (phase === "land_grant") {
      const picker = state.phase.payload.pickOrder[state.phase.payload.pickIndex];
      state = applyAction(state, { type: "pass", playerId: picker });
    } else if (phase === "land_auction") {
      // Skip cleanly through any colony land-auction slot without bidding:
      // tick to the going-countdown's no-sale finish, then end the slot.
      if (state.phase.payload.finished) {
        state = applyAction(state, { type: "end_land_auction" });
      } else {
        state = applyAction(state, { type: "tick" });
      }
    } else if (phase === "develop") {
      state = applyAction(state, { type: "end_turn", playerId: state.phase.payload.activePlayer });
    } else if (phase === "production") {
      state = applyAction(state, { type: "tick" });
    } else if (phase === "auction") {
      state = applyAction(state, { type: "end_auction" });
    }
  }
  assert.equal(state.round, 2);
  assert.equal(state.phase.kind, "land_grant");
  // Store food halved at the boundary (no auction trades changed the stock).
  assert.equal(state.store.stock.food, Math.floor(foodStockBefore / 2));
  // Every good's base price stays a finite integer inside its valid band.
  for (const good of ["food", "energy", "smithore"]) {
    assert.ok(Number.isInteger(state.store.prices[good]));
    assert.ok(state.store.prices[good] <= STORE_PRICE_CEILING);
    assert.ok(state.store.buyPrice[good] < state.store.sellPrice[good]);
  }
});
