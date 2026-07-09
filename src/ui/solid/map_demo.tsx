// Fixture map/HUD demo screen as a SolidJS component (the ?demo=map hook).
//
// Builds a hand-written GameState covering every terrain type and one owned,
// outfitted M.U.L.E. per player, wraps it in a game store, and renders the HUD
// and map for visual and Playwright review, independent of the procedural map
// generator or the game driver's phase logic. The fixture builders moved here
// from src/ui/main.ts when the title screen was ported to Solid.
//
// Solid discipline: the store is created once in this run-once component; the
// HUD reads the reactive state through its props.

import type { JSX } from "solid-js";
import type { GameState, Plot, Terrain } from "../../engine/game_state";
import { PLOT_COLS, PLOT_ROWS } from "../../engine/game_state";
import type { Player } from "../../engine/player";
import { createInitialStoreState } from "../../engine/store";
import { createGameStore } from "../game_store";
import { Hud } from "./hud";
import { MapLayer } from "./map_layer";

//============================================
/**
 * Render the fixture demo screen: the Solid HUD plus the board. Mounted by the
 * app's phase-router when the active screen is the map-demo screen.
 *
 * @returns The demo screen fragment (HUD container plus map container).
 */
export function MapDemoScreen(): JSX.Element {
  const store = createGameStore(buildFixtureState());
  return (
    <>
      <div id="hud-container">
        <Hud state={store.state} />
      </div>
      <div id="map-container">
        <MapLayer state={store.state} />
      </div>
    </>
  );
}

//============================================
/**
 * Build a hand-written fixture `GameState` for visual and automated review of
 * the map and HUD renderers. Covers every terrain type, one owned and outfitted
 * M.U.L.E. per player, and varied money/goods per player.
 *
 * @returns A fixture game state ready for the HUD and map.
 */
function buildFixtureState(): GameState {
  const plots = buildFixturePlots();
  const players: [Player, Player, Player, Player] = [
    {
      id: 0,
      isHuman: true,
      colorSlot: 0,
      // Species is cosmetic; fixed here since this
      // fixture is never exercised by a species picker.
      species: "humanoid",
      money: 850,
      goods: { food: 4, energy: 2, smithore: 0, crystite: 0 },
    },
    {
      id: 1,
      isHuman: false,
      colorSlot: 1,
      species: "gollumer",
      money: 620,
      goods: { food: 1, energy: 5, smithore: 3, crystite: 0 },
    },
    {
      id: 2,
      isHuman: false,
      colorSlot: 2,
      species: "mechtron",
      money: 1140,
      goods: { food: 0, energy: 0, smithore: 7, crystite: 0 },
    },
    {
      id: 3,
      isHuman: false,
      colorSlot: 3,
      species: "packer",
      money: 300,
      goods: { food: 3, energy: 1, smithore: 1, crystite: 0 },
    },
  ];
  return {
    seed: 1,
    rngState: 1,
    mode: "beginner",
    round: 1,
    phase: { kind: "title" },
    plots,
    players,
    store: createInitialStoreState(),
    landMarket: { priceAccumulator: 0, setSize: 0, lastSellPrice: 0 },
    // Static map fixture: the event subsystems (M6) are never exercised here,
    // so they carry empty schedules/decks. Added to satisfy the engine's
    // GameState shape after events landed (compiler-forced).
    colonyEventSchedule: [],
    colonyEventRngState: 0,
    playerEventDeck: [],
    playerEventCursor: 0,
    playerEventRngState: 0,
    eventHistory: [],
    // Static map fixture: the wampus subsystem (M8) is never exercised here
    // (fixture never enters the develop phase), so this only needs to
    // satisfy the engine's GameState shape (compiler-forced).
    wampusRngState: 0,
  };
}

//============================================
/**
 * Build the fixture's plot grid: a deterministic pattern covering every terrain
 * type, with one owned-and-outfitted M.U.L.E. per player id (0-3) placed on
 * distinct non-river, non-town plots.
 *
 * @returns A PLOT_ROWS x PLOT_COLS grid of fixture plots.
 */
function buildFixturePlots(): Plot[][] {
  const riverCol = Math.floor(PLOT_COLS / 2);
  const townRow = Math.floor(PLOT_ROWS / 2);
  const mountainTiers: readonly Terrain[] = ["mountain1", "mountain2", "mountain3"];

  const plots: Plot[][] = [];
  for (let row = 0; row < PLOT_ROWS; row++) {
    const plotRow: Plot[] = [];
    for (let col = 0; col < PLOT_COLS; col++) {
      let terrain: Terrain;
      if (col === riverCol) {
        terrain = row === townRow ? "town" : "river";
      } else if ((row + col) % 3 === 0) {
        const tierIndex = (row + col) % mountainTiers.length;
        terrain = mountainTiers[tierIndex]!;
      } else {
        terrain = "plain";
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

  // Place one owned, outfitted M.U.L.E. per player on a fixed plain plot.
  placeFixtureMule(plots, 0, 0, 0, "food");
  placeFixtureMule(plots, 1, 0, PLOT_COLS - 1, "energy");
  placeFixtureMule(plots, 2, PLOT_ROWS - 1, 0, "smithore");
  placeFixtureMule(plots, 3, PLOT_ROWS - 1, PLOT_COLS - 1, "food");

  return plots;
}

//============================================
/**
 * Overwrite one plot in place with an owned, outfitted M.U.L.E. Callers pick
 * corner plots, which the fixture's generation pattern always leaves as `plain`.
 *
 * @param plots - Grid to mutate; only the target row is replaced.
 * @param owner - Player id claiming the plot.
 * @param row - Zero-based row index of the target plot.
 * @param col - Zero-based col index of the target plot.
 * @param outfit - Resource the placed M.U.L.E. is outfitted for.
 */
function placeFixtureMule(
  plots: Plot[][],
  owner: number,
  row: number,
  col: number,
  outfit: Plot["muleOutfit"],
): void {
  const plotRow = plots[row];
  if (plotRow === undefined) {
    throw new Error(`placeFixtureMule: row ${row} out of range`);
  }
  plotRow[col] = {
    terrain: "plain",
    owner,
    muleOutfit: outfit,
    crystiteLevel: 0,
    crystiteRevealed: false,
  };
}
