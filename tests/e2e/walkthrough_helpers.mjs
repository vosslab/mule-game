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

//============================================
// Realtime-walk calibration constants.
//
// MEASURED, not guessed: these are the winning row of the timing matrix in
// tests/e2e/e2e_walk_calibration.mjs. Regenerate with
// `node tests/e2e/e2e_walk_calibration.mjs`, which writes the full matrix to
// test-results/walker/calibration.json and prints the chosen row.
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
 * Real-ms hold duration of one bounded walk tap. Each tap holds an arrow key
 * this long, releases, then re-checks the avatar's door, so a slow attribute
 * read can never let the avatar sail past a door untouched.
 */
export const WALK_TAP_MS = 120;

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
// attributes to src/ui; it only reads them. Audited 2026-07-09 against
// src/ui/scenes/town_scene.tsx and src/ui/scenes/overworld_scene.tsx:
//
//   target            selector                                        present
//   ----------------- ----------------------------------------------- -------
//   town doors        [data-door-for="<door>"]                        yes
//   town buildings    [data-building="<name>"]                        yes
//   town edge exits   [data-exit="<edge>"]                            yes
//   town avatar       #town-scene [data-actor="player-0"]             yes
//     at-door          ...same node... [data-at-door]                 yes
//     carrying         ...same node... [data-carrying]                yes
//   overworld avatar  .overworld-svg [data-actor="player-0"]          yes
//     cell row/col     ...same node... [data-cell-row]/[data-cell-col] yes
//     carrying         ...same node... [data-carrying]                yes
//   pub payout banner [data-pub-banner] (appended to document.body)   yes
//
// Both avatar nodes also carry an imperatively-written `transform`
// (translate x y) rewritten every rAF frame while moving (town_scene.tsx and
// overworld_scene.tsx `writeTransforms`). That transform, not the coarse
// per-cell/at-door attributes, is the fine-grained per-tap movement signal the
// stall detector below watches: it changes on every moving tap, so N taps with
// an unchanged transform is a genuine stall (a wall, a frozen scene, a
// dropped keypress) rather than the avatar merely walking between two doors.
//============================================

/** Overworld avatar node carrying data-cell-row/col and data-carrying. */
export const OVERWORLD_AVATAR = ".overworld-svg [data-actor='player-0']";

/** Town-interior avatar node carrying data-at-door and data-carrying. */
export const TOWN_AVATAR = "#town-scene [data-actor='player-0']";

/** Upper bound on bounded taps before a walk gives up (matches the specs). */
const MAX_WALK_TAPS = 60;

/**
 * Consecutive taps with an unchanged avatar snapshot that classify a walk as
 * stalled. Eight taps at WALK_TAP_MS is roughly a second of zero movement --
 * long enough that a slow attribute read never trips it, short enough that a
 * genuinely stuck walk ends quickly instead of burning the whole tap budget.
 */
const STALL_TAPS = 8;

/**
 * Real-ms floor a walk tap shrinks to when correcting an overshoot (see
 * walkTownAvatarToDoor). Small enough that even the fast default speed steps
 * well under one street cell so the correction can land inside the target
 * door's cell, yet large enough that a headless rAF frame still samples the
 * held key (a sub-frame tap can be pressed and released between frames and
 * never move the avatar).
 */
const MIN_WALK_TAP_MS = 40;

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
 * Parse the x component out of an SVG `translate(x y)` transform -- the
 * per-frame center position town_scene.tsx / overworld_scene.tsx write on the
 * avatar node every rAF frame. Returns null for a null/absent/unrecognized
 * transform so a caller treats a missing avatar as "position unknown" rather
 * than fabricating a 0 that would read as the far-west edge.
 *
 * @param transform - The raw `transform` attribute value, or null.
 * @returns The numeric x translate, or null when it cannot be parsed.
 */
