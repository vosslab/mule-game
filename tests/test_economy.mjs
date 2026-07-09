// Node unit tests for the engine production and spoilage rules (economy.ts).
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applySpoilage, computeProduction } from "../src/engine/economy.ts";
import { createRng } from "../src/engine/rng.ts";
import {
  ENERGY_PER_MULE,
  ENERGY_YIELD_BY_TERRAIN,
  FOOD_YIELD_BY_TERRAIN,
  ORE_SPOILAGE_CAP,
  PRODUCTION_LEARNING_CURVE_DIVISOR,
  PRODUCTION_MAX_YIELD,
  SMITHORE_YIELD_BY_TERRAIN,
} from "../src/engine/constants.ts";

// Every draw from computeProduction's gaussian variance is round(x) for x in
// [-6, 6) (see rng.ts's normalDistributed doc), so round(x) never falls
// outside [-6, 6]. Every bound check below uses this constant rather than a
// hardcoded 6, so the intent (variance is bounded, not an arbitrary number)
// stays explicit at the call site.
const VARIANCE_BOUND = 6;

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
    goods: { food: 0, energy, smithore: 0, crystite: 0 },
  };
}

// Build a single-row board with `count` owner-0 plots outfitted for
// `resource` on `terrain`, spaced two columns apart (outfitted cells only at
// even column indices) so no two outfitted plots are ever orthogonally
// adjacent -- isolating the learning-curve count bonus from the adjacency
// bonus regardless of how many plots the row holds.
function buildSpacedRow(count, terrain, resource) {
  const cols = count === 0 ? 1 : count * 2 - 1;
  const plots = buildPlots(1, cols);
  for (let index = 0; index < count; index += 1) {
    plots[0][index * 2] = { terrain, owner: 0, muleOutfit: resource };
  }
  return plots;
}

// Mean of a numeric array.
function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Run `computeProduction` on `plots` for one abundantly-powered owner-0
// player across `seedCount` fresh seeds (seeds 1..seedCount), returning the
// list of resulting total yields for `resource`. Used by the statistical
// tests below, where a single deterministic sample cannot distinguish a
// step this small (learning-curve/adjacency bonuses of 1-2 units) from the
// unconditional [-6, 6] variance noise on top of it.
function sampleYields(plots, resource, seedCount) {
  const samples = [];
  for (let seed = 1; seed <= seedCount; seed += 1) {
    const production = computeProduction(plots, [buildPlayer(100)], 0, createRng(seed));
    samples.push(production.yields[0][resource]);
  }
  return samples;
}

const SEED_COUNT = 50;

test("river plot outfitted for food yields within variance bounds of the documented base rate", () => {
  const plots = buildPlots(1, 1);
  plots[0][0] = { terrain: "river", owner: 0, muleOutfit: "food" };
  const production = computeProduction(plots, [buildPlayer(5)], 0, createRng(1));
  const base = FOOD_YIELD_BY_TERRAIN.river;
  assert.ok(production.yields[0].food >= Math.max(0, base - VARIANCE_BOUND));
  assert.ok(production.yields[0].food <= Math.min(base + VARIANCE_BOUND, PRODUCTION_MAX_YIELD));
});

test("plain plot outfitted for energy yields within variance bounds of the documented base rate", () => {
  const plots = buildPlots(1, 1);
  plots[0][0] = { terrain: "plain", owner: 0, muleOutfit: "energy" };
  const production = computeProduction(plots, [buildPlayer(5)], 0, createRng(1));
  const base = ENERGY_YIELD_BY_TERRAIN.plain;
  assert.ok(production.yields[0].energy >= Math.max(0, base - VARIANCE_BOUND));
  assert.ok(production.yields[0].energy <= Math.min(base + VARIANCE_BOUND, PRODUCTION_MAX_YIELD));
});

