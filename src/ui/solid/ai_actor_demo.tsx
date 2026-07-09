// AI-actor fixture demo screen (the ?demo=ai_actor hook).
//
// Builds a real generated-map develop-phase GameState with an AI player (id
// 1) active first and owning one placeable plot, wraps it in a game store,
// and renders the HUD, board, and the AiActorLayer avatar/Skip overlay for
// direct visual and Playwright review -- independent of a full New-Game
// playthrough (which would need the human's own turn to pass first, since
// round 1's develop order runs id 0..3 in this engine's tie-break rule).
// Starts the real scene-manager loop so the "watch it play out" path is the
// exact same scheduler a live game uses; the Skip button (inside
// AiActorLayer) fast-forwards via ai_actor.ts's runAiTurnToCompletion on the
// same store, so both paths are exercisable from one fixture -- what
// tests/playwright/ai_actor_skip.spec.mjs compares (the HUD's money/goods
// and the board's ownership/outfit once player 1's turn ends).
//
// The scene loop is stopped the instant player 1's turn ends (an effect
// watching the live state), freezing the HUD/board at that turn's outcome so
// the watched and skipped runs are captured at the identical point rather
// than racing the background AI turns that would otherwise follow.
//
// Solid discipline: the store is created once in this run-once component,
// and the develop payload is read reactively through an accessor.

import { Show, createEffect, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import type { DevelopPayload, GameState, Plot } from "../../engine/game_state";
import { createInitialGameState } from "../../engine/turn";
import { createWampusState } from "../../engine/wampus";
import { DEVELOP_TICKS_FULL } from "../../engine/constants";
import { createGameStore } from "../game_store";
import { startSceneLoop, stopSceneLoop } from "../scenes/scene_manager";
import { Hud } from "./hud";
import { MapLayer } from "./map_layer";
import { AiActorLayer } from "./ai_actor_layer";

/** AI player id this fixture starts the develop phase on. */
const FIXTURE_ACTIVE_PLAYER = 1;

//============================================
/**
 * Read the `?seed=` param for the fixture's map generation, matching every
 * other `?demo=` screen's determinism convention.
 *
 * @returns The parsed seed, or a fixed fallback when absent or malformed.
 */
function readSeed(): number {
  if (typeof window === "undefined") {
    return 7;
  }
  const raw = new URLSearchParams(window.location.search).get("seed");
  if (raw === null) {
    return 7;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed < 0 ? 7 : parsed;
}

//============================================
/**
 * Read the `?speed=` param for the scene loop, matching every other spatial
 * scene's `?speed=` convention.
 *
 * @returns The parsed speed multiplier, or 1 when absent or malformed.
 */
function readSpeed(): number {
  if (typeof window === "undefined") {
    return 1;
  }
  const raw = new URLSearchParams(window.location.search).get("speed");
  if (raw === null) {
    return 1;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isNaN(parsed) || parsed <= 0 ? 1 : parsed;
}

//============================================
/**
 * Render the AI-actor demo: the board plus the AI develop-turn avatar layer
 * over a fixture where player 1 develops first. Mounted by the app's
 * phase-router when the active screen is the ai-actor-demo screen.
 *
 * @returns The demo screen fragment.
 */
export function AiActorDemoScreen(): JSX.Element {
  const store = createGameStore(buildFixtureState(readSeed()));
  startSceneLoop(store, readSpeed());
  onCleanup(() => stopSceneLoop());

  // Freeze the loop the instant player 1's turn ends, so the HUD/board this
  // renders is a stable snapshot of that turn's outcome (see the module doc).
  createEffect(() => {
    const state = store.state;
    if (
      state.phase.kind !== "develop" ||
      state.phase.payload.activePlayer !== FIXTURE_ACTIVE_PLAYER
    ) {
      stopSceneLoop();
    }
  });

  const payload = (): DevelopPayload | undefined => {
    const state = store.state;
    if (
      state.phase.kind !== "develop" ||
      state.phase.payload.activePlayer !== FIXTURE_ACTIVE_PLAYER
    ) {
      return undefined;
    }
    return state.phase.payload;
  };

  return (
    <div id="ai-actor-demo" class="ai-actor-demo">
      <div id="game-hud">
        <Hud state={store.state} />
      </div>
      <div id="map-container">
        <MapLayer state={store.state} />
      </div>
      <Show when={payload()}>{(develop) => <AiActorLayer store={store} payload={develop} />}</Show>
    </div>
  );
}

//============================================
/**
 * Build a fixture develop-phase `GameState`: a real generated map, player 1
 * active first with a full tick budget, and one plot pre-granted to player 1
 * so its turn can exercise a real placement (walking out to the plot, not
 * just shopping in town).
 *
 * @param seed - Seed for the fixture's map generation.
 * @returns A fixture develop-phase game state.
 */
function buildFixtureState(seed: number): GameState {
  const base = createInitialGameState(seed, "beginner");
  const plots = grantOnePlot(base.plots, FIXTURE_ACTIVE_PLAYER);
  const wampus = createWampusState({ ...base, plots }).wampus;
  const payload: DevelopPayload = {
    turnQueue: [1, 2, 3, 0],
    queueIndex: 0,
    activePlayer: FIXTURE_ACTIVE_PLAYER,
    ticksRemaining: DEVELOP_TICKS_FULL,
    carriedMule: "none",
    rankOrder: [0, 1, 2, 3],
    wampus,
  };
  return { ...base, plots, phase: { kind: "develop", payload } };
}

//============================================
/**
 * Grant the first plain, non-town plot (row-major order) to `playerId`, so
 * the fixture's active AI can place a M.U.L.E. this turn.
 *
 * @param plots - The generated board.
 * @param playerId - Player to grant the plot to.
 * @returns A new board with exactly one plot granted.
 */
function grantOnePlot(plots: readonly (readonly Plot[])[], playerId: number): Plot[][] {
  let granted = false;
  return plots.map((row) =>
    row.map((plot) => {
      if (granted || plot.terrain === "town" || plot.terrain.startsWith("mountain")) {
        return plot;
      }
      granted = true;
      return { ...plot, owner: playerId };
    }),
  );
}
