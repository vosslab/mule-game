// Generate the two PWA manifest icons as flat PNGs.
//
// A minimal "ringed planet" badge -- a filled disc with an outlined stroke,
// haloed by a thin ring -- deliberately mirroring the same two shapes the
// title screen's own planet backdrop draws (src/ui/sprites/sprites_title.ts's
// buildPlanetSurfaceMarkup/buildPlanetRingMarkup: disc fill terrainMountain2,
// disc stroke bgTrackAxis, ring stroke gold), reusing the exact same palette
// tokens so the installed-app icon reads as the same game rather than a
// generic placeholder. Rasterized directly via pngjs (already a devDependency
// for this repo's pixel-metric tests) rather than a full SVG-to-raster
// pipeline, which would need a new dependency for a two-shape icon; each
// output pixel is supersampled over a small subpixel grid for basic
// anti-aliasing on the circle edges.
//
// Usage: node tools/generate_pwa_icons.mjs <outDir>
// Wired into build_github_pages.sh, which owns dist/'s wipe-and-rebuild
// lifecycle; this script only writes dist/icons/icon-192.png and
// dist/icons/icon-512.png (referenced by src/manifest.json's `icons` list).

import fs from "node:fs";
import path from "node:path";

import { PNG } from "pngjs";

/** Icon sizes (px) this script emits, matching src/manifest.json's `icons` list. */
const ICON_SIZES = [192, 512];

/** Subpixel samples per axis per output pixel, for basic edge anti-aliasing. */
const SUPERSAMPLE = 4;

/** Palette tokens reused from src/ui/sprites/palette.ts (kept in sync by hand;
 * this is a tiny, fixed 4-color icon, not a full sprite module the palette
 * conformance test suite covers). */
const BG_DEEP = hexToRgb("#1a1a2e");
const BG_TRACK_AXIS = hexToRgb("#4a4a68");
const GOLD = hexToRgb("#ffd23f");
const TERRAIN_MOUNTAIN_2 = hexToRgb("#8a6f52");

/** Normalized (icon-size-relative) radii for the disc fill/stroke and the halo ring. */
const PLANET_RADIUS = 0.3;
const PLANET_STROKE_WIDTH = 0.02;
const RING_INNER_RADIUS = 0.37;
const RING_OUTER_RADIUS = 0.43;

//============================================
/**
 * Convert a "#rrggbb" hex string to an [r, g, b] byte triple.
 *
 * @param {string} hex - A 6-digit hex color, with leading "#".
 * @returns {[number, number, number]} The RGB byte triple.
 */
function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

//============================================
/**
 * The flat color at one normalized icon-space point (0,0 top-left, 1,1
 * bottom-right; the icon is square). The three shapes (halo ring, disc
 * stroke, disc fill) sit at disjoint distance bands from center, so a single
 * distance-based lookup is enough -- no layered compositing is needed.
 *
 * @param {number} nx - Normalized x in [0, 1].
 * @param {number} ny - Normalized y in [0, 1].
 * @returns {[number, number, number]} The RGB color at that point.
 */
function shapeColorAt(nx, ny) {
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist >= RING_INNER_RADIUS && dist <= RING_OUTER_RADIUS) {
    return GOLD;
  }
  if (dist >= PLANET_RADIUS - PLANET_STROKE_WIDTH && dist <= PLANET_RADIUS) {
    return BG_TRACK_AXIS;
  }
  if (dist < PLANET_RADIUS - PLANET_STROKE_WIDTH) {
    return TERRAIN_MOUNTAIN_2;
  }
  return BG_DEEP;
}

//============================================
/**
 * Render one square icon at `size` pixels into a PNG buffer, supersampling
 * each output pixel over a SUPERSAMPLE x SUPERSAMPLE subpixel grid and
 * averaging the sampled colors for antialiased circle edges.
 *
 * @param {number} size - The icon's width and height, in pixels.
 * @returns {Buffer} The encoded PNG buffer.
 */
function renderIcon(size) {
  const png = new PNG({ width: size, height: size });
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const nx = (px + (sx + 0.5) / SUPERSAMPLE) / size;
          const ny = (py + (sy + 0.5) / SUPERSAMPLE) / size;
          const [r, g, b] = shapeColorAt(nx, ny);
          rSum += r;
          gSum += g;
          bSum += b;
        }
      }
      const sampleCount = SUPERSAMPLE * SUPERSAMPLE;
      const idx = (size * py + px) << 2;
      png.data[idx] = Math.round(rSum / sampleCount);
      png.data[idx + 1] = Math.round(gSum / sampleCount);
      png.data[idx + 2] = Math.round(bSum / sampleCount);
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

//============================================
/**
 * Render every icon size into `outDir/icon-<size>.png`, creating `outDir` if
 * it does not already exist.
 *
 * @param {string} outDir - Directory to write the icon files into.
 */
function main(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const size of ICON_SIZES) {
    const outFile = path.join(outDir, `icon-${size}.png`);
    fs.writeFileSync(outFile, renderIcon(size));
    console.log(`Wrote ${outFile}`);
  }
}

const outDirArg = process.argv[2];
if (outDirArg === undefined) {
  console.error("ERROR: usage: node tools/generate_pwa_icons.mjs <outDir>");
  process.exit(1);
}
main(outDirArg);
