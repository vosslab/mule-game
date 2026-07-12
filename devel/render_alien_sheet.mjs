// Alien-art rasterizer: turns any conforming alien SVG (a file whose
// <defs> hold <symbol> elements with ids shaped "<species>-frame<N>" or
// "<species>-frame-<N>", plus the optional "<species>-head" dock-badge crop
// and "<species>-silhouetteN" lint companions from docs/ALIEN_ART_CONTRACT.md)
// into a graded PNG sheet for a human bake-off review. This tool never
// judges the art; it only produces evidence (renders) and, in the sibling
// devel/measure_alien_art.py, supporting diagnostics beside those renders.
//
// SYMBOL KINDS: three kinds of symbol are discovered and rendered through
// the identical capture pipeline (full size ladder, every player color,
// every background). Only "frame" cells feed manifest.cells, which is the
// exact shape devel/measure_alien_art.py already consumes (per-species
// pairwise IoU, symmetry, clean-edge, all of which are frame concepts).
// "head" and "silhouette" cells are evidence too, but they land in their own
// manifest.headCells / manifest.silhouetteCells arrays instead, so this file
// never has to touch measure_alien_art.py's frame-shaped reconstruction
// logic to add them. The head crop matters most: at the 18px dock badge, it
// is the only thing the game actually draws, and no artist can judge a crop
// they cannot see rendered.
//
// Judged at the SMALLEST rendered sizes, per WP-TOOL-1: everything that
// matters is checked at 18/32/44/64px rendered height (the size ladder),
// never on the SVG's own authoring viewBox. A 4x "inspection" render (4x
// the largest ladder height) is also emitted, clearly tagged, for a human
// to zoom into detail that is invisible at gameplay scale -- it is not
// part of the judged ladder.
//
// ASPECT RATIO NOTE: each symbol's own declared viewBox sets its aspect
// ratio (width / height), rather than a single hardcoded 5:8 (tall) ratio.
// The stand-in devel/alien_wide_candidates/*.svg files this tool was built
// and tested against use a wide 48x30 (8:5) per-frame viewBox, not the
// eventual 200x320 (5:8 tall) authoring grid described in the work order.
// Deriving the aspect from each symbol keeps this tool correct for both
// shapes with no code change when the tall-grid art lands.
//
// COLOR AND BACKGROUND SOURCE OF TRUTH: player tints and canonical
// backgrounds are imported directly from src/ui/sprites/palette.ts by
// token name (player0-3, bgDeep, terrainPlain, bgPanel), not re-hardcoded
// here, so this tool and the game art never drift apart. Node 26's native
// TypeScript type-stripping imports that module directly with plain
// `node` -- no --import tsx flag or build step required.
//
// RASTER PIPELINE (kept to ONE browser capture per species/frame/size/
// player-color, all further variants and backgrounds are derived by local
// pixel math -- see composeVariants() -- so the many-combination grid the
// work order asks for does not multiply out browser overhead):
//   1. Capture the creature alone on a transparent canvas, once per
//      (species, frame, size, player color): this is the authoritative
//      "ink" RGBA raster -- every non-transparent pixel is part of the
//      creature exactly as the SVG draws it (currentColor-tinted parts
//      plus every fixed-color detail element).
//   2. "full" variant: alpha-composite that ink raster over each of the
//      3 canonical backgrounds.
//   3. "silhouette" variant: derive a flattened ink raster by keeping each
//      pixel's alpha (so the anti-aliased edge survives) but replacing its
//      RGB with the flat player-tint color, then composite that over each
//      background the same way. Geometry is color-invariant, so ONLY the
//      player0 capture's alpha channel is also saved as a small standalone
//      "mask" PNG per (species, frame, size) for measure_alien_art.py's
//      shape diagnostics (silhouette IoU, coverage, symmetry) -- it does
//      not need a second browser capture, since alpha shape does not
//      change with tint color.
//
// ANONYMIZATION (bake-off mode, more than one input SVG): evaluator-facing
// files are written under randomized "candidate_alpha".."candidate_epsilon"
// labels, reshuffled every run, and the label-to-source-file mapping is
// written to a SEPARATE manifest (label_mapping.json) the evaluator is not
// shown. Hypothesis/design-rationale XML comments never reach the
// evaluator regardless, since only rendered PNGs are shown, never the raw
// SVG source.
//
// Run:
//   node devel/render_alien_sheet.mjs <svg-file> [<svg-file> ...]
// Writes PNGs and manifest.json under output_smoke/aliens/ (never under
// test-results/, which Playwright clears at the start of every
// "npx playwright test" run; see docs/E2E_TESTS.md).

