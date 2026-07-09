// Pure overworld zone geometry.
//
// DOM-free and framework-free: this module defines the rectangular zones the
// overworld cares about (each plot cell, and the town cell that opens the store
// overlay) and the point-in-zone query the scene uses to decide which zone the
// avatar is standing in. The node tests (tests/test_zones.mjs) exercise it
// directly. It shares the walker's pixel space: a cell at (row, col) spans
// `[col*cellPx, (col+1)*cellPx)` horizontally and `[row*cellPx, (row+1)*cellPx)`
// vertically.

import type { Bounds, Cell, Vec2 } from "./walker";
import { cellCenter } from "./walker";

/** An axis-aligned rectangle in overworld pixel space. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

//============================================
/**
 * The rectangle covering one grid cell.
 *
 * @param cell - The cell to bound.
 * @param cellPx - Pixel size of one cell.
 * @returns The cell's rectangle in overworld pixel space.
 */
export function cellRect(cell: Cell, cellPx: number): Rect {
  return { x: cell.col * cellPx, y: cell.row * cellPx, width: cellPx, height: cellPx };
}

//============================================
/**
 * Whether a point lies inside a rectangle. The left/top edges are inclusive and
 * the right/bottom edges are exclusive, matching the half-open cell spans so a
 * point on a shared border belongs to exactly one adjacent cell.
 *
 * @param rect - The rectangle to test against.
 * @param point - The point to test.
 * @returns True when the point is inside `rect`.
 */
export function rectContainsPoint(rect: Rect, point: { x: number; y: number }): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

//============================================
/**
 * Find the town cell in a terrain grid: the single cell whose terrain is
 * `"town"`. Accepts a plain grid of terrain strings so the module stays
 * decoupled from the engine's `Plot`/`Terrain` types and easy to node-test.
 *
 * @param terrainGrid - Row-major grid of terrain names, `grid[row][col]`.
 * @returns The town cell, or null when the grid has no town cell.
 */
export function findTownCell(terrainGrid: readonly (readonly string[])[]): Cell | null {
  for (let row = 0; row < terrainGrid.length; row++) {
    const terrainRow = terrainGrid[row];
    if (terrainRow === undefined) {
      continue;
    }
    for (let col = 0; col < terrainRow.length; col++) {
      if (terrainRow[col] === "town") {
        return { row, col };
      }
    }
  }
  return null;
}

//============================================
/**
 * Whether two cells are the same cell.
 *
 * @param a - First cell, or null.
 * @param b - Second cell, or null.
 * @returns True when both are non-null and share row and col.
 */
export function cellsEqual(a: Cell | null, b: Cell | null): boolean {
  if (a === null || b === null) {
    return false;
  }
  return a.row === b.row && a.col === b.col;
}

// ============================================================
// Town interior layout
// ============================================================
//
// The town is a self-contained walkable interior, entered from the overworld
// town cell during the human's develop turn. Its coordinate space is the same
// pixel space walker.ts integrates in, but it is a separate board from the
// overworld: a `TOWN_COLS x TOWN_ROWS` grid of `TOWN_CELL_PX` cells. Every
// interactive building door sits on a single horizontal "street" row, so an
// avatar walking straight along that row passes each door in a fixed order
// (corral, then the four outfit counters, then the pub, then the assay), which
// keeps the walk-in flow and its Playwright driving deterministic. The four
// edge exits return to the overworld. The interior is kept small (matching the
// board's tile budget) so the whole buy -> outfit -> exit loop fits inside a
// single develop turn's tick budget: the avatar can walk about 15 tiles per
// turn, so the corral sits at the entrance and the west exit is a few tiles
// away. These functions are pure and DOM-free so the node tests
// (tests/test_zones.mjs) exercise them directly.

/** Pixel size of one town-interior cell (matches the overworld cell size). */
export const TOWN_CELL_PX = 64;

/** Town interior grid width in cells. */
export const TOWN_COLS = 9;

/** Town interior grid height in cells. */
export const TOWN_ROWS = 5;

/** Town interior pixel extent, for the walker's bounds clamp. */
export const TOWN_BOUNDS: Bounds = {
  width: TOWN_COLS * TOWN_CELL_PX,
  height: TOWN_ROWS * TOWN_CELL_PX,
};

/** The single street row every interactive building door sits on. */
const TOWN_STREET_ROW = 2;

/**
 * Where the avatar spawns on entering town: on the corral cell at the street's
 * west end, so the player can buy at once and reach the nearby west exit in a
 * few tiles. Kept close to the entrance so the buy -> outfit -> exit loop stays
 * inside one develop turn's tick budget.
 */
export const TOWN_SPAWN_CELL: Cell = { row: TOWN_STREET_ROW, col: 1 };

/**
 * The interactive building doors, in left-to-right street order. `corral` buys
 * a M.U.L.E.; each `counter-<resource>` outfits the carried M.U.L.E. for that
 * resource; `pub` and `assay` are the two service doors.
 */
