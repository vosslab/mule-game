// Startup utilities shared by the full-game walkthrough harness
// (e2e_walkthrough.mjs). This module owns gesture-agnostic plumbing only:
// repo/dist paths, the static dist/ server, and the launch-to-title
// bootstrap sequence. It intentionally imports nothing from
// walkthrough_report.mjs (the evidence/report module, owned separately);
// the orchestrator (e2e_walkthrough.mjs) wires the two together into the
// phase loop.
//
// Reuses the proven launch model from e2e_full_game.mjs: build via
// build_github_pages.sh when dist/ is missing, serve dist/ on a random
// loopback port (server.listen(0)), and drive the page with playwright-core
// (not "playwright" / "@playwright/test", so this file may live under
// tests/e2e/ without tripping the tests/playwright-only import rule; see
// tests/test_test_naming_conventions.py).

import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WALKER_SPEED_PX_PER_SEC, WALKER_CELL_PX } from "../../src/ui/scenes/walker.ts";
import { TOWN_DOOR_WIDTH, TOWN_AVATAR_RADIUS } from "../../src/ui/scenes/town_world.ts";

//============================================
// Realtime-walk calibration constants.
//
// MEASURED, not guessed: these were the winning row of a timing matrix swept
// by the retired tests/e2e/e2e_walk_calibration.mjs (removed as stale against
// the mode-composed street model; its measurement is superseded by the
// locked, geometry-derived constants below and recorded in
// docs/active_plans/audits/town_spacing_experiment.md).
//
// Winning row: speed=4, WALK_TAP_MS=120 (seed 33). Every config in the sweep
// hit 100% (20/20) door-reach, but the errand metric split the field: speed=8
// with a 120ms tap passes, yet its 180ms-tap sibling FAILS -- a single long
// tap at speed 8 sails past an adjacent errand door (counter/corral one cell
// apart) and straight out the town edge exit. speed=4 is the fastest speed
// with proven tap-length HEADROOM (both its 120ms and 180ms taps pass), so it
// sits a full safety factor below that overshoot cliff -- the margin that
// matters under headless rAF throttling (scene_manager.ts MAX_FRAME_MS=100
// clamps each frame to at most speed*100ms of travel, half a cell at speed 4).
// It is still 2x faster than the proven-safe speed=2 town/pub specs. Revert
// trigger (plan): a >5% door-reach failure across a sweep warrants a rerun.
//============================================

/** Scene speed multiplier for walker runs (the `?speed=` URL param). */
export const WALKER_SPEED = 4;

/**
 * The avatar's effective on-screen speed (town pixels per second) during a
 * walkthrough run: the scene's base land speed scaled by the `?speed=`
 * multiplier the harness drives at. Deriving the tap hold durations below from
 * this keeps per-tap TRAVEL constant when WALKER_SPEED_PX_PER_SEC is retuned --
 * raising the base speed shortens the hold instead of quadrupling the
 * distance each tap covers.
 */
const EFFECTIVE_WALK_SPEED_PX_PER_SEC = WALKER_SPEED_PX_PER_SEC * WALKER_SPEED;

/**
 * Floor (real-ms) every derived tap hold clamps up to, so even at a high base
 * speed a tap still holds the key long enough for a headless rAF frame to sample
 * it and move the avatar. Below this a sub-frame tap can be pressed and released
 * between frames and never move at all. A rare zero-move tap is still absorbed by
 * the loop (every tap is re-checked and re-tapped up to STALL_TAPS times), so
 * this floor only needs to make movement the common case, not guarantee it.
 */
const FRAME_SAFE_TAP_MS = 20;

//============================================
/**
 * Convert a desired per-tap TRAVEL distance (town pixels) into an arrow-key hold
 * duration (real ms) at the current effective walk speed, clamped up to the
 * frame-safe floor. This is the single speed-aware seam the tap constants share
 * so no raw millisecond magic number encodes an assumed walk speed.
 *
 * @param stepPx - The desired per-tap travel distance in town pixels.
 * @returns The hold duration in real milliseconds.
 */
function tapMsForStepPx(stepPx) {
  const ms = Math.round((stepPx / EFFECTIVE_WALK_SPEED_PX_PER_SEC) * 1000);
  return Math.max(FRAME_SAFE_TAP_MS, ms);
}

/**
 * Real-ms hold duration of one bounded overworld walk tap, derived so each tap
 * travels about half an overworld cell (walker.ts's WALKER_CELL_PX). Sub-cell
 * travel is the safety invariant for the overworld/town-edge walks that use it
 * (walkOverworldAvatarToCell, enterTown, exitTown, and the north-into-a-door
 * push): a single tap can never leap clear across a target cell, so a slow read
 * can never let the avatar sail a whole cell past a target before the seek
 * reacts. The narrow town-door x-alignment uses its own, finer gap-proportional
 * step (see walkTownAvatarToDoorX below), since the door-entry window is much
 * tighter than an overworld cell.
 */
export const WALK_TAP_MS = tapMsForStepPx(WALKER_CELL_PX / 2);

/**
 * Wall-clock budget for a single walker act (walk-to-door, enter/exit town,
 * place). Rounded up to a stable 1000ms from the winning row's worst measured
 * single act (~250ms, the west-exit walk) -- roughly a 4x margin so a loaded
 * machine's slow act still fits while a genuine multi-second stall (the
 * speed=8/tap=180 overshoot spun for ~11s) is still caught.
 */
export const PER_ACT_BUDGET_MS = 1000;

/** Repo root, resolved via git so the harness runs from any cwd. */
export const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

/** Built site root the static server serves. */
export const DIST_DIR = path.join(REPO_ROOT, "dist");

/** Content types for the handful of extensions dist/ contains. */
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

//============================================
// Stale-dist detection.
//
// A bare exists-check (the prior buildSiteIfMissing) treats any dist/index.html
// as good enough forever, so an old dist/ left over from a previous run gets
// served against fresh src/ edits -- the walker then exercises stale code and
// silently reports on the wrong bundle. buildSiteIfStale below rebuilds
// whenever dist/index.html is missing OR older than the newest source input
// the build actually consumes.
//============================================

/**
 * Source inputs build_github_pages.sh reads to produce dist/: the full src/
 * tree (recursively -- everything under it feeds either tsc, the esbuild
 * bundle, or a verbatim copy step), tsconfig.json (the tsc --noEmit config),
 * pipeline/build.mjs (the esbuild driver script itself), and package.json
 * (dependency version bumps, e.g. esbuild or esbuild-plugin-solid, change the
 * bundle without touching src/). This repo has no root index.html or vite
 * config (build_github_pages.sh drives esbuild directly; see that script).
 */
