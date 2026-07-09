// Pure-function unit tests for tests/pixel_metrics.mjs. Runs under plain
// `node --test tests/test_pixel_metrics.mjs` (no tsx loader needed: this
// file and its subject both stay in .mjs with no .ts import) and also under
// check_codebase.sh's canonical `node --import tsx --test tests/test_*.mjs`.
// Every case builds a tiny synthetic image in-memory rather than reading a
// real screenshot, so this suite stays fast and has no browser dependency.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PNG } from "pngjs";
import {
  decodePng,
  hexToRgb,
  rgbToLab,
  cie76DeltaE,
  deltaEBetweenRgb,
  computeCoverageRatio,
  countDistinctColors,
  computePaletteConformanceRatio,
  meanColor,
} from "./pixel_metrics.mjs";

//============================================
/**
 * Build a decoded-image-shaped object directly from a flat list of [r, g, b]
 * triples, one per pixel in row-major order, with alpha fixed at 255.
 */
function buildImage(width, height, rgbGrid) {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const pixel = rgbGrid[i];
    data[i * 4] = pixel[0];
    data[i * 4 + 1] = pixel[1];
    data[i * 4 + 2] = pixel[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

test("decodePng round-trips a solid-color PNG through pngjs's own encoder", () => {
  const png = new PNG({ width: 4, height: 3 });
  for (let i = 0; i < png.width * png.height; i += 1) {
    png.data[i * 4] = 10;
    png.data[i * 4 + 1] = 20;
    png.data[i * 4 + 2] = 30;
    png.data[i * 4 + 3] = 255;
  }
  const buffer = PNG.sync.write(png);
  const decoded = decodePng(buffer);
  assert.equal(decoded.width, 4);
  assert.equal(decoded.height, 3);
  assert.deepEqual([decoded.data[0], decoded.data[1], decoded.data[2]], [10, 20, 30]);
});

test("hexToRgb parses a hex color into its RGB channels", () => {
  assert.deepEqual(hexToRgb("#1a1a2e"), [26, 26, 46]);
  assert.deepEqual(hexToRgb("#ffffff"), [255, 255, 255]);
});

test("cie76DeltaE reads 0 for identical colors and ~100 for black vs white", () => {
  const black = rgbToLab([0, 0, 0]);
  const white = rgbToLab([255, 255, 255]);
  assert.equal(cie76DeltaE(black, black), 0);
  const blackWhiteDeltaE = cie76DeltaE(black, white);
  assert.ok(
    blackWhiteDeltaE > 99 && blackWhiteDeltaE < 101,
    `expected black-vs-white deltaE near 100, got ${blackWhiteDeltaE}`,
  );
});

test("deltaEBetweenRgb composes rgbToLab and cie76DeltaE", () => {
  assert.equal(deltaEBetweenRgb([10, 20, 30], [10, 20, 30]), 0);
  assert.ok(deltaEBetweenRgb([255, 0, 0], [0, 255, 0]) > 50);
});

test("computeCoverageRatio counts the exact non-background pixel fraction", () => {
  const background = [0, 0, 0];
  const foreground = [255, 255, 255];
  // 2x2 image: 1 background pixel, 3 foreground pixels -> ratio 0.75.
  const image = buildImage(2, 2, [background, foreground, foreground, foreground]);
  assert.equal(computeCoverageRatio(image, background, 1), 0.75);
});

test("computeCoverageRatio honors stride sampling", () => {
  const background = [0, 0, 0];
  const foreground = [255, 255, 255];
  // 4x1 image alternating background/foreground; stride=2 samples only
  // columns 0 and 2, both background -> ratio 0, unlike the full-scan 0.5.
  const image = buildImage(4, 1, [background, foreground, background, foreground]);
  assert.equal(computeCoverageRatio(image, background, 1), 0.5);
  assert.equal(computeCoverageRatio(image, background, 1, 2), 0);
});

test("countDistinctColors ignores background and quantizes near-duplicate foreground colors", () => {
  const background = [0, 0, 0];
  // Two foreground colors far apart, plus a near-duplicate of the first that
  // quantizes into the same bucket at quantizeStep=32.
  const image = buildImage(2, 2, [background, [200, 0, 0], [204, 2, 1], [0, 200, 0]]);
  assert.equal(countDistinctColors(image, background, 1, 32), 2);
});

test("computePaletteConformanceRatio scores an exact palette match as fully on-palette", () => {
  const background = [0, 0, 0];
  const paletteToken = [124, 154, 78];
  const image = buildImage(1, 2, [background, paletteToken]);
  assert.equal(computePaletteConformanceRatio(image, background, 1, [paletteToken], 1), 1);
});

test("computePaletteConformanceRatio scores a far-off color as off-palette", () => {
  const background = [0, 0, 0];
  const paletteToken = [124, 154, 78];
  const offPaletteColor = [255, 0, 255];
  const image = buildImage(1, 2, [background, offPaletteColor]);
  assert.equal(computePaletteConformanceRatio(image, background, 1, [paletteToken], 5), 0);
});

test("computePaletteConformanceRatio throws when every sampled pixel is background", () => {
  const background = [0, 0, 0];
  const image = buildImage(1, 1, [background]);
  assert.throws(() => computePaletteConformanceRatio(image, background, 1, [[255, 255, 255]], 5));
});

test("meanColor averages every pixel's channels", () => {
  const image = buildImage(1, 2, [
    [0, 0, 0],
    [255, 255, 255],
  ]);
  assert.deepEqual(meanColor(image), [127.5, 127.5, 127.5]);
});
