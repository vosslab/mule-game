// Node unit tests for the walker debug projection (walker_debug.ts).
// Covers the two acceptance properties the strategy-adapter package depends
// on: mutating the returned projection throws under strict mode, and a
// second call after a dispatch reflects the post-dispatch state.
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createStore } from "solid-js/store";

import { applyAction } from "../src/engine/game_state.ts";
import { createInitialGameState } from "../src/engine/turn.ts";
import { currentPicker } from "../src/engine/land_grant.ts";
import { buildWalkerProjection } from "../src/ui/walker_debug.ts";

// Fixed seed: only used to build a deterministic land_grant phase snapshot,
// not asserted on for its own value.
const SEED = 2026;

function landGrantState() {
  const initial = createInitialGameState(SEED);
  return applyAction(initial, { type: "start_game" });
}

// ============================================================
// buildWalkerProjection: shape and convenience fields
// ============================================================

test("buildWalkerProjection reports the land_grant phase's convenience fields", () => {
  const state = landGrantState();
  const projection = buildWalkerProjection(state);

  assert.equal(projection.phaseKind, "land_grant");
  assert.equal(projection.activePlayerId, currentPicker(state.phase.payload));
  assert.equal(projection.humanMoney, state.players[0].money);
  assert.equal(projection.sweepRow, state.phase.payload.sweepRow);
  assert.equal(projection.sweepCol, state.phase.payload.sweepCol);
});

test("buildWalkerProjection reports null sweep coordinates outside land_grant", () => {
  const state = landGrantState();
  const scoring = { ...state, phase: { kind: "scoring", payload: {} } };
  const projection = buildWalkerProjection(scoring);

  assert.equal(projection.sweepRow, null);
  assert.equal(projection.sweepCol, null);
  assert.equal(projection.activePlayerId, null);
});

// ============================================================
// buildWalkerProjection: deep-freeze and re-snapshot properties
// ============================================================

test("buildWalkerProjection's snapshot throws on mutation in strict mode", () => {
  const state = landGrantState();
  const projection = buildWalkerProjection(state);

  assert.throws(() => {
    projection.state.round = 999;
  });
  assert.throws(() => {
    projection.state.players[0].money = 999;
  });
});

test("a second call after a dispatch reflects the post-dispatch state", () => {
  const state = landGrantState();
  const before = buildWalkerProjection(state);

  const picker = currentPicker(state.phase.payload);
  const after = applyAction(state, { type: "pass", playerId: picker });
  const projectionAfter = buildWalkerProjection(after);

  assert.notEqual(projectionAfter.activePlayerId, before.activePlayerId);
});

// ============================================================
// buildWalkerProjection: SolidJS reactive store input (regression)
// ============================================================

// Regression for the DataCloneError bug: window.muleGameState() is built
// from game_store.ts's live store, which wraps GameState in a SolidJS
// createStore Proxy, not a plain object. structuredClone cannot serialize a
// Proxy directly, so buildWalkerProjection must unwrap it first. This test
// wraps a real GameState the same way game_store.ts does and asserts the
// projection is produced without throwing and matches the plain-state
// projection deep-equally (same result whether the caller passes a plain
// GameState or a live Solid store's `state` proxy).
test("buildWalkerProjection accepts a SolidJS store proxy without throwing", () => {
  const state = landGrantState();
  const [storeState] = createStore(state);

  const plainProjection = buildWalkerProjection(state);
  const storeProjection = buildWalkerProjection(storeState);

  assert.deepEqual(storeProjection, plainProjection);
});
