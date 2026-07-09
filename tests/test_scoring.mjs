// Node unit tests for end-of-game scoring, colony rating, colony failure,
// and First Founder. Run via check_codebase.sh:
// node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildScoringPayload,
  checkColonyFailure,
  computeColonyRating,
  computeScoreBreakdowns,
} from "../src/engine/scoring.ts";
import { createInitialStoreState } from "../src/engine/store.ts";
import {
  COLONY_FAILURE_MESSAGE_ENERGY,
  COLONY_FAILURE_MESSAGE_FOOD,
  COLONY_RATING_MESSAGES,
  LAND_VALUE_PER_PLOT,
  OUTFIT_COST,
  POINTS_PER_MULE,
  ROUND_COUNT_BY_MODE,
} from "../src/engine/constants.ts";

function buildPlayer(overrides) {
  return {
    id: 0,
    isHuman: true,
    colorSlot: 0,
    species: "humanoid",
    money: 0,
    goods: { food: 0, energy: 0, smithore: 0, crystite: 0 },
    ...overrides,
  };
}

// A single-row board: `spec` is one { owner, muleOutfit } cell per column.
function buildPlots(spec) {
  return [
    spec.map((cell) => ({
      terrain: "plain",
      owner: cell.owner,
      muleOutfit: cell.muleOutfit ?? null,
      crystiteLevel: 0,
      crystiteRevealed: false,
    })),
  ];
}

function fourPlayers(overrides) {
  const players = [
    buildPlayer({ id: 0 }),
    buildPlayer({ id: 1 }),
    buildPlayer({ id: 2 }),
    buildPlayer({ id: 3 }),
  ];
  return overrides === undefined
    ? players
    : players.map((player) => (player.id === overrides.id ? overrides : player));
}

function buildState(overrides) {
  return {
    mode: "standard",
    round: 1,
    players: fourPlayers(),
    plots: buildPlots([{ owner: null }]),
    store: createInitialStoreState(),
    ...overrides,
  };
}

// An empty store (zero of every good), used by the colony-failure tests so
// the store's own stock never masks a player-side shortage.
function emptyStore() {
  return { ...createInitialStoreState(), stock: { food: 0, energy: 0, smithore: 0, crystite: 0 } };
}

// ============================================================
// Score breakdown: per-plot, per-mule, and goods-at-current-price terms
// (planet_mule Player.calcPoints, Player.java lines 411-426)
// ============================================================

test("score breakdown: money plus LAND_VALUE_PER_PLOT for each owned unoutfitted plot", () => {
  const player = buildPlayer({ id: 0, money: 200 });
  const state = buildState({
    players: fourPlayers(player),
    plots: buildPlots([{ owner: 0 }, { owner: 0 }]),
  });
  const [breakdown] = computeScoreBreakdowns(state);
  assert.equal(breakdown.money, 200);
  assert.equal(breakdown.landValue, 2 * LAND_VALUE_PER_PLOT);
  assert.equal(breakdown.muleValue, 0);
  assert.equal(breakdown.total, 200 + 2 * LAND_VALUE_PER_PLOT);
});

test("score breakdown: an installed mule adds POINTS_PER_MULE plus its outfit cost, on top of land value", () => {
  const state = buildState({ plots: buildPlots([{ owner: 0, muleOutfit: "smithore" }]) });
  const [breakdown] = computeScoreBreakdowns(state);
  assert.equal(breakdown.landValue, LAND_VALUE_PER_PLOT);
  assert.equal(breakdown.muleValue, POINTS_PER_MULE + OUTFIT_COST.smithore);
  assert.equal(breakdown.total, LAND_VALUE_PER_PLOT + POINTS_PER_MULE + OUTFIT_COST.smithore);
});

test("score breakdown: an owned plot with no mule earns land value only, no mule value", () => {
  const state = buildState({ plots: buildPlots([{ owner: 0, muleOutfit: null }]) });
  const [breakdown] = computeScoreBreakdowns(state);
  assert.equal(breakdown.muleValue, 0);
});