import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

import { PALETTE } from "../src/ui/sprites/palette.ts";

const REPO_ROOT = path.dirname(path.dirname(url.fileURLToPath(import.meta.url)));
const OUTPUT_DIR = path.join(REPO_ROOT, "output_smoke", "aliens");

/** Size ladder, expressed as rendered HEIGHT in device pixels. Width is
 * derived per-symbol from that symbol's own viewBox aspect ratio. */
const SIZE_LADDER_PX = [18, 32, 44, 64];

/** 4x the largest ladder height: inspection-only, never part of the judged
 * grid, always tagged isInspection in the manifest and "_inspect" in
 * filenames. */
const INSPECTION_HEIGHT_PX = Math.max(...SIZE_LADDER_PX) * 4;

/** Canonical background tokens, read by name from palette.ts (single
 * source of truth) rather than re-hardcoded hex values. */
const BACKGROUND_TOKENS = ["bgDeep", "terrainPlain", "bgPanel"];

/** Player color tokens, likewise read by name rather than hardcoded hex. */
const PLAYER_COLOR_TOKENS = ["player0", "player1", "player2", "player3"];

/** Symbol id pattern: "<species>-frame<N>" or "<species>-frame-<N>". */
const FRAME_ID_PATTERN = /^([a-z][a-z0-9]*)-frame-?([0-9]+)$/i;

/** Symbol id pattern: "<species>-head", the 18px dock-badge crop. */
const HEAD_ID_PATTERN = /^([a-z][a-z0-9]*)-head$/i;

/** Symbol id pattern: "<species>-silhouetteN", the lint-only flat-fill mask. */
const SILHOUETTE_ID_PATTERN = /^([a-z][a-z0-9]*)-silhouette([0-9]+)$/i;

/** Shuffled evaluator-facing labels for bake-off (multi-file) mode. */
const CANDIDATE_LABELS = ["candidate_alpha", "candidate_beta", "candidate_gamma",
	"candidate_delta", "candidate_epsilon"];

//============================================
/**
 * Fisher-Yates shuffle, used to randomize bake-off candidate labels.
 *
 * @param {Array} items - Items to shuffle in place.
 * @returns {Array} The same array, shuffled.
 */
function shuffleInPlace(items) {
	for (let i = items.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1));
		const temp = items[i];
		items[i] = items[j];
		items[j] = temp;
	}
	return items;
}

//============================================
/**
 * Convert a "#rrggbb" hex color string into an [r, g, b] byte triple.
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
 * Classify a symbol id against the three recognized shapes: frame, head, or
 * silhouette. Returns null for any id that matches none of them (for
 * example a non-species-scoped helper symbol some other tool may define).
 *
 * @param {string} symbolId - The symbol's "id" attribute.
 * @returns {{kind: string, species: string, frame: number|null,
 *   silhouetteIndex: number|null, tag: string}|null} Classification, or null.
 */
function classifySymbolId(symbolId) {
	const frameMatch = FRAME_ID_PATTERN.exec(symbolId);
	if (frameMatch) {
		const frame = Number(frameMatch[2]);
		return {
			kind: "frame", species: frameMatch[1], frame, silhouetteIndex: null,
			tag: `frame${frame}`,
		};
	}
	const headMatch = HEAD_ID_PATTERN.exec(symbolId);
	if (headMatch) {
		return { kind: "head", species: headMatch[1], frame: null, silhouetteIndex: null, tag: "head" };
	}
	const silhouetteMatch = SILHOUETTE_ID_PATTERN.exec(symbolId);
	if (silhouetteMatch) {
		const silhouetteIndex = Number(silhouetteMatch[2]);
		return {
			kind: "silhouette", species: silhouetteMatch[1], frame: null, silhouetteIndex,
			tag: `silhouette${silhouetteIndex}`,
		};
	}
	return null;
}

