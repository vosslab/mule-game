// Colorblind-distinguishability follow-up flagged in
// docs/active_plans/active/mule_art_style_spec.md's "Known risks" section:
// the spec's earlier player-color reasoning was luminance/blue-channel
// analysis, not simulator-verified. This test runs the 4 player colors
// through the Vienot, Brettel, Mollon (1999) linear-RGB dichromacy
// simulation matrices for deuteranopia and protanopia, then asserts every
// pair stays visually separable (CIE76 deltaE > 20) under each simulation.
//
// Reads src/ui/sprites/palette.ts as TEXT (regex-extracted), the same
// approach tests/test_sprite_palette.mjs uses, so this file runs under
// plain `node --test` with no tsx/TypeScript loader.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PALETTE_FILE = path.join(REPO_ROOT, "src", "ui", "sprites", "palette.ts");

const PLAYER_COLOR_COUNT = 4;
const CIE76_MIN_DELTA_E = 20;

// Vienot, Brettel, Mollon (1999) simplified dichromacy simulation matrices,
// applied to linear (gamma-decoded) RGB. This is the same family of
// matrices widely used by web colorblind simulators.
const DICHROMACY_MATRICES = {
  protanopia: [
    [0.567, 0.433, 0.0],
    [0.558, 0.442, 0.0],
    [0.0, 0.242, 0.758],
  ],
  deuteranopia: [
    [0.625, 0.375, 0.0],
    [0.7, 0.3, 0.0],
    [0.0, 0.3, 0.7],
  ],
};

// sRGB (D65) -> XYZ, standard matrix.
const SRGB_TO_XYZ_MATRIX = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];

const D65_WHITE_XYZ = [0.95047, 1.0, 1.08883];

//============================================
function extractPlayerColorHexValues(sourceText) {
  const pattern = /player([0-3]):\s*"(#[0-9a-fA-F]{6})"/g;
  const colors = new Array(PLAYER_COLOR_COUNT).fill(null);
  for (const match of sourceText.matchAll(pattern)) {
    const playerIndex = Number(match[1]);
    colors[playerIndex] = match[2];
  }
  return colors;
}

//============================================
function hexToSrgb01(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

//============================================
function srgbChannelToLinear(channel) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

//============================================
function linearChannelToSrgb(channel) {
  const clamped = Math.min(1, Math.max(0, channel));
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
}

//============================================
function applyMatrix(matrix, vector) {
  return matrix.map((row) => row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]);
}

//============================================
function simulateDichromacy(hex, deficiency) {
  const srgb = hexToSrgb01(hex);
  const linear = srgb.map(srgbChannelToLinear);
  const simulatedLinear = applyMatrix(DICHROMACY_MATRICES[deficiency], linear);
  return simulatedLinear.map(linearChannelToSrgb);
}

//============================================
function srgbToXyz(srgb) {
  return applyMatrix(SRGB_TO_XYZ_MATRIX, srgb);
}

//============================================
function xyzChannelToLabF(t) {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
}

//============================================
function xyzToLab([x, y, z]) {
  const fx = xyzChannelToLabF(x / D65_WHITE_XYZ[0]);
  const fy = xyzChannelToLabF(y / D65_WHITE_XYZ[1]);
  const fz = xyzChannelToLabF(z / D65_WHITE_XYZ[2]);
  const l = 116 * fy - 16;
  const a = 500 * (fx - fy);
  const bLab = 200 * (fy - fz);
  return [l, a, bLab];
}

//============================================
function cie76DeltaE(labA, labB) {
  const dl = labA[0] - labB[0];
  const da = labA[1] - labB[1];
  const db = labA[2] - labB[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

const paletteSourceText = fs.readFileSync(PALETTE_FILE, "utf8");
const playerColorHexValues = extractPlayerColorHexValues(paletteSourceText);

test("palette.ts defines all 4 player colors", () => {
  assert.equal(playerColorHexValues.length, PLAYER_COLOR_COUNT);
  for (const hex of playerColorHexValues) {
    assert.ok(hex, "expected every player color slot to be populated");
  }
});

for (const deficiency of Object.keys(DICHROMACY_MATRICES)) {
  test(`player colors stay pairwise separable under simulated ${deficiency} (CIE76 deltaE > ${CIE76_MIN_DELTA_E})`, () => {
    const simulatedLabValues = playerColorHexValues.map((hex) =>
      xyzToLab(srgbToXyz(simulateDichromacy(hex, deficiency))),
    );
    const failures = [];
    const deltaEReport = [];
    for (let i = 0; i < simulatedLabValues.length; i++) {
      for (let j = i + 1; j < simulatedLabValues.length; j++) {
        const deltaE = cie76DeltaE(simulatedLabValues[i], simulatedLabValues[j]);
        deltaEReport.push(`player${i} vs player${j}: deltaE=${deltaE.toFixed(2)}`);
        if (deltaE <= CIE76_MIN_DELTA_E) {
          failures.push(`player${i} vs player${j}: deltaE=${deltaE.toFixed(2)}`);
        }
      }
    }
    // Report every pairwise deltaE (not just failures) on assertion failure,
    // so a failing run shows the full evidence, not just which pair failed.
    assert.deepEqual(
      failures,
      [],
      `${deficiency} pairwise deltaE values: ${deltaEReport.join(", ")}`,
    );
  });
}
