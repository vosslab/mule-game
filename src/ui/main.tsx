import { render } from "solid-js/web";
import type { GameMode } from "../engine/game_state";
import type { Species } from "../engine/player";
import { SPECIES } from "../engine/player";
import { registerScreen, showScreen } from "./screen_router";
import {
  startNewGame,
  resumeSavedGame,
  randomSeed,
  GAME_SCREEN_ID,
  DEFAULT_NEW_GAME_SELECTION,
} from "./game_driver";
import type { NewGameSelection } from "./game_driver";
import { App } from "./solid/app";
import { registerServiceWorker } from "./pwa_register";

const TITLE_SCREEN_ID = "screen-title";
const MAP_SCREEN_ID = "screen-map";
const TOWN_SCREEN_ID = "screen-town";
const AI_ACTOR_DEMO_SCREEN_ID = "screen-ai-actor-demo";
const MULE_ESCAPE_DEMO_SCREEN_ID = "screen-mule-escape-demo";
const WAMPUS_HUNT_DEMO_SCREEN_ID = "screen-wampus-hunt-demo";
const REPLAY_SCREEN_ID = "screen-replay";

//============================================
export function initApp(): void {
  registerServiceWorker();
  registerScreen(TITLE_SCREEN_ID);
  registerScreen(GAME_SCREEN_ID);
  registerScreen(MAP_SCREEN_ID);
  registerScreen(TOWN_SCREEN_ID);
  registerScreen(AI_ACTOR_DEMO_SCREEN_ID);
  registerScreen(MULE_ESCAPE_DEMO_SCREEN_ID);
  registerScreen(WAMPUS_HUNT_DEMO_SCREEN_ID);
  registerScreen(REPLAY_SCREEN_ID);
  showScreen(TITLE_SCREEN_ID);

  const params = new URLSearchParams(window.location.search);
  mountApp(params);

  const demo = params.get("demo");
  if (demo === "map") {
    showScreen(MAP_SCREEN_ID);
  } else if (demo === "town") {
    showScreen(TOWN_SCREEN_ID);
  } else if (demo === "ai_actor") {
    showScreen(AI_ACTOR_DEMO_SCREEN_ID);
  } else if (demo === "mule_escape") {
    showScreen(MULE_ESCAPE_DEMO_SCREEN_ID);
  } else if (demo === "wampus") {
    showScreen(WAMPUS_HUNT_DEMO_SCREEN_ID);
  }

  // The replay viewer is a separate entry, opened by `?replay=fixture` (or the
  // title screen's Watch replay control), independent of the demo screens.
  if (params.get("replay") === "fixture") {
    showScreen(REPLAY_SCREEN_ID);
  }
}

/**
 * Mount the SolidJS root app into #app. The App's phase-router shows the active
 * screen; clicking New Game on the title screen starts a full game at the seed
 * and speed parsed from the URL (`?seed=` / `?speed=`), plus the mode/species
 * the title screen's picker was carrying at the moment of the click. A fixed
 * `?seed=` makes the game deterministic for tests; `?speed=` scales the
 * scene-manager clock so specs and headless harnesses can fast-forward;
 * `?mode=` / `?species=` pre-select the title screen's
 * picker so a Playwright spec can pin a mode or species without driving the
 * picker's own clicks first.
 *
 * @param params - The parsed URL query parameters.
 */
function mountApp(params: URLSearchParams): void {
  const appEl = document.getElementById("app");
  if (appEl === null) {
    throw new Error("mountApp: #app missing");
  }
  const seed = parseSeed(params.get("seed"));
  const speed = parseSpeed(params.get("speed"));
  const initialSelection = parseSelection(params);
  render(
    () => (
      <App
        initialSelection={initialSelection}
        replaySpeed={speed}
        onNewGame={(selection) => startNewGame({ seed, speed, selection })}
        onResume={() => resumeSavedGame()}
        onWatchReplay={() => showScreen(REPLAY_SCREEN_ID)}
      />
    ),
    appEl,
  );
}

/**
 * Parse the title screen's initial mode/species selection from `?mode=` and
 * `?species=`, falling back to `DEFAULT_NEW_GAME_SELECTION`'s field for
 * whichever is absent or malformed, so an unrecognized value never blocks
 * mounting.
 *
 * @param params - The parsed URL query parameters.
 * @returns The initial title-screen selection.
 */
function parseSelection(params: URLSearchParams): NewGameSelection {
  return {
    mode: parseMode(params.get("mode")),
    species: parseSpecies(params.get("species")),
    relaxedTimer: parseRelaxedTimer(params.get("timer")),
  };
}

/**
 * Parse the `?mode=` parameter into a `GameMode`.
 *
 * @param raw - The raw query value, or null when the parameter is absent.
 * @returns `"beginner"` or `"standard"` when `raw` matches one exactly,
 *   else `DEFAULT_NEW_GAME_SELECTION.mode`.
 */
function parseMode(raw: string | null): GameMode {
  if (raw === "beginner" || raw === "standard") {
    return raw;
  }
  return DEFAULT_NEW_GAME_SELECTION.mode;
}

/**
 * Parse the `?species=` parameter into a `Species`.
 *
 * @param raw - The raw query value, or null when the parameter is absent.
 * @returns `raw` when it names one of `SPECIES`, else
 *   `DEFAULT_NEW_GAME_SELECTION.species`.
 */
function parseSpecies(raw: string | null): Species {
  if (raw !== null && (SPECIES as readonly string[]).includes(raw)) {
    return raw as Species;
  }
  return DEFAULT_NEW_GAME_SELECTION.species;
}

/**
 * Parse the `?timer=` parameter into the relaxed-timer toggle: `"relaxed"`
 * turns it on, anything else (including absent) leaves it off.
 *
 * @param raw - The raw query value, or null when the parameter is absent.
 * @returns Whether the relaxed-timer option starts on.
 */
function parseRelaxedTimer(raw: string | null): boolean {
  return raw === "relaxed";
}

/**
 * Parse the `?seed=` parameter into a non-negative integer seed, falling back
 * to a wall-clock random seed when absent or malformed.
 *
 * @param raw - The raw query value, or null when the parameter is absent.
 * @returns The seed to start the game with.
 */
function parseSeed(raw: string | null): number {
  if (raw === null) {
    return randomSeed();
  }
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return randomSeed();
  }
  return parsed;
}

/**
 * Parse the `?speed=` parameter into a positive speed multiplier, defaulting to
 * 1 when absent or malformed.
 *
 * @param raw - The raw query value, or null when the parameter is absent.
 * @returns The speed multiplier for the scene-manager clock.
 */
function parseSpeed(raw: string | null): number {
  if (raw === null) {
    return 1;
  }
  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 1;
  }
  return parsed;
}
