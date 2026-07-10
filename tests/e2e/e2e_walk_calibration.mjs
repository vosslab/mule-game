// Realtime-walk timing calibration experiment. The walkthrough harness
// drives real keyboard walking through headless Chromium, so its
// timing constants (scene speed, per-tap hold length, per-act wall budget)
// must be MEASURED against the actual rendered game rather than guessed. This
// script is that measurement: it sweeps a small matrix of
// `speed x WALK_TAP_MS` configurations, records two success metrics per row,
// prints the table, writes test-results/walker/calibration.json, and names a
// winning row. The chosen row is copied by hand into the constants block at
// the top of tests/e2e/walkthrough_helpers.mjs.
//
// Two metrics, each deterministic on fixed seed 33 (its all-plains town row is
// the same walkable fixture town_scene.spec.mjs / pub_gamble.spec.mjs use):
//
//   metric 1 (door-reach reliability): using the isolated ?demo=town fixture
//   (src/ui/solid/town_demo.tsx -- the exact same TownScene, reading the same
//   ?speed= URL param, so its walk physics are identical to a live develop
//   turn, but with no land-grant bootstrap and no draining tick budget to
//   corrupt the measurement), walk the avatar from its corral spawn out to a
//   target door and back, DOOR_REACH_ATTEMPTS times. An attempt succeeds only
//   when both legs land on their door within MAX_WALK_TAPS bounded taps. This
//   is the direct overshoot measurement the WALK_TAP_MS/speed pair is tuned
//   for: too long a tap at too high a speed sails the avatar past the target
//   door (headless rAF clamps each frame's delta to MAX_FRAME_MS=100ms, so one
//   slow frame moves up to speed*100ms of travel -- a whole cell at speed=8).
//
//   metric 2 (develop-turn errand within budget): bootstrap a real seeded game
//   to the human's develop turn (claim the town's west-neighbor plot, pass the
//   rest of the land grant), then run the full scripted errand -- enter town,
//   buy at the corral, outfit at a counter, exit west, return to the owned
//   plot, place the M.U.L.E. -- and check it all completes while the develop
//   tick budget still has ticks left. The budget drains in real time as
//   `DEVELOP_TICK_MS(950) / speed` per tick (scene_manager.ts), so a faster
//   scene leaves less wall-clock room; this metric is what rules a too-fast
//   row out even when its door-reach is perfect.
//
// Uses playwright-core via the shared walkthrough_helpers.mjs startup (not the
// "playwright" / "@playwright/test" packages), so this browser-driving .mjs may
// live under tests/e2e/ without tripping the tests/playwright-only import rule
// (tests/test_test_naming_conventions.py). Run directly, not via pytest:
//
//   node tests/e2e/e2e_walk_calibration.mjs
//
// Rerun it twice; a reliable winning row reproduces its door-reach rate within
// noise. The revert trigger in the plan is a >5% door-reach failure across a
// sweep (a passing row needs rate >= 0.95).

import fs from "node:fs";
import path from "node:path";

import {
  REPO_ROOT,
  buildSiteIfStale,
  startServer,
  launchBrowser,
  ensureDir,
  isVisible,
  waitForMuleGameState,
  readGameState,
  MAX_WALK_TAPS,
} from "./walkthrough_helpers.mjs";

//============================================
// Experiment parameters.
//============================================

/** Fixed seed whose all-plains town row makes the walk deterministic. */
const SEED = 33;

/** Town cell column (row center) for seed 33's 5x9 board. */
const TOWN_COL = 4;

/**
 * The develop-turn town row on the overworld board. Player 0 (the human) picks
 * first in round 1 and claims the town's west neighbor, so exiting town west
 * returns the avatar straight onto its owned plot with no extra walking.
 */
const TOWN_ROW = 2;

/** Door the metric-1 walk targets: five cells east of the corral spawn. */
const METRIC1_TARGET_DOOR = "pub";

/** The counter the errand outfits at (one cell east of the corral spawn). */
const ERRAND_COUNTER_DOOR = "counter-food";

/** Door-reach attempts per config for the metric-1 success rate. */
const DOOR_REACH_ATTEMPTS = 20;

/**
 * The `speed x WALK_TAP_MS` matrix (at most 5 rows). Speeds span the fast end
 * the full-game harness already runs at (8) down to the modest speed the
 * proven town/pub specs walk at (2); tap lengths span the specs' 120ms up to a
 * longer 180ms that covers more ground per tap but risks overshoot.
 */
