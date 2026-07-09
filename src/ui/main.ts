import type { GameState, Plot, Terrain } from "../engine/game_state";
import { PLOT_COLS, PLOT_ROWS } from "../engine/game_state";
import type { Player } from "../engine/player";
import { createInitialStoreState } from "../engine/store";
import { registerScreen, showScreen } from "./screen_router";
import { renderMap } from "./map_render";
import { renderHud } from "./hud";
import { startNewGame, GAME_SCREEN_ID } from "./game_driver";

const TITLE_SCREEN_ID = "screen-title";
const MAP_SCREEN_ID = "screen-map";

//============================================
export function initApp(): void {
  registerScreen(TITLE_SCREEN_ID);
  registerScreen(GAME_SCREEN_ID);
  registerScreen(MAP_SCREEN_ID);
  showScreen(TITLE_SCREEN_ID);

  wireNewGameButton();

  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "map") {
    renderFixtureDemo();
  }
}

/**
 * Enable the title screen's New Game button and start a full game when it is
 * clicked. The button ships disabled in index.html so it is inert until the
 * driver is wired here.
 */
function wireNewGameButton(): void {
  const button = document.getElementById("new-game-button");
  if (button === null) {
    throw new Error("wireNewGameButton: #new-game-button missing");
  }
  if (button instanceof HTMLButtonElement) {
    button.disabled = false;
  }
  button.addEventListener("click", () => {
    startNewGame(GAME_SCREEN_ID);
  });
}

/**
 * Build a hand-written fixture `GameState` for visual and automated review
 * of the map and HUD renderers, independent of the procedural map generator
 * or any other phase package's logic. Covers every terrain type, one owned
 * and outfitted M.U.L.E. per player, and varied money/goods per player.
 *
 * @returns A fixture game state ready for `renderMap`/`renderHud`.
 */
function buildFixtureState(): GameState {
  const plots = buildFixturePlots();
  const players: [Player, Player, Player, Player] = [
    { id: 0, isHuman: true, colorSlot: 0, money: 850, goods: { food: 4, energy: 2, smithore: 0 } },
    { id: 1, isHuman: false, colorSlot: 1, money: 620, goods: { food: 1, energy: 5, smithore: 3 } },
    {
      id: 2,
      isHuman: false,
      colorSlot: 2,
      money: 1140,
      goods: { food: 0, energy: 0, smithore: 7 },
    },
    { id: 3, isHuman: false, colorSlot: 3, money: 300, goods: { food: 3, energy: 1, smithore: 1 } },
  ];
  return {
    seed: 1,
    rngState: 1,
    round: 1,
    phase: { kind: "title" },
    plots,
    players,
    store: createInitialStoreState(),
  };
}

/**
 * Build the fixture's plot grid: a deterministic pattern covering every
 * terrain type, with one owned-and-outfitted M.U.L.E. per player id (0-3)
 * placed on distinct non-river, non-town plots.
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
      plotRow.push({ terrain, owner: null, muleOutfit: null });
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

/**
 * Overwrite one plot in place (by replacing its row array entry) with an
 * owned, outfitted M.U.L.E. Callers pick corner plots, which the fixture's
 * generation pattern always leaves as `plain`.
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
  plotRow[col] = { terrain: "plain", owner, muleOutfit: outfit };
}

/**
 * Render the fixture state's map and HUD into `#map-container` and
 * `#hud-container`, then show the map screen. Invoked behind the
 * `?demo=map` URL param so the renderers can be viewed and driven by
 * Playwright without going through real game flow.
 */
function renderFixtureDemo(): void {
  const mapContainer = document.getElementById("map-container");
  const hudContainer = document.getElementById("hud-container");
  if (mapContainer === null || hudContainer === null) {
    throw new Error("renderFixtureDemo: #map-container or #hud-container missing");
  }
  const state = buildFixtureState();
  renderMap(mapContainer, state);
  renderHud(hudContainer, state);
  showScreen(MAP_SCREEN_ID);
}
