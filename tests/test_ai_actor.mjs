// Node unit tests for the AI develop-turn presentation logic (ai_actor.ts).
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyAction } from "../src/engine/game_state.ts";
import { createInitialGameState } from "../src/engine/turn.ts";
import { decideLandGrantAction } from "../src/ai/land_ai.ts";
import { decideDevelopAction } from "../src/ai/develop_ai.ts";
import {
  findPlacedPlot,
  aiActorTarget,
  directionToward,
  reachedTarget,
  runAiTurnToCompletion,
  AI_TURN_WATCHDOG_STEPS,
} from "../src/ui/scenes/ai_actor.ts";

//============================================================
// Fixtures, mirroring tests/test_ai.mjs's helpers so this suite can drive a
// real game into the develop phase without a browser.
//============================================================

function startedGame(seed) {
  return applyAction(createInitialGameState(seed), { type: "start_game" });
}

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

// Every player claims the AI's chosen plot on its own pick, so every player
// owns at least one plot entering develop (exercises findPlacedPlot/target
// tracking through a real placement).
function claimThroughLandGrant(state) {
  let current = state;
  while (current.phase.kind === "land_grant") {
    const payload = current.phase.payload;
    const picker = payload.pickOrder[payload.pickIndex];
    const action = decideLandGrantAction(current, picker);
    current = applyAction(current, action);
  }
  return skipThroughLandAuctions(current);
}

function plainPlot(overrides = {}) {
  return {
    terrain: "plain",
    owner: null,
    muleOutfit: null,
    crystiteLevel: 0,
    crystiteRevealed: false,
    ...overrides,
  };
}

//============================================================
// findPlacedPlot
//============================================================

test("findPlacedPlot locates the newly outfitted plot for the given player", () => {
  const prev = [
    [plainPlot({ owner: 1 }), plainPlot()],
    [plainPlot(), plainPlot({ owner: 1 })],
  ];
  const curr = [
    [plainPlot({ owner: 1 }), plainPlot()],
    [plainPlot(), plainPlot({ owner: 1, muleOutfit: "food" })],
  ];
  assert.deepEqual(findPlacedPlot(prev, curr, 1), { row: 1, col: 1 });
});

test("findPlacedPlot returns null when nothing changed", () => {
  const prev = [[plainPlot({ owner: 1 })]];
  const curr = [[plainPlot({ owner: 1 })]];
  assert.equal(findPlacedPlot(prev, curr, 1), null);
});

test("findPlacedPlot ignores a placement by a different player", () => {
  const prev = [[plainPlot({ owner: 2 })]];
  const curr = [[plainPlot({ owner: 2, muleOutfit: "energy" })]];
  assert.equal(findPlacedPlot(prev, curr, 1), null);
});

//============================================================
// aiActorTarget
//============================================================

const TOWN_CELL = { row: 3, col: 3 };

function developPayload(overrides = {}) {
  return {
    turnQueue: [0, 1, 2, 3],
    queueIndex: 1,
    activePlayer: 1,
    ticksRemaining: 10,
    carriedMule: "none",
    rankOrder: [0, 1, 2, 3],
    wampus: {
      row: null,
      col: null,
      visible: false,
      dead: true,
      caught: false,
      moneyReward: 0,
      blinkTicks: 0,
      blinksRemainingAtSite: 0,
      mountains: [],
      tick: 0,
      events: [],
    },
    ...overrides,
  };
}

test("aiActorTarget sends the avatar to town while carrying a M.U.L.E. through the shop steps", () => {
  const payload = developPayload({ carriedMule: "unoutfitted" });
  assert.deepEqual(aiActorTarget(payload, null, null, [], TOWN_CELL), TOWN_CELL);
});

test("aiActorTarget falls back to the board corner with no town cell and nothing carried", () => {
  const payload = developPayload({ carriedMule: "none" });
  assert.deepEqual(aiActorTarget(payload, null, null, [], null), { row: 0, col: 0 });
});

