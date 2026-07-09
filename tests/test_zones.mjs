// Node unit tests for overworld and town zone geometry (zones.ts).
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { cellRect, rectContainsPoint, findTownCell, cellsEqual } from "../src/ui/scenes/zones.ts";
import {
  TOWN_SPAWN_CELL,
  TOWN_CELL_PX,
  townDoorAt,
  townDoorCenter,
  townExitAt,
  townExitCenter,
  overworldReturnCell,
} from "../src/ui/scenes/zones.ts";
import { cellCenter } from "../src/ui/scenes/walker.ts";

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

test("townDoorAt finds each door at its own cell center and null off a door", () => {
  assert.equal(townDoorAt(townDoorCenter("corral")), "corral");
  assert.equal(townDoorAt(townDoorCenter("counter-food")), "counter-food");
  assert.equal(townDoorAt(townDoorCenter("assay")), "assay");
  // A point far above the street row lies on no door.
  assert.equal(townDoorAt({ x: townDoorCenter("corral").x, y: 0 }), null);
});

test("the spawn cell sits on the corral door so the player can buy at once", () => {
  assert.equal(townDoorAt(cellCenter(TOWN_SPAWN_CELL, TOWN_CELL_PX)), "corral");
});

test("townExitAt finds each edge exit at its cell center", () => {
  assert.equal(townExitAt(townExitCenter("west")), "west");
  assert.equal(townExitAt(townExitCenter("east")), "east");
  assert.equal(townExitAt(townExitCenter("north")), "north");
  assert.equal(townExitAt(townExitCenter("south")), "south");
});

test("townDoorAt and townExitAt do not overlap", () => {
  assert.equal(townExitAt(townDoorCenter("corral")), null);
  assert.equal(townDoorAt(townExitCenter("east")), null);
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
