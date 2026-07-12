// Alien cast contact-sheet capture driver, work package WP-PROOF-1 (plan
// docs/active_plans/... pure-bouncing-lobster milestone M4). The eight alien
// species are the game's most-seen art; this driver is the durable evidence
// that the whole cast reads correctly, so a human (or an evaluator agent) can
// look at every creature in every player color on every background at every
// size the game draws, in one place, on demand.
//
// Per docs/E2E_TESTS.md (non-browser tier, tests/e2e/, self-contained, run
// directly rather than via pytest). Uses playwright-core (not "playwright" /
// "@playwright/test"), matching every other driver in this directory, so this
// file may live under tests/e2e/ without tripping the tests/playwright-only
// import rule (tests/test_test_naming_conventions.py).
//
// Run:
//   node --import tsx tests/e2e/e2e_alien_contact_sheet.mjs
// Writes contact-sheet PNGs into output_smoke/aliens_cast/sheets/ (durable;
// never under test-results/, which Playwright CLEARS at the start of every
// "npx playwright test" run -- docs/E2E_TESTS.md records a real incident
// where 13 of 14 screenshots were destroyed that way). Copied per-species
// renders (evidence backing the sheets) land in output_smoke/aliens_cast/
// renders/. Exits non-zero the instant any expected cell is missing or blank,
// so an incomplete run cannot be mistaken for a clean one.
//
// REUSE, NOT REBUILD: devel/render_alien_sheet.mjs already rasterizes any
// conforming alien SVG across the size ladder (18/32/44/64 px tall, plus a 4x
// inspection render), the four player colors, and the three canonical
// backgrounds (read from src/ui/sprites/palette.ts by token name). This
// driver shells out to that tool once per species (see ONE-SPECIES-PER-CALL
// below) and only assembles its output into readable sheets; it never
// reimplements the raster pipeline.
//
// ONE-SPECIES-PER-CALL (avoids anonymization): render_alien_sheet.mjs treats
// more than one input path as a BAKE-OFF run -- it shuffles evaluator-facing
// labels every run and hides the label-to-source mapping, which is exactly
// wrong for a cast sheet that must show the game's real species names. Every
// invocation here passes exactly one SVG, which keeps single-file mode active
// and gets each species (or, since a recent concurrent edit, the input's
// REPO_ROOT-relative path with separators replaced by "_") as its label.
//
// WHY THIS DRIVER DOES NOT READ THE TOOL'S manifest.json: render_alien_sheet
// writes ONE shared manifest.json at output_smoke/aliens/ root, overwritten
// by every invocation of the tool -- and this repo currently has several
// other agents invoking that same tool concurrently for the alien bake-off.
// Reading that shared file after a subprocess call is a real race (a
// concurrent invocation can overwrite it between our subprocess returning and
// our read). Instead, this driver mirrors the tool's tiny, stable filename
// contract directly (see cellFileName()) and validates each expected PNG by
// reading the file itself (existence + a pixel-content check), which is
// immune to what any other invocation writes to the shared manifest.
//
// SIZES CHOSEN: 32 px is "the size the game draws in the overworld and the
// size you design for" (docs/ALIEN_ART_CONTRACT.md); the per-species sheet
// uses it as "game size". 18 px is the dock-badge size and, per the same doc,
// the size silhouette confusion is judged at -- the silhouette overview sheet
// uses both 18 and 32 side by side for exactly that judgment (the bake-off's
// worst unsolved confusion was mechtron vs leggite, IoU 0.71-0.86 across every
// prior set; this sheet is the standing check against a repeat).
//
// FAIL LOUD: every expected file is required to exist, and every composited
// image is required to contain at least a few pixels that differ from its
// own background color -- a render that silently came back blank (creature
// invisible) throws immediately, naming the exact missing/blank file, rather
// than producing an incomplete sheet that looks complete.

import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";

import { REPO_ROOT } from "./walkthrough_helpers.mjs";
import { PALETTE } from "../../src/ui/sprites/palette.ts";