export function parseTranslateX(transform) {
  if (transform === null) {
    return null;
  }
  const match = transform.match(/translate\(\s*(-?[0-9.]+)/);
  if (match === null) {
    return null;
  }
  const x = Number(match[1]);
  return Number.isNaN(x) ? null : x;
}

//============================================
/**
 * The arrow key that steps the town avatar horizontally from `avatarX` toward
 * `targetX` (both in the town SVG's pixel space). Returns null when the avatar
 * is already aligned with the target column, so a caller reads arrival from the
 * coarse data-at-door attribute rather than an exact-pixel match. Unlike the
 * fixed heading a door's spawn-side would imply, this recomputes each tap from
 * the live position, so an overshoot past the target flips the returned key and
 * walks the avatar back toward the door.
 *
 * @param avatarX - The avatar center's current x in town pixel space.
 * @param targetX - The target door center's x in town pixel space.
 * @returns "ArrowRight", "ArrowLeft", or null when aligned.
 */
export function horizontalSeekKey(avatarX, targetX) {
  if (targetX > avatarX) {
    return "ArrowRight";
  }
  if (targetX < avatarX) {
    return "ArrowLeft";
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
  const [transform, atDoor, row, col, carrying] = await Promise.all([
    handle.getAttribute("transform"),
    handle.getAttribute("data-at-door"),
    handle.getAttribute("data-cell-row"),
    handle.getAttribute("data-cell-col"),
    handle.getAttribute("data-carrying"),
  ]);
  return [transform, atDoor, row, col, carrying].join("|");
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
 * Read the town avatar's live center x in town pixel space, or null when the
 * avatar node is unmounted (the avatar walked out an edge exit and the town
 * scene tore down). Resolves the node fresh each call so a remount never
 * stale-reads.
 *
 * @param page - The Playwright page.
 * @returns The avatar center's x, or null when the node is absent.
 */
async function readTownAvatarX(page) {
  const handle = await page.$(TOWN_AVATAR);
  if (handle === null) {
    return null;
  }
  return parseTranslateX(await handle.getAttribute("transform"));
}

//============================================
/**
 * Read the town door the avatar currently stands at (its data-at-door), or null
 * when the avatar node is absent. This coarse per-cell attribute is the arrival
 * signal a door walk waits on; the fine per-frame transform only steers.
 *
 * @param page - The Playwright page.
 * @returns The door id string, or null.
 */
async function readTownAtDoor(page) {
  const handle = await page.$(TOWN_AVATAR);
  if (handle === null) {
    return null;
  }
  return handle.getAttribute("data-at-door");
}

//============================================
/**
 * Read a town door marker's center x in town pixel space, or null when the
 * marker is not mounted. town_scene.tsx renders each door as a
 * `[data-door-for] <use x width>` in the same SVG user space the avatar's
 * transform lives in, so `x + width / 2` is the door center directly comparable
 * to the avatar's transform x -- no hardcoded cell geometry in the harness.
 *
 * @param page - The Playwright page.
 * @param door - The target [data-door-for] door id.
 * @returns The door center's x, or null when the marker is absent.
 */
async function readTownDoorCenterX(page, door) {
  const handle = await page.$(`[data-door-for='${door}'] use`);
  if (handle === null) {
    return null;
  }
  const x = await handle.getAttribute("x");
  const width = await handle.getAttribute("width");
  if (x === null || width === null) {
    return null;
  }
  const centerX = Number(x) + Number(width) / 2;
  return Number.isNaN(centerX) ? null : centerX;
}

//============================================
/**
 * Walk the town avatar along the single street row to `door`, seeking by live
 * position so an overshoot self-corrects. Each tap recomputes the heading from
 * the avatar's transform x versus the target door's center x
 * (`horizontalSeekKey`), so a tap that sails past the door flips the heading and
 * walks back toward it -- unlike a fixed spawn-side heading, which at the fast
 * default speed steps more than one cell per tap and sails clean past a
 * mid-street door and out the far edge (the counter-smithore walk stall).
 *
 * Overshoot convergence: when the avatar crosses the target's x since the last
 * committed step, the tap is halved (down to MIN_WALK_TAP_MS) so the correction
 * step is shorter than one street cell and lands inside the target door's cell,
 * where data-at-door finally reads the door. Arrival is that coarse attribute,
 * never an exact-pixel match, so the seek only accepts the requested door and
 * not a neighbor it happens to pass.
 *
 * Stall detection mirrors walkTo: `stallTaps` consecutive taps with no change in
 * the avatar snapshot (a wall, a frozen scene, a dropped keypress) classify the
 * walk as stalled via `report.fail("walk_stall", ...)`. A vanished avatar node
 * (walked out an edge before arriving) is likewise a reported failure, not a
 * silent spin against a torn-down scene.
 *
 * @param page - The Playwright page.
 * @param report - The walk report, for walk_stall classification (optional).
 * @param door - The target [data-door-for] door id.
 * @param options - `{ budget, tapMs, stallTaps, minTapMs }`, all optional.
 * @returns True once data-at-door reads the door, false on stall/budget/exit.
 */
export async function walkTownAvatarToDoor(page, report, door, options = {}) {
  const {
    budget = MAX_WALK_TAPS,
    tapMs = WALK_TAP_MS,
    stallTaps = STALL_TAPS,
    minTapMs = MIN_WALK_TAP_MS,
  } = options;
  const arrived = async () => (await readTownAtDoor(page)) === door;
  const failStall = (detail) => {
    if (report !== undefined) {
      report.fail("walk_stall", detail);
    }
  };
  // Already at the door: no walk (and no door geometry) needed. Checked before
  // resolving the marker so an already-arrived caller never depends on it.
  if (await arrived()) {
    return true;
  }
  // The street layout is static for the turn, so resolve the target once.
  const targetX = await readTownDoorCenterX(page, door);
  if (targetX === null) {
    failStall(`town door ${door} marker was not mounted to walk toward`);
    return false;
  }
  let currentTap = tapMs;
  // Sign of (targetX - avatarX) before the last committed step; 0 until the
  // first move, so an overshoot is only detected once a heading is established.
  let priorSide = 0;
  let stall = 0;
  for (let tap = 0; tap < budget; tap++) {
    if (await arrived()) {
      return true;
    }
    const avatarX = await readTownAvatarX(page);
    if (avatarX === null) {
      failStall(`town avatar left the street before reaching the ${door} door`);
      return false;
    }
    const side = Math.sign(targetX - avatarX);
    if (side === 0) {
      // Aligned in x yet not registered at the door: nothing left to steer, so
      // let the stall counter end the walk rather than spin in place.
      stall += 1;
    } else {
      // Crossing the target since the last step means the previous tap overshot
      // the door cell; halve the tap so the correction lands inside it.
      if (priorSide !== 0 && side !== priorSide) {
        currentTap = Math.max(minTapMs, Math.floor(currentTap / 2));
      }
      priorSide = side;
      const key = horizontalSeekKey(avatarX, targetX);
      const before = await snapshotAvatar(page, TOWN_AVATAR);
      await tapWalk(page, key, currentTap);
      const after = await snapshotAvatar(page, TOWN_AVATAR);
      stall = after === before ? stall + 1 : 0;
    }
    if (stall >= stallTaps) {
      failStall(`town avatar never reached the ${door} door`);
      return false;
    }
  }
  if (await arrived()) {
    return true;
  }
  failStall(`town avatar never reached the ${door} door`);
  return false;
}

//============================================
/**
 * Walk the overworld avatar to grid cell `target`, seeking one axis at a time
 * (columns before rows, per directionToward) off the avatar's live cell so an
 * overshoot self-corrects. This is the 2D twin of walkTownAvatarToDoor: each tap
 * recomputes the heading from the avatar's live data-cell-row/col versus the
 * target cell, so a tap that sails past the target cell flips the heading and
 * walks back toward it -- unlike a fixed heading, which at the fast default speed
 * steps more than one cell per tap and oscillates around the target cell without
 * ever landing on it (the place_mule walk stall).
 *
 * Overshoot convergence: when the avatar crosses the target on the axis it is
 * currently seeking, the tap is halved (down to minTapMs) so the correction step
 * is shorter than one cell and lands inside the target cell. Switching axes
 * (the sought axis is aligned, now seeking the other) restarts the tap at full
 * length, since the new axis gets its own overshoot budget. Movement is
 * axis-locked (walker.ts directionFromKeys with a single held key), so seeking
 * one axis never disturbs the already-aligned one.
 *
 * Heading each tap comes from `options.nextStep(current)`, which defaults to a
 * straight `directionToward` step but lets a caller route around obstacles (the
 * place walk injects firstStepAvoiding so it never steps onto the town cell,
 * which would re-enter the town scene and unmount the avatar). A null step with
 * the target not yet reached counts as a stalled tap, so an unreachable target
 * ends the walk instead of spinning.
 *
 * Arrival is the coarse data-cell-row/col equalling `target`, never a pixel
 * match. Stall detection mirrors walkTo/walkTownAvatarToDoor: `stallTaps`
 * consecutive taps with no change in the avatar snapshot classify the walk as
 * stalled via report.fail("walk_stall", ...). A vanished avatar node (scene
 * remount before arrival) is likewise a reported failure, not a silent spin.
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
    budget = MAX_WALK_TAPS,
    tapMs = WALK_TAP_MS,
    stallTaps = STALL_TAPS,
    minTapMs = MIN_WALK_TAP_MS,
    failureMessage,
    nextStep = (current) => directionToward(current, target),
  } = options;
  const stallDetail =
    failureMessage ?? `overworld avatar never reached plot (${target.row}, ${target.col})`;
  const failStall = (detail) => {
    if (report !== undefined) {
      report.fail("walk_stall", detail);
    }
  };
  let currentTap = tapMs;
  // The axis ("col"|"row") sought on the previous committed step, and the sign
  // of (target - current) along it; both reset when the seek switches axes.
  let priorAxis = null;
  let priorSide = 0;
  let stall = 0;
  for (let tap = 0; tap < budget; tap++) {
    const current = await readAvatarCell(page, OVERWORLD_AVATAR);
    if (current === null) {
      failStall(`overworld avatar vanished before reaching plot (${target.row}, ${target.col})`);
      return false;
    }
    if (current.row === target.row && current.col === target.col) {
      return true;
    }
    const key = nextStep(current);
    if (key === null) {
      // No step toward the target though not yet arrived (target unreachable, or
      // fully walled off): count a stalled tap so the walk ends rather than spins.
      // Clearing priorAxis makes the next real step reset its own overshoot state.
      priorAxis = null;
      stall += 1;
    } else {
      const axis = key === "ArrowLeft" || key === "ArrowRight" ? "col" : "row";
      const side =
        axis === "col" ? Math.sign(target.col - current.col) : Math.sign(target.row - current.row);
      if (axis !== priorAxis) {
        // Switched axis (the prior axis is now aligned, or a detour turned a
        // corner): the new axis gets a full-length first step, and taking this
        // branch skips the overshoot-halving below for its first step.
        currentTap = tapMs;
      } else if (priorSide !== 0 && side !== priorSide) {
        // Crossed the target on this axis since the last step means the previous
        // tap overshot the target cell; halve the tap so the correction lands in it.
        currentTap = Math.max(minTapMs, Math.floor(currentTap / 2));
      }
      priorAxis = axis;
      priorSide = side;
      const before = await snapshotAvatar(page, OVERWORLD_AVATAR);
      await tapWalk(page, key, currentTap);
      const after = await snapshotAvatar(page, OVERWORLD_AVATAR);
      stall = after === before ? stall + 1 : 0;
    }
    if (stall >= stallTaps) {
      failStall(stallDetail);
      return false;
    }
  }
  const finalCell = await readAvatarCell(page, OVERWORLD_AVATAR);
  if (finalCell !== null && finalCell.row === target.row && finalCell.col === target.col) {
    return true;
  }
  failStall(stallDetail);
  return false;
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
