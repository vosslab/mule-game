// Pure pixel-math helpers for the automated visual-render art gate
// (docs/archive/mule_fidelity_plan.md, "Acceptance criteria and
// gates" > Art gate). Every function here operates on a decoded RGBA image
// buffer (see decodePng) or on plain [r, g, b] triples, so this module is
// unit-testable with `node --test tests/test_pixel_metrics.mjs` and needs no
// browser or Playwright dependency at all: Playwright only ever supplies PNG
// bytes (page.screenshot() / locator.screenshot() already return a PNG
// Buffer); decoding and every metric below is plain math on those bytes.
//
// Why pixel invariants instead of golden-image diffs: docs/PLAYWRIGHT_TEST_
// STYLE.md's "Common pitfalls" table prefers behavior/visibility assertions
// over pixel checks, because pixel checks tend to mean brittle golden-image
// byte diffs that break on font, anti-aliasing, and Chromium-version drift
// with no useful signal about what actually broke. This module is a
// different shape of pixel check: coverage bands, palette-conformance
// ratios, and pairwise region distinctness are programmatic invariants that
// survive those environmental differences while still catching the real art
// failure modes a DOM/attribute assertion cannot see -- a blank canvas, a
// solid-color smear, or a fill that drifted off the shared palette.
import { PNG } from "pngjs";

//============================================
/**
 * Decode a PNG buffer (e.g. from Playwright's page.screenshot()) into a
 * plain RGBA pixel grid.
 *
 * @param {Buffer} buffer - Raw PNG file bytes.
 * @returns {{width: number, height: number, data: Buffer}} Decoded image;
 *   `data` is a flat RGBA byte buffer of length width*height*4.
 */
export function decodePng(buffer) {
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: png.data };
}

//============================================
/**
 * Read one pixel's [r, g, b, a] channel values.
 *
 * @param {{width: number, data: Buffer}} image - Decoded image.
 * @param {number} x - Zero-based column.
 * @param {number} y - Zero-based row.
 * @returns {[number, number, number, number]} The pixel's RGBA channels.
 */
export function readPixel(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return [
    image.data[offset],
    image.data[offset + 1],
    image.data[offset + 2],
    image.data[offset + 3],
  ];
}

//============================================
/**
 * Convert a "#rrggbb" hex string into an [r, g, b] triple.
 *
 * @param {string} hex - A 7-character hex color, e.g. "#1a1a2e".
 * @returns {[number, number, number]} The RGB channel values (0-255).
 */
export function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

// sRGB -> linear -> XYZ -> Lab, the same conversion chain
// tests/test_player_color_distinct.mjs uses for its dichromacy check,
// generalized here to plain 0-255 RGB triples (that file works from hex
// strings scoped to its own dichromacy-simulation test) so both modules
// share the same CIE76 deltaE definition without one importing the other's
// test-scoped helpers.
const SRGB_TO_XYZ_MATRIX = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];
const D65_WHITE_XYZ = [0.95047, 1.0, 1.08883];

//============================================
function srgbChannelToLinear(channel) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

//============================================
function applyMatrix(matrix, vector) {
  return matrix.map((row) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]);
}