export const TOWN_DOOR_IDS = [
  "corral",
  "counter-food",
  "counter-energy",
  "counter-smithore",
  "counter-crystite",
  "pub",
  "assay",
] as const;

export type TownDoorId = (typeof TOWN_DOOR_IDS)[number];

/** The street column each door occupies (adjacent, left to right). */
const TOWN_DOOR_COLS: Readonly<Record<TownDoorId, number>> = {
  corral: 1,
  "counter-food": 2,
  "counter-energy": 3,
  "counter-smithore": 4,
  "counter-crystite": 5,
  pub: 6,
  assay: 7,
};

/** The four town edge exits, each returning to the overworld. */
export const TOWN_EXITS = ["north", "south", "east", "west"] as const;

export type TownExit = (typeof TOWN_EXITS)[number];

/** The cell each exit occupies: west/east cap the street, north/south the mid edges. */
const TOWN_EXIT_CELLS: Readonly<Record<TownExit, Cell>> = {
  west: { row: TOWN_STREET_ROW, col: 0 },
  east: { row: TOWN_STREET_ROW, col: TOWN_COLS - 1 },
  north: { row: 0, col: Math.floor(TOWN_COLS / 2) },
  south: { row: TOWN_ROWS - 1, col: Math.floor(TOWN_COLS / 2) },
};

//============================================
/**
 * The pixel rectangle of one building door's cell on the street.
 *
 * @param id - The door to bound.
 * @returns The door cell's rectangle in town pixel space.
 */
export function townDoorRect(id: TownDoorId): Rect {
  return cellRect({ row: TOWN_STREET_ROW, col: TOWN_DOOR_COLS[id] }, TOWN_CELL_PX);
}

//============================================
/**
 * The pixel center of one building door's cell, for placing its sprite and its
 * door marker.
 *
 * @param id - The door to locate.
 * @returns The door cell's center in town pixel space.
 */
export function townDoorCenter(id: TownDoorId): Vec2 {
  return cellCenter({ row: TOWN_STREET_ROW, col: TOWN_DOOR_COLS[id] }, TOWN_CELL_PX);
}

//============================================
/**
 * The pixel rectangle of one edge exit's cell.
 *
 * @param exit - The exit to bound.
 * @returns The exit cell's rectangle in town pixel space.
 */
export function townExitRect(exit: TownExit): Rect {
  return cellRect(TOWN_EXIT_CELLS[exit], TOWN_CELL_PX);
}

//============================================
/**
 * The pixel center of one edge exit's cell, for placing its marker.
 *
 * @param exit - The exit to locate.
 * @returns The exit cell's center in town pixel space.
 */
export function townExitCenter(exit: TownExit): Vec2 {
  return cellCenter(TOWN_EXIT_CELLS[exit], TOWN_CELL_PX);
}

//============================================
/**
 * Which building door, if any, contains a point. Doors sit one empty cell
 * apart, so at most one contains a given point and the gaps read as "at no
 * door".
 *
 * @param point - A point in town pixel space (the avatar center).
 * @returns The door id the point lies in, or null.
 */
export function townDoorAt(point: Vec2): TownDoorId | null {
  for (const id of TOWN_DOOR_IDS) {
    if (rectContainsPoint(townDoorRect(id), point)) {
      return id;
    }
  }
  return null;
}

//============================================
/**
 * Which edge exit, if any, contains a point.
 *
 * @param point - A point in town pixel space (the avatar center).
 * @returns The exit direction the point lies in, or null.
 */
export function townExitAt(point: Vec2): TownExit | null {
  for (const exit of TOWN_EXITS) {
    if (rectContainsPoint(townExitRect(exit), point)) {
      return exit;
    }
  }
  return null;
}

//============================================
/**
 * The overworld cell the avatar returns to after leaving town through `exit`:
 * one cell off the town cell in the exit's direction, clamped to the board so
 * a town at a corner still yields an in-bounds neighbor. Returning off the town
 * cell (rather than onto it) keeps the avatar from immediately re-entering.
 *
 * @param townCell - The overworld town cell.
 * @param exit - The exit the avatar left through.
 * @param rows - Overworld board row count.
 * @param cols - Overworld board column count.
 * @returns The overworld cell to respawn the avatar at.
 */
export function overworldReturnCell(
  townCell: Cell,
  exit: TownExit,
  rows: number,
  cols: number,
): Cell {
  const deltas: Readonly<Record<TownExit, Cell>> = {
    north: { row: -1, col: 0 },
    south: { row: 1, col: 0 },
    east: { row: 0, col: 1 },
    west: { row: 0, col: -1 },
  };
  const delta = deltas[exit];
  const row = Math.max(0, Math.min(rows - 1, townCell.row + delta.row));
  const col = Math.max(0, Math.min(cols - 1, townCell.col + delta.col));
  return { row, col };
}