//============================================
/**
 * Discover every "<species>-frame<N>", "<species>-head", and
 * "<species>-silhouetteN" symbol in a raw SVG string, using a real browser
 * DOMParser rather than regex-scraping the markup, so nested or reordered
 * attributes never break discovery.
 *
 * @param {import("playwright-core").Page} page - A Playwright page.
 * @param {string} rawSvg - The full raw SVG source text.
 * @returns {Promise<Array>} Discovered symbols: {id, kind, species, frame,
 *   silhouetteIndex, tag, viewBox, viewBoxWidth, viewBoxHeight, aspect}.
 */
async function discoverSymbols(page, rawSvg) {
	await page.setContent("<!doctype html><html><body></body></html>");
	const symbols = await page.evaluate((svgText) => {
		const parser = new DOMParser();
		const doc = parser.parseFromString(svgText, "image/svg+xml");
		const found = [];
		for (const symbolElement of doc.querySelectorAll("symbol[id]")) {
			found.push({
				id: symbolElement.getAttribute("id"),
				viewBox: symbolElement.getAttribute("viewBox"),
			});
		}
		return found;
	}, rawSvg);

	const matched = [];
	for (const symbol of symbols) {
		const classification = classifySymbolId(symbol.id);
		if (!classification) {
			continue;
		}
		if (!symbol.viewBox) {
			throw new Error(`Symbol "${symbol.id}" is missing a required viewBox attribute.`);
		}
		const viewBoxParts = symbol.viewBox.trim().split(/\s+/).map(Number);
		const viewBoxWidth = viewBoxParts[2];
		const viewBoxHeight = viewBoxParts[3];
		matched.push({
			id: symbol.id,
			...classification,
			viewBox: symbol.viewBox,
			viewBoxWidth,
			viewBoxHeight,
			aspect: viewBoxWidth / viewBoxHeight,
		});
	}
	return matched;
}

//============================================
/**
 * Capture one symbol instance, tinted by player color, alone on a fully
 * transparent canvas at the given rendered height.
 *
 * @param {import("playwright-core").Page} page - A Playwright page.
 * @param {string} rawSvg - The full raw SVG source text (holds the defs).
 * @param {object} symbol - Discovered symbol descriptor.
 * @param {number} heightPx - Target rendered height, in device pixels.
 * @param {string} colorHex - Player tint hex, applied via CSS `color`.
 * @returns {Promise<{png: PNG, widthPx: number, heightPx: number}>}
 */
async function captureInkRaster(page, rawSvg, symbol, heightPx, colorHex) {
	const widthPx = Math.round(heightPx * symbol.aspect);
	// The outer <svg> carries NO viewBox of its own. A <use> that references a
	// <symbol> already generates its own synthetic viewport that applies the
	// symbol's own viewBox exactly once; giving the outer <svg> the SAME
	// viewBox as well would apply it a second time, shifting content by
	// (-minX, -minY). That double shift is invisible for a "0 0 W H" frame
	// viewBox (translation is zero) but moves a non-zero-origin viewBox (for
	// example a head crop's "46 14 108 108" window) out of frame. Explicit
	// width/height on the <use> element ensure its generated viewport is
	// sized in device pixels regardless of the symbol's own width/height.
	const html = "<!doctype html><html><body style=\"margin:0\">"
		+ `<div style="display:none">${rawSvg}</div>`
		+ `<svg id="cell" width="${widthPx}" height="${heightPx}" `
		+ `style="color:${colorHex}">`
		+ `<use href="#${symbol.id}" x="0" y="0" width="${widthPx}" height="${heightPx}"></use></svg>`
		+ "</body></html>";
	await page.setContent(html);
	const buffer = await page.locator("#cell").screenshot({ omitBackground: true });
	const png = PNG.sync.read(buffer);
	return { png, widthPx, heightPx };
}

//============================================
/**
 * Alpha-composite an RGBA source raster over a solid background color.
 *
 * @param {PNG} sourcePng - Source RGBA raster (creature ink, transparent
 *   elsewhere).
 * @param {number[]} backgroundRgb - [r, g, b] background color.
 * @returns {PNG} A new fully-opaque PNG, the same size as sourcePng.
 */
