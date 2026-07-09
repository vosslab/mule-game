// Node unit tests for store pricing (store.ts) and end-of-game scoring
// (scoring.ts). Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyBuyFromStore,
  applySellToStore,
  computeBuyCost,
  computeMulePurchaseCost,
  computeOutfitCost,
  computeSellProceeds,
  createInitialStoreState,
} from "../src/engine/store.ts";
import { computeScores, computeWinnerIndex } from "../src/engine/scoring.ts";
import { MULE_BASE_PRICE } from "../src/engine/constants.ts";

function buildPlayer(overrides) {
  return {
    id: 0,
    isHuman: true,
    colorSlot: 0,
    money: 0,
    goods: { food: 0, energy: 0, smithore: 0 },
    ...overrides,
  };
}

test("mule purchase cost is the base price plus the outfit cost", () => {
  const store = createInitialStoreState();
  const cost = computeMulePurchaseCost("smithore");
  assert.equal(cost, MULE_BASE_PRICE + computeOutfitCost("smithore"));
  assert.ok(store.stock.smithore > 0);
});

test("buying and selling round-trip restores store stock", () => {
  const store = createInitialStoreState();
  const boughtDown = applyBuyFromStore(store, "food", 5);
  const restored = applySellToStore(boughtDown, "food", 5);
  assert.equal(restored.stock.food, store.stock.food);
});

test("sell proceeds and buy cost scale linearly with quantity", () => {
  const store = createInitialStoreState();
  const proceedsOne = computeSellProceeds(store, "energy", 1);
  const proceedsFive = computeSellProceeds(store, "energy", 5);
  assert.equal(proceedsFive, proceedsOne * 5);

  const costOne = computeBuyCost(store, "energy", 1);
  const costFive = computeBuyCost(store, "energy", 5);
  assert.equal(costFive, costOne * 5);
});

test("a richer player scores higher with an otherwise identical board", () => {
  const plots = [[{ terrain: "plain", owner: null, muleOutfit: null }]];
  const richPlayer = buildPlayer({ id: 0, money: 5000 });
  const poorPlayer = buildPlayer({ id: 1, money: 100 });
  const state = { players: [richPlayer, poorPlayer], plots };
  const scores = computeScores(state);
  assert.ok(scores[0] > scores[1]);
});

test("owning more land raises a player's score", () => {
  const plots = [
    [
      { terrain: "plain", owner: 0, muleOutfit: null },
      { terrain: "plain", owner: 0, muleOutfit: null },
    ],
  ];
  const landedPlayer = buildPlayer({ id: 0, money: 0 });
  const landlessPlayer = buildPlayer({ id: 1, money: 0 });
  const state = { players: [landedPlayer, landlessPlayer], plots };
  const scores = computeScores(state);
  assert.ok(scores[0] > scores[1]);
});

test("the winner is the player with the highest score", () => {
  const plots = [[{ terrain: "plain", owner: null, muleOutfit: null }]];
  const state = {
    players: [buildPlayer({ id: 0, money: 10 }), buildPlayer({ id: 1, money: 999 })],
    plots,
  };
  assert.equal(computeWinnerIndex(state), 1);
});

test("ties are broken by the lowest player index", () => {
  const plots = [[{ terrain: "plain", owner: null, muleOutfit: null }]];
  const state = {
    players: [buildPlayer({ id: 0, money: 500 }), buildPlayer({ id: 1, money: 500 })],
    plots,
  };
  assert.equal(computeWinnerIndex(state), 0);
});