test("mountain3 plot outfitted for smithore yields within variance bounds of the documented base rate", () => {
  const plots = buildPlots(1, 1);
  plots[0][0] = { terrain: "mountain3", owner: 0, muleOutfit: "smithore" };
  const production = computeProduction(plots, [buildPlayer(5)], 0, createRng(1));
  const base = SMITHORE_YIELD_BY_TERRAIN.mountain3;
  assert.ok(production.yields[0].smithore >= Math.max(0, base - VARIANCE_BOUND));
  assert.ok(production.yields[0].smithore <= Math.min(base + VARIANCE_BOUND, PRODUCTION_MAX_YIELD));
});

test("an unpowered M.U.L.E. produces nothing", () => {
  const plots = buildPlots(1, 1);
  plots[0][0] = { terrain: "river", owner: 0, muleOutfit: "food" };
  const production = computeProduction(plots, [buildPlayer(0)], 0, createRng(1));
  assert.equal(production.yields[0].food, 0);
  assert.equal(production.energyConsumed[0], 0);
});

test("a powered non-energy M.U.L.E. consumes ENERGY_PER_MULE energy", () => {
  const plots = buildPlots(1, 1);
  plots[0][0] = { terrain: "river", owner: 0, muleOutfit: "food" };
  const production = computeProduction(plots, [buildPlayer(5)], 0, createRng(1));
  assert.equal(production.energyConsumed[0], ENERGY_PER_MULE);
});

test("an energy M.U.L.E. draws no power from its own owner", () => {
  const plots = buildPlots(1, 1);
  plots[0][0] = { terrain: "plain", owner: 0, muleOutfit: "energy" };
  const production = computeProduction(plots, [buildPlayer(0)], 0, createRng(1));
  // Zero energy on hand, yet the energy M.U.L.E. still produces: it draws no
  // power itself (only non-energy M.U.L.E.s cost ENERGY_PER_MULE).
  const base = ENERGY_YIELD_BY_TERRAIN.plain;
  assert.ok(production.yields[0].energy >= Math.max(0, base - VARIANCE_BOUND));
  assert.equal(production.energyConsumed[0], 0);
});

test("food spoilage loses floor(food / 2), keeping the ceiling half", () => {
  const even = applySpoilage({ food: 20, energy: 0, smithore: 0, crystite: 0 });
  assert.equal(even.food, 10);
  const odd = applySpoilage({ food: 21, energy: 0, smithore: 0, crystite: 0 });
  assert.equal(odd.food, 11);
});

test("energy spoilage loses floor(energy / 4), keeping the remainder", () => {
  const even = applySpoilage({ food: 0, energy: 20, smithore: 0, crystite: 0 });
  assert.equal(even.energy, 15);
  const remainder = applySpoilage({ food: 0, energy: 11, smithore: 0, crystite: 0 });
  assert.equal(remainder.energy, 9);
});

test("smithore and crystite are capped at ORE_SPOILAGE_CAP, losing any excess", () => {
  const overCap = applySpoilage({
    food: 0,
    energy: 0,
    smithore: ORE_SPOILAGE_CAP + 13,
    crystite: ORE_SPOILAGE_CAP + 13,
  });
  assert.equal(overCap.smithore, ORE_SPOILAGE_CAP);
  assert.equal(overCap.crystite, ORE_SPOILAGE_CAP);
});

test("smithore and crystite below the cap do not spoil", () => {
  const belowCap = applySpoilage({ food: 0, energy: 0, smithore: 40, crystite: 9 });
  assert.equal(belowCap.smithore, 40);
  assert.equal(belowCap.crystite, 9);
});

test("two powered non-energy mules on the same owner consume energy independently", () => {
  const plots = buildPlots(1, 2);
  plots[0][0] = { terrain: "river", owner: 0, muleOutfit: "food" };
  plots[0][1] = { terrain: "mountain3", owner: 0, muleOutfit: "smithore" };
  const production = computeProduction(plots, [buildPlayer(2)], 0, createRng(1));
  // Exactly enough energy (2) to power both non-energy mules.
  assert.equal(production.energyConsumed[0], 2 * ENERGY_PER_MULE);
  assert.ok(production.yields[0].food > 0);
  assert.ok(production.yields[0].smithore > 0);
});

