// Node unit tests for the engine production and spoilage rules (economy.ts).
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applySpoilage, computeProduction } from "../src/engine/economy.ts";
import {
  ENERGY_YIELD_BY_TERRAIN,
  FOOD_YIELD_BY_TERRAIN,
  SMITHORE_YIELD_BY_TERRAIN,
} from "../src/engine/constants.ts";

// Build a small rectangular grid of unowned "plain" plots; individual cells
// are overridden by the caller before passing the grid to computeProduction.
function buildPlots(rows, cols) {
  const plots = [];
  for (let row = 0; row < rows; row += 1) {
    const plotRow = [];
    for (let col = 0; col < cols; col += 1) {
      plotRow.push({ terrain: "plain", owner: null, muleOutfit: null });
    }
    plots.push(plotRow);
  }
  return plots;
}

function buildPlayer(energy) {
  return {
    id: 0,
    isHuman: true,
    colorSlot: 0,
    money: 0,
    goods: { food: 0, energy, smithore: 0 },
  };
}

test("river plot outfitted for food yields the documented base rate", () => {
  const plots = buildPlots(1, 1);
  plots[0][0] = { terrain: "river", owner: 0, muleOutfit: "food" };
  const totals = computeProduction(plots, [buildPlayer(5)], 0);
  assert.equal(totals[0].food, FOOD_YIELD_BY_TERRAIN.river);
});

test("plain plot outfitted for energy yields the documented base rate", () => {
  const plots = buildPlots(1, 1);
  plots[0][0] = { terrain: "plain", owner: 0, muleOutfit: "energy" };
  const totals = computeProduction(plots, [buildPlayer(5)], 0);
  assert.equal(totals[0].energy, ENERGY_YIELD_BY_TERRAIN.plain);
});

test("mountain3 plot outfitted for smithore yields the documented base rate", () => {
  const plots = buildPlots(1, 1);
  plots[0][0] = { terrain: "mountain3", owner: 0, muleOutfit: "smithore" };
  const totals = computeProduction(plots, [buildPlayer(5)], 0);
  assert.equal(totals[0].smithore, SMITHORE_YIELD_BY_TERRAIN.mountain3);
});

test("same-owner same-outfit adjacency raises each plot's yield", () => {
  const plots = buildPlots(1, 2);
  plots[0][0] = { terrain: "plain", owner: 0, muleOutfit: "energy" };
  plots[0][1] = { terrain: "plain", owner: 0, muleOutfit: "energy" };
  const totalsWithNeighbor = computeProduction(plots, [buildPlayer(5)], 0);

  const isolatedPlots = buildPlots(1, 1);
  isolatedPlots[0][0] = { terrain: "plain", owner: 0, muleOutfit: "energy" };
  const totalsIsolated = computeProduction(isolatedPlots, [buildPlayer(5)], 0);

  assert.ok(totalsWithNeighbor[0].energy > totalsIsolated[0].energy);
});

test("an unpowered M.U.L.E. produces nothing", () => {
  const plots = buildPlots(1, 1);
  plots[0][0] = { terrain: "river", owner: 0, muleOutfit: "food" };
  const totals = computeProduction(plots, [buildPlayer(0)], 0);
  assert.equal(totals[0].food, 0);
});

test("surplus food above upkeep spoils by roughly half", () => {
  const result = applySpoilage({ food: 20, energy: 0, smithore: 0 }, 0);
  assert.ok(result.food < 20);
  assert.ok(result.food > 0);
});

test("surplus energy above upkeep decays by roughly a quarter", () => {
  const result = applySpoilage({ food: 0, energy: 20, smithore: 0 }, 0);
  assert.ok(result.energy < 20);
  assert.ok(result.energy > result.energy * (1 - 0.25) - 1);
});

test("smithore never decays", () => {
  const result = applySpoilage({ food: 0, energy: 0, smithore: 15 }, 3);
  assert.equal(result.smithore, 15);
});

test("upkeep never drives a resource below zero", () => {
  const result = applySpoilage({ food: 1, energy: 1, smithore: 0 }, 5);
  assert.ok(result.food >= 0);
  assert.ok(result.energy >= 0);
});