const CONFIGS = [
  { speed: 8, tapMs: 120 },
  { speed: 8, tapMs: 180 },
  { speed: 4, tapMs: 120 },
  { speed: 4, tapMs: 180 },
  { speed: 2, tapMs: 120 },
];

/** A door-reach rate at or above this passes; below it triggers the plan's rerun. */
const DOOR_REACH_PASS_RATE = 0.95;

/** Engine develop-turn full tick budget (src/engine/constants.ts DEVELOP_TICKS_FULL). */
const DEVELOP_TICKS_FULL = 50;

/** Where the recorded matrix lands for reruns and the walkthrough guide table. */
const OUTPUT_DIR = path.join(REPO_ROOT, "test-results", "walker");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "calibration.json");

//============================================
// Small DOM helpers (playwright-core, no expect fixtures).
//============================================

/**
 * Read an attribute off the first element matching `selector`, or null when no
 * element matches. Resolves the element fresh each call so a scene remount
 * (which detaches and re-mounts the avatar node) never leaves a stale handle.
 *
 * @param page - The Playwright page.
 * @param selector - CSS selector to resolve.
 * @param attr - Attribute name to read.
 * @returns The attribute value, or null.
 */
async function getAttr(page, selector, attr) {
  const handle = await page.$(selector);
  if (handle === null) {
    return null;
  }
  return handle.getAttribute(attr);
}

//============================================
/**
 * Poll `isVisible(selector)` until it is true or the deadline passes.
 *
 * @param page - The Playwright page.
 * @param selector - CSS selector to wait for.
 * @param timeoutMs - How long to poll before giving up.
 * @returns True once visible, false if the deadline passed.
 */
async function waitForVisible(page, selector, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isVisible(page, selector)) {
      return true;
    }
    await page.waitForTimeout(30);
  }
  return false;
}

//============================================
/**
 * Poll until `selector` resolves to no element (gone from the DOM) or the
 * deadline passes.
 *
 * @param page - The Playwright page.
 * @param selector - CSS selector to wait to disappear.
 * @param timeoutMs - How long to poll before giving up.
 * @returns True once gone, false if the deadline passed.
 */
async function waitForGone(page, selector, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await page.$(selector)) === null) {
      return true;
    }
    await page.waitForTimeout(30);
  }
  return false;
}

//============================================
/**
 * Advance the avatar with ONE bounded tap: hold `walkDir` for `tapMs` of real
 * time, then release. Bounding each tap keeps every subsequent door check a
 * stationary snapshot -- the avatar can only move for `tapMs` of real time
 * between checks, so a slow attribute round trip can never let it sail past a
 * door untouched (see town_scene.spec.mjs's `useDoor` doc comment).
 *
 * @param page - The Playwright page.
 * @param walkDir - Arrow key to hold (e.g. "ArrowRight").
 * @param tapMs - Real-ms hold duration for this tap.
 */
async function tapWalk(page, walkDir, tapMs) {
  await page.keyboard.down(walkDir);
  await page.waitForTimeout(tapMs);
  await page.keyboard.up(walkDir);
}

//============================================
/**
 * Walk in `walkDir` with bounded taps until the avatar stands at `door`
 * (data-at-door), or give up after MAX_WALK_TAPS. Skips the walk when already
 * at the door.
 *
 * @param page - The Playwright page.
 * @param avatarSelector - Selector for the avatar carrying data-at-door.
 * @param door - Target door id.
 * @param walkDir - Arrow key to hold each tap.
 * @param tapMs - Real-ms hold duration per tap.
 * @returns True when the door was reached within the tap budget.
 */
async function walkToDoor(page, avatarSelector, door, walkDir, tapMs) {
  for (let tap = 0; tap < MAX_WALK_TAPS; tap++) {
    if ((await getAttr(page, avatarSelector, "data-at-door")) === door) {
      return true;
    }
    await tapWalk(page, walkDir, tapMs);
  }
  // One last check after the final tap, so a door reached exactly on the last
  // tap still counts.
  return (await getAttr(page, avatarSelector, "data-at-door")) === door;
}

//============================================
// Metric 1: door-reach reliability in the isolated demo town.
//============================================