function compositeOverBackground(sourcePng, backgroundRgb) {
	const output = new PNG({ width: sourcePng.width, height: sourcePng.height });
	for (let i = 0; i < sourcePng.data.length; i += 4) {
		const alpha = sourcePng.data[i + 3] / 255;
		output.data[i] = Math.round(sourcePng.data[i] * alpha + backgroundRgb[0] * (1 - alpha));
		output.data[i + 1] = Math.round(sourcePng.data[i + 1] * alpha + backgroundRgb[1] * (1 - alpha));
		output.data[i + 2] = Math.round(sourcePng.data[i + 2] * alpha + backgroundRgb[2] * (1 - alpha));
		output.data[i + 3] = 255;
	}
	return output;
}

//============================================
/**
 * Flatten an ink raster to a solid silhouette: keep each pixel's alpha (so
 * the anti-aliased edge survives) but replace RGB with a single flat tint
 * color, discarding every internal detail color.
 *
 * @param {PNG} sourcePng - Source RGBA ink raster.
 * @param {number[]} tintRgb - [r, g, b] flat silhouette color.
 * @returns {PNG} A new transparent PNG, same size as sourcePng.
 */
function flattenToSilhouette(sourcePng, tintRgb) {
	const output = new PNG({ width: sourcePng.width, height: sourcePng.height });
	for (let i = 0; i < sourcePng.data.length; i += 4) {
		output.data[i] = tintRgb[0];
		output.data[i + 1] = tintRgb[1];
		output.data[i + 2] = tintRgb[2];
		output.data[i + 3] = sourcePng.data[i + 3];
	}
	return output;
}

//============================================
/**
 * Recolor an ink raster's RGB to white while preserving alpha, producing a
 * standalone geometry mask used only by measure_alien_art.py's shape
 * diagnostics (never shown to an evaluator as art).
 *
 * @param {PNG} sourcePng - Source RGBA ink raster.
 * @returns {PNG} A new transparent white-on-alpha mask PNG.
 */
function toWhiteMask(sourcePng) {
	return flattenToSilhouette(sourcePng, [255, 255, 255]);
}

//============================================
/**
 * Write a PNG buffer to disk, creating parent directories as needed.
 *
 * @param {string} filePath - Destination path.
 * @param {PNG} png - PNG to encode and write.
 */
function writePng(filePath, png) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, PNG.sync.write(png));
}

//============================================
/**
 * Build the filename-safe size tag for a rendered height.
 *
 * @param {number} heightPx - Rendered height in device pixels.
 * @param {boolean} isInspection - Whether this is the inspection render.
 * @returns {string} A tag such as "h32" or "h256-inspect".
 */
function sizeTag(heightPx, isInspection) {
	return isInspection ? `h${heightPx}-inspect` : `h${heightPx}`;
}

//============================================
/**
 * Render one input SVG's full combination grid: every symbol (frame, head,
 * and silhouette alike), every size (ladder plus inspection), every player
 * color, every background, both the "full" and "silhouette" variants, plus
 * one geometry mask per symbol/size.
 *
 * Frame-kind cells are returned in "frameCells" -- the exact shape
 * devel/measure_alien_art.py's manifest.cells reconstruction already
 * expects, byte-identical filenames to before this change. Head and
 * silhouette cells are returned separately in "headCells" and
 * "silhouetteCells" so that existing frame-shaped diagnostics never see
 * them and never need to change.
 *
 * @param {import("playwright-core").Page} page - A Playwright page.
 * @param {string} svgPath - Absolute path to the input SVG.
 * @param {string} evaluatorLabel - Anonymized label used for output paths.
 * @returns {Promise<{frameCells: object[], headCells: object[],
 *   silhouetteCells: object[]}>} Manifest cell descriptors, by kind.
 */