test("aiActorTarget sends the avatar to the plot it just placed a M.U.L.E. on", () => {
  const prevPayload = developPayload({ carriedMule: "smithore" });
  const currPayload = developPayload({ carriedMule: "none" });
  const prevPlots = [[plainPlot({ owner: 1 }), plainPlot({ owner: 1 })]];
  const currPlots = [[plainPlot({ owner: 1 }), plainPlot({ owner: 1, muleOutfit: "smithore" })]];
  assert.deepEqual(aiActorTarget(currPayload, prevPayload, prevPlots, currPlots, TOWN_CELL), {
    row: 0,
    col: 1,
  });
});

test("aiActorTarget stays at town when carriedMule clears without a matching placement", () => {
  // carriedMule went from a resource to none (e.g. gamble ended the turn
  // without ever placing) but no plot actually changed -- falls back to town
  // rather than reporting a phantom placement.
  const prevPayload = developPayload({ carriedMule: "food" });
  const currPayload = developPayload({ carriedMule: "none" });
  const plots = [[plainPlot({ owner: 1 })]];
  assert.deepEqual(aiActorTarget(currPayload, prevPayload, plots, plots, TOWN_CELL), TOWN_CELL);
});

//============================================================
// directionToward / reachedTarget
//============================================================

test("directionToward returns a unit vector pointing at the target", () => {
  const direction = directionToward({ x: 0, y: 0 }, { x: 3, y: 4 });
  assert.ok(Math.abs(direction.x - 0.6) < 1e-9);
  assert.ok(Math.abs(direction.y - 0.8) < 1e-9);
});

test("directionToward returns the zero vector once already at the target", () => {
  assert.deepEqual(directionToward({ x: 5, y: 5 }, { x: 5, y: 5 }), { x: 0, y: 0 });
});

test("reachedTarget respects the epsilon tolerance", () => {
  assert.equal(reachedTarget({ x: 0, y: 0 }, { x: 1, y: 0 }, 2), true);
  assert.equal(reachedTarget({ x: 0, y: 0 }, { x: 10, y: 0 }, 2), false);
});

//============================================================
// runAiTurnToCompletion: cannot-stall and skip-equivalence
//============================================================

test("runAiTurnToCompletion ends the active AI player's turn within the watchdog", () => {
  let state = claimThroughLandGrant(startedGame(5));
  assert.equal(state.phase.kind, "develop");
  const playerId = state.phase.payload.activePlayer;
  const dispatch = (action) => {
    state = applyAction(state, action);
  };
  const steps = runAiTurnToCompletion(dispatch, () => state, playerId);
  assert.ok(steps > 0);
  assert.ok(steps < AI_TURN_WATCHDOG_STEPS);
  const stillThatPlayersTurn =
    state.phase.kind === "develop" && state.phase.payload.activePlayer === playerId;
  assert.equal(stillThatPlayersTurn, false);
});

test("runAiTurnToCompletion returns 0 steps for a player who is not currently active", () => {
  let state = claimThroughLandGrant(startedGame(5));
  const inactivePlayer = (state.phase.payload.activePlayer + 1) % 4;
  const dispatch = (action) => {
    state = applyAction(state, action);
  };
  const steps = runAiTurnToCompletion(dispatch, () => state, inactivePlayer);
  assert.equal(steps, 0);
});

test("skip-equivalence: fast-forwarding every develop turn reaches the same final state as watching it step by step", () => {
  const seed = 42;

  // "Watched": step decideDevelopAction one action at a time for whichever
  // player is active, exactly like the scene manager's timed cadence would
  // (minus the timers), until the develop phase ends.
  let watched = claimThroughLandGrant(startedGame(seed));
  while (watched.phase.kind === "develop") {
    const active = watched.phase.payload.activePlayer;
    watched = applyAction(watched, decideDevelopAction(watched, active));
  }

  // "Skipped": fast-forward each active player's whole turn in one
  // runAiTurnToCompletion call, repeating until the develop phase ends.
  let skipped = claimThroughLandGrant(startedGame(seed));
  while (skipped.phase.kind === "develop") {
    const active = skipped.phase.payload.activePlayer;
    runAiTurnToCompletion(
      (action) => {
        skipped = applyAction(skipped, action);
      },
      () => skipped,
      active,
    );
  }

  assert.deepEqual(skipped, watched);
  assert.notEqual(skipped.phase.kind, "develop");
});