//============================================
function xyzChannelToLabF(t) {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

//============================================
/**
 * Convert an [r, g, b] triple (0-255 channels) into CIE Lab space.
 *
 * @param {[number, number, number]} rgb - RGB channel values (0-255).
 * @returns {[number, number, number]} The [L, a, b] Lab coordinates.
 */
export function rgbToLab(rgb) {
  const srgb01 = rgb.map((channel) => channel / 255);
  const linear = srgb01.map(srgbChannelToLinear);
  const xyz = applyMatrix(SRGB_TO_XYZ_MATRIX, linear);
  const fx = xyzChannelToLabF(xyz[0] / D65_WHITE_XYZ[0]);
  const fy = xyzChannelToLabF(xyz[1] / D65_WHITE_XYZ[1]);
  const fz = xyzChannelToLabF(xyz[2] / D65_WHITE_XYZ[2]);
  const l = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bLab = 200 * (fy - fz);
  return [l, a, bLab];
}

//============================================
/**
 * CIE76 perceptual color distance between two Lab coordinates.
 *
 * @param {[number, number, number]} labA - First color's Lab coordinates.
 * @param {[number, number, number]} labB - Second color's Lab coordinates.
 * @returns {number} The Euclidean distance in Lab space (deltaE).
 */
export function cie76DeltaE(labA, labB) {
  const dl = labA[0] - labB[0];
  const da = labA[1] - labB[1];
  const db = labA[2] - labB[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

//============================================
/**
 * CIE76 deltaE between two RGB triples (0-255 channels): a thin composition
 * of rgbToLab + cie76DeltaE for callers that only ever work in RGB.
 *
 * @param {[number, number, number]} rgbA - First color's RGB channels.
 * @param {[number, number, number]} rgbB - Second color's RGB channels.
 * @returns {number} The CIE76 deltaE between the two colors.
 */
export function deltaEBetweenRgb(rgbA, rgbB) {
  return cie76DeltaE(rgbToLab(rgbA), rgbToLab(rgbB));
}

//============================================
/**
 * Fraction of an image's sampled pixels that differ from a background color
 * by more than a small deltaE tolerance. Catches a blank (all-background)
 * render on the low end and a solid-smear render (near-total coverage) on
 * the high end.
 *
 * @param {{width: number, height: number, data: Buffer}} image - Decoded image.
 * @param {[number, number, number]} backgroundRgb - The expected page/panel
 *   background color.
 * @param {number} deltaETolerance - Max deltaE still counted as background
 *   (absorbs anti-aliasing right at the background edge).
 * @param {number} [stride] - Sample every Nth pixel in both dimensions,
 *   trading precision for speed on large screenshots. Defaults to 1 (every
 *   pixel).
 * @returns {number} The non-background pixel fraction, in [0, 1].
 */
export function computeCoverageRatio(image, backgroundRgb, deltaETolerance, stride = 1) {
  const backgroundLab = rgbToLab(backgroundRgb);
  let sampled = 0;
  let nonBackground = 0;
  for (let y = 0; y < image.height; y += stride) {
    for (let x = 0; x < image.width; x += stride) {
      const [r, g, b] = readPixel(image, x, y);
      sampled += 1;
      if (cie76DeltaE(rgbToLab([r, g, b]), backgroundLab) > deltaETolerance) {
        nonBackground += 1;
      }
    }
  }
  if (sampled === 0) {
    throw new Error("computeCoverageRatio: image has zero sampled pixels");
  }
  return nonBackground / sampled;
}

//============================================
/**
 * Count distinct quantized colors among an image's sampled non-background
 * pixels. Quantizing each channel to `quantizeStep`-wide buckets absorbs the
 * anti-aliasing blend continuum between two "real" fill colors, so the count
 * reflects deliberate fill colors rather than every intermediate AA shade.
 *
 * @param {{width: number, height: number, data: Buffer}} image - Decoded image.
 * @param {[number, number, number]} backgroundRgb - The expected background
 *   color, excluded from the count.
 * @param {number} deltaETolerance - Max deltaE still counted as background.
 * @param {number} quantizeStep - Bucket width per RGB channel (0-255).
 * @param {number} [stride] - Sample every Nth pixel in both dimensions.
 * @returns {number} The count of distinct quantized non-background colors.
 */
export function countDistinctColors(
  image,
  backgroundRgb,
  deltaETolerance,
  quantizeStep,
  stride = 1,
) {
  const backgroundLab = rgbToLab(backgroundRgb);
  const seen = new Set();
  for (let y = 0; y < image.height; y += stride) {
    for (let x = 0; x < image.width; x += stride) {
      const [r, g, b] = readPixel(image, x, y);
      if (cie76DeltaE(rgbToLab([r, g, b]), backgroundLab) <= deltaETolerance) {
        continue;
      }
      const bucket = [r, g, b].map((channel) => Math.round(channel / quantizeStep) * quantizeStep);
      seen.add(bucket.join(","));
    }
  }
  return seen.size;
}

//============================================
/**
 * Fraction of an image's sampled non-background pixels whose color lies
 * within `maxDeltaE` of at least one entry in `paletteRgbList`: the anti-
 * aliasing-tolerant "did this render actually use the shared palette" check.
 * A pure fill pixel scores deltaE ~0 against its own token; a blended edge
 * pixel between two palette tokens (or a token and the background) still
 * scores low against whichever token it leans toward.
 *
 * @param {{width: number, height: number, data: Buffer}} image - Decoded image.
 * @param {[number, number, number]} backgroundRgb - Background color,
 *   excluded from the ratio's denominator.
 * @param {number} backgroundDeltaETolerance - Max deltaE still counted as
 *   background.
 * @param {ReadonlyArray<[number, number, number]>} paletteRgbList - Every
 *   palette token's RGB value being conformed to.
 * @param {number} maxDeltaE - Max deltaE from the nearest palette token
 *   still counted as "on palette".
 * @param {number} [stride] - Sample every Nth pixel in both dimensions.
 * @returns {number} The on-palette fraction of sampled non-background
 *   pixels, in [0, 1].
 */
export function computePaletteConformanceRatio(
  image,
  backgroundRgb,
  backgroundDeltaETolerance,
  paletteRgbList,
  maxDeltaE,
  stride = 1,
) {
  const backgroundLab = rgbToLab(backgroundRgb);
  const paletteLabList = paletteRgbList.map(rgbToLab);
  let nonBackground = 0;
  let onPalette = 0;
  for (let y = 0; y < image.height; y += stride) {
    for (let x = 0; x < image.width; x += stride) {
      const [r, g, b] = readPixel(image, x, y);
      const pixelLab = rgbToLab([r, g, b]);
      if (cie76DeltaE(pixelLab, backgroundLab) <= backgroundDeltaETolerance) {
        continue;
      }
      nonBackground += 1;
      const nearestDeltaE = Math.min(
        ...paletteLabList.map((tokenLab) => cie76DeltaE(pixelLab, tokenLab)),
      );
      if (nearestDeltaE <= maxDeltaE) {
        onPalette += 1;
      }
    }
  }
  if (nonBackground === 0) {
    throw new Error("computePaletteConformanceRatio: no non-background pixels sampled");
  }
  return onPalette / nonBackground;
}

//============================================
/**
 * Mean RGB color over every pixel in an image. Used to characterize a small,
 * visually uniform screenshot (for example one map cell's terrain tile) as
 * one representative color for palette-token and distinctness comparisons.
 *
 * @param {{width: number, height: number, data: Buffer}} image - Decoded image.
 * @returns {[number, number, number]} The mean [r, g, b] over every pixel.
 */
export function meanColor(image) {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const pixelCount = image.width * image.height;
  if (pixelCount === 0) {
    throw new Error("meanColor: image has zero pixels");
  }
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const [r, g, b] = readPixel(image, x, y);
      sumR += r;
      sumG += g;
      sumB += b;
    }
  }
  return [sumR / pixelCount, sumG / pixelCount, sumB / pixelCount];
}