const BUILD_SOURCE_INPUTS = [
  path.join(REPO_ROOT, "src"),
  path.join(REPO_ROOT, "tsconfig.json"),
  path.join(REPO_ROOT, "pipeline", "build.mjs"),
  path.join(REPO_ROOT, "package.json"),
];

/**
 * Newest mtime (ms since epoch) among `inputPath` and, if it is a directory,
 * every file and subdirectory beneath it, recursively. A directory's own
 * mtime is included alongside its contents, since renaming/removing an entry
 * bumps the directory's mtime even when no file's own mtime changes.
 *
 * @param inputPath - Absolute path to a file or directory.
 * @returns The newest mtime found, in milliseconds since epoch.
 */
export function newestMtimeMsRecursive(inputPath) {
  const stat = fs.statSync(inputPath);
  if (!stat.isDirectory()) {
    return stat.mtimeMs;
  }
  let newest = stat.mtimeMs;
  for (const entry of fs.readdirSync(inputPath)) {
    const childNewest = newestMtimeMsRecursive(path.join(inputPath, entry));
    newest = Math.max(newest, childNewest);
  }
  return newest;
}

/**
 * Pure staleness decision: given the dist bundle's mtime (or null when
 * dist/index.html does not exist) and the newest mtime among the tracked
 * source inputs (plus a label identifying which input that was, for the log
 * line), decide whether a rebuild is required.
 *
 * @param distMtimeMs - mtime of dist/index.html in ms, or null if absent.
 * @param sourceMtimeMs - Newest mtime among BUILD_SOURCE_INPUTS, in ms.
 * @param sourceLabel - Path of the input that produced sourceMtimeMs, for the log.
 * @returns `{ stale, reason }`.
 */
export function decideDistStaleness(distMtimeMs, sourceMtimeMs, sourceLabel) {
  if (distMtimeMs === null) {
    return { stale: true, reason: "dist/index.html is missing" };
  }
  if (sourceMtimeMs > distMtimeMs) {
    return { stale: true, reason: `${sourceLabel} is newer than dist/index.html` };
  }
  return { stale: false, reason: "dist/index.html is newer than every tracked source input" };
}

/**
 * Newest mtime across every entry in BUILD_SOURCE_INPUTS, plus which entry
 * produced it (for the staleness log line).
 *
 * @returns `{ mtimeMs, label }`.
 */
function newestSourceMtime() {
  let newest = -Infinity;
  let newestLabel = null;
  for (const input of BUILD_SOURCE_INPUTS) {
    const mtimeMs = newestMtimeMsRecursive(input);
    if (mtimeMs > newest) {
      newest = mtimeMs;
      newestLabel = input;
    }
  }
  return { mtimeMs: newest, label: newestLabel };
}

/**
 * Build the production bundle into dist/ via the canonical build script,
 * but only when dist/ is stale: dist/index.html is missing, or older than
 * the newest mtime among BUILD_SOURCE_INPUTS. build_github_pages.sh always
 * wipes and rebuilds dist/ from scratch, so a stale partial dist/ is never
 * left half-built by a skip.
 */
