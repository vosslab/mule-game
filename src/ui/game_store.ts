// Reactive Solid store wrapping the engine's immutable GameState snapshots.
//
// The engine reducer (`applyAction`) stays the single source of truth: it takes
// an immutable GameState plus an Action and returns the next immutable snapshot.
// This module bridges those snapshots into SolidJS fine-grained reactivity via
// `reconcile`, which diffs the new snapshot against the current store and
// touches only the fields that actually changed, so Solid components re-run just
// the reactive computations tied to changed data.
//
// Discipline: `dispatch` is the ONLY writer. UI code reads through `state` (the
// reactive proxy) and mutates exclusively by dispatching Actions, never by
// calling the store setter directly. This keeps every transition funneled
// through the pure reducer so replay and determinism hold.

import { createStore, reconcile } from "solid-js/store";
import type { Action, GameState } from "../engine/game_state";
import { applyAction } from "../engine/game_state";

/** A reactive game store: the read proxy plus its bound dispatch function. */
export interface GameStore {
  /** Reactive read accessor. Access fields inside a tracking scope to subscribe. */
  readonly state: GameState;
  /** Apply an Action through the pure reducer and reconcile the result in. */
  readonly dispatch: (action: Action) => void;
}

/** Optional hooks for a game store. */
export interface GameStoreOptions {
  /**
   * Invoked after each dispatched action has reconciled, with the action just
   * applied. The autosave recorder (src/ui/game_driver.ts) uses this to append
   * the action to the persisted log and rewrite the save; a plain store (the
   * replay viewer, demos) omits it and never touches localStorage. Keeping the
   * recorder a caller-supplied hook rather than baked in preserves the "dispatch
   * is the sole writer" discipline while leaving the store ignorant of seed,
   * selection, and buildVersion, which are the driver's and save_log's concern.
   */
  readonly onDispatch?: (action: Action) => void;
}

//============================================
/**
 * Create a reactive game store seeded from an immutable snapshot.
 *
 * @param initialSnapshot - Starting GameState (from `createInitialGameState`
 *   or a fixture). Copied into the reactive store; the original is not mutated.
 * @param options - Optional store hooks (the autosave recorder).
 * @returns A `GameStore` exposing the reactive `state` proxy and `dispatch`.
 */
export function createGameStore(
  initialSnapshot: GameState,
  options: GameStoreOptions = {},
): GameStore {
  const [state, setState] = createStore<GameState>(initialSnapshot);

  // dispatch is the sole writer: run the pure reducer, then reconcile the next
  // snapshot into the store so Solid updates only the fields that changed, then
  // notify the optional recorder so autosave stays exactly one action behind the
  // live state.
  const dispatch = (action: Action): void => {
    const next = applyAction(state, action);
    setState(reconcile(next));
    options.onDispatch?.(action);
  };

  return { state, dispatch };
}