/** The eight canonical species names, in the order docs/ALIEN_ART_CONTRACT.md
 * lists their silhouette archetypes -- used only for the "which species did
 * we find" report, not to gate rendering. */
const SPECIES_CANON = [
  "humanoid", "gollumer", "mechtron", "packer",
  "leggite", "bonzoid", "spheroid", "flapper",
];

/** Player color and background tokens, read by name from palette.ts (single
 * source of truth), matching devel/render_alien_sheet.mjs's own tokens. */
const PLAYER_COLOR_TOKENS = ["player0", "player1", "player2", "player3"];
const BACKGROUND_TOKENS = ["bgDeep", "terrainPlain", "bgPanel"];

/** The size the game actually draws creatures at in the overworld (see
 * header note); the per-species color x background sheet is judged here. */
const GAME_SIZE_PX = 32;

/** Both sizes the silhouette-collision judgment happens at (see header
 * note), largest first to match the work order's own wording. */
const SILHOUETTE_SIZES_PX = [32, 18];

/** Canonical color/background used for the silhouette overview sheet: any
 * fixed pair works since geometry (the thing being judged there) does not
 * change with tint or backdrop; bgDeep is the game's default backdrop. */
const SILHOUETTE_COLOR_TOKEN = "player0";
const SILHOUETTE_BACKGROUND_TOKEN = "bgDeep";

/** CSS-pixelated upscale factor applied to every embedded cell so a human
 * reviewer can actually see 18-32 px art on a normal screen, while the
 * caption always states the true native pixel size being judged. */
const ZOOM_FACTOR = 4;

const RENDER_SCRIPT = path.join(REPO_ROOT, "devel", "render_alien_sheet.mjs");
const ALIENS_DIR = path.join(REPO_ROOT, "art", "aliens");
const TOOL_OUTPUT_DIR = path.join(REPO_ROOT, "output_smoke", "aliens");
const OUTPUT_DIR = path.join(REPO_ROOT, "output_smoke", "aliens_cast");
const RENDERS_DIR = path.join(OUTPUT_DIR, "renders");
const SHEETS_DIR = path.join(OUTPUT_DIR, "sheets");

//============================================
/**
 * Mirror devel/render_alien_sheet.mjs's labelFromPath(): derive the
 * single-file-mode output-folder label from the input SVG's path relative to
 * REPO_ROOT (not just its basename), since that is the tool's current
 * behavior. Kept here as a small, explicitly-labeled mirror rather than an
 * import, since the tool exports nothing; if that function's shape changes
 * again, this copy needs a matching update.
 *
 * @param {string} absoluteSvgPath - Absolute path to the input SVG.
 * @returns {string} The same filesystem-safe label the tool would use.
 */
function labelFromPath(absoluteSvgPath) {
  const relativePath = path.relative(REPO_ROOT, absoluteSvgPath);
  const withoutExtension = relativePath.slice(0, -path.extname(relativePath).length);
  return withoutExtension.replace(/[^a-zA-Z0-9]+/g, "_");
}

//============================================
/**
 * Convert a "#rrggbb" hex color string into an [r, g, b] byte triple, the
 * same conversion devel/render_alien_sheet.mjs uses internally.
 *
 * @param {string} hex - Hex color, for example "#ff5a5f".
 * @returns {number[]} [r, g, b] byte values.
 */
function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

//============================================
/**
 * Extract every `<symbol id="...">` id attribute from raw SVG source text.
 * A plain regex scan (not a DOM parse) is enough for this driver's only
 * need: knowing which species/frame/head symbols exist so the exact PNG
 * filenames render_alien_sheet.mjs will produce can be predicted -- the
 * actual rasterization stays entirely delegated to that tool.
 *
 * @param {string} rawSvg - Full raw SVG source text.
 * @returns {string[]} Every discovered symbol id.
 */
function extractSymbolIds(rawSvg) {
  const ids = [];
  const symbolTagPattern = /<symbol\b[^>]*\bid="([^"]+)"/g;
  let match = symbolTagPattern.exec(rawSvg);
  while (match !== null) {
    ids.push(match[1]);
    match = symbolTagPattern.exec(rawSvg);
  }
  return ids;
}