export function buildSiteIfStale() {
  const indexPath = path.join(DIST_DIR, "index.html");
  const distMtimeMs = fs.existsSync(indexPath) ? fs.statSync(indexPath).mtimeMs : null;
  const { mtimeMs: sourceMtimeMs, label: sourceLabel } = newestSourceMtime();
  const decision = decideDistStaleness(distMtimeMs, sourceMtimeMs, sourceLabel);
  if (!decision.stale) {
    console.log(`==> dist fresh, skipping build (${decision.reason})`);
    return;
  }
  console.log(`==> dist stale (${decision.reason}), rebuilding`);
  execFileSync("bash", [path.join(REPO_ROOT, "build_github_pages.sh")], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
}

//============================================
/**
 * Start a minimal static file server for dist/ on a random loopback port.
 *
 * @returns The listening server and its assigned port.
 */
export async function startServer() {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    const rawPath = decodeURIComponent(requestUrl.pathname);
    const relPath = rawPath === "/" ? "index.html" : rawPath.replace(/^\/+/, "");
    const filePath = path.join(DIST_DIR, relPath);
    // Reject any path that escapes dist/ (path traversal guard).
    if (!filePath.startsWith(DIST_DIR)) {
      res.writeHead(403);
      res.end("forbidden");
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      const contentType = MIME_TYPES[path.extname(filePath)] ?? "application/octet-stream";
      res.writeHead(200, { "content-type": contentType });
      res.end(data);
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("static server did not bind a numeric port");
  }
  console.log(`==> serving dist/ on 127.0.0.1:${address.port}`);
  return { server, port: address.port };
}

//============================================
/**
 * Launch a headless Chromium browser via playwright-core.
 *
 * @returns The launched browser instance.
 */
export async function launchBrowser() {
  return chromium.launch({ headless: true });
}

/**
 * Fail-fast default timeout applied to every walker page (page.setDefaultTimeout),
 * so a stray selector wait against a control the current phase no longer
 * renders (the auction role-button-after-tick-0 hang that used to eat
 * Playwright's ~30s default actionability timeout) fails in seconds instead.
 * Every walker waitForSelector/waitForFunction call that needs a longer
 * budget already passes its own explicit `timeout` option (audited across
 * tests/e2e/*.mjs), so this default only ever governs the unbounded calls
 * that were never meant to wait long in the first place.
 */
const PAGE_DEFAULT_TIMEOUT_MS = 2_000;

//============================================
/**
 * Ensure a directory exists, creating parents as needed.
 *
 * @param dirPath - Absolute path of the directory to create.
 */
export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

//============================================
/**
 * Whether a selector currently resolves to a visible element. Phase-agnostic:
 * used by any caller polling for a live control regardless of which phase it
 * belongs to.
 *
 * @param page - The Playwright page.
 * @param selector - CSS selector to test.
 * @returns True when at least one matching element is visible.
 */
export async function isVisible(page, selector) {
  const handle = await page.$(selector);
  if (handle === null) {
    return false;
  }
  return handle.isVisible().catch(() => false);
}

/**
 * Bounded wait clickIfPresent allows Playwright's click() before giving up.
 * Short relative to Playwright's default ~30s actionability timeout, so a
 * control that stops being actionable between the presence check and the
 * click itself (a role/intent panel that unmounts every tick after tick 0;
 * see auction_role's tick-0-only render in scene_manager.ts) fails fast
 * instead of hanging the whole auction-tick loop for 30s while a bare
 * `.catch` silently swallows the eventual rejection -- the exact bug shape
 * this helper exists to prevent.
 */
const CLICK_TIMEOUT_MS = 1000;

//============================================
/**
 * Click a selector only if it currently resolves to a visible element,
 * documenting the "safe to miss" contract every walkthrough gesture click
 * relies on: a missing/not-yet-rendered control (the target state already
 * changed, a role/intent button not mounted this tick) is a normal, silent
 * no-op, never a report.fail. Resolves one element handle and reuses it for
 * both the visibility check and the click (rather than re-querying the
 * selector), so the presence check and the click target the same DOM node
 * and the click() call itself is bounded by CLICK_TIMEOUT_MS -- closing the
 * gap where the element could vanish between a separate check and a
 * default-timeout click. A click that DOES find the element but then
 * rejects (detached mid-click within the bounded wait, occluded, navigated
 * away) is a real signal worth surfacing, so it is logged via
 * report.log("warn", ...) with the selector and reason instead of being
 * swallowed identically.
 *
 * @param page - The Playwright page.
 * @param selector - CSS selector to click if present.
 * @param report - The walk report (see walkthrough_report.mjs), for the warn log.
 * @returns True once the click succeeded, false when the element was absent,
 *   not visible, or the click itself rejected (including a timeout).
 */
export async function clickIfPresent(page, selector, report) {
  const handle = await page.$(selector);
  if (handle === null) {
    return false;
  }
  const visible = await handle.isVisible().catch(() => false);
  if (!visible) {
    return false;
  }
  return handle
    .click({ timeout: CLICK_TIMEOUT_MS })
    .then(() => true)
    .catch((error) => {
      const reason = error instanceof Error ? error.message : String(error);
      report.log("warn", `clickIfPresent: click failed on "${selector}"`, { selector, reason });
      return false;
    });
}

//============================================
/**
 * Wait until `window.muleGameState` is installed on the page, so the caller
 * never polls the projection before game_driver.ts has wired it up.
 *
 * @param page - The Playwright page.
 * @param timeoutMs - How long to wait before giving up.
 */
export async function waitForMuleGameState(page, timeoutMs = 30_000) {
  await page.waitForFunction(() => typeof window.muleGameState === "function", null, {
    timeout: timeoutMs,
  });
}

//============================================
/**
 * Read the current walker projection off the live page.
 *
 * @param page - The Playwright page.
 * @returns The `WalkerProjection` object (see src/ui/walker_debug.ts).
 */
export async function readGameState(page) {
  return page.evaluate(() => window.muleGameState());
}

//============================================
/**
 * Drive the launch bootstrap: navigate to the seeded/mode/speed URL, clear
 * localStorage (so a saved game from a prior run cannot short-circuit New
 * Game into Resume), reload, click New Game, and wait for both the game
 * screen and `window.muleGameState` to become available.
 *
 * `window.muleGameState` is installed by game_driver.ts only once a
 * GameStore exists (on New Game or Resume; see src/ui/game_driver.ts's
 * createAutosavingStore), so it is never present at the bare title screen --
 * the wait for it belongs after the New Game click, not before.
 *
 * @param page - The Playwright page.
 * @param baseUrl - The origin the site is served from.
 * @param options - `{ seed, mode, speed }` URL parameters.
 */
export async function bootstrapGame(page, baseUrl, { seed, mode, speed }) {
  page.setDefaultTimeout(PAGE_DEFAULT_TIMEOUT_MS);
  const url = `${baseUrl}/?seed=${seed}&mode=${mode}&speed=${speed}`;
  await page.goto(url);

  // Clear any saved game left over from a previous run so New Game always
  // starts a fresh game instead of falling back to Resume.
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  await page.click("#new-game-button");
  await page.waitForSelector("#screen-game.active", { state: "visible", timeout: 30_000 });
  await waitForMuleGameState(page);
}

//============================================
/**
 * Save a full-page screenshot into the screenshots directory, creating the
 * directory first if needed.
 *
 * @param page - The Playwright page.
 * @param screenshotsDir - Absolute directory to save the screenshot into.
 * @param fileName - File name (including extension) for the screenshot.
 */
export async function saveScreenshot(page, screenshotsDir, fileName) {
  ensureDir(screenshotsDir);
  await page.screenshot({ path: path.join(screenshotsDir, fileName) });
}

/** Default wall-clock budget for actAndWaitProgress's post-act poll. */
const DEFAULT_ACT_PROGRESS_BUDGET_MS = 5_000;

/** Default poll delay for actAndWaitProgress's post-act poll. */
const DEFAULT_ACT_PROGRESS_POLL_MS = 100;

//============================================
/**
 * Generic act-and-wait-for-progress helper: snapshot a small piece of live
 * state, perform an action (a click or keypress), then poll the same
 * snapshot until it changes or the budget expires. A snapshot that never
 * changes means the action did not do anything (a detached button, a plan
 * whose precondition already stopped holding, a UI bug), so this reports
 * `report.fail(failureKind, failureMessage)` rather than looping forever.
 * Comparison is by `JSON.stringify` equality, which suits the small
 * plain-data snapshots (projection field subsets) every caller passes.
 *
 * @param page - The Playwright page (or any object exposing `waitForTimeout`).
 * @param report - The walk report (see walkthrough_report.mjs), for `fail()`.
 * @param options - `{ snapshot(page), act(), failureKind, failureMessage,
 *   budgetMs, pollIntervalMs }`. `snapshot` and `act` are required; the rest
 *   default to DEFAULT_ACT_PROGRESS_BUDGET_MS / DEFAULT_ACT_PROGRESS_POLL_MS.
 * @returns True once the snapshot changed, false if the budget expired.
 */
export async function actAndWaitProgress(page, report, options) {
  const {
    snapshot,
    act,
    failureKind,
    failureMessage,
    budgetMs = DEFAULT_ACT_PROGRESS_BUDGET_MS,
    pollIntervalMs = DEFAULT_ACT_PROGRESS_POLL_MS,
  } = options;
  const before = JSON.stringify(await snapshot(page));
  await act();
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const current = JSON.stringify(await snapshot(page));
    if (current !== before) {
      return true;
    }
    await page.waitForTimeout(pollIntervalMs);
  }
  report.fail(failureKind, failureMessage);
  return false;
}

//============================================
/**
 * Poll `window.muleGameState().phaseKind` until it matches the requested
 * phase or the deadline passes.
 *
 * @param page - The Playwright page.
 * @param phaseKind - The phase kind to wait for (e.g. "land_grant").
 * @param timeoutMs - How long to poll before giving up.
 * @param pollIntervalMs - Delay between polls.
 * @returns True once the phase is reached, false if the deadline passed.
 */