test("score breakdown: every outfit resource contributes its own OUTFIT_COST", () => {
  for (const resource of ["food", "energy", "smithore", "crystite"]) {
    const state = buildState({ plots: buildPlots([{ owner: 0, muleOutfit: resource }]) });
    const [breakdown] = computeScoreBreakdowns(state);
    assert.equal(breakdown.muleValue, POINTS_PER_MULE + OUTFIT_COST[resource], resource);
  }
});

test("score breakdown: goods are valued at the store's current prices, not a fixed table", () => {
  const store = {
    ...createInitialStoreState(),
    prices: { food: 99, energy: 1, smithore: 1, crystite: 1 },
  };
  const player = buildPlayer({ id: 0, goods: { food: 3, energy: 0, smithore: 0, crystite: 0 } });
  const state = buildState({ players: fourPlayers(player), store });
  const [breakdown] = computeScoreBreakdowns(state);
  assert.equal(breakdown.goodsValue, 3 * 99);
});

// ============================================================
// Colony rating: 7 tiers, scaled by round count (M9 exit criterion)
// (SummaryPhase2.getColonyMessage, SummaryPhase2.java lines 282-289)
// ============================================================

test("colony rating: standard mode (12 rounds) tier span is 20000", () => {
  assert.equal(computeColonyRating({ mode: "standard" }, 0).tier, 0);
  assert.equal(computeColonyRating({ mode: "standard" }, 19999).tier, 0);
  assert.equal(computeColonyRating({ mode: "standard" }, 20000).tier, 1);
  assert.equal(computeColonyRating({ mode: "standard" }, 39999).tier, 1);
  assert.equal(computeColonyRating({ mode: "standard" }, 40000).tier, 2);
});

test("colony rating: standard mode top tier clamps at 6 for any total at or above 120000", () => {
  assert.equal(computeColonyRating({ mode: "standard" }, 119999).tier, 5);
  assert.equal(computeColonyRating({ mode: "standard" }, 120000).tier, 6);
  assert.equal(computeColonyRating({ mode: "standard" }, 10_000_000).tier, 6);
});

test("colony rating: beginner mode (6 rounds) halves the tier span to 10000", () => {
  assert.equal(computeColonyRating({ mode: "beginner" }, 9999).tier, 0);
  assert.equal(computeColonyRating({ mode: "beginner" }, 10000).tier, 1);
  assert.equal(computeColonyRating({ mode: "beginner" }, 59999).tier, 5);
  assert.equal(computeColonyRating({ mode: "beginner" }, 60000).tier, 6);
});

test("colony rating: message text matches the tier index into COLONY_RATING_MESSAGES", () => {
  const rating = computeColonyRating({ mode: "standard" }, 45000);
  assert.equal(rating.tier, 2);
  assert.equal(rating.message, COLONY_RATING_MESSAGES[2]);
});

test("colony rating: the message set has exactly 7 tiers, worst first", () => {
  assert.equal(COLONY_RATING_MESSAGES.length, 7);
  assert.match(COLONY_RATING_MESSAGES[0], /prison/i);
  assert.match(COLONY_RATING_MESSAGES[6], /luxurious/i);
});

// ============================================================
// Colony failure: total food or energy zero with no food production
// (SummaryPhase2.checkShortageMessage, SummaryPhase2.java lines 116-152)
// ============================================================

test("colony failure: total food zero across store and players, no food mule anywhere, fails", () => {
  const state = buildState({ store: emptyStore() });
  const result = checkColonyFailure(state);
  assert.equal(result.failed, true);
  assert.equal(result.message, COLONY_FAILURE_MESSAGE_FOOD);
});

test("colony failure: total energy zero across store and players, no food mule anywhere, fails", () => {
  const player = buildPlayer({ id: 0, goods: { food: 5, energy: 0, smithore: 0, crystite: 0 } });
  const state = buildState({ players: fourPlayers(player), store: emptyStore() });
  const result = checkColonyFailure(state);
  assert.equal(result.failed, true);
  assert.equal(result.message, COLONY_FAILURE_MESSAGE_ENERGY);
});

