// Node unit tests for AI personality profiles (personas.ts).
// Covers the assignment function's replay-safety invariants (human-seat
// exclusion, determinism, no dependency on evaluation order) and reruns a
// full-game cannot-stall check once per named personality so a parameterized
// AI seat can never produce an illegal or stuck decision.
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyAction } from "../src/engine/game_state.ts";
import { createInitialGameState } from "../src/engine/turn.ts";
import { decideLandGrantAction, decideLandAuctionAction } from "../src/ai/land_ai.ts";
import { decideDevelopAction } from "../src/ai/develop_ai.ts";
import { decideAuctionActions } from "../src/ai/auction_ai.ts";
import {
  BASELINE_PERSONA_PARAMS,
  PERSONALITIES,
  personalityForPlayer,
  personaParamsForPlayer,
} from "../src/ai/personas.ts";

// Watchdog: fail loudly instead of hanging forever if the AI/engine softlocks.
const WATCHDOG_LIMIT = 20000;

// Watchdog: fail loudly instead of scanning forever if personas.ts's
// assignment ever stops covering every named personality within a small
// seed range.
const PERSONA_SEED_SCAN_LIMIT = 50;

// Fixed-seed fixtures where player 1 (an AI seat) draws each named
// personality, derived at test-setup time by scanning seeds rather than
// hardcoded, so a legitimate refactor of the assignment derivation in
// personas.ts cannot silently break this fixture table.
function findSeedByPersonaForPlayer1() {
  const seedByPersona = {};
  for (let seed = 0; seed < PERSONA_SEED_SCAN_LIMIT; seed += 1) {
    const state = createInitialGameState(seed);
    const personality = personalityForPlayer(state, 1);
    if (!(personality in seedByPersona)) {
      seedByPersona[personality] = seed;
    }
    if (Object.keys(seedByPersona).length === PERSONALITIES.length) {
      return seedByPersona;
    }
  }
  throw new Error(
    `findSeedByPersonaForPlayer1: did not find all of ${PERSONALITIES.join(", ")} ` +
      `within ${PERSONA_SEED_SCAN_LIMIT} seeds (found: ${Object.keys(seedByPersona).join(", ")})`,
  );
}

const SEED_BY_PERSONA_FOR_PLAYER_1 = findSeedByPersonaForPlayer1();

// ============================================================
// personalityForPlayer / personaParamsForPlayer
// ============================================================

test("personalityForPlayer never assigns the human seat (player 0)", () => {
  for (let seed = 0; seed < 20; seed += 1) {
    const state = createInitialGameState(seed);
    assert.equal(personalityForPlayer(state, 0), null);
  }
});

test("personalityForPlayer assigns one of the three named personalities to an AI seat", () => {
  for (let seed = 0; seed < 20; seed += 1) {
    const state = createInitialGameState(seed);
    for (const playerId of [1, 2, 3]) {
      const personality = personalityForPlayer(state, playerId);
      assert.ok(
        PERSONALITIES.includes(personality),
        `seed ${seed} player ${playerId}: unexpected personality ${personality}`,
      );
    }
  }
});

test("personalityForPlayer is deterministic and order-independent: repeated calls and calls against a later state (same seed) agree", () => {
  const initial = createInitialGameState(5);
  const first = personalityForPlayer(initial, 1);
  const second = personalityForPlayer(initial, 1);
  assert.equal(first, second);

  // A later state from the same seed (after actions have run) still reports
  // the same assignment: personalityForPlayer reads only seed and isHuman,
  // never anything that changes turn to turn -- the replay-safety property.
  const started = applyAction(initial, { type: "start_game" });
  assert.equal(personalityForPlayer(started, 1), first);
});

test("personalityForPlayer sees every named personality across a spread of seeds", () => {
  const seen = new Set();
  for (let seed = 0; seed < 50; seed += 1) {
    const state = createInitialGameState(seed);
    seen.add(personalityForPlayer(state, 1));
  }
  for (const personality of PERSONALITIES) {
    assert.ok(seen.has(personality), `personality ${personality} never appeared in 50 seeds`);
  }
});

test("personaParamsForPlayer returns the exact pre-persona baseline for the human seat", () => {
  const state = createInitialGameState(6);
  assert.deepEqual(personaParamsForPlayer(state, 0), BASELINE_PERSONA_PARAMS);
});

test("personaParamsForPlayer returns a non-baseline parameter set for an assigned AI seat", () => {
  const state = createInitialGameState(SEED_BY_PERSONA_FOR_PLAYER_1.land_baron);
  const params = personaParamsForPlayer(state, 1);
  assert.notEqual(params.landBidFactor, BASELINE_PERSONA_PARAMS.landBidFactor);
});

// ============================================================
// Cannot-stall: one full-game watchdog run per named personality
// ============================================================

// Drive a full 4-AI game from a fixed seed through land grant, develop,
// production, and auction phases until the scoring phase is reached, the
// same shape test_full_game.mjs's playFullGame drives, without the
// conservation bookkeeping this file does not need.
function playFullGameToScoring(seed) {
  let state = applyAction(createInitialGameState(seed), { type: "start_game" });
  let steps = 0;

  while (state.phase.kind !== "scoring") {
    steps += 1;
    if (steps > WATCHDOG_LIMIT) {
      throw new Error(
        `playFullGameToScoring: watchdog limit exceeded at step ${steps}, phase ${state.phase.kind}`,
      );
    }
    for (const player of state.players) {
      assert.ok(player.money >= 0, `player ${player.id} money went negative: ${player.money}`);
    }

    const phase = state.phase;
    if (phase.kind === "land_grant") {
      const picker = phase.payload.pickOrder[phase.payload.pickIndex];
      state = applyAction(state, decideLandGrantAction(state, picker));
    } else if (phase.kind === "land_auction") {
      if (phase.payload.finished) {
        state = applyAction(state, { type: "end_land_auction" });
      } else {
        for (let playerId = 0; playerId < 4; playerId += 1) {
          const action = decideLandAuctionAction(state, playerId);
          if (action !== null) {
            state = applyAction(state, action);
          }
        }
        state = applyAction(state, { type: "tick" });
      }
    } else if (phase.kind === "develop") {
      const active = phase.payload.activePlayer;
      const action = decideDevelopAction(state, active);
      state = applyAction(state, action);
      if (state.phase.kind === "develop" && state.phase.payload.activePlayer === active) {
        state = applyAction(state, { type: "tick" });
      }
    } else if (phase.kind === "production") {
      state = applyAction(state, { type: "tick" });
    } else if (phase.kind === "auction") {
      for (let playerId = 0; playerId < 4; playerId += 1) {
        const action = decideAuctionActions(state, playerId);
        if (action !== null) {
          state = applyAction(state, action);
        }
      }
      state = applyAction(state, { type: "tick" });
      if (state.phase.kind === "auction" && state.phase.payload.finished) {
        state = applyAction(state, { type: "end_auction" });
      }
    } else {
      throw new Error(`playFullGameToScoring: unexpected phase ${phase.kind}`);
    }
  }

  return state;
}

for (const [personality, seed] of Object.entries(SEED_BY_PERSONA_FOR_PLAYER_1)) {
  test(`cannot-stall: a full game reaches scoring with player 1 parameterized as ${personality}`, () => {
    const state = createInitialGameState(seed);
    // Confirms the fixture still assigns the expected personality before
    // spending the watchdog run on it (fails loudly if personas.ts's
    // assignment ever changes without updating this fixture table).
    assert.equal(personalityForPlayer(state, 1), personality);
    const finalState = playFullGameToScoring(seed);
    assert.equal(finalState.phase.kind, "scoring");
  });
}