export async function waitForPhaseKind(page, phaseKind, timeoutMs, pollIntervalMs = 100) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const projection = await readGameState(page);
    if (projection.phaseKind === phaseKind) {
      return true;
    }
    await page.waitForTimeout(pollIntervalMs);
  }
  return false;
}

//============================================
// Spatial walking section.
//
// Selector audit -- every spatial target the walk drivers below need already
// carries a durable data-* hook in the scene source, so this section adds NO
// attributes to src/ui; it only reads them. Re-audited 2026-07-11 against
// src/ui/scenes/town_scene.tsx, src/ui/scenes/town_scene_render.tsx, and
// src/ui/scenes/overworld_scene.tsx:
//
//   target            selector                                        present
//   ----------------- ----------------------------------------------- -------
//   town doors        [data-door-for="<door>"]                        yes
//   town buildings    [data-building="<name>"]                        yes
//   town edge exits   [data-exit="<edge>"]                            yes
//   town avatar       #town-scene [data-actor="player-0"]             yes
//     at-door          ...same node... [data-at-door]                 RETIRED
//     avatar x/y       ...same node... [data-town-avatar-x]/[-y]      yes
//     carrying         ...same node... [data-carrying]                yes
//   overworld avatar  .overworld-svg [data-actor="player-0"]          yes
//     cell row/col     ...same node... [data-cell-row]/[data-cell-col] yes
//     carrying         ...same node... [data-carrying]                yes
//   pub payout banner [data-pub-banner] (appended to document.body)   yes
//
// data-at-door was retired from town_scene.tsx during the town rebuild; it is
// no longer a live attribute and this module no longer reads it. Both avatar
// nodes carry an imperatively-written `transform` (translate x y) rewritten
// every rAF frame while moving (town_scene.tsx and overworld_scene.tsx
// `writeTransforms`). That transform, not a coarse per-cell attribute, is the
// fine-grained per-tap movement signal the stall detector below watches: it
// changes on every moving tap, so N taps with an unchanged transform is a
// genuine stall (a wall, a frozen scene, a dropped keypress) rather than the
// avatar merely walking between two doors.
//============================================

/** Overworld avatar node carrying data-cell-row/col and data-carrying. */
export const OVERWORLD_AVATAR = ".overworld-svg [data-actor='player-0']";

/** Town-interior avatar node carrying data-town-avatar-x/-y and data-carrying. */
export const TOWN_AVATAR = "#town-scene [data-actor='player-0']";

/** Upper bound on bounded taps before a walk gives up (matches the specs). */
export const MAX_WALK_TAPS = 60;

/**
 * Consecutive taps with an unchanged avatar snapshot that classify a walk as
 * stalled. Several taps of zero movement -- long enough that a slow attribute
 * read or a lone frame-starved short tap never trips it, short enough that a
 * genuinely stuck walk ends quickly instead of burning the whole tap budget.
 */
const STALL_TAPS = 8;

/**
 * Real-ms hold a walk tap halves down to when correcting an overshoot (see
 * seekAvatarToTarget). Derived for about a quarter-cell of travel so the
 * correction lands inside the target door's cell, and (like every derived tap)
 * clamped up to the frame-safe floor so the halving can never shrink a
 * correction below a tap that still moves the avatar. Sharing the speed-aware
 * seam keeps it in step with WALK_TAP_MS if the base speed is retuned again.
 */
const MIN_WALK_TAP_MS = tapMsForStepPx(WALKER_CELL_PX / 4);

//============================================
/**
 * Pick the arrow key that steps one cell from `current` toward `target` on the
 * overworld grid (row increases downward, col increases rightward). Columns are
 * resolved before rows, so the walk zig-zags one axis at a time. Returns null
 * when already on the target cell.
 *
 * @param current - `{ row, col }` of the avatar's current cell.
 * @param target - `{ row, col }` of the destination cell.
 * @returns An arrow-key name, or null when current already equals target.
 */
export function directionToward(current, target) {
  if (target.col > current.col) {
    return "ArrowRight";
  }
  if (target.col < current.col) {
    return "ArrowLeft";
  }
  if (target.row > current.row) {
    return "ArrowDown";
  }
  if (target.row < current.row) {
    return "ArrowUp";
  }
  return null;
}

//============================================
/**
 * Advance the avatar with ONE bounded tap: hold `key` for `tapMs` of real time,
 * then release. Bounding each tap keeps every subsequent predicate/snapshot
 * check a stationary read -- the avatar can only move for `tapMs` between
 * checks, well under one cell, so a slow read never lets it sail past a target
 * untouched (see town_scene.spec.mjs's `useDoor` doc comment).
 *
 * @param page - The Playwright page.
 * @param key - Arrow key to hold (e.g. "ArrowRight").
 * @param tapMs - Real-ms hold duration for this tap.
 */
async function tapWalk(page, key, tapMs) {
  await page.keyboard.down(key);
  await page.waitForTimeout(tapMs);
  await page.keyboard.up(key);
}

//============================================
/**
 * Read the overworld avatar's current grid cell, or null when the node is not
 * mounted or not yet carrying cell attributes. Resolves the node fresh each
 * call so a scene remount never leaves a stale handle.
 *
 * @param page - The Playwright page.
 * @param selector - Avatar selector carrying data-cell-row/col.
 * @returns `{ row, col }` numeric cell, or null.
 */
async function readAvatarCell(page, selector) {
  const handle = await page.$(selector);
  if (handle === null) {
    return null;
  }
  const row = await handle.getAttribute("data-cell-row");
  const col = await handle.getAttribute("data-cell-col");
  if (row === null || col === null) {
    return null;
  }
  return { row: Number(row), col: Number(col) };
}

//============================================
/**
 * Snapshot the avatar's movement-bearing attributes into one comparable string:
 * the per-frame `transform` plus the coarse door/cell/carry attributes. Any
 * change between two snapshots means the avatar made progress this tap; an
 * identical snapshot across taps is what the stall detector counts. A detached
 * node returns the sentinel "gone" (a scene unmount is progress, never a
 * stall). Resolves the node fresh each call so a remount cannot stale-read.
 *
 * @param page - The Playwright page.
 * @param selector - Avatar selector to snapshot.
 * @returns A joined attribute string, or "gone" when the node is absent.
 */
async function snapshotAvatar(page, selector) {
  const handle = await page.$(selector);
  if (handle === null) {
    return "gone";
  }
  const [transform, row, col, carrying] = await Promise.all([
    handle.getAttribute("transform"),
    handle.getAttribute("data-cell-row"),
    handle.getAttribute("data-cell-col"),
    handle.getAttribute("data-carrying"),
  ]);
  return [transform, row, col, carrying].join("|");
}

