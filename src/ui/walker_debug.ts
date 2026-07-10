// Read-only browser projection of the live game state, for Playwright/E2E
// walkers that drive the UI without importing engine internals directly.
//
// Coupling contract: the walker ORCHESTRATOR (scene-transition waiting,
// generic polling, "has the phase changed yet") may read only the
// convenience fields below (phaseKind/activePlayerId/humanMoney/sweepRow/
// sweepCol). Everything else -- what to buy, bid, or claim -- flows through
// the strategy adapter, which is the sole consumer of the full `state`
// field. This keeps the orchestrator ignorant of game rules and the
// adapter as the single seam that knows how to decide.

import { unwrap } from "solid-js/store";

import type { GameState } from "../engine/game_state";
import { currentPicker } from "../engine/land_grant";
import type { GameStore } from "./game_store";

/** Player id of the single human player; ids 1..3 are AI (matches game_driver.ts HUMAN_ID). */
const HUMAN_PLAYER_ID = 0;

/**
 * Read-only snapshot of the live game exposed to Playwright walkers. `state`
 * is the full engine `GameState`, deep-frozen and structured-cloned so a
 * caller mutation cannot drift the snapshot away from the live store.
 */
export interface WalkerProjection {
  readonly state: GameState;
  readonly phaseKind: GameState["phase"]["kind"];
  readonly activePlayerId: number | null;
  readonly humanMoney: number;
  readonly sweepRow: number | null;
  readonly sweepCol: number | null;
}

declare global {
  interface Window {
    muleGameState?: () => WalkerProjection;
  }
}

//============================================
/**
 * Recursively freeze a structured-clone-safe plain-data value: arrays and
 * plain objects only, matching `GameState`'s serializable shape. Freezing in
 * place makes any caller mutation throw under strict mode (ESM is strict by
 * default) instead of silently succeeding.
 *
 * @param value - Plain-data value to freeze in place.
 * @returns The same value, deep-frozen.
 */
function deepFreeze<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return Object.freeze(value);
  }
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    return Object.freeze(value);
  }
  return value;
}

//============================================
/**
 * The active/picker player id for phases with a single well-defined active
 * player: land grant's current picker and develop's active turn holder.
 * Every other phase (title, land auction, production, resource auction,
 * scoring) has either no single active player (multiple simultaneous
 * bidders) or no player turn at all, so this returns null there.
 *
 * @param state - The engine state to read.
 * @returns The active player id, or null.
 */
function activePlayerIdFor(state: GameState): number | null {
  const phase = state.phase;
  if (phase.kind === "land_grant") {
    return currentPicker(phase.payload);
  }
  if (phase.kind === "develop") {
    return phase.payload.activePlayer;
  }
  return null;
}

//============================================
/**
 * Build the walker projection from a live `GameState`: a deep-frozen
 * structured clone of the full state, plus the convenience fields the
 * walker orchestrator reads directly. Exported so Node unit tests exercise
 * the exact same code path installed on `window.muleGameState` (the
 * strategy-adapter package depends on this export).
 *
 * `state` is unwrapped before cloning because the live store (game_store.ts's
 * `createStore` from solid-js/store) is a reactive Proxy, and
 * `structuredClone` cannot serialize a Proxy directly (throws
 * DataCloneError). `unwrap()` returns the plain underlying object Solid's
 * Proxy wraps; called on an already-plain `GameState` (e.g. from a Node
 * unit test) it returns the value unchanged, so this stays valid outside a
 * Solid store too.
 *
 * @param state - The live engine state to snapshot.
 * @returns The frozen projection.
 */
export function buildWalkerProjection(state: GameState): WalkerProjection {
  const cloned = structuredClone(unwrap(state));
  deepFreeze(cloned);
  const phase = cloned.phase;
  const sweepRow = phase.kind === "land_grant" ? phase.payload.sweepRow : null;
  const sweepCol = phase.kind === "land_grant" ? phase.payload.sweepCol : null;
  const projection: WalkerProjection = {
    state: cloned,
    phaseKind: phase.kind,
    activePlayerId: activePlayerIdFor(cloned),
    humanMoney: cloned.players[HUMAN_PLAYER_ID].money,
    sweepRow,
    sweepCol,
  };
  return Object.freeze(projection);
}

//============================================
/**
 * Install `window.muleGameState()` so every call reflects the given store's
 * CURRENT state (read live off `store.state` each call, not a cached
 * snapshot). Call again whenever the store is replaced (new game, resume)
 * so the installed reader points at the fresh store. No-op outside a
 * browser, so engine/Node imports stay clean.
 *
 * @param store - The live game store to project.
 */
export function installWalkerDebug(store: GameStore): void {
  if (typeof window === "undefined") {
    return;
  }
  window.muleGameState = (): WalkerProjection => buildWalkerProjection(store.state);
}