// ============================================================
// Energy-shortfall order: random, not fixed row-major
// ============================================================

test("with enough energy for exactly one mule, energy still zeroes to none, never both", () => {
  const plots = buildPlots(1, 2);
  plots[0][0] = { terrain: "river", owner: 0, muleOutfit: "food" };
  plots[0][1] = { terrain: "mountain3", owner: 0, muleOutfit: "smithore" };
  const production = computeProduction(plots, [buildPlayer(ENERGY_PER_MULE)], 0, createRng(1));
  const foodPowered = production.yields[0].food > 0;
  const smithorePowered = production.yields[0].smithore > 0;
  // Exactly one of the two non-energy mules is powered (never both, never
  // neither, with exactly ENERGY_PER_MULE banked).
  assert.notEqual(foodPowered, smithorePowered);
  assert.equal(production.energyConsumed[0], ENERGY_PER_MULE);
});

test("which mule loses power on a shortfall varies by seed (random order, not board position)", () => {
  const plots = buildPlots(1, 2);
  plots[0][0] = { terrain: "river", owner: 0, muleOutfit: "food" };
  plots[0][1] = { terrain: "mountain3", owner: 0, muleOutfit: "smithore" };
  let foodWonAtLeastOnce = false;
  let smithoreWonAtLeastOnce = false;
  for (let seed = 1; seed <= SEED_COUNT; seed += 1) {
    const production = computeProduction(plots, [buildPlayer(ENERGY_PER_MULE)], 0, createRng(seed));
    if (production.yields[0].food > 0) {
      foodWonAtLeastOnce = true;
    }
    if (production.yields[0].smithore > 0) {
      smithoreWonAtLeastOnce = true;
    }
  }
  // A fixed row-major order (the pre-M7 model) would always power the
  // first-listed plot (food) and never the second (smithore). Random
  // per-round ordering (Player.useEnergy's Collections.shuffle) means both
  // outcomes appear somewhere across a range of seeds.
  assert.ok(foodWonAtLeastOnce, "food was never powered across the seed range");
  assert.ok(smithoreWonAtLeastOnce, "smithore was never powered across the seed range");
});

// ============================================================
// Variance: bounds, clamp, determinism
// ============================================================

test("variance never pushes a plot's yield outside [0, PRODUCTION_MAX_YIELD]", () => {
  const plots = buildPlots(2, 2);
  plots[0][0] = { terrain: "river", owner: 0, muleOutfit: "food" };
  plots[0][1] = { terrain: "mountain3", owner: 0, muleOutfit: "smithore" };
  plots[1][0] = { terrain: "plain", owner: 0, muleOutfit: "energy" };
  plots[1][1] = { terrain: "plain", owner: 0, muleOutfit: "food" };
  for (let seed = 1; seed <= SEED_COUNT; seed += 1) {
    const production = computeProduction(plots, [buildPlayer(100)], 0, createRng(seed));
    for (const entry of production.perPlot) {
      assert.ok(entry.amount >= 0, `amount ${entry.amount} is negative (seed ${seed})`);
      assert.ok(
        entry.amount <= PRODUCTION_MAX_YIELD,
        `amount ${entry.amount} exceeds PRODUCTION_MAX_YIELD (seed ${seed})`,
      );
    }
  }
});

test("the same seed reproduces the identical production result", () => {
  const plots = buildPlots(1, 2);
  plots[0][0] = { terrain: "river", owner: 0, muleOutfit: "food" };
  plots[0][1] = { terrain: "plain", owner: 0, muleOutfit: "energy" };
  const first = computeProduction(plots, [buildPlayer(5)], 0, createRng(2026));
  const second = computeProduction(plots, [buildPlayer(5)], 0, createRng(2026));
  assert.deepEqual(first, second);
});