/** Avatar node inside the demo/live town scene (carries data-at-door). */
const TOWN_AVATAR = "#town-scene [data-actor='player-0']";

/**
 * Run DOOR_REACH_ATTEMPTS out-and-back walks in the ?demo=town fixture at the
 * given speed and tap length. Each attempt walks east to METRIC1_TARGET_DOOR
 * then west back to the corral; it succeeds only when both legs reach their
 * door within the tap budget. The demo remounts the scene fresh on an edge
 * exit (town_demo.tsx), so an overshoot that sails out the edge simply resets
 * the avatar to the corral spawn for the next attempt -- and is scored a miss.
 *
 * @param baseUrl - The origin the site is served from.
 * @param speed - Scene speed multiplier for this config.
 * @param tapMs - Real-ms hold duration per tap.
 * @returns Per-config door-reach counts and the failing attempt indices.
 */
async function measureDoorReach(baseUrl, speed, tapMs) {
  const browser = await launchBrowser();
  const pageErrors = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    await page.goto(`${baseUrl}/?demo=town&speed=${speed}`);
    if (!(await waitForVisible(page, "#town-scene", 30_000))) {
      throw new Error("demo town scene never mounted");
    }
    // Confirm the fixture spawns the avatar at the corral (data-at-door=corral)
    // before the first attempt, so every attempt starts from the same cell.
    if (!(await walkToDoor(page, TOWN_AVATAR, "corral", "ArrowLeft", tapMs))) {
      throw new Error("demo town avatar never reported the corral spawn door");
    }

    let successes = 0;
    const failedAttempts = [];
    for (let attempt = 0; attempt < DOOR_REACH_ATTEMPTS; attempt++) {
      const reachedTarget = await walkToDoor(
        page,
        TOWN_AVATAR,
        METRIC1_TARGET_DOOR,
        "ArrowRight",
        tapMs,
      );
      const reachedBack = await walkToDoor(page, TOWN_AVATAR, "corral", "ArrowLeft", tapMs);
      if (reachedTarget && reachedBack) {
        successes += 1;
      } else {
        failedAttempts.push(attempt);
        // A miss can leave the avatar anywhere (mid-street or freshly remounted
        // at the corral after an edge exit); re-seat it at the corral so the
        // next attempt starts clean.
        await walkToDoor(page, TOWN_AVATAR, "corral", "ArrowLeft", tapMs);
      }
    }

    return { attempts: DOOR_REACH_ATTEMPTS, successes, failedAttempts, pageErrors };
  } finally {
    await browser.close();
  }
}

//============================================
// Metric 2: full develop-turn errand within the tick budget.
//============================================

/**
 * Read the live develop-turn ticks remaining, or null when the human is no
 * longer the active develop player (turn ended / budget drained).
 *
 * @param page - The Playwright page.
 * @returns Ticks remaining for the human's develop turn, or null.
 */
async function humanDevelopTicks(page) {
  const projection = await readGameState(page);
  if (projection.phaseKind !== "develop" || projection.activePlayerId !== 0) {
    return null;
  }
  return projection.state.phase.payload.ticksRemaining;
}

//============================================
/**
 * Bootstrap a fresh seeded game to the human's develop turn: New Game, claim
 * the town's west-neighbor plot by pressing Enter when the land-grant sweep
 * cursor reaches it (read off the walker projection, matching
 * pub_gamble.spec.mjs's claim), then pass the rest of the land grant until the
 * human's develop turn begins.
 *
 * @param page - The Playwright page.
 * @param baseUrl - The origin the site is served from.
 * @param speed - Scene speed multiplier for this config.
 */
