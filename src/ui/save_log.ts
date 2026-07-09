// Autosave persistence and action-log replay for the live game.
//
// The engine reducer (`applyAction`) is a pure function of (state, action), so
// a game is fully described by its seed, its title-screen selection, and the
// ordered list of actions dispatched through the store since `start_game`. This
// module owns that saved representation: it writes the current (buildVersion,
// seed, selection, action log) to localStorage after every dispatch and reads
// it back on load, and it reconstructs a GameState by replaying the log through
// the same reducer the live game uses.
//
// Same-build replay is the only compatibility guarantee (see
// docs/active_plans/active/mule_fidelity_plan.md, "Migration and compatibility
// policy"). BUILD_VERSION is a stable per-build identifier injected at build
// time (see pipeline/build.mjs). A saved game whose buildVersion differs from
// the running build is not resumable: the title screen shows a brief notice and
// discards it rather than replaying a log the current reducer may interpret
// differently.

import type { Action, GameMode, GameState } from "../engine/game_state";
import { applyAction } from "../engine/game_state";
import type { Species } from "../engine/player";
import { SPECIES } from "../engine/player";
import { createInitialGameState } from "../engine/turn";

/**
 * The build-time-injected build identifier. `pipeline/build.mjs` defines
 * `__MULE_BUILD_VERSION__` (a hash of the source tree) so the bundle carries a
 * stable id that changes whenever the source, and therefore possibly the
 * reducer's behavior, changes. Absent a build-time define (unit tests run the
 * TypeScript directly through tsx), it resolves to "dev".
 */
declare const __MULE_BUILD_VERSION__: string | undefined;

//============================================
/**
 * Resolve the running build's version id from the build-time define, falling
 * back to "dev" when the code runs without a bundle (tsx unit tests).
 *
 * @returns The build version id.
 */
function resolveBuildVersion(): string {
  if (typeof __MULE_BUILD_VERSION__ === "string") {
    return __MULE_BUILD_VERSION__;
  }
  return "dev";
}

/** The running build's version id; saved games from other builds are not resumable. */
export const BUILD_VERSION: string = resolveBuildVersion();

/** localStorage key the single autosave slot lives under. */
export const SAVE_STORAGE_KEY = "mule-game-save-v1";

/**
 * A persisted game: everything needed to reconstruct the exact live state by
 * replaying `actions` through the reducer from a fresh seeded initial state.
 * `species` is the human's chosen (cosmetic) species; the three AI species are
 * derived deterministically the same way the live game derives them (see
 * `buildSpeciesTuple`). `speed` and `relaxedTimer` restore the scene-manager
 * pacing on resume.
 */
export interface SavedGame {
  /** The build that produced this save; only a matching build may resume it. */
  readonly buildVersion: string;
  /** The engine RNG seed the game was created with. */
  readonly seed: number;
  /** The round-count mode the game runs under. */
  readonly mode: GameMode;
  /** The human player's chosen cosmetic species. */
  readonly species: Species;
  /** Whether the relaxed-timer pacing option was on. */
  readonly relaxedTimer: boolean;
  /** The scene-manager speed multiplier the game was running at. */
  readonly speed: number;
  /** Every action dispatched through the store since `start_game`, in order. */
  readonly actions: readonly Action[];
}

//============================================
/**
 * Build the per-player species tuple `createInitialGameState` expects: the
 * human's chosen species in slot 0 and `SPECIES`'s next three entries for the
 * three AI slots. Shared by the live game start, the resume path, and the
 * replay viewer so all three reconstruct byte-identical initial states.
 *
 * @param humanSpecies - The human player's chosen species.
 * @returns The four-entry species tuple for `createInitialGameState`.
 */
export function buildSpeciesTuple(
  humanSpecies: Species,
): readonly [Species, Species, Species, Species] {
  return [humanSpecies, SPECIES[1] as Species, SPECIES[2] as Species, SPECIES[3] as Species];
}

//============================================
/**
 * The initial post-`start_game` state a save's game began from, before any of
 * its recorded actions. The replay viewer steps forward from here one recorded
 * action at a time.
 *
 * @param save - The saved game to reconstruct the opening state for.
 * @returns The GameState immediately after `start_game`.
 */
export function initialStateFromSave(save: SavedGame): GameState {
  const seeded = createInitialGameState(save.seed, save.mode, buildSpeciesTuple(save.species));
  return applyAction(seeded, { type: "start_game" });
}

//============================================
/**
 * Reconstruct the exact live state a save represents by replaying its full
 * action log through the reducer from the seeded initial state. Used by the
 * resume path to rebuild the store's snapshot before live play continues.
 *
 * @param save - The saved game to replay.
 * @returns The GameState after every recorded action has been applied.
 */
export function replayToState(save: SavedGame): GameState {
  let state = initialStateFromSave(save);
  for (const action of save.actions) {
    state = applyAction(state, action);
  }
  return state;
}

//============================================
/**
 * The active localStorage, or null when none exists (node unit tests, or a
 * browser with storage disabled). Reading through this keeps the module usable
 * outside a browser without a broad try/catch.
 *
 * @returns The Storage object, or null when unavailable.
 */
function storage(): Storage | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  return localStorage;
}

//============================================
/**
 * Persist a save to the single autosave slot. A no-op when no localStorage is
 * available, so callers on the dispatch path never need to guard.
 *
 * @param save - The save to write.
 */
export function writeSave(save: SavedGame): void {
  const ls = storage();
  if (ls === null) {
    return;
  }
  ls.setItem(SAVE_STORAGE_KEY, JSON.stringify(save));
}

//============================================
/**
 * Clear the autosave slot. Called on New Game (a fresh game overwrites its own
 * save immediately) and when a build-mismatched save is discarded.
 */
export function clearSave(): void {
  const ls = storage();
  if (ls === null) {
    return;
  }
  ls.removeItem(SAVE_STORAGE_KEY);
}

//============================================
/**
 * Read the persisted save, or null when none exists or the stored value is not
 * a well-formed save. Parsing persisted, externally-mutable data is the one
 * place a narrow try/catch is warranted: corrupt localStorage returns null
 * rather than crashing the title screen.
 *
 * @returns The saved game, or null.
 */
export function loadSavedGame(): SavedGame | null {
  const ls = storage();
  if (ls === null) {
    return null;
  }
  const raw = ls.getItem(SAVE_STORAGE_KEY);
  if (raw === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isSavedGame(parsed)) {
    return null;
  }
  return parsed;
}

//============================================
/**
 * Whether a saved game is resumable in the running build. Same-build replay is
 * the only compatibility guarantee, so a save from any other build is not.
 *
 * @param save - The saved game to check.
 * @returns True when the save's build matches the running build.
 */
export function isResumable(save: SavedGame): boolean {
  return save.buildVersion === BUILD_VERSION;
}

//============================================
/**
 * Structural type guard for a parsed save. Guards against a stored value from
 * an older, incompatible save schema (not just another build) by confirming
 * every required field is present with the right primitive type; the action
 * list is checked for arrayness only, since a same-build replay validates each
 * action by applying it.
 *
 * @param value - The parsed JSON value from localStorage.
 * @returns True when `value` has the SavedGame shape.
 */
function isSavedGame(value: unknown): value is SavedGame {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record["buildVersion"] === "string" &&
    typeof record["seed"] === "number" &&
    typeof record["mode"] === "string" &&
    typeof record["species"] === "string" &&
    typeof record["relaxedTimer"] === "boolean" &&
    typeof record["speed"] === "number" &&
    Array.isArray(record["actions"])
  );
}