// ============================================================
// Learning-curve count bonus: floor(sameResourceCount / divisor) (M7)
// ============================================================

test("the learning-curve count bonus steps at each PRODUCTION_LEARNING_CURVE_DIVISOR threshold", () => {
  const belowThreshold = PRODUCTION_LEARNING_CURVE_DIVISOR - 1; // 2 at divisor 3
  const atThreshold = PRODUCTION_LEARNING_CURVE_DIVISOR; // 3 at divisor 3
  const midBand = PRODUCTION_LEARNING_CURVE_DIVISOR + 2; // 5 at divisor 3
  const nextThreshold = PRODUCTION_LEARNING_CURVE_DIVISOR * 2; // 6 at divisor 3

  const avgBelow = average(
    sampleYields(buildSpacedRow(belowThreshold, "river", "food"), "food", SEED_COUNT),
  );
  const avgAt = average(
    sampleYields(buildSpacedRow(atThreshold, "river", "food"), "food", SEED_COUNT),
  );
  const avgMid = average(
    sampleYields(buildSpacedRow(midBand, "river", "food"), "food", SEED_COUNT),
  );
  const avgNext = average(
    sampleYields(buildSpacedRow(nextThreshold, "river", "food"), "food", SEED_COUNT),
  );

  // Per-plot mean is base(4) + floor(count/3), summed across `count` plots,
  // so the total climbs with count regardless of the bonus; divide back down
  // to a per-plot mean to isolate the bonus step.
  const perPlotBelow = avgBelow / belowThreshold;
  const perPlotAt = avgAt / atThreshold;
  const perPlotMid = avgMid / midBand;
  const perPlotNext = avgNext / nextThreshold;

  // Crossing a threshold (2 -> 3, 5 -> 6) adds floor(1) to every plot's mean;
  // staying within a band (3 -> 5) adds nothing. A margin of 0.4 comfortably
  // separates a real 1-unit step from sampling noise at SEED_COUNT samples
  // (variance has standard deviation ~1, so the mean's standard error here
  // is ~1/sqrt(50) ~= 0.14).
  assert.ok(
    perPlotAt - perPlotBelow > 0.4,
    `expected a step crossing the divisor: ${perPlotBelow} -> ${perPlotAt}`,
  );
  assert.ok(
    perPlotNext - perPlotMid > 0.4,
    `expected a step crossing 2x the divisor: ${perPlotMid} -> ${perPlotNext}`,
  );
  assert.ok(
    Math.abs(perPlotMid - perPlotAt) < 0.4,
    `expected no step within the band: ${perPlotAt} vs ${perPlotMid}`,
  );
});

// ============================================================
// Adjacency: a flat bonus, not scaled by matching-neighbor count (M7)
// ============================================================