//============================================
/**
 * Discover the species prefix, the set of frame numbers, and whether a head
 * crop exists, directly from an alien SVG's symbol ids. Mirrors the id shapes
 * documented in devel/render_alien_sheet.mjs's own FRAME_ID_PATTERN /
 * HEAD_ID_PATTERN header comments ("<species>-frame<N>" / "<species>-head").
 *
 * @param {string} svgPath - Absolute path to the species SVG.
 * @returns {{species: string|null, frameNumbers: Set<number>, hasHead: boolean}}
 */
function discoverSpeciesSymbols(svgPath) {
  const rawSvg = fs.readFileSync(svgPath, "utf8");
  const ids = extractSymbolIds(rawSvg);
  const frameNumbers = new Set();
  let hasHead = false;
  let species = null;
  for (const id of ids) {
    const frameMatch = /^([a-z][a-z0-9]*)-frame-?([0-9]+)$/i.exec(id);
    if (frameMatch) {
      species = frameMatch[1];
      frameNumbers.add(Number(frameMatch[2]));
      continue;
    }
    const headMatch = /^([a-z][a-z0-9]*)-head$/i.exec(id);
    if (headMatch) {
      species = headMatch[1];
      hasHead = true;
    }
  }
  return { species, frameNumbers, hasHead };
}

//============================================
/**
 * List every *.svg file under art/aliens/, ordered with SPECIES_CANON
 * matches first (in canonical order) and any other file alphabetically
 * after -- so the driver stays useful today (2 files) and correct once all
 * eight land, with no code change required either time.
 *
 * @returns {{species: string, svgPath: string}[]} Discovered species files.
 */
function discoverSpeciesFiles() {
  const entries = fs.readdirSync(ALIENS_DIR).filter((name) => name.endsWith(".svg"));
  const files = entries.map((name) => ({
    species: path.basename(name, ".svg"),
    svgPath: path.join(ALIENS_DIR, name),
  }));
  files.sort((a, b) => {
    const indexA = SPECIES_CANON.indexOf(a.species);
    const indexB = SPECIES_CANON.indexOf(b.species);
    if (indexA === -1 && indexB === -1) {
      return a.species.localeCompare(b.species);
    }
    if (indexA === -1) {
      return 1;
    }
    if (indexB === -1) {
      return -1;
    }
    return indexA - indexB;
  });
  return files;
}

//============================================
/**
 * Render one species through devel/render_alien_sheet.mjs (single-file mode,
 * see header note), validate its symbols against the filename this driver
 * expects, then copy the tool's per-label output folder into this driver's
 * own durable renders/ directory so a later concurrent tool invocation
 * cannot touch it.
 *
 * @param {string} species - Species name (the art/aliens/<species>.svg stem).
 * @param {string} svgPath - Absolute path to that species' SVG.
 * @returns {string} The species name, confirmed to match its own symbol ids.
 */
function renderSpecies(species, svgPath) {
  const { species: symbolSpecies, frameNumbers, hasHead } = discoverSpeciesSymbols(svgPath);
  if (symbolSpecies === null) {
    throw new Error(
      `No "<species>-frame<N>" or "<species>-head" symbols found in ${svgPath}.`,
    );
  }
  if (symbolSpecies !== species) {
    throw new Error(
      `${svgPath}: symbol ids use species prefix "${symbolSpecies}" but the filename implies ` +
        `"${species}" -- these must match per docs/ALIEN_ART_CONTRACT.md.`,
    );
  }
  if (!frameNumbers.has(1) || !frameNumbers.has(2)) {
    throw new Error(
      `${species}.svg is missing frame1 or frame2 (found frames: ${[...frameNumbers].join(", ")}).`,
    );
  }
  if (!hasHead) {
    throw new Error(`${species}.svg is missing its "-head" dock-badge crop symbol.`);
  }

  console.log(`==> rendering ${species} (${svgPath})`);
  execFileSync(process.execPath, [RENDER_SCRIPT, svgPath], { cwd: REPO_ROOT, stdio: "inherit" });

  const label = labelFromPath(svgPath);
  const candidateDir = path.join(TOOL_OUTPUT_DIR, label);
  if (!fs.existsSync(candidateDir)) {
    throw new Error(
      `render_alien_sheet.mjs did not write an output folder for ${svgPath}: ${candidateDir}`,
    );
  }

  const destDir = path.join(RENDERS_DIR, species);
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.cpSync(candidateDir, destDir, { recursive: true });

  return species;
}

