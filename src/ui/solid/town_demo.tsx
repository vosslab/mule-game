// Town-scene fixture demo screen (the ?demo=town hook).
//
// Builds a hand-written develop-phase GameState (the human active, a full tick
// budget, a stocked store) and renders the walkable TownScene against it for
// direct visual and Playwright review, independent of the game driver's phase
// logic. Buying at the corral and outfitting at a counter dispatch real actions
// against this fixture store, so the tow follower and outfit badge update just
// as they do in a live game. Walking into an edge exit remounts the scene fresh
// (there is no overworld to return to in the fixture), so the demo stays usable.
//
// Solid discipline: the store is created once in this run-once component; the
// TownScene reads the reactive develop payload through the accessor passed in.

import { Show, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import type { DevelopPayload, GameState, Plot, Terrain } from "../../engine/game_state";
import { PLOT_COLS, PLOT_ROWS } from "../../engine/game_state";
import type { Player } from "../../engine/player";
import { DEVELOP_TICKS_FULL } from "../../engine/constants";
import type { Species } from "../../engine/player";
import { createInitialGameState } from "../../engine/turn";
import { createWampusState } from "../../engine/wampus";
import { createGameStore } from "../game_store";
import { TownScene } from "../scenes/town_scene";

//============================================
/**
 * Render the town-scene demo: the walkable TownScene over a fixture develop
 * state. Mounted by the app's phase-router when the active screen is the
 * town-demo screen.
 *
 * @returns The town demo screen element.
 */
export function TownDemoScreen(): JSX.Element {
  const store = createGameStore(buildFixtureState());
  const payload = (): DevelopPayload => {
    if (store.state.phase.kind !== "develop") {
      throw new Error("TownDemoScreen: fixture state left the develop phase");
    }
    return store.state.phase.payload;
  };
  // Walking into an exit remounts the scene fresh (no overworld in the fixture).
  const [mountToken, setMountToken] = createSignal(1);
  return (
    <div id="town-demo" class="town-demo">
      <Show when={mountToken()} keyed>
        {(_mountKey) => (
          <TownScene
            store={store}
            payload={payload}
            onExit={() => setMountToken((token) => token + 1)}
            onArmAssay={() => undefined}
          />
        )}
      </Show>
    </div>
  );
}

//============================================
/**
 * Build a fixture develop-phase `GameState`: the human (player 0) active with a
 * full tick budget, four funded players, a stocked store, and a simple board.
 *
 * @returns A fixture develop-phase game state.
 */
function buildFixtureState(): GameState {
  // Start from a real initial game so every engine field (store stock, event
  // schedules, rng) is valid, then override the board, players, and phase for
  // the fixture. Building off the factory keeps this fixture correct as the
  // engine state shape grows.
  const base = createInitialGameState(1, "beginner");
  const players: [Player, Player, Player, Player] = [
    makePlayer(0, true, "humanoid"),
    makePlayer(1, false, "gollumer"),
    makePlayer(2, false, "mechtron"),
    makePlayer(3, false, "packer"),
  ];
  // The wampus subsystem (M8) is never exercised by this fixture; a freshly
  // created one from the base state satisfies DevelopPayload's shape.
  const wampus = createWampusState(base).wampus;
  const payload: DevelopPayload = {
    turnQueue: [0, 1, 2, 3],
    queueIndex: 0,
    activePlayer: 0,
    ticksRemaining: DEVELOP_TICKS_FULL,
    carriedMule: "none",
    rankOrder: [0, 1, 2, 3],
    wampus,
  };
  return {
    ...base,
    plots: buildFixturePlots(),
    players,
    phase: { kind: "develop", payload },
  };
}

//============================================
/**
 * Build one funded fixture player.
 *
 * @param id - Player id and color slot (0..3).
 * @param isHuman - Whether this player is the human.
 * @param species - Cosmetic species for this fixture player.
 * @returns A fixture player with a starting bankroll.
 */
function makePlayer(id: number, isHuman: boolean, species: Species): Player {
  return {
    id,
    isHuman,
    colorSlot: id as Player["colorSlot"],
    species,
    money: 1000,
    goods: { food: 4, energy: 2, smithore: 0, crystite: 0 },
  };
}

//============================================
/**
 * Build a plain fixture board with a central town cell, matching the live
 * map's town placement so the fixture reads as the same colony.
 *
 * @returns A PLOT_ROWS x PLOT_COLS grid of fixture plots.
 */
function buildFixturePlots(): Plot[][] {
  const riverCol = Math.floor(PLOT_COLS / 2);
  const townRow = Math.floor(PLOT_ROWS / 2);
  const plots: Plot[][] = [];
  for (let row = 0; row < PLOT_ROWS; row++) {
    const plotRow: Plot[] = [];
    for (let col = 0; col < PLOT_COLS; col++) {
      let terrain: Terrain = "plain";
      if (col === riverCol) {
        terrain = row === townRow ? "town" : "river";
      }
      plotRow.push({
        terrain,
        owner: null,
        muleOutfit: null,
        crystiteLevel: 0,
        crystiteRevealed: false,
      });
    }
    plots.push(plotRow);
  }
  return plots;
}