//============================================
/**
 * Generalized bounded-tap walk: tap the avatar in a direction until `predicate`
 * holds, giving up after `budget` taps. This is the single walk primitive the
 * spatial drivers share, generalized from town_scene.spec.mjs's `useDoor` and
 * pub_gamble.spec.mjs's `walkToDoor` bounded-tap loops.
 *
 * `dir` is either a fixed arrow-key name (constant heading, e.g. walk east
 * until the town mounts) or a direction-provider `(page) => Promise<string |
 * null>` that recomputes the heading each tap from the avatar's live position
 * (overworld pathing toward a target cell via `directionToward`). A provider
 * returning null (nowhere left to step, yet the predicate still fails) counts
 * as a stalled tap so an unreachable target still ends the walk.
 *
 * Stall detection: `options.stallTaps` consecutive taps with no change in the
 * avatar snapshot (`snapshotAvatar`) classify the walk as stalled. When
 * `options.report` is supplied, the stall is recorded as `report.fail(
 * "walk_stall", ...)`; either way the walk returns false. Every wait here is
 * state-based (a predicate/snapshot read between bounded taps), never a bare
 * sleep waiting for motion to "probably" finish.
 *
 * @param page - The Playwright page.
 * @param scope - Avatar selector to snapshot for stall detection.
 * @param predicate - `(page) => Promise<boolean>` arrival test, checked before
 *   each tap and once more after the budget is spent.
 * @param dir - A fixed arrow-key name, or a `(page) => Promise<string | null>`
 *   direction provider.
 * @param budget - Max taps before giving up (default MAX_WALK_TAPS).
 * @param options - `{ report, tapMs, stallTaps, failureMessage }`; all optional.
 * @returns True once the predicate held, false on stall or budget exhaustion.
 */
export async function walkTo(page, scope, predicate, dir, budget = MAX_WALK_TAPS, options = {}) {
  const { report, tapMs = WALK_TAP_MS, stallTaps = STALL_TAPS, failureMessage } = options;
  let stall = 0;
  for (let tap = 0; tap < budget; tap++) {
    if (await predicate(page)) {
      return true;
    }
    const key = typeof dir === "function" ? await dir(page) : dir;
    if (key === null) {
      // Provider has no step to offer but the predicate still fails: count it
      // as a stalled tap so an unreachable target ends rather than spins.
      stall += 1;
    } else {
      const before = await snapshotAvatar(page, scope);
      await tapWalk(page, key, tapMs);
      const after = await snapshotAvatar(page, scope);
      stall = after === before ? stall + 1 : 0;
    }
    if (stall >= stallTaps) {
      if (report !== undefined) {
        const headed = typeof dir === "function" ? "provider" : dir;
        const detail =
          failureMessage ??
          `walk stalled: ${stallTaps} taps with no avatar movement (scope ${scope}, heading ${headed})`;
        report.fail("walk_stall", detail);
      }
      return false;
    }
  }
  return await predicate(page);
}

//============================================
/**
 * Shared overshoot-correcting seek core behind walkTownAvatarNorthUntil (a
 * fixed one-axis heading) and walkOverworldAvatarToCell (2D). Each tap
 * re-samples the avatar (arrival flag plus a position, via `spec.sample`),
 * turns that position into a candidate step (arrow key, seek axis, sign
 * toward target, via `spec.computeStep`), and taps: a step that crosses the
 * target on its axis since the last committed step means the previous tap
 * overshot, so the tap is halved (down to `minTapMs`) so the correction lands
 * inside the target cell/door; switching axis restarts the tap at full
 * length, since the new axis gets its own overshoot budget. A null step
 * (nothing left to steer toward an unreachable or already-aligned-but-
 * unarrived target) counts as a stalled tap rather than spinning forever.
 *
 * Stall detection: `stallTaps` consecutive taps with no change in the avatar
 * snapshot (a wall, a frozen scene, a dropped keypress) classify the walk as
 * stalled via `report.fail("walk_stall", ...)`. A vanished avatar node (walked
 * out an edge, or a scene remount) is a reported failure the moment `sample`
 * reports it, not a silent spin against a torn-down scene.
 *
 * @param page - The Playwright page.
 * @param report - The walk report, for walk_stall classification (optional).
 * @param spec - `{ avatarSelector, budget, tapMs, stallTaps, minTapMs, sample,
 *   computeStep, vanishDetail, stallDetail }`.
 *   `sample()` is `async () => { arrived: true } | { vanished: true } |
 *   { position }`, called once per tap (and once more after the budget is
 *   spent).
 *   `computeStep(position)` returns `{ key, axis, side } | null`; `axis`
 *   distinguishes the overshoot-halving state across seek dimensions (a fixed
 *   one-axis caller uses one constant axis; 2D callers use "row"/"col").
 * @returns True once `sample` reports arrived, false on stall/budget/vanish.
 */
async function seekAvatarToTarget(page, report, spec) {
  const {
    avatarSelector,
    budget = MAX_WALK_TAPS,
    tapMs = WALK_TAP_MS,
    stallTaps = STALL_TAPS,
    minTapMs = MIN_WALK_TAP_MS,
    sample,
    computeStep,
    vanishDetail,
    stallDetail,
  } = spec;
  const failStall = (detail) => {
    if (report !== undefined) {
      report.fail("walk_stall", detail);
    }
  };
  let currentTap = tapMs;
  // The axis sought on the previous committed step, and the sign of
  // (target - position) along it; both reset when the seek switches axes.
  let priorAxis = null;
  let priorSide = 0;
  let stall = 0;
  for (let tap = 0; tap < budget; tap++) {
    const state = await sample();
    if (state.arrived) {
      return true;
    }
    if (state.vanished) {
      failStall(vanishDetail);
      return false;
    }
    const step = computeStep(state.position);
    if (step === null) {
      // Nothing left to steer toward (aligned but unarrived, or unreachable):
      // count a stalled tap so the walk ends rather than spins. Clearing
      // priorAxis makes the next real step reset its own overshoot state.
      priorAxis = null;
      stall += 1;
    } else {
      const { key, axis, side } = step;
      if (axis !== priorAxis) {
        // Switched axis (the prior axis is now aligned, or a detour turned a
        // corner): the new axis gets a full-length first step, and taking this
        // branch skips the overshoot-halving below for its first step.
        currentTap = tapMs;
      } else if (priorSide !== 0 && side !== priorSide) {
        // Crossed the target on this axis since the last step means the
        // previous tap overshot the target; halve the tap so the correction
        // lands inside it.
        currentTap = Math.max(minTapMs, Math.floor(currentTap / 2));
      }
      priorAxis = axis;
      priorSide = side;
      const before = await snapshotAvatar(page, avatarSelector);
      await tapWalk(page, key, currentTap);
      const after = await snapshotAvatar(page, avatarSelector);
      stall = after === before ? stall + 1 : 0;
    }
    if (stall >= stallTaps) {
      failStall(stallDetail);
      return false;
    }
  }
  const finalState = await sample();
  if (finalState.arrived) {
    return true;
  }
  failStall(stallDetail);
  return false;
}

