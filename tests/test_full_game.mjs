// Headless full-game simulation: drive a fixed-seed 4-AI game through all six
// rounds using the pure AI decision functions, then assert the game reaches a
// scored winner with no thrown errors, a conservation invariant holds across
// one observed auction, money never goes negative, and two runs with the same
// seed produce identical final scores (determinism).
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyAction } from "../src/engine/game_state.ts";
import { createInitialGameState } from "../src/engine/turn.ts";
import { decideLandGrantAction } from "../src/ai/land_ai.ts";
import { decideDevelopAction } from "../src/ai/develop_ai.ts";
import { decideAuctionActions } from "../src/ai/auction_ai.ts";
import { RESOURCES } from "../src/engine/player.ts";

// Watchdog: fail loudly instead of hanging forever if the AI/engine softlocks.
const WATCHDOG_LIMIT = 20000;

// Sum goods (for a single resource) across every player plus the store's
// remaining stock of that resource, for the conservation check.
function totalGoodsPlusStock(state, good, storeStock) {
  let total = storeStock;
  for (const player of state.players) {
    total += player.goods[good];
  }
  return total;
}

// Drive a full 4-AI game from a fixed seed through land grant, develop,
// production, and auction phases until the scoring phase is reached.
// Returns the final state plus any observed auction conservation snapshots.
function playFullGame(seed) {
  let state = applyAction(createInitialGameState(seed), { type: "start_game" });
  let steps = 0;
  let conservationSnapshots = null;

  while (state.phase.kind !== "scoring") {
    steps += 1;
    if (steps > WATCHDOG_LIMIT) {
      throw new Error(
        `playFullGame: watchdog limit exceeded at step ${steps}, phase ${state.phase.kind}`,
      );
    }

    // Money must never go negative for any player at any observed step.
    for (const player of state.players) {
      assert.ok(player.money >= 0, `player ${player.id} money went negative: ${player.money}`);
    }

    const phase = state.phase;
    if (phase.kind === "land_grant") {
      const picker = phase.payload.pickOrder[phase.payload.pickIndex];
      const action = decideLandGrantAction(state, picker);
      state = applyAction(state, action);
    } else if (phase.kind === "develop") {
      const active = phase.payload.activePlayer;
      const action = decideDevelopAction(state, active);
      state = applyAction(state, action);
      // Only tick when the same player's turn continues; end_turn already
      // advanced to the next player (or to production) without a tick.
      if (state.phase.kind === "develop" && state.phase.payload.activePlayer === active) {
        state = applyAction(state, { type: "tick" });
      }
    } else if (phase.kind === "production") {
      state = applyAction(state, { type: "tick" });
    } else if (phase.kind === "auction") {
      const good = phase.payload.good;
      const isFirstObservedAuction = conservationSnapshots === null;
      if (isFirstObservedAuction && phase.payload.tick === 0) {
        conservationSnapshots = {
          good,
          before: totalGoodsPlusStock(state, good, phase.payload.storeStock),
        };
      }
      for (let playerId = 0; playerId < 4; playerId += 1) {
        const action = decideAuctionActions(state, playerId);
        if (action !== null) {
          state = applyAction(state, action);
        }
      }
      state = applyAction(state, { type: "tick" });
      if (
        conservationSnapshots !== null &&
        conservationSnapshots.after === undefined &&
        state.phase.kind === "auction" &&
        state.phase.payload.good === good &&
        state.phase.payload.finished
      ) {
        conservationSnapshots.after = totalGoodsPlusStock(
          state,
          good,
          state.phase.payload.storeStock,
        );
      }
      if (state.phase.kind === "auction" && state.phase.payload.finished) {
        state = applyAction(state, { type: "end_auction" });
      }
    } else {
      throw new Error(`playFullGame: unexpected phase ${phase.kind}`);
    }
  }

  return { state, conservationSnapshots };
}

test("full 4-AI game reaches scoring after six rounds with no thrown errors", () => {
  const { state } = playFullGame(2026);
  assert.equal(state.phase.kind, "scoring");
  assert.equal(state.round, 6);
});

test("full 4-AI game scores are valid: four finite non-negative scores and a valid winner", () => {
  const { state } = playFullGame(2026);
  const payload = state.phase.payload;
  assert.equal(payload.scores.length, 4);
  for (const score of payload.scores) {
    assert.ok(Number.isFinite(score), `score ${score} is not finite`);
    assert.ok(score >= 0, `score ${score} is negative`);
  }
  assert.ok(payload.winnerIndex >= 0 && payload.winnerIndex < 4);
});

test("goods plus store stock are conserved across one observed auction phase", () => {
  const { conservationSnapshots } = playFullGame(2026);
  assert.notEqual(conservationSnapshots, null);
  assert.ok(RESOURCES.includes(conservationSnapshots.good));
  assert.notEqual(conservationSnapshots.after, undefined);
  assert.equal(conservationSnapshots.before, conservationSnapshots.after);
});

test("two runs with the same seed produce identical final scores (determinism)", () => {
  const first = playFullGame(4242);
  const second = playFullGame(4242);
  assert.deepEqual(first.state.phase.payload.scores, second.state.phase.payload.scores);
  assert.equal(first.state.phase.payload.winnerIndex, second.state.phase.payload.winnerIndex);
});