async function bootstrapToDevelop(page, baseUrl, speed) {
  await page.goto(`${baseUrl}/?seed=${SEED}&speed=${speed}`);
  // Drop any saved game from a prior run so New Game starts fresh.
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.click("#new-game-button");
  await page.waitForSelector("#screen-game.active", { state: "visible", timeout: 30_000 });
  await waitForMuleGameState(page);

  // Claim the town's west neighbor: wait for the human's pick with the sweep
  // cursor sitting on the target plot, then press Enter (claim_current_plot).
  const claimDeadline = Date.now() + 30_000;
  let claimed = false;
  while (Date.now() < claimDeadline) {
    const projection = await readGameState(page);
    if (
      projection.phaseKind === "land_grant" &&
      projection.activePlayerId === 0 &&
      projection.sweepRow === TOWN_ROW &&
      projection.sweepCol === TOWN_COL - 1
    ) {
      await page.keyboard.press("Enter");
      claimed = true;
      break;
    }
    if (projection.phaseKind === "develop") {
      break;
    }
    await page.waitForTimeout(20);
  }
  if (!claimed) {
    throw new Error("land-grant sweep never offered the human the target plot");
  }

  // Pass the remaining land-grant picks until the human's develop turn is up.
  const passButton = "#land-grant-pass-button";
  const developDeadline = Date.now() + 30_000;
  while (Date.now() < developDeadline) {
    const ticks = await humanDevelopTicks(page);
    if (ticks !== null) {
      return;
    }
    if (await isVisible(page, passButton)) {
      await page.click(passButton);
    }
    await page.waitForTimeout(50);
  }
  throw new Error("human develop turn never began after passing the land grant");
}

//============================================
/**
 * Run the full develop-turn errand once at the given speed/tap and report
 * whether it completed while the tick budget still had ticks. The errand:
 * enter town, buy at the corral, outfit at a counter, exit west, return to the
 * owned plot, place the M.U.L.E. Each act's wall time is recorded so the
 * PER_ACT_BUDGET_MS constant can be sized from the measured worst act.
 *
 * @param baseUrl - The origin the site is served from.
 * @param speed - Scene speed multiplier for this config.
 * @param tapMs - Real-ms hold duration per tap.
 * @returns The errand outcome: completion flag, timings, ticks consumed.
 */
async function measureErrand(baseUrl, speed, tapMs) {
  const browser = await launchBrowser();
  const pageErrors = [];
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    await bootstrapToDevelop(page, baseUrl, speed);
    const ticksAtStart = await humanDevelopTicks(page);
    if (ticksAtStart === null) {
      throw new Error("human develop turn was not active at errand start");
    }
    if (!(await waitForVisible(page, ".overworld-svg [data-actor='player-0']", 30_000))) {
      throw new Error("overworld avatar never mounted for the develop turn");
    }

    const acts = {};
    const errandStart = Date.now();

    // Act: enter town. Bounded taps east until the town interior mounts.
    const enterStart = Date.now();
    let entered = false;
    for (let tap = 0; tap < MAX_WALK_TAPS; tap++) {
      if (await isVisible(page, "#town-scene")) {
        entered = true;
        break;
      }
      await tapWalk(page, "ArrowRight", tapMs);
    }
    entered = entered || (await isVisible(page, "#town-scene"));
    acts.enter = Date.now() - enterStart;

    let bought = false;
    let outfitted = false;
    let exited = false;
    let returned = false;
    let placed = false;
    let ticksAtPlace = null;

    if (entered) {
      // Act: buy at the corral (the spawn door).
      const buyStart = Date.now();
      if (await walkToDoor(page, TOWN_AVATAR, "corral", "ArrowLeft", tapMs)) {
        await page.keyboard.press("Space");
        bought = (await getAttr(page, TOWN_AVATAR, "data-carrying")) === "unoutfitted";
        // The carry attribute may settle a frame later; re-poll briefly.
        for (let i = 0; i < 20 && !bought; i++) {
          await page.waitForTimeout(30);
          bought = (await getAttr(page, TOWN_AVATAR, "data-carrying")) === "unoutfitted";
        }
      }
      acts.buy = Date.now() - buyStart;

      // Act: outfit at the food counter (one cell east).
      const outfitStart = Date.now();
      if (
        bought &&
        (await walkToDoor(page, TOWN_AVATAR, ERRAND_COUNTER_DOOR, "ArrowRight", tapMs))
      ) {
        await page.keyboard.press("Space");
        outfitted = (await getAttr(page, TOWN_AVATAR, "data-carrying")) === "food";
        for (let i = 0; i < 20 && !outfitted; i++) {
          await page.waitForTimeout(30);
          outfitted = (await getAttr(page, TOWN_AVATAR, "data-carrying")) === "food";
        }
      }
      acts.outfit = Date.now() - outfitStart;

      // Act: exit west. The west exit returns the avatar to the owned plot.
      const exitStart = Date.now();
      if (outfitted) {
        for (let tap = 0; tap < MAX_WALK_TAPS; tap++) {
          if ((await page.$("#town-scene")) === null) {
            break;
          }
          await tapWalk(page, "ArrowLeft", tapMs);
        }
        exited = await waitForGone(page, "#town-scene", 15_000);
      }
      acts.exit = Date.now() - exitStart;

      // Act: return to the owned plot (the west exit drops the avatar there).
      const returnStart = Date.now();
      if (exited) {
        const overworldAvatar = ".overworld-svg [data-actor='player-0']";
        const returnDeadline = Date.now() + 15_000;
        while (Date.now() < returnDeadline) {
          if ((await getAttr(page, overworldAvatar, "data-cell-col")) === String(TOWN_COL - 1)) {
            returned = true;
            break;
          }
          await page.waitForTimeout(50);
        }
      }
      acts.return = Date.now() - returnStart;

      // Act: place the M.U.L.E. on the owned plot; success is the placed-outfit
      // badge appearing while the human's develop turn still has ticks.
      const placeStart = Date.now();
      if (returned) {
        ticksAtPlace = await humanDevelopTicks(page);
        await page.keyboard.press("Enter");
        const badge = `#game-map .map-svg g[data-row="${TOWN_ROW}"][data-col="${TOWN_COL - 1}"] g[data-outfit]`;
        placed = await waitForVisible(page, badge, 10_000);
      }
      acts.place = Date.now() - placeStart;
    }

    const errandWallMs = Date.now() - errandStart;
    const complete =
      entered &&
      bought &&
      outfitted &&
      exited &&
      returned &&
      placed &&
      ticksAtPlace !== null &&
      ticksAtPlace > 0;
    const maxActMs = Math.max(...Object.values(acts));

    return {
      complete,
      steps: { entered, bought, outfitted, exited, returned, placed },
      acts,
      maxActMs,
      errandWallMs,
      ticksAtStart,
      ticksAtPlace,
      ticksConsumed: ticksAtPlace === null ? null : ticksAtStart - ticksAtPlace,
      pageErrors,
    };
  } finally {
    await browser.close();
  }
}