//============================================
// Town door x-alignment in WORLD coordinates (the mode-composed street model).
//
// The town executors (walkthrough_town.mjs) DISCOVER the active street from
// src/ui/scenes/town_world.ts and pass a target door's composed WORLD center x
// here. Alignment reads the camera-independent data-town-avatar-x attribute
// town_scene.tsx writes each frame, so the seek never touches the camera offset.
//
// A door's walk-in only fires when the avatar CENTER sits within
// (TOWN_DOOR_WIDTH / 2 - TOWN_AVATAR_RADIUS) world px of the door center --
// outside that the door jambs wall off the north push. That entry window is far
// tighter than an overworld cell, so this seek uses GAP-PROPORTIONAL taps (each
// tap's hold shrinks with the remaining gap, the proven town_street.spec.mjs /
// pub_gamble.spec.mjs pattern) that converge on the narrow window instead of
// fixed-length taps that overshoot it. Tap bounds and the arrival tolerance are
// DERIVED from the composed door geometry and the effective walk speed. Locked
// as of 2026-07-10: spacing stayed unchanged, so the derived bounds are final
// at the current town geometry; door-reach measured 100% (beginner 25/25,
// standard 30/30, +-8 px window, zero stalls) at the calibrated speed.
//============================================

/**
 * World-px half-window the avatar center must reach around a door center to push
 * north through the door, less a small margin so a converged seek is clear of
 * the jambs. Derived from town geometry (TOWN_DOOR_WIDTH, TOWN_AVATAR_RADIUS),
 * never a hand-set pixel count. This is the source of truth for the door
 * alignment tolerance; tests/playwright/pub_gamble.spec.mjs and
 * tests/playwright/town_street.spec.mjs run against built HTML over HTTP and
 * cannot import this module, so they each carry their own bare `8`-px
 * constant naming this export as its source. Update this value and the two
 * spec constants together.
 */
export const TOWN_DOOR_ALIGN_TOLERANCE_PX = Math.max(
  2,
  TOWN_DOOR_WIDTH / 2 - TOWN_AVATAR_RADIUS - 2,
);

/**
 * Longest per-tap hold the door x-seek uses far from the target, derived so one
 * tap covers about a door width: long enough to close a big gap quickly, short
 * enough that a single tap cannot sail the avatar clear past a whole facade and
 * out an edge exit. Locked as of 2026-07-10 at the current town geometry.
 */
const DOOR_SEEK_MAX_TAP_MS = tapMsForStepPx(TOWN_DOOR_WIDTH);

/**
 * Shortest per-tap hold the door x-seek shrinks to near the target, derived so
 * one tap travels a little under twice the alignment tolerance: small enough that
 * the near-target overshoot lands back inside the tolerance window (so the seek
 * converges instead of oscillating), yet not so short that a sub-frame tap
 * routinely fails to move the avatar at all. Computed WITHOUT the frame-safe
 * floor tapMsForStepPx applies (that 20ms floor's travel would exceed the narrow
 * window at speed), then floored at a small reliable-motion minimum.
 * Locked as of 2026-07-10 at the current town geometry.
 */
const DOOR_SEEK_MIN_TAP_MS = Math.max(
  10,
  Math.round(((2 * TOWN_DOOR_ALIGN_TOLERANCE_PX - 2) / EFFECTIVE_WALK_SPEED_PX_PER_SEC) * 1000),
);

//============================================
/**
 * Read the town avatar's live WORLD x from the camera-independent
 * data-town-avatar-x attribute (town_scene.tsx writeTransforms), or null when
 * the avatar node is unmounted (walked out an exit, scene torn down). Resolves
 * the node fresh each call so a remount never stale-reads.
 *
 * @param page - The Playwright page.
 * @returns The avatar center's world x, or null when the node is absent.
 */
async function readTownAvatarWorldX(page) {
  const handle = await page.$(TOWN_AVATAR);
  if (handle === null) {
    return null;
  }
  const raw = await handle.getAttribute("data-town-avatar-x");
  if (raw === null) {
    return null;
  }
  const x = Number(raw);
  return Number.isNaN(x) ? null : x;
}

//============================================
/**
 * Read the town avatar's live WORLD y from data-town-avatar-y, the 2D twin of
 * readTownAvatarWorldX. Exported because walkBackToStreet (walkthrough_town.mjs)
 * needs a world y to tell "back on the street lane" from "still in the doorway".
 *
 * @param page - The Playwright page.
 * @returns The avatar center's world y, or null when the node is absent.
 */
export async function readTownAvatarWorldY(page) {
  const handle = await page.$(TOWN_AVATAR);
  if (handle === null) {
    return null;
  }
  const raw = await handle.getAttribute("data-town-avatar-y");
  if (raw === null) {
    return null;
  }
  const y = Number(raw);
  return Number.isNaN(y) ? null : y;
}

//============================================
/**
 * Walk the town avatar along the street lane until its world x is within
 * `tolerancePx` of `targetX` (a composed door center), seeking by live world
 * position so an overshoot self-corrects. Each tap heads whichever way currently
 * closes the gap and holds for a duration proportional to the remaining distance
 * (clamped to [DOOR_SEEK_MIN_TAP_MS, DOOR_SEEK_MAX_TAP_MS]), so a fast walker
 * converges on the narrow door-entry window instead of overshooting it every
 * tap. Pure horizontal taps never cross a threshold notch (that needs a north
 * push), so this cannot fire a walk-in while it aligns. A vanished avatar (walked
 * out an exit) or `stallTaps` consecutive no-move taps report a walk_stall.
 *
 * @param page - The Playwright page.
 * @param report - The walk report, for walk_stall classification (optional).
 * @param targetX - The target door center's world x (composed doorCenterX).
 * @param options - `{ budget, stallTaps, tolerancePx }`, all optional.
 * @returns True once aligned within tolerance, false on stall/budget/exit.
 */