//============================================
/**
 * Build the exact filename devel/render_alien_sheet.mjs writes for one
 * cell, matching its "full" and "silhouette" naming exactly (see that
 * file's renderOneCandidate()).
 *
 * @param {string} species - Species name.
 * @param {string} tag - "frame1", "frame2", or "head".
 * @param {number} heightPx - Rendered height.
 * @param {string} colorToken - Player color token, for example "player0".
 * @param {string} backgroundToken - Background token, for example "bgDeep".
 * @param {"full"|"silhouette"} variant - Which composited variant to build.
 * @returns {string} The cell's absolute path under destDir.
 */
function resolveCellPath(destDir, species, tag, heightPx, colorToken, backgroundToken, variant) {
  const subDir = variant === "silhouette" ? "silhouette" : "full";
  const suffix = variant === "silhouette" ? "_silhouette.png" : ".png";
  const fileName = `${species}_${tag}_h${heightPx}_${colorToken}_${backgroundToken}${suffix}`;
  return path.join(destDir, subDir, fileName);
}

//============================================
/**
 * Read a cell PNG, failing loudly if it does not exist -- the exact "quietly
 * produces an incomplete sheet" failure mode this driver is designed against.
 *
 * @param {string} absPath - Expected cell path.
 * @param {string} descriptor - Human-readable description for the error.
 * @returns {PNG} The decoded PNG.
 */
function readCellOrThrow(absPath, descriptor) {
  if (!fs.existsSync(absPath)) {
    throw new Error(`Missing cell (${descriptor}): ${absPath}`);
  }
  return PNG.sync.read(fs.readFileSync(absPath));
}

//============================================
/**
 * Verify a composited cell actually shows the creature: at least a handful
 * of pixels must differ from the flat background color it was composited
 * over. A cell that is pixel-identical to its background means the creature
 * silently failed to draw (transparent ink raster, wrong symbol id, etc.).
 *
 * @param {PNG} png - The decoded cell PNG.
 * @param {string} backgroundHex - The background hex this cell was composited over.
 * @param {string} descriptor - Human-readable description for the error.
 * @param {string} absPath - The cell's path, for the error message.
 */
function verifyNotBlank(png, backgroundHex, descriptor, absPath) {
  const [bgR, bgG, bgB] = hexToRgb(backgroundHex);
  let differingPixels = 0;
  for (let i = 0; i < png.data.length; i += 4) {
    const diff = Math.abs(png.data[i] - bgR)
      + Math.abs(png.data[i + 1] - bgG)
      + Math.abs(png.data[i + 2] - bgB);
    if (diff > 6) {
      differingPixels += 1;
      if (differingPixels > 4) {
        return;
      }
    }
  }
  throw new Error(
    `Blank cell (${descriptor}): pixel-identical to its own background, creature did not render: ` +
      `${absPath}`,
  );
}

//============================================
/**
 * Load, validate (exists + not blank), and embed one cell as a base64 data
 * URI, returning everything a sheet-building caller needs to place it.
 *
 * @param {string} destDir - The species' copied render directory.
 * @param {string} species - Species name.
 * @param {string} tag - "frame1", "frame2", or "head".
 * @param {number} heightPx - Rendered height.
 * @param {string} colorToken - Player color token.
 * @param {string} backgroundToken - Background token.
 * @param {"full"|"silhouette"} variant - Which composited variant to load.
 * @returns {{dataUri: string, widthPx: number, heightPx: number}}
 */
