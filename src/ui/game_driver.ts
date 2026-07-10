// Game session controller.
//
// This is the thin seam between "start a game" and the reactive Solid UI. It
// owns the live `GameStore` (exposed as a reactive signal the app routes on),
// starts the rAF scene manager that drives ticks and AI turns, and hands the
// store to the Solid `GameScreen` for rendering. It does no DOM rendering
// itself: the old imperative renderers and setTimeout chains are gone, replaced
// by `src/ui/scenes/scene_manager.ts` (scheduling) and the Solid components
// under `src/ui/solid/` (rendering).
//
// The store is the single source of truth for the live game: every transition
// flows through `store.dispatch` (the pure reducer + reconcile), whether it
// originates from a human control in a Solid panel or from the scene manager's
// AI/tick scheduling.

import { createSignal } from "solid-js";
import type { Action, GameMode, GameState } from "../engine/game_state";
import { applyAction } from "../engine/game_state";
import { createInitialGameState } from "../engine/turn";
import type { Species } from "../engine/player";
import { SPECIES } from "../engine/player";
import type { GameStore } from "./game_store";
import { createGameStore } from "./game_store";
import type { SavedGame } from "./save_log";
import {
  BUILD_VERSION,
  buildSpeciesTuple,
  isResumable,
  loadSavedGame,
  replayToState,
  writeSave,
} from "./save_log";
import { showScreen } from "./screen_router";
import { startSceneLoop, stopSceneLoop } from "./scenes/scene_manager";
import { installWalkerDebug } from "./walker_debug";

/** Player id of the single human player; ids 1..3 are AI. */
export const HUMAN_ID = 0;

/** Registered id of the gameplay screen; shared with main.tsx wiring. */
export const GAME_SCREEN_ID = "screen-game";

/**
 * The title screen's species/mode picker choice: the human's own species
 * (cosmetic, see `Species`'s doc comment) and the round-count mode. The three
 * AI players' species are filled in from `SPECIES` deterministically (see
 * `buildSpeciesTuple`); only the human's is player-chosen.
 */
export interface NewGameSelection {
  /** The player-chosen game mode (round count). */
  readonly mode: GameMode;
  /** The human player's (id 0) chosen cosmetic species. */
  readonly species: Species;
  /**
   * Whether the relaxed-timer option is on: doubles the develop-tick and
   * land-grant-sweep real-time pacing (UI-side only, see scene_manager.ts's
   * RELAXED_TIMER_MULTIPLIER) for players who find the default reflex timing
   * tight. Engine tick budgets are unaffected.
   */
  readonly relaxedTimer: boolean;
}

/** Configuration for a new game: the RNG seed, the loop speed multiplier, and the title-screen selection. */
export interface NewGameConfig {
  /** Seed for the deterministic engine RNG. */
  readonly seed: number;
  /** Speed multiplier for the scene-manager clock. */
  readonly speed: number;
  /** Game mode and the human's species pick from the title screen. */
  readonly selection: NewGameSelection;
}

/** Default selection matching this engine's pre-picker defaults (beginner mode, the first species). */
export const DEFAULT_NEW_GAME_SELECTION: NewGameSelection = {
  mode: "beginner",
  species: SPECIES[0] as Species,
  relaxedTimer: false,
};

/** The live game store, or null before the first game starts. */
const [gameStore, setGameStore] = createSignal<GameStore | null>(null);

/** Seed of the most recent game, reused by the autosave record. */
let currentSeed = 0;

/** Speed multiplier of the most recent game, reused by Play Again and autosave. */
let currentSpeed = 1;

/** Mode/species selection of the most recent game, reused by Play Again. */
let currentSelection: NewGameSelection = DEFAULT_NEW_GAME_SELECTION;

//============================================
/**
 * Reactive accessor for the live game store. The app's phase-router reads this
 * to mount `GameScreen` once a game is running.
 *
 * @returns The current game store, or null when no game is active.
 */
export function currentGameStore(): GameStore | null {
  return gameStore();
}

