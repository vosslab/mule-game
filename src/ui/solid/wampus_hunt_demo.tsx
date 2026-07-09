// Wampus-hunt fixture demo screen (the ?demo=wampus hook).
//
// Builds a real generated-map develop-phase GameState with the human active
// and a fixed wampus already visible (with a matching "spawn" event, so
// wampus_presentation.ts's buffer arms the same way it would in a live
// game) on an unowned mountain plot, then spawns the avatar directly on
// that plot -- so pressing the action key immediately exercises the hunt
// trigger without needing to walk there -- for direct visual and Playwright
// review of wampus render/blink/catch independent of waiting for a real
// game's random spawn timing.
//
// Solid discipline: the store is created once in this run-once component,
// and the develop payload is read reactively through an accessor.

import type { JSX } from "solid-js";
import type { DevelopPayload, GameState, Plot } from "../../engine/game_state";
import { createInitialGameState } from "../../engine/turn";
import { DEVELOP_TICKS_FULL } from "../../engine/constants";
import { createGameStore } from "../game_store";
import { HUMAN_ID } from "../game_driver";
import { Hud } from "./hud";
import { MapLayer } from "./map_layer";
import { OverworldScene } from "../scenes/overworld_scene";
import type { Cell } from "../scenes/walker";

//============================================
/**
 * Read the `?seed=` param for the fixture's map generation.
 *
 * @returns The parsed seed, or a fixed fallback when absent or malformed.
 */
function readSeed(): number {
  if (typeof window === "undefined") {
    return 11;
  }
  const raw = new URLSearchParams(window.location.search).get("seed");
  if (raw === null) {
    return 11;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) || parsed < 0 ? 11 : parsed;
}

//============================================
/**
 * Find the first unowned mountain plot (row-major order), the wampus's
 * candidate site.
 *
 * @param plots - The generated board.
 * @returns The mountain plot's coordinates.
 * @throws If the board has no unowned mountain plot (should not happen on a
 *   freshly generated board).
 */
function firstUnownedMountain(plots: readonly (readonly Plot[])[]): Cell {
  for (const [row, rowPlots] of plots.entries()) {
    for (const [col, plot] of rowPlots.entries()) {
      if (plot.owner === null && plot.terrain.startsWith("mountain")) {
        return { row, col };
      }
    }
  }
  throw new Error("wampus_hunt_demo: no unowned mountain plot on the generated board");
}

//============================================
/**
 * Render the wampus-hunt demo: the HUD, board, and the walkable overworld
 * with a visible, catchable wampus at the avatar's spawn cell. Mounted by
 * the app's phase-router when the active screen is the wampus-demo screen.
 *
 * @returns The demo screen fragment.
 */
export function WampusHuntDemoScreen(): JSX.Element {
  const store = createGameStore(buildFixtureState(readSeed()));
  const payload = (): DevelopPayload => {
    if (store.state.phase.kind !== "develop") {
      throw new Error("WampusHuntDemoScreen: fixture state left the develop phase");
    }
    return store.state.phase.payload;
  };
  const wampusCell = firstUnownedMountain(store.state.plots);

  return (
    <div id="wampus-hunt-demo" class="wampus-hunt-demo">
      <div id="game-hud">
        <Hud state={store.state} />
      </div>
      <div id="map-container">
        <MapLayer state={store.state} />
        <OverworldScene
          store={store}
          payload={payload}
          spawnCell={wampusCell}
          onEnterTown={() => undefined}
          assayArmed={() => false}
          onAssayed={() => undefined}
        />
      </div>
    </div>
  );
}

//============================================
/**
 * Build a fixture develop-phase `GameState`: a real generated map, the
 * human active with a full tick budget, and a wampus fixed visible (with a
 * matching spawn event) at the first unowned mountain plot.
 *
 * @param seed - Seed for the fixture's map generation.
 * @returns A fixture develop-phase game state.
 */
function buildFixtureState(seed: number): GameState {
  const base = createInitialGameState(seed, "beginner");
  const wampusCell = firstUnownedMountain(base.plots);
  const payload: DevelopPayload = {
    turnQueue: [0, 1, 2, 3],
    queueIndex: 0,
    activePlayer: HUMAN_ID,
    ticksRemaining: DEVELOP_TICKS_FULL,
    carriedMule: "none",
    rankOrder: [0, 1, 2, 3],
    wampus: {
      row: wampusCell.row,
      col: wampusCell.col,
      visible: true,
      dead: false,
      caught: false,
      moneyReward: 100,
      blinkTicks: 5,
      blinksRemainingAtSite: 1,
      mountains: [wampusCell],
      tick: 1,
      events: [{ tick: 1, kind: "spawn", row: wampusCell.row, col: wampusCell.col }],
    },
  };
  return { ...base, phase: { kind: "develop", payload } };
}