//============================================
// Orchestration, table, winner selection.
//============================================

/**
 * Whether a config row "passes": its door-reach rate clears
 * DOOR_REACH_PASS_RATE, its errand completed within the tick budget, and it
 * drove the game with zero uncaught page errors.
 *
 * @param row - A per-config result row.
 * @returns True when the row passes all three checks.
 */
function rowPasses(row) {
  return (
    row.doorReach.rate >= DOOR_REACH_PASS_RATE && row.errand.complete && row.pageErrorCount === 0
  );
}

//============================================
/**
 * Pick the winning config. Not merely the fastest passing row: the fastest
 * speed can pass at one tap length while sitting right on the overshoot cliff
 * (its longer-tap sibling FAILS because a single tap sails past an adjacent
 * errand door -- the speed=8/tap=180 case). Under headless rAF throttling
 * (MAX_FRAME_MS=100 clamps each frame, so one stalled frame travels up to
 * `speed*100ms` -- a whole cell at speed=8) that cliff is exactly where the
 * plan's >5% walk-failure revert trigger bites. So the winner must show
 * TAP-LENGTH HEADROOM: it is chosen from passing rows whose speed also has a
 * passing row at a strictly longer tap, or whose speed is the slowest tested
 * (the always-trusted conservative floor). Among those, the fastest speed
 * wins, then the shortest tap. Falls back to the fastest plain-passing row,
 * then the best door-reach rate, so a row is always named.
 *
 * @param results - The per-config result rows.
 * @returns The winning result row.
 */
function pickWinner(results) {
  const passing = results.filter(rowPasses);
  const slowestSpeed = Math.min(...results.map((r) => r.speed));
  // A passing row is margin-backed when a longer tap at the same speed also
  // passes (proven headroom), or its speed is the conservative slowest floor.
  const marginBacked = passing.filter(
    (r) =>
      r.speed === slowestSpeed ||
      passing.some((other) => other.speed === r.speed && other.tapMs > r.tapMs),
  );
  const pool =
    marginBacked.length > 0 ? marginBacked : passing.length > 0 ? passing : results.slice();
  pool.sort((a, b) => {
    if (b.speed !== a.speed) {
      return b.speed - a.speed;
    }
    if (a.tapMs !== b.tapMs) {
      return a.tapMs - b.tapMs;
    }
    return b.doorReach.rate - a.doorReach.rate;
  });
  return pool[0];
}

