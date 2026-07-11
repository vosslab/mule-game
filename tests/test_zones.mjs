// Node unit tests for overworld zone geometry (zones.ts).
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
//
// The town INTERIOR geometry this file used to cover (door ids, four exits,
// spawn cell) was retired along with the 9x5 grid town; that coverage moved
// to tests/test_town_world.mjs against the new mode-composed street
// (src/ui/scenes/town_world.ts). This file keeps only the overworld-facing
// cases: the plain grid-cell geometry and the overworld/town boundary glue
// (findTownCell, overworldReturnCell) that zones.ts still owns.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  cellRect,
  rectContainsPoint,
  findTownCell,
  cellsEqual,
  overworldReturnCell,
} from "../src/ui/scenes/zones.ts";

test("cellRect bounds a cell at the right pixel offset", () => {
  assert.deepEqual(cellRect({ row: 2, col: 3 }, 64), { x: 192, y: 128, width: 64, height: 64 });
});

test("rectContainsPoint is inclusive on left/top, exclusive on right/bottom", () => {
  const rect = cellRect({ row: 0, col: 0 }, 64);
  assert.equal(rectContainsPoint(rect, { x: 0, y: 0 }), true); // top-left corner included
  assert.equal(rectContainsPoint(rect, { x: 32, y: 32 }), true); // center inside
  assert.equal(rectContainsPoint(rect, { x: 64, y: 0 }), false); // right edge excluded
  assert.equal(rectContainsPoint(rect, { x: 0, y: 64 }), false); // bottom edge excluded
  assert.equal(rectContainsPoint(rect, { x: -1, y: 10 }), false); // left of the rect
});

test("findTownCell locates the town cell in a terrain grid", () => {
  const grid = [
    ["plain", "river", "plain"],
    ["mountain1", "town", "plain"],
  ];
  assert.deepEqual(findTownCell(grid), { row: 1, col: 1 });
});

test("findTownCell returns null when no town cell exists", () => {
  const grid = [
    ["plain", "river"],
    ["mountain1", "plain"],
  ];
  assert.equal(findTownCell(grid), null);
});

test("cellsEqual compares row and col and rejects null", () => {
  assert.equal(cellsEqual({ row: 2, col: 4 }, { row: 2, col: 4 }), true);
  assert.equal(cellsEqual({ row: 2, col: 4 }, { row: 2, col: 5 }), false);
  assert.equal(cellsEqual(null, { row: 2, col: 4 }), false);
  assert.equal(cellsEqual({ row: 2, col: 4 }, null), false);
  assert.equal(cellsEqual(null, null), false);
});

test("overworldReturnCell offsets one cell off the town in the exit direction", () => {
  const town = { row: 2, col: 4 };
  assert.deepEqual(overworldReturnCell(town, "west", 5, 9), { row: 2, col: 3 });
  assert.deepEqual(overworldReturnCell(town, "east", 5, 9), { row: 2, col: 5 });
  assert.deepEqual(overworldReturnCell(town, "north", 5, 9), { row: 1, col: 4 });
  assert.deepEqual(overworldReturnCell(town, "south", 5, 9), { row: 3, col: 4 });
});

test("overworldReturnCell clamps to the board at a corner town", () => {
  const town = { row: 0, col: 0 };
  assert.deepEqual(overworldReturnCell(town, "north", 5, 9), { row: 0, col: 0 });
  assert.deepEqual(overworldReturnCell(town, "west", 5, 9), { row: 0, col: 0 });
});