test("colony failure: a single food-outfitted mule anywhere on the board prevents failure, even at zero food", () => {
  const state = buildState({
    store: emptyStore(),
    plots: buildPlots([{ owner: 1, muleOutfit: "food" }]),
  });
  const result = checkColonyFailure(state);
  assert.equal(result.failed, false);
  assert.equal(result.message, null);
});

test("colony failure: a food mule also prevents failure on a total energy shortage (planet_mule's literal food-only gate)", () => {
  const player = buildPlayer({ id: 0, goods: { food: 5, energy: 0, smithore: 0, crystite: 0 } });
  const state = buildState({
    players: fourPlayers(player),
    store: emptyStore(),
    plots: buildPlots([{ owner: 1, muleOutfit: "food" }]),
  });
  const result = checkColonyFailure(state);
  assert.equal(result.failed, false);
});

test("colony failure: store stock alone can keep a resource above zero and avoid failure", () => {
  const store = { ...emptyStore(), stock: { food: 3, energy: 0, smithore: 0, crystite: 0 } };
  const state = buildState({ store });
  const result = checkColonyFailure(state);
  // Food is nonzero (store stock covers it); energy is zero with no food
  // production, so the energy branch still fires.
  assert.equal(result.failed, true);
  assert.equal(result.message, COLONY_FAILURE_MESSAGE_ENERGY);
});

test("colony failure: never checked on the game's final round", () => {
  const lastRound = ROUND_COUNT_BY_MODE.standard;
  const state = buildState({ round: lastRound, store: emptyStore() });
  const result = checkColonyFailure(state);
  assert.equal(result.failed, false);
  assert.equal(result.message, null);
});

test("colony failure: does not fire when neither food nor energy totals zero", () => {
  const player = buildPlayer({ id: 0, goods: { food: 1, energy: 1, smithore: 0, crystite: 0 } });
  const state = buildState({ players: fourPlayers(player), store: emptyStore() });
  const result = checkColonyFailure(state);
  assert.equal(result.failed, false);
});

// ============================================================
// Scoring payload: colonyTotal, rating, failure, and First Founder wiring
// ============================================================

test("scoring payload: colonyTotal is the sum of every player's score", () => {
  const players = [
    buildPlayer({ id: 0, money: 1000 }),
    buildPlayer({ id: 1, money: 2000 }),
    buildPlayer({ id: 2, money: 3000 }),
    buildPlayer({ id: 3, money: 4000 }),
  ];
  const state = buildState({ players, round: ROUND_COUNT_BY_MODE.standard });
  const payload = buildScoringPayload(state);
  const total = payload.scores.reduce((sum, score) => sum + score, 0);
  assert.equal(payload.colonyTotal, total);
});

test("scoring payload: First Founder is the rank-1 player when the colony survives", () => {
  const players = [
    buildPlayer({ id: 0, money: 100 }),
    buildPlayer({ id: 1, money: 999999 }),
    buildPlayer({ id: 2, money: 100 }),
    buildPlayer({ id: 3, money: 100 }),
  ];
  const state = buildState({ players, round: ROUND_COUNT_BY_MODE.standard });
  const payload = buildScoringPayload(state);
  assert.equal(payload.winnerIndex, 1);
  assert.equal(payload.firstFounderId, 1);
  assert.equal(payload.colonyFailed, false);
});

test("scoring payload: no First Founder is awarded when the colony fails", () => {
  const players = [
    buildPlayer({ id: 0, money: 999999 }),
    buildPlayer({ id: 1, money: 100 }),
    buildPlayer({ id: 2, money: 100 }),
    buildPlayer({ id: 3, money: 100 }),
  ];
  const state = buildState({ players, round: 3, store: emptyStore() });
  const payload = buildScoringPayload(state);
  assert.equal(payload.colonyFailed, true);
  assert.equal(payload.failureMessage, COLONY_FAILURE_MESSAGE_FOOD);
  assert.equal(payload.firstFounderId, null);
  // Scores are still computed on a failed colony (planet_mule calls
  // calcPoints unconditionally in updatePlayerRankOrder before deciding
  // failure) -- the leader is still identifiable, just not crowned.
  assert.equal(payload.winnerIndex, 0);
});