async function renderOneCandidate(page, svgPath, evaluatorLabel) {
	const rawSvg = fs.readFileSync(svgPath, "utf8");
	const symbols = await discoverSymbols(page, rawSvg);
	if (symbols.length === 0) {
		throw new Error(
			`No "<species>-frame<N>", "<species>-head", or "<species>-silhouetteN" `
			+ `symbols found in ${svgPath}. `
			+ "This tool requires <symbol id=...> elements matching one of those naming conventions."
		);
	}

	const sizeEntries = SIZE_LADDER_PX.map((heightPx) => ({ heightPx, isInspection: false }));
	sizeEntries.push({ heightPx: INSPECTION_HEIGHT_PX, isInspection: true });

	const frameCells = [];
	const headCells = [];
	const silhouetteCells = [];
	const candidateDir = path.join(OUTPUT_DIR, evaluatorLabel);

	// Clear ONLY this candidate's own subdirectory, never the shared
	// OUTPUT_DIR root: concurrent invocations render different labels into
	// sibling subdirectories, and wiping the shared root would destroy
	// another in-flight run's already-written cells.
	fs.rmSync(candidateDir, { recursive: true, force: true });
	fs.mkdirSync(candidateDir, { recursive: true });

	for (const symbol of symbols) {
		for (const sizeEntry of sizeEntries) {
			const tag = sizeTag(sizeEntry.heightPx, sizeEntry.isInspection);
			let maskWritten = false;

			for (const colorToken of PLAYER_COLOR_TOKENS) {
				const colorHex = PALETTE[colorToken];
				const capture = await captureInkRaster(
					page, rawSvg, symbol, sizeEntry.heightPx, colorHex
				);

				// Geometry mask: color-invariant, so only saved once per
				// (symbol, size), from whichever color token is first in the
				// loop (player0) rather than a second dedicated capture.
				if (!maskWritten) {
					const maskPath = path.join(
						candidateDir, "masks",
						`${symbol.species}_${symbol.tag}_${tag}_mask.png`
					);
					writePng(maskPath, toWhiteMask(capture.png));
					maskWritten = true;
				}

				const tintRgb = hexToRgb(colorHex);
				const silhouettePng = flattenToSilhouette(capture.png, tintRgb);

				for (const bgToken of BACKGROUND_TOKENS) {
					const bgHex = PALETTE[bgToken];
					const bgRgb = hexToRgb(bgHex);

					const fullPath = path.join(
						candidateDir, "full",
						`${symbol.species}_${symbol.tag}_${tag}_${colorToken}_${bgToken}.png`
					);
					writePng(fullPath, compositeOverBackground(capture.png, bgRgb));

					const silhouettePath = path.join(
						candidateDir, "silhouette",
						`${symbol.species}_${symbol.tag}_${tag}_${colorToken}_${bgToken}_silhouette.png`
					);
					writePng(silhouettePath, compositeOverBackground(silhouettePng, bgRgb));

					const cell = {
						evaluatorLabel,
						kind: symbol.kind,
						species: symbol.species,
						frame: symbol.frame,
						silhouetteIndex: symbol.silhouetteIndex,
						symbolId: symbol.id,
						heightPx: sizeEntry.heightPx,
						isInspection: sizeEntry.isInspection,
						colorToken,
						colorHex,
						backgroundToken: bgToken,
						backgroundHex: bgHex,
						widthPx: capture.widthPx,
						full: path.relative(OUTPUT_DIR, fullPath),
						silhouette: path.relative(OUTPUT_DIR, silhouettePath),
					};

					if (symbol.kind === "frame") {
						frameCells.push(cell);
					} else if (symbol.kind === "head") {
						headCells.push(cell);
					} else {
						silhouetteCells.push(cell);
					}
				}
			}
		}
	}

	return { frameCells, headCells, silhouetteCells };
}

//============================================
/**
 * Derive a single-file-mode output label from the input SVG's path relative
 * to REPO_ROOT, rather than just its basename. Two different candidate SVGs
 * sharing a basename (for example set_3/aliens.svg and set_5/aliens.svg,
 * both literally named "aliens.svg") are common across sibling candidate
 * folders; a basename-only label would give both runs the identical output
 * subdirectory and let one concurrent invocation's per-candidate clear wipe
 * the other's in-flight cells.
 *
 * @param {string} absoluteSvgPath - Absolute path to the input SVG.
 * @returns {string} A filesystem-safe label unique to this input's location.
 */
