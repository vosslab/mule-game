// Node unit tests for seeded map generation (map.ts).
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { createRng } from "../src/engine/rng.ts";
import { generateMap, terrainOf } from "../src/engine/map.ts";
import { PLOT_COLS, PLOT_ROWS } from "../src/engine/game_state.ts";

test("generates a PLOT_ROWS x PLOT_COLS grid", () => {
  const plots = generateMap(createRng(1));
  assert.equal(plots.length, PLOT_ROWS);
  for (const row of plots) {
    assert.equal(row.length, PLOT_COLS);
  }
});

test("center column is river, except the center plot which is town", () => {
  const plots = generateMap(createRng(1));
  const riverCol = Math.floor(PLOT_COLS / 2);
  const townRow = Math.floor(PLOT_ROWS / 2);
  for (let row = 0; row < PLOT_ROWS; row += 1) {
    const terrain = terrainOf(plots, row, riverCol);
    if (row === townRow) {
      assert.equal(terrain, "town");
    } else {
      assert.equal(terrain, "river");
    }
  }
});

test("non-river columns never contain river or town terrain", () => {
  const plots = generateMap(createRng(1));
  const riverCol = Math.floor(PLOT_COLS / 2);
  for (let row = 0; row < PLOT_ROWS; row += 1) {
    for (let col = 0; col < PLOT_COLS; col += 1) {
      if (col === riverCol) {
        continue;
      }
      const terrain = terrainOf(plots, row, col);
      assert.notEqual(terrain, "river");
      assert.notEqual(terrain, "town");
    }
  }
});

test("same seed produces an identical map", () => {
  const plotsA = generateMap(createRng(2024));
  const plotsB = generateMap(createRng(2024));
  assert.deepEqual(plotsA, plotsB);
});

test("plots start unowned with no installed M.U.L.E.", () => {
  const plots = generateMap(createRng(5));
  for (const row of plots) {
    for (const plot of row) {
      assert.equal(plot.owner, null);
      assert.equal(plot.muleOutfit, null);
    }
  }
});