//============================================
/**
 * Assemble the current autosave from the base game parameters and the running
 * action log. `actions` is stored by reference: the recorder pushes onto the
 * same array, so each write serializes the up-to-date log without copying.
 *
 * @param actions - The live action log the recorder appends to.
 * @returns The SavedGame to persist.
 */
function buildSave(actions: readonly Action[]): SavedGame {
  return {
    buildVersion: BUILD_VERSION,
    seed: currentSeed,
    mode: currentSelection.mode,
    species: currentSelection.species,
    relaxedTimer: currentSelection.relaxedTimer,
    speed: currentSpeed,
    actions,
  };
}

//============================================
/**
 * Wrap a starting snapshot in a reactive store whose dispatch also autosaves.
 * The recorder appends each dispatched action to `log` (seeded with any actions
 * already replayed on resume) and rewrites the save, so the persisted log stays
 * exactly one action behind the live state.
 *
 * @param initial - The store's starting snapshot (already at `priorActions`).
 * @param priorActions - Actions already applied to `initial` (empty for a new game).
 * @returns The autosaving store.
 */
function createAutosavingStore(initial: GameState, priorActions: readonly Action[]): GameStore {
  const log: Action[] = [...priorActions];
  function record(action: Action): void {
    log.push(action);
    writeSave(buildSave(log));
  }
  const store = createGameStore(initial, { onDispatch: record });
  // Persist the base save immediately so a reload right after start (or resume),
  // before any further dispatch, still finds a resumable game.
  writeSave(buildSave(log));
  // Install (or reinstall) the walker debug projection so window.muleGameState
  // always reads off this store, not a prior replaced one.
  installWalkerDebug(store);
  return store;
}

//============================================
/**
 * Start a fresh game: build the initial post-start state, wrap it in an
 * autosaving reactive store, show the game screen, and start the scene-manager
 * loop. Safe to call again for "Play Again". Any prior loop is stopped first,
 * and any earlier save is overwritten by this game's fresh save.
 *
 * @param config - The seed, speed, and title-screen selection for the new game.
 */
export function startNewGame(config: NewGameConfig): void {
  stopSceneLoop();
  currentSeed = config.seed;
  currentSpeed = config.speed > 0 ? config.speed : 1;
  currentSelection = config.selection;
  const initialState = createInitialGameState(
    config.seed,
    config.selection.mode,
    buildSpeciesTuple(config.selection.species),
  );
  const initial = applyAction(initialState, { type: "start_game" });
  const store = createAutosavingStore(initial, []);
  setGameStore(store);
  showScreen(GAME_SCREEN_ID);
  startSceneLoop(store, currentSpeed, config.selection.relaxedTimer);
}

//============================================
/**
 * Resume the persisted game when it matches the running build: replay its
 * action log through the reducer to rebuild the exact live state, wrap it in a
 * fresh autosaving store seeded with the replayed log, show the game screen,
 * and restart the scene loop at the saved speed and timer setting. Continued
 * play appends to the same log, so the save stays complete.
 *
 * @returns True when a game was resumed, false when no matching save exists.
 */
export function resumeSavedGame(): boolean {
  const save = loadSavedGame();
  if (save === null || !isResumable(save)) {
    return false;
  }
  stopSceneLoop();
  currentSeed = save.seed;
  currentSpeed = save.speed > 0 ? save.speed : 1;
  currentSelection = {
    mode: save.mode,
    species: save.species,
    relaxedTimer: save.relaxedTimer,
  };
  const resumed = replayToState(save);
  const store = createAutosavingStore(resumed, save.actions);
  setGameStore(store);
  showScreen(GAME_SCREEN_ID);
  startSceneLoop(store, currentSpeed, currentSelection.relaxedTimer);
  return true;
}

//============================================
/**
 * Restart with a fresh random seed at the current speed and selection. Wired
 * to the scoring screen's Play Again button.
 */
export function playAgain(): void {
  startNewGame({ seed: randomSeed(), speed: currentSpeed, selection: currentSelection });
}

//============================================
/**
 * A fresh non-negative 32-bit seed for a non-deterministic new game.
 *
 * @returns A seed derived from the wall clock.
 */
export function randomSeed(): number {
  return Date.now() % 0xffffffff;
}