export async function walkTownAvatarToDoorX(page, report, targetX, options = {}) {
  const {
    budget = MAX_WALK_TAPS,
    stallTaps = STALL_TAPS,
    tolerancePx = TOWN_DOOR_ALIGN_TOLERANCE_PX,
  } = options;
  const failStall = (detail) => {
    if (report !== undefined) {
      report.fail("walk_stall", detail);
    }
  };
  const aligned = (x) => x !== null && Math.abs(targetX - x) <= tolerancePx;
  let stall = 0;
  for (let tap = 0; tap < budget; tap++) {
    const avatarX = await readTownAvatarWorldX(page);
    if (avatarX === null) {
      failStall(`town avatar left the street before aligning to the door at x=${targetX}`);
      return false;
    }
    if (aligned(avatarX)) {
      return true;
    }
    const remaining = targetX - avatarX;
    // Hold proportional to the remaining gap so the tap shrinks as the avatar
    // closes on the target, then clamp to the derived door-seek bounds.
    const proportionalMs = Math.round(
      (Math.abs(remaining) / EFFECTIVE_WALK_SPEED_PX_PER_SEC) * 1000,
    );
    const tapMs = Math.min(DOOR_SEEK_MAX_TAP_MS, Math.max(DOOR_SEEK_MIN_TAP_MS, proportionalMs));
    const key = remaining > 0 ? "ArrowRight" : "ArrowLeft";
    const before = await snapshotAvatar(page, TOWN_AVATAR);
    await tapWalk(page, key, tapMs);
    const after = await snapshotAvatar(page, TOWN_AVATAR);
    stall = after === before ? stall + 1 : 0;
    if (stall >= stallTaps) {
      failStall(
        `town avatar never aligned to the door at x=${targetX} (stalled ${stallTaps} taps)`,
      );
      return false;
    }
  }
  // A convergence that lands on the final tap still counts.
  if (aligned(await readTownAvatarWorldX(page))) {
    return true;
  }
  failStall(`town avatar never reached the door at x=${targetX} within ${budget} taps`);
  return false;
}

//============================================
/**
 * Walk the town avatar's world y to targetY (the composed street's lane
 * center), seeking by live position so an overshoot self-corrects -- the y-twin
 * of walkTownAvatarToDoorX. The walk-back after a panel interaction
 * (walkBackToStreet, walkthrough_town.mjs) used to be a plain one-way south
 * walk with a fixed tap sized off the retired grid's quarter-cell, which can
 * overshoot the lane by more than DOOR_OPEN_RADIUS_PX's vertical margin above
 * it (root-caused during triage: seed 1's "town door mining never
 * reported data-door-state=\"open\"" walk_stall -- the avatar had overshot
 * south of the lane by more than the open-radius margin, so the next door's
 * approach never registered within range). Converging on the lane instead of
 * a one-way "at least there" walk fixes this regardless of any single tap's
 * step size.
 *
 * @param page - The Playwright page.
 * @param report - The walk report, for walk_stall classification (optional).
 * @param targetY - The target world y (the composed street's streetLaneY).
 * @param options - `{ budget, stallTaps, tolerancePx }`, all optional.
 * @returns True once aligned within tolerance, false on stall/budget/exit.
 */
export async function walkTownAvatarToStreetLaneY(page, report, targetY, options = {}) {
  const {
    budget = MAX_WALK_TAPS,
    stallTaps = STALL_TAPS,
    tolerancePx = TOWN_DOOR_ALIGN_TOLERANCE_PX,
  } = options;
  const failStall = (detail) => {
    if (report !== undefined) {
      report.fail("walk_stall", detail);
    }
  };
  const aligned = (y) => y !== null && Math.abs(targetY - y) <= tolerancePx;
  let stall = 0;
  for (let tap = 0; tap < budget; tap++) {
    const avatarY = await readTownAvatarWorldY(page);
    if (avatarY === null) {
      failStall(`town avatar left the street before returning to the lane at y=${targetY}`);
      return false;
    }
    if (aligned(avatarY)) {
      return true;
    }
    const remaining = targetY - avatarY;
    // Hold proportional to the remaining gap, clamped to the same derived
    // door-seek bounds walkTownAvatarToDoorX uses, so this converges instead
    // of a fixed-length tap sailing past the lane.
    const proportionalMs = Math.round(
      (Math.abs(remaining) / EFFECTIVE_WALK_SPEED_PX_PER_SEC) * 1000,
    );
    const tapMs = Math.min(DOOR_SEEK_MAX_TAP_MS, Math.max(DOOR_SEEK_MIN_TAP_MS, proportionalMs));
    const key = remaining > 0 ? "ArrowDown" : "ArrowUp";
    const before = await snapshotAvatar(page, TOWN_AVATAR);
    await tapWalk(page, key, tapMs);
    const after = await snapshotAvatar(page, TOWN_AVATAR);
    stall = after === before ? stall + 1 : 0;
    if (stall >= stallTaps) {
      failStall(
        `town avatar never returned to the lane at y=${targetY} (stalled ${stallTaps} taps)`,
      );
      return false;
    }
  }
  // A convergence that lands on the final tap still counts.
  if (aligned(await readTownAvatarWorldY(page))) {
    return true;
  }
  failStall(`town avatar never returned to the lane at y=${targetY} within ${budget} taps`);
  return false;
}

//============================================
/**
 * Tap the town avatar north (into the buildings) until `arrived` reports that
 * a door's walk-in interaction fired, or the walk stalls/exhausts its budget.
 * town_scene.tsx's door model (docs/HUMAN_GUIDANCE.md "Town interaction
 * model") opens a door's panel the instant the avatar's center crosses the
 * inner-threshold entry line north of the street -- walking north through an
 * open doorway reaches it, so this is a plain northward press toward that line,
 * not a seek toward a known pixel target (the entry line's y lives in
 * town_collision.ts's townDoorAtThreshold and this harness does not duplicate
 * town geometry). Reuses the shared `seekAvatarToTarget`
 * core purely for its bounded-tap, stall, and vanish handling: north
 * is always the correct heading here, so `computeStep` never needs the
 * overshoot-halving branch (there is nothing to overshoot toward).
 *
 * A caller wanting `walk_stall` reported for a genuine no-op interaction
 * should pass its own report-derived failure via the returned boolean rather
 * than `report` here, since a no-op still counts as a stall (the avatar's
 * attributes stop changing once it is flush against a wall or podium) but the
 * caller usually wants a more specific failureKind (see town executors).
 *
 * @param page - The Playwright page.
 * @param report - The walk report, for walk_stall classification (optional;
 *   pass undefined to let the caller report its own failureKind instead).
 * @param arrived - `() => Promise<boolean>` the caller's door-specific
 *   interaction-fired check (a data-carrying flip, a projection field, or the
 *   pub confirm affordance appearing).
 * @param options - `{ budget, tapMs, stallTaps, minTapMs }`, all optional.
 * @returns True once `arrived` reports the interaction fired, false on
 *   stall/budget/vanish.
 */