function loadValidatedCell(destDir, species, tag, heightPx, colorToken, backgroundToken, variant) {
  const absPath = resolveCellPath(destDir, species, tag, heightPx, colorToken, backgroundToken, variant);
  const descriptor = `${species} ${tag} h${heightPx} ${colorToken} ${backgroundToken} ${variant}`;
  const png = readCellOrThrow(absPath, descriptor);
  const backgroundHex = PALETTE[backgroundToken];
  verifyNotBlank(png, backgroundHex, descriptor, absPath);
  const dataUri = `data:image/png;base64,${fs.readFileSync(absPath).toString("base64")}`;
  return { dataUri, widthPx: png.width, heightPx: png.height };
}

//============================================
/**
 * Wrap a sheet's body markup in the shared page shell (dark theme matching
 * the game, pixelated image scaling so tiny sprites stay legible zoomed up).
 *
 * @param {string} title - Sheet title, shown as an H1.
 * @param {string} bodyHtml - Pre-built body markup.
 * @returns {string} A complete HTML document string.
 */
function buildSheetHtml(title, bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8" /><style>
    body { background:#0d0d18; color:#e6e6e6; font-family: sans-serif; margin:0; padding:24px; }
    h1 { font-size:20px; margin:0 0 16px; }
    h2 { font-size:14px; margin:20px 0 8px; color:#cfcfe6; }
    .row { display:flex; flex-wrap:wrap; gap:12px; }
    .cell { margin:0; padding:8px; background:#1a1a2e; border:1px solid #3a3a55;
      border-radius:4px; text-align:center; }
    .cell img { display:block; margin:0 auto 6px; }
    .pixelated { image-rendering: pixelated; image-rendering: -moz-crisp-edges;
      image-rendering: crisp-edges; }
    figcaption { font-size:11px; color:#b7b7d0; }
  </style></head><body><h1>${title}</h1>${bodyHtml}</body></html>`;
}

//============================================
/**
 * Build the all-species silhouette overview: one sheet with a row at 32 px
 * and a row at 18 px, every found species side by side in each row, so a
 * human can immediately judge silhouette-collision risk (the bake-off's
 * unsolved mechtron-vs-leggite confusion; see header note).
 *
 * @param {import("playwright-core").Page} page - The Playwright page.
 * @param {string[]} foundSpecies - Species names, in report order.
 * @returns {Promise<string>} The written sheet's absolute path.
 */
async function buildSilhouetteOverviewSheet(page, foundSpecies) {
  const rowsHtml = [];
  for (const heightPx of SILHOUETTE_SIZES_PX) {
    const cellsHtml = [];
    for (const species of foundSpecies) {
      const destDir = path.join(RENDERS_DIR, species);
      const cell = loadValidatedCell(
        destDir, species, "frame1", heightPx,
        SILHOUETTE_COLOR_TOKEN, SILHOUETTE_BACKGROUND_TOKEN, "silhouette",
      );
      const zoomWidth = cell.widthPx * ZOOM_FACTOR;
      const zoomHeight = cell.heightPx * ZOOM_FACTOR;
      cellsHtml.push(
        `<figure class="cell"><img src="${cell.dataUri}" width="${zoomWidth}" ` +
          `height="${zoomHeight}" class="pixelated" /><figcaption>${species}<br/>native ` +
          `${cell.widthPx}x${cell.heightPx}px, shown at ${ZOOM_FACTOR}x</figcaption></figure>`,
      );
    }
    rowsHtml.push(
      `<section><h2>${heightPx} px silhouette row (frame 1, ${SILHOUETTE_COLOR_TOKEN} tint, ` +
        `${SILHOUETTE_BACKGROUND_TOKEN} background)</h2><div class="row">${cellsHtml.join("")}` +
        "</div></section>",
    );
  }

  const html = buildSheetHtml(
    "Alien cast silhouette overview - collision check (18px and 32px)",
    rowsHtml.join(""),
  );
  await page.setContent(html);
  const outPath = path.join(SHEETS_DIR, "silhouette_overview.png");
  await page.screenshot({ path: outPath, fullPage: true });
  return outPath;
}

/** Which symbol kinds the per-species sheet shows, in reading order. */
const SPECIES_SHEET_KINDS = [
  { tag: "frame1", label: "Frame 1 (idle)" },
  { tag: "frame2", label: "Frame 2 (motion)" },
  { tag: "head", label: "Head (dock badge crop)" },
];

//============================================
/**
 * Build one species' full sheet: its two frames and head, across all four
 * player colors and all three backgrounds, at game size (32 px) -- the exact
 * "Done when" check in docs/ALIEN_ART_CONTRACT.md ("At 18 and 32 px, in ALL
 * FOUR player colors, on ALL THREE backgrounds, you can see the creature and
 * its body reads as the player's color").
 *
 * @param {import("playwright-core").Page} page - The Playwright page.
 * @param {string} species - Species name.
 * @returns {Promise<string>} The written sheet's absolute path.
 */
async function buildSpeciesSheet(page, species) {
  const destDir = path.join(RENDERS_DIR, species);
  const rowsHtml = [];
  for (const { tag, label } of SPECIES_SHEET_KINDS) {
    const cellsHtml = [];
    for (const colorToken of PLAYER_COLOR_TOKENS) {
      for (const backgroundToken of BACKGROUND_TOKENS) {
        const cell = loadValidatedCell(
          destDir, species, tag, GAME_SIZE_PX, colorToken, backgroundToken, "full",
        );
        const zoomWidth = cell.widthPx * ZOOM_FACTOR;
        const zoomHeight = cell.heightPx * ZOOM_FACTOR;
        cellsHtml.push(
          `<figure class="cell"><img src="${cell.dataUri}" width="${zoomWidth}" ` +
            `height="${zoomHeight}" class="pixelated" /><figcaption>${colorToken}<br/>` +
            `${backgroundToken}</figcaption></figure>`,
        );
      }
    }
    rowsHtml.push(`<section><h2>${label}</h2><div class="row">${cellsHtml.join("")}</div></section>`);
  }

  const html = buildSheetHtml(
    `${species} - all colors x all backgrounds at ${GAME_SIZE_PX}px (game size)`,
    rowsHtml.join(""),
  );
  await page.setContent(html);
  const outPath = path.join(SHEETS_DIR, `${species}_sheet.png`);
  await page.screenshot({ path: outPath, fullPage: true });
  return outPath;
}

//============================================
async function main() {
  fs.mkdirSync(RENDERS_DIR, { recursive: true });
  fs.mkdirSync(SHEETS_DIR, { recursive: true });

  const speciesFiles = discoverSpeciesFiles();
  if (speciesFiles.length === 0) {
    throw new Error(`No alien SVGs found under ${ALIENS_DIR}.`);
  }

  const foundSpecies = [];
  for (const { species, svgPath } of speciesFiles) {
    foundSpecies.push(renderSpecies(species, svgPath));
  }

  const missingSpecies = SPECIES_CANON.filter((species) => !foundSpecies.includes(species));
  console.log(`==> found ${foundSpecies.length}/${SPECIES_CANON.length} canonical species: ` +
    `${foundSpecies.join(", ")}`);
  if (missingSpecies.length > 0) {
    console.log(`==> not yet drawn: ${missingSpecies.join(", ")}`);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 2200, height: 1400 } });

  const sheetPaths = [];
  try {
    sheetPaths.push(await buildSilhouetteOverviewSheet(page, foundSpecies));
    for (const species of foundSpecies) {
      sheetPaths.push(await buildSpeciesSheet(page, species));
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "species_report.json"),
    JSON.stringify({ foundSpecies, missingSpecies, canonicalOrder: SPECIES_CANON }, null, 2),
  );

  console.log(`==> wrote ${sheetPaths.length} contact sheets to ${SHEETS_DIR}`);
  for (const sheetPath of sheetPaths) {
    console.log(`    ${sheetPath}`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("FAIL: e2e_alien_contact_sheet:", error);
  process.exit(1);
});
