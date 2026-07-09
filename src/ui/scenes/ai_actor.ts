// Pure AI develop-turn presentation logic.
//
// An AI develop turn is already a deterministic sequence of discrete engine
// actions: the scene manager calls `decideDevelopAction` on a fixed cadence
// (AI_STEP_MS in scene_manager.ts) and dispatches whatever it returns until
// the turn ends. This module turns that same sequence into a walkable
// avatar's presentation: given the develop payload and board before and
// after one dispatched action, it derives where the AI's avatar should be
// standing (`aiActorTarget`) -- purely a function of engine state, so the
// walk path a human watches is identical every time the same seed plays out,
// with no extra randomness or wall-clock dependency of its own.
//
// It also owns the "Skip" fast-forward: `runAiTurnToCompletion` dispatches
// the same `decideDevelopAction` sequence the scene manager would have, just
// without waiting for AI_STEP_MS between steps, so skipping a turn and
// watching it play out arrive at the identical final GameState (they call
// the exact same pure decision function in the exact same order). A watchdog
// step cap throws rather than looping forever, matching this repo's other
// AI cannot-stall guards.
//
// DOM-free and framework-free by design, like walker.ts and zones.ts: the
// node tests (tests/test_ai_actor.mjs) exercise it directly without a
// browser or a Solid component.

import type { Action, DevelopPayload, GameState, Plot } from "../../engine/game_state";
import { decideDevelopAction } from "../../ai/develop_ai";
import type { Cell, Vec2 } from "./walker";

/**
 * Safety cap on actions dispatched within one AI develop turn before treating
 * the AI as stalled. Sized well above any real turn (a turn assays/buys/
 * outfits/places/hunts/gambles at most a handful of times before ending),
 * mirroring the cannot-stall watchdogs `tests/test_ai.mjs` and
 * `tests/test_wampus_pub.mjs` already apply to `decideDevelopAction`.
 */
export const AI_TURN_WATCHDOG_STEPS = 200;

/**
 * Find the plot `playerId` just placed a M.U.L.E. on between two board
 * snapshots: owned by `playerId` and outfitted in `currPlots` but not yet
 * outfitted at the same coordinates in `prevPlots`. Row-major order, so the
 * result is deterministic even in the (impossible in this engine's
 * one-mule-per-turn model) case of more than one match.
 *
 * @param prevPlots - Board snapshot before the action.
 * @param currPlots - Board snapshot after the action.
 * @param playerId - Player whose newly-outfitted plot to find.
 * @returns The placed plot's coordinates, or null if none was placed.
 */
export function findPlacedPlot(
  prevPlots: readonly (readonly Plot[])[],
  currPlots: readonly (readonly Plot[])[],
  playerId: number,
): Cell | null {
  for (const [row, rowPlots] of currPlots.entries()) {
    for (const [col, plot] of rowPlots.entries()) {
      if (plot.owner !== playerId || plot.muleOutfit === null) {
        continue;
      }
      const before = prevPlots[row]?.[col];
      if (before !== undefined && before.muleOutfit === null) {
        return { row, col };
      }
    }
  }
  return null;
}

/**
 * Decide where the AI's avatar should be walking toward right now: town
 * while it is carrying a M.U.L.E. through the buy/outfit steps (or idling to
 * hunt the wampus, assay, or gamble -- all town-adjacent business in this
 * engine's non-spatial model), or the plot it just placed a M.U.L.E. on, the
 * one moment its business takes it out to the board. Falls back to the town
 * cell (or the board's top-left corner when the board somehow has none) so
 * the avatar always has a defined target.
 *
 * @param payload - The develop payload after the most recent dispatched action.
 * @param prevPayload - The develop payload before it, or null on the turn's
 *   first frame (no prior action to compare against).
 * @param prevPlots - Board snapshot before the action, or null alongside
 *   `prevPayload`.
 * @param currPlots - Board snapshot after the action.
 * @param townCell - The board's town cell, or null if the board has none.
 * @returns The cell the avatar should be walking toward.
 */
export function aiActorTarget(
  payload: DevelopPayload,
  prevPayload: DevelopPayload | null,
  prevPlots: readonly (readonly Plot[])[] | null,
  currPlots: readonly (readonly Plot[])[],
  townCell: Cell | null,
): Cell {
  const fallback = townCell ?? { row: 0, col: 0 };
  if (payload.carriedMule !== "none") {
    return fallback;
  }
  const justPlaced =
    prevPayload !== null &&
    prevPlots !== null &&
    prevPayload.carriedMule !== "none" &&
    prevPayload.carriedMule !== "unoutfitted";
  if (justPlaced) {
    const placed = findPlacedPlot(prevPlots, currPlots, payload.activePlayer);
    if (placed !== null) {
      return placed;
    }
  }
  return fallback;
}

/**
 * A unit vector pointing from `position` toward `target`, or the zero vector
 * once already at `target` (within floating-point tolerance). The seek
 * analog of `walker.ts`'s `directionFromKeys`, for presentation code that
 * walks an avatar toward a computed target instead of a held key.
 *
 * @param position - Current pixel position.
 * @param target - Target pixel position.
 * @returns A direction vector of length 0 (arrived) or 1 (seeking).
 */
export function directionToward(position: Vec2, target: Vec2): Vec2 {
  const dx = target.x - position.x;
  const dy = target.y - position.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-6) {
    return { x: 0, y: 0 };
  }
  return { x: dx / distance, y: dy / distance };
}

/**
 * Whether `position` has arrived at `target`, within `epsilon` pixels.
 *
 * @param position - Current pixel position.
 * @param target - Target pixel position.
 * @param epsilon - Arrival tolerance in pixels.
 * @returns True when `position` is within `epsilon` of `target`.
 */
export function reachedTarget(position: Vec2, target: Vec2, epsilon: number): boolean {
  return Math.hypot(target.x - position.x, target.y - position.y) <= epsilon;
}

/**
 * Fast-forward one AI player's develop turn to completion: repeatedly decide
 * and dispatch the same `decideDevelopAction` sequence the scene manager's
 * timed cadence would have, with no delay between steps, stopping the instant
 * the phase leaves develop or the active player changes (the turn ended).
 * This is the "Skip" control's implementation: because it calls the exact
 * same pure decision function in the exact same order as watching the turn
 * play out one AI_STEP_MS step at a time, the two paths reach an identical
 * final GameState for the same starting state (the skip-equivalence
 * property `tests/test_ai_actor.mjs` and the Playwright skip-equivalence
 * spec both verify).
 *
 * @param dispatch - The store's dispatch function.
 * @param getState - Reads the current live GameState (called again after
 *   every dispatch, so it must reflect the just-applied action).
 * @param playerId - The AI player whose turn to fast-forward.
 * @returns The number of actions dispatched.
 * @throws If the turn has not ended within `AI_TURN_WATCHDOG_STEPS` actions.
 */
export function runAiTurnToCompletion(
  dispatch: (action: Action) => void,
  getState: () => GameState,
  playerId: number,
): number {
  let steps = 0;
  for (;;) {
    const state = getState();
    if (state.phase.kind !== "develop" || state.phase.payload.activePlayer !== playerId) {
      return steps;
    }
    if (steps >= AI_TURN_WATCHDOG_STEPS) {
      throw new Error(
        `runAiTurnToCompletion: player ${playerId} did not end its turn within ` +
          `${AI_TURN_WATCHDOG_STEPS} actions`,
      );
    }
    dispatch(decideDevelopAction(state, playerId));
    steps += 1;
  }
}