export async function walkTownAvatarNorthUntil(page, report, arrived, options = {}) {
  const sample = async () => {
    if (await arrived()) {
      return { arrived: true };
    }
    if ((await page.$(TOWN_AVATAR)) === null) {
      return { vanished: true };
    }
    // No real target coordinate is tracked (see doc comment): the position
    // is a placeholder computeStep never inspects.
    return { position: 0 };
  };
  const computeStep = () => ({ key: "ArrowUp", axis: "y", side: -1 });
  return await seekAvatarToTarget(page, report, {
    ...options,
    avatarSelector: TOWN_AVATAR,
    sample,
    computeStep,
    vanishDetail: "town avatar vanished while pressing north into the door",
    stallDetail: "town avatar's north press into the door never triggered its interaction",
  });
}

//============================================
/**
 * Walk the overworld avatar to grid cell `target`, seeking one axis at a time
 * (columns before rows, per directionToward) off the avatar's live cell so an
 * overshoot self-corrects. This is the 2D twin of walkTownAvatarToDoorX: each tap
 * recomputes the heading from the avatar's live data-cell-row/col versus the
 * target cell, so a tap that sails past the target cell flips the heading and
 * walks back toward it -- unlike a fixed heading, which at the fast default speed
 * steps more than one cell per tap and oscillates around the target cell without
 * ever landing on it (the place_mule walk stall).
 *
 * Overshoot convergence, stall detection, and arrival semantics are owned by
 * the shared `seekAvatarToTarget` core; this wrapper supplies the 2D sampling
 * (the avatar's live data-cell-row/col) and stepping (heading each tap comes
 * from `options.nextStep(current)`, which defaults to a straight
 * `directionToward` step but lets a caller route around obstacles -- the place
 * walk injects firstStepAvoiding so it never steps onto the town cell, which
 * would re-enter the town scene and unmount the avatar). Movement is
 * axis-locked (walker.ts directionFromKeys with a single held key), so seeking
 * one axis never disturbs the already-aligned one.
 *
 * Arrival is the coarse data-cell-row/col equalling `target`, never a pixel
 * match.
 *
 * @param page - The Playwright page.
 * @param report - The walk report, for walk_stall classification (optional).
 * @param target - `{ row, col }` destination cell.
 * @param options - `{ budget, tapMs, stallTaps, minTapMs, failureMessage,
 *   nextStep }`, all optional. `failureMessage` overrides the walk_stall detail
 *   for the never-reached cases (a vanished avatar keeps its own specific
 *   message). `nextStep(current)` returns the arrow key for this tap, or null.
 * @returns True once the avatar's cell equals target, false on stall/budget/vanish.
 */
export async function walkOverworldAvatarToCell(page, report, target, options = {}) {
  const {
    failureMessage,
    nextStep = (current) => directionToward(current, target),
    ...rest
  } = options;
  const stallDetail =
    failureMessage ?? `overworld avatar never reached plot (${target.row}, ${target.col})`;
  const sample = async () => {
    const current = await readAvatarCell(page, OVERWORLD_AVATAR);
    if (current === null) {
      return { vanished: true };
    }
    if (current.row === target.row && current.col === target.col) {
      return { arrived: true };
    }
    return { position: current };
  };
  const computeStep = (current) => {
    const key = nextStep(current);
    if (key === null) {
      return null;
    }
    const axis = key === "ArrowLeft" || key === "ArrowRight" ? "col" : "row";
    const side =
      axis === "col" ? Math.sign(target.col - current.col) : Math.sign(target.row - current.row);
    return { key, axis, side };
  };
  return await seekAvatarToTarget(page, report, {
    ...rest,
    avatarSelector: OVERWORLD_AVATAR,
    sample,
    computeStep,
    vanishDetail: `overworld avatar vanished before reaching plot (${target.row}, ${target.col})`,
    stallDetail,
  });
}

//============================================
/**
 * Walk the overworld avatar into the town interior and confirm the town scene
 * mounted. By default the avatar heads a fixed direction (east, the proven
 * heading when the human owns the town's west neighbor -- seed 33); pass
 * `options.townCell` to instead path toward a known town cell via
 * `directionToward`. Arrival is verified by `#town-scene` becoming visible.
 *
 * @param page - The Playwright page.
 * @param report - The walk report, for `walk_stall` classification.
 * @param options - `{ dir, townCell, budget }`, all optional (dir default
 *   "ArrowRight").
 * @returns True once `#town-scene` is visible, false on stall/budget.
 */
export async function enterTown(page, report, options = {}) {
  const { dir = "ArrowRight", townCell, budget = MAX_WALK_TAPS } = options;
  const heading =
    townCell === undefined ? dir : (p) => provideOverworldDirection(p, OVERWORLD_AVATAR, townCell);
  return walkTo(page, OVERWORLD_AVATAR, (p) => isVisible(p, "#town-scene"), heading, budget, {
    report,
    failureMessage: "overworld avatar never reached the town cell to enter",
  });
}

//============================================
/**
 * Walk the town avatar into an edge exit and confirm the town scene unmounted
 * (back on the overworld). Exit direction defaults west ("ArrowLeft"), which
 * returns the avatar to the town's west-neighbor plot (the human's owned plot
 * on seed 33); pass `options.dir` for another edge. Arrival is verified by
 * `#town-scene` leaving the DOM, then the overworld avatar re-appearing so a
 * caller can immediately read its cell.
 *
 * @param page - The Playwright page.
 * @param report - The walk report, for `walk_stall` classification.
 * @param options - `{ dir, budget }`, both optional (dir default "ArrowLeft").
 * @returns True once the town unmounted and the overworld avatar is back.
 */
export async function exitTown(page, report, options = {}) {
  const { dir = "ArrowLeft", budget = MAX_WALK_TAPS } = options;
  const townGone = async (p) => (await p.$("#town-scene")) === null;
  const reached = await walkTo(page, TOWN_AVATAR, townGone, dir, budget, {
    report,
    failureMessage: "town avatar never reached an edge exit to leave town",
  });
  if (reached) {
    await page.waitForSelector(OVERWORLD_AVATAR, { state: "visible", timeout: 15_000 });
  }
  return reached;
}

//============================================
/**
 * Direction provider for overworld pathing: read the avatar's live cell and
 * return the arrow key stepping one cell toward `target`, or null when the
 * avatar is unmounted or already on the target cell.
 *
 * @param page - The Playwright page.
 * @param selector - Overworld avatar selector.
 * @param target - `{ row, col }` destination cell.
 * @returns An arrow-key name, or null.
 */
async function provideOverworldDirection(page, selector, target) {
  const current = await readAvatarCell(page, selector);
  if (current === null) {
    return null;
  }
  return directionToward(current, target);
}