//============================================
/**
 * Print the measured matrix as an aligned ASCII table.
 *
 * @param results - The per-config result rows.
 * @param winner - The chosen winning row.
 */
function printTable(results, winner) {
  const header =
    "speed  tap_ms  door_reach   metric2   errand_ms  ticks_used/50  max_act_ms  pg_err";
  console.log("");
  console.log("=== walk calibration matrix (seed 33) ===");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const r of results) {
    const reach = `${r.doorReach.successes}/${r.doorReach.attempts} ${(r.doorReach.rate * 100).toFixed(0)}%`;
    const m2 = r.errand.complete ? "PASS" : "FAIL";
    const ticks = r.errand.ticksConsumed === null ? "n/a" : `${r.errand.ticksConsumed}`;
    const mark = r === winner ? "  <== winner" : "";
    const row =
      String(r.speed).padEnd(7) +
      String(r.tapMs).padEnd(8) +
      reach.padEnd(13) +
      m2.padEnd(10) +
      String(r.errand.errandWallMs).padEnd(11) +
      `${ticks}`.padEnd(15) +
      String(r.errand.maxActMs).padEnd(12) +
      String(r.pageErrorCount).padEnd(6) +
      mark;
    console.log(row);
  }
  console.log("");
}

//============================================
/**
 * Run the full calibration matrix: build/serve dist/ once, measure both
 * metrics for every config, print the table, pick a winner, and write
 * calibration.json.
 */
async function main() {
  buildSiteIfStale();
  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const results = [];
  try {
    for (const config of CONFIGS) {
      console.log(`==> config speed=${config.speed} tap=${config.tapMs}ms`);
      const doorReach = await measureDoorReach(baseUrl, config.speed, config.tapMs);
      const rate = doorReach.successes / doorReach.attempts;
      const errand = await measureErrand(baseUrl, config.speed, config.tapMs);
      const pageErrorCount = doorReach.pageErrors.length + errand.pageErrors.length;
      results.push({
        speed: config.speed,
        tapMs: config.tapMs,
        doorReach: { ...doorReach, rate },
        errand,
        pageErrorCount,
      });
      console.log(
        `    door-reach ${doorReach.successes}/${doorReach.attempts} (${(rate * 100).toFixed(0)}%), ` +
          `errand ${errand.complete ? "PASS" : "FAIL"} in ${errand.errandWallMs}ms, ` +
          `page-errors ${pageErrorCount}`,
      );
    }
  } finally {
    server.close();
  }

  const winner = pickWinner(results);
  printTable(results, winner);

  // PER_ACT_BUDGET_MS is sized off the winning row's slowest single act with a
  // 2x safety margin, so the shared act-and-wait helper waits long enough
  // for the worst act at the chosen speed without hanging on a genuine
  // stall.
  const perActBudgetMs = winner.errand.maxActMs * 2;
  const chosen = {
    speed: winner.speed,
    tapMs: winner.tapMs,
    perActBudgetMs,
    doorReachRate: winner.doorReach.rate,
    errandComplete: winner.errand.complete,
  };

  ensureDir(OUTPUT_DIR);
  const record = {
    generatedAt: new Date().toISOString(),
    regenerateCommand: "node tests/e2e/e2e_walk_calibration.mjs",
    seed: SEED,
    doorReachAttempts: DOOR_REACH_ATTEMPTS,
    maxWalkTaps: MAX_WALK_TAPS,
    developTicksFull: DEVELOP_TICKS_FULL,
    doorReachPassRate: DOOR_REACH_PASS_RATE,
    metric1TargetDoor: METRIC1_TARGET_DOOR,
    errandCounterDoor: ERRAND_COUNTER_DOOR,
    chosen,
    results,
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(record, null, 2) + "\n");
  console.log(`==> wrote ${path.relative(REPO_ROOT, OUTPUT_FILE)}`);
  console.log(
    `==> winner: speed=${chosen.speed} WALK_TAP_MS=${chosen.tapMs} ` +
      `PER_ACT_BUDGET_MS=${chosen.perActBudgetMs} ` +
      `(door-reach ${(chosen.doorReachRate * 100).toFixed(0)}%, errand ${chosen.errandComplete ? "PASS" : "FAIL"})`,
  );
  console.log(
    "==> copy these into the calibration constants block at the top of " +
      "tests/e2e/walkthrough_helpers.mjs",
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