test("adjacency is a flat bonus: 4 matching neighbors score the same as 1", () => {
  // Plus-shape: a center plot with 1, then all 4, orthogonal same-owner
  // same-outfit neighbors. If the bonus were still multiplied by neighbor
  // count (the pre-M7 reading), 4 neighbors would score visibly higher than
  // 1; a flat bonus scores them the same on average.
  //
  // Both boards hold the SAME total same-owner same-resource factory count
  // (5), via non-adjacent filler plots on the 1-neighbor board -- otherwise
  // the 4-neighbor board's higher total would also cross the
  // learning-curve count-bonus threshold (M7) on its own, confounding the
  // comparison with a second, unrelated bonus term.
  const onePlots = buildPlots(5, 5);
  onePlots[2][2] = { terrain: "plain", owner: 0, muleOutfit: "energy" }; // center
  onePlots[1][2] = { terrain: "plain", owner: 0, muleOutfit: "energy" }; // 1 neighbor
  onePlots[2][4] = { terrain: "plain", owner: 0, muleOutfit: "energy" }; // filler (not adjacent)
  onePlots[4][2] = { terrain: "plain", owner: 0, muleOutfit: "energy" }; // filler (not adjacent)
  onePlots[4][4] = { terrain: "plain", owner: 0, muleOutfit: "energy" }; // filler (not adjacent)

  const fourPlots = buildPlots(5, 5);
  fourPlots[2][2] = { terrain: "plain", owner: 0, muleOutfit: "energy" }; // center
  fourPlots[1][2] = { terrain: "plain", owner: 0, muleOutfit: "energy" }; // neighbor
  fourPlots[3][2] = { terrain: "plain", owner: 0, muleOutfit: "energy" }; // neighbor
  fourPlots[2][1] = { terrain: "plain", owner: 0, muleOutfit: "energy" }; // neighbor
  fourPlots[2][3] = { terrain: "plain", owner: 0, muleOutfit: "energy" }; // neighbor

  // Read only the center plot's own amount each sample (not the whole
  // player total, which would also grow with the extra neighbor plots'
  // own production).
  function centerAmount(plots, seed) {
    const production = computeProduction(plots, [buildPlayer(100)], 0, createRng(seed));
    const center = production.perPlot.find((entry) => entry.row === 2 && entry.col === 2);
    return center.amount;
  }

  const oneSamples = [];
  const fourSamples = [];
  for (let seed = 1; seed <= SEED_COUNT; seed += 1) {
    oneSamples.push(centerAmount(onePlots, seed));
    fourSamples.push(centerAmount(fourPlots, seed));
  }

  // Same margin reasoning as the count-bonus test above: a per-neighbor
  // model would show roughly a 3-unit gap (4 - 1 neighbors); a flat model
  // shows none.
  assert.ok(
    Math.abs(average(fourSamples) - average(oneSamples)) < 0.6,
    `expected the flat adjacency bonus to score 1 and 4 neighbors alike: ${average(oneSamples)} vs ${average(fourSamples)}`,
  );
});

// ============================================================
// Crystite: EBPC = deposit level, not gated by crystiteRevealed (M7)
// ============================================================

test("crystite yield tracks the plot's own deposit level", () => {
  const lowPlots = buildPlots(1, 1);
  lowPlots[0][0] = {
    terrain: "plain",
    owner: 0,
    muleOutfit: "crystite",
    crystiteLevel: 0,
    crystiteRevealed: false,
  };
  const highPlots = buildPlots(1, 1);
  highPlots[0][0] = {
    terrain: "plain",
    owner: 0,
    muleOutfit: "crystite",
    crystiteLevel: 4,
    crystiteRevealed: false,
  };

  const lowAvg = average(sampleYields(lowPlots, "crystite", SEED_COUNT));
  const highAvg = average(sampleYields(highPlots, "crystite", SEED_COUNT));

  // A level-4 deposit should average about 4 units higher than a level-0
  // deposit (the variance term is identical in distribution for both, mean
  // 0), well clear of sampling noise at SEED_COUNT samples.
  assert.ok(
    highAvg - lowAvg > 3,
    `expected a level-4 deposit to out-yield a level-0 deposit by ~4: ${lowAvg} vs ${highAvg}`,
  );
});

test("crystite production reads the true deposit level even when crystiteRevealed is false", () => {
  const plots = buildPlots(1, 1);
  plots[0][0] = {
    terrain: "plain",
    owner: 0,
    muleOutfit: "crystite",
    crystiteLevel: 3,
    crystiteRevealed: false,
  };
  // Production is a real gameplay mechanic, not a UI concern: an unassayed
  // (unrevealed) high-level deposit still yields real crystite when mined,
  // matching planet_mule (PlanetTile.getYieldPotential's Crystite case reads
  // the raw level; the reveal flag only gates the production-digit sprite).
  // This project deliberately does not add a production-triggers-reveal
  // rule; see economy.ts's baseYield doc comment and docs/RULE_SOURCES.md.
  const avg = average(sampleYields(plots, "crystite", SEED_COUNT));
  assert.ok(avg > 0, `expected real crystite yield from an unrevealed deposit, got avg ${avg}`);
});
