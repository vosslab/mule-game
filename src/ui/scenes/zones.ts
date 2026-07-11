// Pure overworld zone geometry.
//
// DOM-free and framework-free: this module defines the rectangular zones the
// overworld cares about (each plot cell, and the town cell that opens the store
// overlay) and the point-in-zone query the scene uses to decide which zone the
// avatar is standing in. The node tests (tests/test_zones.mjs) exercise it
// directly. It shares the walker's pixel space: a cell at (row, col) spans
// `[col*cellPx, (col+1)*cellPx)` horizontally and `[row*cellPx, (row+1)*cellPx)`
// vertically.
//
// The town INTERIOR geometry (the retired 9x5 grid: town cells, door ids, four
// exits, spawn) used to live here too. It has been replaced by the mode-composed
// scrolling street in town_world.ts (see docs/THE_TOWN_ANALYSIS.md). Only the
// overworld-facing town boundary glue stays here: `findTownCell` (which overworld
// cell is the town) and `overworldReturnCell` (where the avatar lands when it
// leaves town), plus the `TownExit` direction union those two use. The town
// interior's own geometry is not this module's concern anymore.

import type { Cell } from "./walker";

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
// Town boundary glue (overworld side)
// ============================================================
//
// The avatar enters town from the overworld town cell during the human's develop
// turn and returns to the overworld on leaving. The town interior itself is a
// separate board owned by town_world.ts. These two symbols are the overworld
// side of that boundary: the exit direction the avatar left through and the
// overworld cell it lands on.
//
// `TownExit` is still the four-direction union that `human_develop_layer.tsx`
// maps today. The mode-composed street exposes only two endpoint exits
// (town_world.ts `TownEndpoint` = "left" | "right"); a future change migrates
// the overworld spawn/exit wiring to that two-endpoint model. Until then this
// union and `overworldReturnCell` keep the overworld glue compiling unchanged.

/** The direction the avatar leaves town through. */
export type TownExit = "north" | "south" | "east" | "west";

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