function labelFromPath(absoluteSvgPath) {
	const relativePath = path.relative(REPO_ROOT, absoluteSvgPath);
	const withoutExtension = relativePath.slice(0, -path.extname(relativePath).length);
	return withoutExtension.replace(/[^a-zA-Z0-9]+/g, "_");
}

//============================================
/**
 * Entry point: render every input SVG, anonymizing labels in bake-off
 * (multi-file) mode, and write the combined manifest.
 */
async function main() {
	const inputPaths = process.argv.slice(2).map((inputPath) => path.resolve(inputPath));
	if (inputPaths.length === 0) {
		throw new Error("Usage: node devel/render_alien_sheet.mjs <svg-file> [<svg-file> ...]");
	}
	if (inputPaths.length > CANDIDATE_LABELS.length) {
		throw new Error(
			`At most ${CANDIDATE_LABELS.length} candidate SVGs are supported per bake-off run.`
		);
	}

	const isBakeOff = inputPaths.length > 1;
	const labels = isBakeOff
		? shuffleInPlace([...CANDIDATE_LABELS]).slice(0, inputPaths.length)
		: [labelFromPath(inputPaths[0])];

	// Never clear the shared OUTPUT_DIR root here: other invocations may be
	// rendering different candidate labels into sibling subdirectories at
	// the same time. Each candidate's own subdirectory is cleared instead,
	// scoped to just that label, inside renderOneCandidate().
	fs.mkdirSync(OUTPUT_DIR, { recursive: true });

	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });

	const allFrameCells = [];
	const allHeadCells = [];
	const allSilhouetteCells = [];
	const labelMapping = [];
	for (let i = 0; i < inputPaths.length; i += 1) {
		const evaluatorLabel = labels[i];
		const { frameCells, headCells, silhouetteCells } = await renderOneCandidate(
			page, inputPaths[i], evaluatorLabel
		);
		allFrameCells.push(...frameCells);
		allHeadCells.push(...headCells);
		allSilhouetteCells.push(...silhouetteCells);
		labelMapping.push({ evaluatorLabel, sourceSvg: path.relative(REPO_ROOT, inputPaths[i]) });
		console.log(`Rendered ${frameCells.length} frame cells, ${headCells.length} head cells, `
			+ `${silhouetteCells.length} silhouette cells for ${evaluatorLabel} `
			+ `(source: ${path.relative(REPO_ROOT, inputPaths[i])})`);
	}

	await browser.close();

	const manifest = {
		generatedAt: new Date().toISOString(),
		isBakeOff,
		backgroundTokens: Object.fromEntries(
			BACKGROUND_TOKENS.map((token) => [token, PALETTE[token]])
		),
		playerColorTokens: Object.fromEntries(
			PLAYER_COLOR_TOKENS.map((token) => [token, PALETTE[token]])
		),
		sizeLadderPx: SIZE_LADDER_PX,
		inspectionHeightPx: INSPECTION_HEIGHT_PX,
		// "cells" stays frame-only and keeps its pre-existing shape: this is
		// the exact key devel/measure_alien_art.py reconstructs mask/full
		// paths from. Head and silhouette evidence lives in its own arrays
		// alongside it so that reconstruction logic never has to change.
		cells: allFrameCells,
		headCells: allHeadCells,
		silhouetteCells: allSilhouetteCells,
	};
	fs.writeFileSync(
		path.join(OUTPUT_DIR, "manifest.json"),
		JSON.stringify(manifest, null, 2)
	);

	// Kept separate from manifest.json (never shown to the blind evaluator)
	// only when there is an actual mapping to hide; in single-file mode the
	// label already equals the source basename, so there is nothing to blind.
	if (isBakeOff) {
		fs.writeFileSync(
			path.join(OUTPUT_DIR, "label_mapping.json"),
			JSON.stringify({ note: "DO NOT SHOW TO EVALUATOR", labelMapping }, null, 2)
		);
	}

	const totalCells = allFrameCells.length + allHeadCells.length + allSilhouetteCells.length;
	console.log(`Wrote ${allFrameCells.length} frame cells, ${allHeadCells.length} head cells, `
		+ `${allSilhouetteCells.length} silhouette cells (${totalCells} total) to ${OUTPUT_DIR}`);
}

main();
