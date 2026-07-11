// Full-game browser walkthrough harness: launch bootstrap plus the passive
// phase loop and baseline-noise audit. The phase loop drives a complete
// seeded game from the title screen
// to the scoring screen using only passive fallbacks for the human seat
// (pass every land grant, end every develop turn immediately, sit out every
// goods auction), reusing the proven passive pattern from
// e2e_full_game.mjs's actForCurrentPhase but reading phase state from
// `window.muleGameState()` (the walker orchestrator's convenience fields;
// see src/ui/walker_debug.ts) instead of polling the DOM for phase identity.
// Evidence collection (log/phase timings/failure taxonomy/counters/error
// collectors/screenshots) is delegated to walkthrough_report.mjs's
// createWalkReport; this file owns only the phase loop that drives the
// browser and feeds that report.
//
// Per docs/E2E_TESTS.md (non-browser tier, tests/e2e/, e2e_ prefix,
// self-contained, run directly rather than via pytest). Uses playwright-core
// (not "playwright" / "@playwright/test") so this browser-driving .mjs may
// live under tests/e2e/ without tripping the tests/playwright-only import
// rule (tests/test_test_naming_conventions.py).
//
// This file imports src/ui/scenes/zones.ts and src/engine/constants.ts
// directly, which resolve sibling .ts modules by extensionless specifier;
// Node's own type-stripping resolver cannot follow that (unlike tsx's
// resolver), so `--import tsx` is required:
//
// Run the full active phase loop, the default (writes
// test-results/walker/playthrough_report.json):
//   node --import tsx tests/e2e/e2e_walkthrough.mjs --seed 3 --mode beginner
// Run the M2-baseline passive fallbacks instead (pass every land grant, end
// every develop turn immediately, sit out every goods auction):
//   node --import tsx tests/e2e/e2e_walkthrough.mjs --seed 3 --mode beginner --passive
// Run the bootstrap-only smoke (this package's own quick launch check):
//   node --import tsx tests/e2e/e2e_walkthrough.mjs --seed 3 --mode beginner --bootstrap-only
// Run with a custom screenshots directory or an overridden speed (default
// speed is the calibrated WALKER_SPEED, not this example's 8):
//   node --import tsx tests/e2e/e2e_walkthrough.mjs --seed 7 --mode standard --speed 8 \
//     --screenshots test-results/walker
//
// Active mode wires the seat-0 strategy adapter (walkthrough_strategy.mjs)
// into every phase driver (walkthrough_land.mjs, walkthrough_auction.mjs,
// walkthrough_town.mjs, walkthrough_overworld.mjs): on each phase's entry
// the matching driver is
// called once and loops internally until the phase ends or an act fails.
// The develop phase's own driver (activeDriveDevelop below) is a small
// per-turn loop local to this file: it re-decides one gesture plan at a time
// via decideDevelopPlan (a develop turn is reactive, not a fixed script; see
// walkthrough_strategy.mjs's note on why), routes each plan through
// executePlan (walkthrough_exec.mjs) to the matching town/overworld executor,
// and checks the tick-budget truncation guard before every new plan.
// Active-mode runs additionally assert the active-participation invariants at
// the end of the run (see assertActiveInvariants below).

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  REPO_ROOT,
  WALKER_SPEED,
  buildSiteIfStale,
  startServer,
  launchBrowser,
  bootstrapGame,
  saveScreenshot,
  waitForPhaseKind,
  readGameState,
  isVisible,
  actAndWaitProgress,
  exitTown,
} from "./walkthrough_helpers.mjs";
import { createWalkReport } from "./walkthrough_report.mjs";
import { driveLandGrant, driveLandAuction } from "./walkthrough_land.mjs";
import { driveAuction } from "./walkthrough_auction.mjs";
import {
  decideLandGrant,
  decideLandAuction,
  decideAuctionIntent,
  decideDevelopPlan,
  marshalProjection,
} from "./walkthrough_strategy.mjs";
import {
  executePlan,
  exitCodeForFailure,
  runActivePhaseDriver,
  assertActiveInvariants,
} from "./walkthrough_exec.mjs";
import {
  executeBuyMule,
  executeOutfitMule,
  executeGamblePub,
  executeArmAssay,
} from "./walkthrough_town.mjs";
import {
  executePlaceMule,
  executeHuntWampus,
  executeAssayPlot,
  maybeTruncateTurn,
} from "./walkthrough_overworld.mjs";
import { findTownCell } from "../../src/ui/scenes/zones.ts";
import { ROUND_COUNT_BY_MODE } from "../../src/engine/constants.ts";

/**
 * Default speed multiplier applied when --speed is not given. Comes from the
 * timing calibration experiment (WALKER_SPEED, walkthrough_helpers.mjs; see
 * docs/active_plans/audits/town_spacing_experiment.md for the locked-constant
 * measurement), not a value chosen locally -- CLI --speed still overrides it
 * per run.
 */
const DEFAULT_SPEED = WALKER_SPEED;

/** Default screenshots directory (repo-relative), created if missing. */
const DEFAULT_SCREENSHOTS_DIR = path.join("test-results", "walker");

/** Wall-clock budget to reach the first land-grant phase in --bootstrap-only mode. */
const LAND_GRANT_TIMEOUT_MS = 30_000;

/**
 * Per-phase wall-clock budget in ms. Generous at the default speed=8 so a
 * single slow phase (e.g. a develop turn with several ticks) never trips a
 * false timeout.
 */
const PHASE_BUDGET_MS = 60_000;

/**
 * Worst-case wall-clock budget for one round's five active-mode phases, in
 * ms. Summed from the worst per-phase-kind durations measured across
 * test-results/walker/playthrough_report.json and sweep runs at the default
 * speed: auction 12-18s (structural: AUCTION_POLL_INTERVAL_MS x real window
 * ticks, the dominant cost), land_auction 3-7s, develop 2-7s, land_grant
 * under 1s, production under 0.5s. Worst-case sum is 18 + 7 + 7 + 1 + 0.5 =
 * 33.5s; a 1.5x headroom margin (so one slow phase in an otherwise-normal
 * round never trips a false stall) rounds up to 51s.
 */
const ROUND_BUDGET_MS = 51_000;

/**
 * Fixed overhead added once per run on top of the per-round budget: the
 * scoring phase plus poll-interval slack around every phase-kind
 * transition. The run's earlier land-grant/auction/develop/production
 * phases are already counted per round; bootstrap (build, serve, navigate
 * to a fresh game) happens before runPhaseLoop's deadline starts, so it is
 * not part of this budget.
 */
const RUN_FIXED_OVERHEAD_MS = 10_000;

/**
 * Whole-run wall-clock budget in ms, by mode: ROUND_BUDGET_MS times the
 * mode's round count (ROUND_COUNT_BY_MODE, src/engine/constants.ts -- 6 for
 * beginner, 12 for standard) plus RUN_FIXED_OVERHEAD_MS. Derived from
 * measured per-round costs rather than a flat constant so standard mode's
 * extra rounds are not shortchanged and beginner mode is not padded with
 * standard's headroom.
 */
const RUN_BUDGET_MS_BY_MODE = {
  beginner: ROUND_BUDGET_MS * ROUND_COUNT_BY_MODE.beginner + RUN_FIXED_OVERHEAD_MS,
  standard: ROUND_BUDGET_MS * ROUND_COUNT_BY_MODE.standard + RUN_FIXED_OVERHEAD_MS,
};

/** Delay between phase-loop polls. */
const POLL_INTERVAL_MS = 120;

/**
 * Wait this long once the develop panel is visible before ending the turn,
 * so at least one develop-phase tick fires first (matches
 * e2e_full_game.mjs's DEVELOP_TICK_SETTLE_MS rationale).
 */
const DEVELOP_TICK_SETTLE_MS = 200;

/** Number of ranked rows the scoring screen must show (four players). */
const EXPECTED_SCORING_ROW_COUNT = 4;

//============================================
/**
 * Parse CLI flags into a plain options object, applying defaults for any
 * flag not given. Active mode (the seat-0 strategy adapter driving land
 * grant, land auction, and goods auction) is on by default; --passive
 * restores the M2 baseline (passive fallbacks for every phase).
 *
 * @param argv - `process.argv.slice(2)`.
 * @returns `{ seed, mode, speed, screenshotsDir, bootstrapOnly, active }`.
 */
function parseArgs(argv) {
  const options = {
    seed: 1,
    mode: "beginner",
    speed: DEFAULT_SPEED,
    screenshotsDir: DEFAULT_SCREENSHOTS_DIR,
    bootstrapOnly: false,
    active: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--seed") {
      index += 1;
      options.seed = Number.parseInt(argv[index], 10);
    } else if (flag === "--mode") {
      index += 1;
      options.mode = argv[index];
    } else if (flag === "--speed") {
      index += 1;
      options.speed = Number.parseInt(argv[index], 10);
    } else if (flag === "--screenshots") {
      index += 1;
      options.screenshotsDir = argv[index];
    } else if (flag === "--bootstrap-only") {
      options.bootstrapOnly = true;
    } else if (flag === "--active") {
      options.active = true;
    } else if (flag === "--passive") {
      options.active = false;
    } else {
      throw new Error(`unknown flag "${flag}"`);
    }
  }
  if (Number.isNaN(options.seed)) {
    throw new Error("--seed requires an integer value");
  }
  if (Number.isNaN(options.speed)) {
    throw new Error("--speed requires an integer value");
  }
  if (options.mode !== "beginner" && options.mode !== "standard") {
    throw new Error(`--mode must be "beginner" or "standard", got "${options.mode}"`);
  }
  return options;
}

//============================================
/**
 * Resolve the screenshots directory to an absolute path, treating a
 * relative --screenshots value as repo-relative.
 *
 * @param screenshotsDir - The raw --screenshots value.
 * @returns Absolute path to the screenshots directory.
 */
function resolveScreenshotsDir(screenshotsDir) {
  return path.isAbsolute(screenshotsDir) ? screenshotsDir : path.join(REPO_ROOT, screenshotsDir);
}

//============================================
/**
 * Run the launch bootstrap: build/serve dist/, drive the browser through
 * the title screen into a fresh seeded game, save `initial_state.png`, and
 * (in --bootstrap-only mode) wait for the first land-grant phase before
 * returning.
 *
 * @param options - Parsed CLI options.
 */
async function runBootstrap(options) {
  buildSiteIfStale();
  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const screenshotsDir = resolveScreenshotsDir(options.screenshotsDir);

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    await bootstrapGame(page, baseUrl, {
      seed: options.seed,
      mode: options.mode,
      speed: options.speed,
    });
    await saveScreenshot(page, screenshotsDir, "initial_state.png");

    if (options.bootstrapOnly) {
      const reachedLandGrant = await waitForPhaseKind(page, "land_grant", LAND_GRANT_TIMEOUT_MS);
      if (!reachedLandGrant) {
        throw new Error("bootstrap-only: game never reached the land_grant phase");
      }
    }

    if (pageErrors.length > 0) {
      throw new Error(`page errors during bootstrap: ${pageErrors.join("; ")}`);
    }
  } finally {
    await browser.close();
    server.close();
  }
}

//============================================
/**
 * Snapshot the one field a develop-end-turn click's progress check needs:
 * the phase kind. A real end-turn click always advances the game out of
 * "develop" (the turn sequencer moves straight to production), so a
 * snapshot that does not change means the click was swallowed (a detached
 * button, a stale precondition), not a completed turn.
 *
 * @param page - The Playwright page.
 * @returns `{ phaseKind }`.
 */
async function developPhaseSnapshot(page) {
  const projection = await readGameState(page);
  return { phaseKind: projection.phaseKind };
}

//============================================
/**
 * Click develop-end-turn and confirm it actually advanced the phase. This is
 * the walker's OWN end-turn gesture: it ends the turn when the strategy's plan
 * is `end_turn`. It deliberately does NOT count the turn -- a human develop
 * turn also ends by routes the walker never clicks (a tick-budget truncation,
 * a gamble, or the engine exhausting the tick budget), so counting is owned by
 * createHumanDevelopTurnCounter (which counts from observed engine state, not
 * from this click). See that factory's comment for the counting contract.
 *
 * @param page - The Playwright page.
 * @param report - The walk report (see walkthrough_report.mjs).
 * @returns True once the end-turn click was confirmed to advance the phase.
 */
async function endDevelopTurn(page, report) {
  // Give the develop phase's own tick timer one chance to fire before
  // ending the turn, so the tick ledger records at least one develop
  // tick instead of racing straight past it.
  await page.waitForTimeout(DEVELOP_TICK_SETTLE_MS);
  const advanced = await actAndWaitProgress(page, report, {
    snapshot: developPhaseSnapshot,
    act: () => page.click('[data-action="develop-end-turn"]'),
    failureKind: "act_did_not_advance",
    failureMessage: "develop-end-turn click did not advance the phase",
  });
  return advanced;
}

//============================================
/**
 * Take the human's passive scripted action for the given phase, if any
 * control is live: pass a land grant, end a develop turn, or sit out a
 * goods auction. Every other phase (title, land_auction, production,
 * scoring) has no live human control and is left to run on its own. A
 * detached element between the visibility check and the click is ignored
 * (the phase advanced on its own).
 *
 * @param page - The Playwright page.
 * @param phaseKind - The current `WalkerProjection.phaseKind`.
 * @param report - The walk report, so a completed develop turn can be
 *   counted.
 */
async function actForPhase(page, phaseKind, report) {
  if (phaseKind === "land_grant") {
    if (await isVisible(page, '[data-action="land-grant-pass"]')) {
      await page.click('[data-action="land-grant-pass"]').catch(() => undefined);
    }
    return;
  }
  if (phaseKind === "develop") {
    if (await isVisible(page, '[data-action="develop-end-turn"]')) {
      await endDevelopTurn(page, report);
    }
    return;
  }
  if (phaseKind === "auction") {
    if (await isVisible(page, '[data-action="auction-role"][data-role="out"]')) {
      await page.click('[data-action="auction-role"][data-role="out"]').catch(() => undefined);
      return;
    }
    if (await isVisible(page, '[data-action="auction-continue"]')) {
      await page.click('[data-action="auction-continue"]').catch(() => undefined);
    }
  }
  // land_auction, production, scoring: no live human control, wait it out.
}

//============================================
/**
 * Locate the town cell from a marshalled GameState's plots, so enterTown's
 * townCell option can path the overworld avatar toward it directly. The town
 * plot's position varies by seed, so this cannot be a fixed heading the way
 * walkthrough_helpers.mjs's own default (a fixed east-heading proven only on
 * seed 33) is.
 *
 * @param state - The marshalled GameState.
 * @returns `{ row, col }`, or null (should not happen; every board has
 *   exactly one town plot).
 */
function townCellFromState(state) {
  const terrainGrid = state.plots.map((row) => row.map((plot) => plot.terrain));
  return findTownCell(terrainGrid);
}

//============================================
/**
 * Place a M.U.L.E. on the overworld, first leaving the town interior if the
 * previous plan (buy_mule/outfit_mule) left the avatar there --
 * walkthrough_overworld.mjs's executePlaceMule assumes the avatar is already
 * on the overworld and has no town-exit step of its own, so the orchestrator
 * (this file) owns that transition between the two spatial executors.
 *
 * @param page - The Playwright page.
 * @param report - The walk report (see walkthrough_report.mjs).
 * @param deps - Passed through to exitTown/executePlaceMule.
 * @param plan - The `place_mule` plan (`{ row, col }`).
 * @returns True once the placement is verified, false on a town-exit stall
 *   or a failed placement (both already reported by their own helper).
 */
async function executePlaceMuleFromTown(page, report, deps, plan) {
  if (await isVisible(page, "#town-scene")) {
    const exited = await exitTown(page, report, deps.exitTownOptions);
    if (!exited) {
      return false;
    }
  }
  return executePlaceMule(page, report, deps, { row: plan.row, col: plan.col });
}

//============================================
/**
 * Hunt this round's wampus on the overworld, first leaving the town interior
 * if the previous plan left the avatar there. Mirrors
 * executePlaceMuleFromTown's shape: walkthrough_overworld.mjs's
 * executeHuntWampus assumes the avatar is already on the overworld and has
 * no town-exit step of its own.
 *
 * @param page - The Playwright page.
 * @param report - The walk report (see walkthrough_report.mjs).
 * @param deps - Passed through to exitTown/executeHuntWampus.
 * @returns True once the catch is verified, false on a town-exit stall or a
 *   failed hunt (both already reported by their own helper).
 */
async function executeHuntWampusFromTown(page, report, deps) {
  if (await isVisible(page, "#town-scene")) {
    const exited = await exitTown(page, report, deps.exitTownOptions);
    if (!exited) {
      return false;
    }
  }
  return executeHuntWampus(page, report, deps);
}

//============================================
/**
 * Assay a develop plan's target plot: arm the assay at the town's assay
 * office (walkthrough_town.mjs's executeArmAssay, a walk-in-trigger door use
 * per the M3 town interaction model), exit town, then path the overworld
 * avatar to the plot and fire the assay (walkthrough_overworld.mjs's
 * executeAssayPlot). This orchestrator owns the town-to-overworld
 * transition between the two spatial executors, matching
 * executePlaceMuleFromTown's split.
 *
 * @param page - The Playwright page.
 * @param report - The walk report (see walkthrough_report.mjs).
 * @param deps - Passed through to executeArmAssay/exitTown/executeAssayPlot.
 * @param plan - The `assay_plot` plan (`{ row, col }`).
 * @returns True once the reveal is verified, false on a failed arm, a
 *   town-exit stall, or a failed assay (all already reported by their own
 *   helper).
 */
async function executeAssayPlotFromTown(page, report, deps, plan) {
  if (!(await executeArmAssay(page, report, deps))) {
    return false;
  }
  const exited = await exitTown(page, report, deps.exitTownOptions);
  if (!exited) {
    return false;
  }
  return executeAssayPlot(page, report, deps, { row: plan.row, col: plan.col });
}

//============================================
/**
 * Route one develop gesture plan through executePlan to the matching
 * town/overworld executor (walkthrough_town.mjs, walkthrough_overworld.mjs),
 * or to endDevelopTurn for "end_turn". An out-of-vocabulary plan kind is
 * classified unknown_plan_kind by executePlan itself.
 *
 * @param page - The Playwright page.
 * @param report - The walk report (see walkthrough_report.mjs).
 * @param plan - The develop plan from decideDevelopPlan.
 * @param deps - Passed through to the town/overworld executors (see
 *   activeDriveDevelop).
 * @returns True once the plan's action completed.
 */
async function executeDevelopPlan(page, report, plan, deps) {
  return executePlan(plan, report, {
    buy_mule: () => executeBuyMule(page, report, deps),
    outfit_mule: () => executeOutfitMule(page, report, deps, plan.resource),
    place_mule: () => executePlaceMuleFromTown(page, report, deps, plan),
    gamble_pub: () => executeGamblePub(page, report, deps),
    end_turn: () => endDevelopTurn(page, report),
    hunt_wampus: () => executeHuntWampusFromTown(page, report, deps),
    assay_plot: () => executeAssayPlotFromTown(page, report, deps, plan),
  });
}

//============================================
/**
 * Active develop-phase driver: check the
 * tick-budget truncation guard first (maybeTruncateTurn,
 * walkthrough_overworld.mjs), then re-decide one gesture plan at a time via
 * decideDevelopPlan (a develop turn is reactive, not a fixed script -- see
 * walkthrough_strategy.mjs's note) and execute it, looping until the turn
 * ends (end_turn, gamble_pub, or truncation) or an act fails. hunt_wampus
 * and assay_plot execute spatially (walkthrough_town.mjs/
 * walkthrough_overworld.mjs) and loop back for the next decision rather
 * than ending the turn. Matches the call-once-per-phase-entry contract the
 * other active drivers use.
 *
 * @param page - The Playwright page.
 * @param report - The walk report (see walkthrough_report.mjs).
 * @param deps - The per-run driver deps (ACTIVE_DRIVER_DEPS plus the run's
 *   humanDevelopTurnCounter); this turn's enterTownOptions.townCell is derived
 *   fresh from the live board each loop iteration.
 */
async function activeDriveDevelop(page, report, deps) {
  while (true) {
    const projection = await deps.readProjection(page);
    // Sample the human-develop-turn counter every iteration: this loop is the
    // one place that reliably observes the human holding the develop turn even
    // when the driver blocks the outer poll loop for the whole turn (see
    // createHumanDevelopTurnCounter). Observe before the phase-exit return so
    // the turn's closing edge is caught the moment the turn ends.
    deps.humanDevelopTurnCounter.observe(projection);
    if (projection.phaseKind !== "develop") {
      return;
    }

    const state = marshalProjection(projection);
    const townDeps = { ...deps, enterTownOptions: { townCell: townCellFromState(state) } };
    // Decide the next gesture BEFORE the tick-budget guard. The guard still ends
    // the turn at the reserve either way (identical gameplay), but only COUNTS a
    // truncation when the cut plan commits the budget to a buy/outfit/place
    // gesture (see maybeTruncateTurn/planCommitsBudget). A turn-ending
    // gamble_pub/end_turn, or a free hunt_wampus/assay_plot cut off before it
    // runs, is the develop turn's natural end either way, so ending it at the
    // reserve is not a truncation -- the develop AI emits gamble (which ends
    // the turn), never a bare end_turn, when it is out of productive moves
    // (src/ai/develop_ai.ts), so a plan-blind counter reclassified every
    // out-of-work turn as truncated.
    const plan = decideDevelopPlan(state);
    if (await maybeTruncateTurn(page, report, deps, plan, state)) {
      return;
    }
    report.counters.plansAttempted += 1;

    const completed = await executeDevelopPlan(page, report, plan, townDeps);
    if (report.hasFailed()) {
      return;
    }
    if (completed) {
      report.counters.plansCompleted += 1;
    }
    // end_turn and gamble_pub always end the develop turn (end_turn
    // directly, gamble_pub via town_scene.tsx's confirm-and-end-turn
    // gesture); every other plan kind, including hunt_wampus and
    // assay_plot, loops back for the next decideDevelopPlan call.
    // decideDevelopAction (src/ai/develop_ai.ts) checks the wampus
    // unconditionally before its carriedMule branches and returns
    // assay_plot from the carriedMule === "none" branch, so once a
    // catch/reveal lands the next iteration naturally continues into the
    // turn's real economic gesture (buy_mule, etc) rather than ending here.
    if (plan.kind === "end_turn" || plan.kind === "gamble_pub") {
      return;
    }
  }
}

/**
 * Active-mode phase drivers, keyed by `WalkerProjection.phaseKind`. Each
 * driver owns the full human-seat gesture loop for its phase and is called
 * exactly once, on phase entry, from runPhaseLoop; phases with no entry here
 * (title, production, scoring) have no live human control in either mode.
 */
const ACTIVE_PHASE_DRIVERS = {
  land_grant: driveLandGrant,
  land_auction: driveLandAuction,
  auction: driveAuction,
  develop: activeDriveDevelop,
};

/**
 * Shared deps object passed to every active phase driver: the seat-0
 * strategy adapter's decide* wrappers (walkthrough_strategy.mjs) plus the
 * live projection reader. A driver that does not need a given field simply
 * does not destructure it.
 */
const ACTIVE_DRIVER_DEPS = {
  readProjection: readGameState,
  decideLandGrant,
  decideLandAuction,
  decideAuctionIntent,
};

//============================================
/**
 * Confirm the scoring screen rendered its full ranking: `.scoring-panel`
 * visible with exactly EXPECTED_SCORING_ROW_COUNT `.scoring-row` entries.
 * A mismatch here is a rendering bug, not an expected runtime failure mode,
 * so it throws rather than routing through the closed failureKind taxonomy.
 *
 * @param page - The Playwright page.
 * @returns True once the scoring panel is visible and fully ranked.
 */
async function confirmScoring(page) {
  if (!(await isVisible(page, ".scoring-panel"))) {
    return false;
  }
  const rankedCount = await page.locator(".scoring-row").count();
  if (rankedCount !== EXPECTED_SCORING_ROW_COUNT) {
    throw new Error(
      `expected ${EXPECTED_SCORING_ROW_COUNT} ranked players on the scoring screen, got ${rankedCount}`,
    );
  }
  return true;
}

//============================================
/**
 * Counting contract for `report.counters.humanTurnsCompleted`.
 *
 * A completed human develop turn is counted from the OBSERVED engine phase,
 * not from the walker's own end-turn gesture. On every projection the harness
 * reads -- the phase loop's poll AND the develop driver's per-plan loop --
 * observe() is fed the current projection. humanTurnsCompleted increments once
 * on each transition of `phaseKind` OUT of "develop" (was "develop" on the
 * previous observation, is not now). The human seat is always in the round's
 * develop turn queue and so completes exactly one develop turn per develop
 * phase, so this counts one human develop turn per round.
 *
 * Keying on the develop PHASE leaving, rather than on the human seat's own
 * `activePlayerId` window, is a deliberate robustness choice. The develop
 * phase runs every seat's turn under one contiguous `phaseKind === "develop"`
 * span that lasts many poll intervals, so the poll loop always samples it and
 * always sees it end. The human's own active window can collapse to nearly
 * zero: when an AI seat leads the queue, the driver's pending end-turn click
 * resolves the instant the human seat becomes active and ends the turn at
 * once, so no observation ever catches `activePlayerId === HUMAN_PLAYER_ID`.
 * An activePlayerId-edge counter MISSES that turn -- observed live on seed 7,
 * where every develop sample showed an AI seat active and the count came out 0
 * against 2 rounds reached. Keying on the phase span cannot miss it.
 *
 * This also counts the turn no matter HOW it ended -- the walker's end-turn
 * click, a tick-budget truncation (maybeTruncateTurn), a gamble-triggered
 * synchronous end, or the engine exhausting the tick budget on its own --
 * because every one of those ends the develop phase for that round, which is
 * the transition. The previous design tied the count to the walker's confirmed
 * end-turn click and missed every turn that ended by any other route; whether
 * the click or an auto-advance won was a wall-clock race, so the same seed
 * reported 0, 2, or the right value from run to run.
 *
 * Feeding observe() from both the poll loop and the develop driver is safe:
 * the single "was develop" flag falls at most once per develop phase, so extra
 * samples of the same transition from either source cannot double-count. At
 * scoring humanTurnsCompleted equals the rounds reached, the invariant
 * walkthrough_exec.mjs's assertActiveInvariants checks.
 *
 * @param report - The walk report whose counters.humanTurnsCompleted is bumped.
 * @returns `{ observe }`, where observe(projection) feeds one observation.
 */
export function createHumanDevelopTurnCounter(report) {
  let previousPhaseWasDevelop = false;

  //============================================
  /**
   * Feed one observed projection to the counter, incrementing
   * humanTurnsCompleted on the transition of phaseKind out of "develop".
   *
   * @param projection - A WalkerProjection (src/ui/walker_debug.ts); only
   *   phaseKind is read.
   */
  function observe(projection) {
    const isDevelop = projection.phaseKind === "develop";
    if (previousPhaseWasDevelop && !isDevelop) {
      report.counters.humanTurnsCompleted += 1;
    }
    previousPhaseWasDevelop = isDevelop;
  }

  return { observe };
}

//============================================
/**
 * Drive the phase loop from whatever phase the game is already in
 * (immediately after New Game) through to the scoring screen: on every
 * phase-kind change, close out the prior phase's timing, open the new
 * phase's timing, save a screenshot, and (in active mode) call that phase's
 * driver once; act passively for the current phase when active mode is off
 * or the phase has no driver; and enforce both a per-phase and a whole-run
 * wall-clock budget.
 *
 * @param page - The Playwright page.
 * @param report - The walk report (see walkthrough_report.mjs).
 * @param screenshotsDir - Absolute directory to save phase screenshots into.
 * @param mode - The game mode, selecting the whole-run budget.
 * @param active - True to drive land grant, land auction, and goods auction
 *   through the seat-0 strategy adapter (see ACTIVE_PHASE_DRIVERS); false to
 *   restore the M2 passive-fallback baseline for every phase.
 * @returns `{ reachedScoring, finalRound, colonyFailed }`. `finalRound` is
 *   the `state.round` reached at scoring, or null when scoring was not
 *   reached. `colonyFailed` is the scoring phase's own
 *   `ScoringPayload.colonyFailed` flag (src/engine/scoring.ts
 *   `checkColonyFailure`, true only on a non-final round), or null when
 *   scoring was not reached.
 */
async function runPhaseLoop(page, report, screenshotsDir, mode, active) {
  const runDeadline = Date.now() + RUN_BUDGET_MS_BY_MODE[mode];
  // One counter for the whole run: it tracks the human-develop-turn edge across
  // every round. Fed here on every poll AND (in active mode) from the develop
  // driver, which the per-run deps below carry it into.
  const humanDevelopTurnCounter = createHumanDevelopTurnCounter(report);
  const driverDeps = { ...ACTIVE_DRIVER_DEPS, humanDevelopTurnCounter };
  let currentPhaseKind = null;
  let phaseDeadline = Date.now() + PHASE_BUDGET_MS;
  let phaseIndex = 0;

  while (Date.now() < runDeadline) {
    const projection = await readGameState(page);
    humanDevelopTurnCounter.observe(projection);
    if (projection.phaseKind !== currentPhaseKind) {
      if (currentPhaseKind !== null) {
        report.endPhase(currentPhaseKind);
      }
      currentPhaseKind = projection.phaseKind;
      phaseIndex += 1;
      phaseDeadline = Date.now() + PHASE_BUDGET_MS;
      report.beginPhase(currentPhaseKind);
      const shotName = `phase_${String(phaseIndex).padStart(2, "0")}_${currentPhaseKind}.png`;
      await report.screenshot(page, shotName, screenshotsDir);

      if (active && ACTIVE_PHASE_DRIVERS[currentPhaseKind] !== undefined) {
        // Call the driver once, on phase entry; it loops internally until
        // the phase ends or one of its acts fails. Check the report's
        // failure state right away rather than waiting for a later timeout
        // to notice the driver already gave up.
        await runActivePhaseDriver(
          ACTIVE_PHASE_DRIVERS[currentPhaseKind],
          page,
          report,
          driverDeps,
        );
        if (report.hasFailed()) {
          return { reachedScoring: false, finalRound: null, colonyFailed: null };
        }
      }
    }

    if (currentPhaseKind === "scoring" && (await confirmScoring(page))) {
      report.endPhase(currentPhaseKind);
      const scoringPhase = projection.state.phase;
      const colonyFailed =
        scoringPhase.kind === "scoring" ? scoringPhase.payload.colonyFailed : null;
      return { reachedScoring: true, finalRound: projection.state.round, colonyFailed };
    }

    if (Date.now() > phaseDeadline) {
      report.fail("phase_timeout", `phase "${currentPhaseKind}" exceeded its per-phase budget`);
      return { reachedScoring: false, finalRound: null, colonyFailed: null };
    }

    if (!active || ACTIVE_PHASE_DRIVERS[currentPhaseKind] === undefined) {
      await actForPhase(page, currentPhaseKind, report);
    }
    await page.waitForTimeout(POLL_INTERVAL_MS);
  }

  report.fail("run_stalled", "walkthrough did not reach scoring within the whole-run budget");
  return { reachedScoring: false, finalRound: null, colonyFailed: null };
}

//============================================
/**
 * Run the full phase loop: launch bootstrap, drive every phase to scoring,
 * enforce the active-mode invariants (assertActiveInvariants,
 * walkthrough_exec.mjs) while the live report handle is still available, and
 * write the evidence report into screenshotsDir. write() runs in a finally
 * block wrapping the whole bootstrap/phase-loop/invariant-check sequence, so
 * ANY thrown error along that path (an invariant violation, a phase driver
 * throw such as driveAuction's tick-ceiling guard, a bootstrap failure) still
 * persists playthrough_report.json before the caller sees the failure --
 * previously only the clean-completion path ever called write(), so a stuck
 * auction was the one failure mode that lost the whole evidence trail.
 *
 * @param options - Parsed CLI options.
 * @returns `{ reachedScoring, reportPath, finalRound }`. `finalRound` is the
 *   `state.round` reached at scoring, or null when scoring was not reached.
 *   The written report additionally records `run.colonyFailed` (see
 *   runPhaseLoop).
 */
async function runWalkthrough(options) {
  const report = createWalkReport({ seed: options.seed, mode: options.mode, speed: options.speed });
  buildSiteIfStale();
  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const screenshotsDir = resolveScreenshotsDir(options.screenshotsDir);

  let loopResult;
  let reportPath;
  try {
    try {
      const browser = await launchBrowser();
      try {
        const page = await browser.newPage();
        report.attachErrorCollectors(page);

        await bootstrapGame(page, baseUrl, {
          seed: options.seed,
          mode: options.mode,
          speed: options.speed,
        });
        await saveScreenshot(page, screenshotsDir, "initial_state.png");

        loopResult = await runPhaseLoop(page, report, screenshotsDir, options.mode, options.active);
      } finally {
        await browser.close();
      }
    } finally {
      server.close();
    }

    if (options.active && loopResult.reachedScoring && !report.hasFailed()) {
      assertActiveInvariants(report, loopResult.finalRound);
    }
  } finally {
    reportPath = report.write(screenshotsDir, {
      finalRound: loopResult?.finalRound ?? null,
      colonyFailed: loopResult?.colonyFailed ?? null,
    });
  }
  return {
    reachedScoring: loopResult.reachedScoring,
    reportPath,
    finalRound: loopResult.finalRound,
  };
}

//============================================
/**
 * Read the written report back off disk and print its summary block, so a
 * caller sees the same failure/counters data that was persisted.
 *
 * @param reportPath - Absolute path of playthrough_report.json.
 * @returns `{ failure, counters }` from the written report (`failure` is
 *   null on a clean run).
 */
function printReportSummary(reportPath) {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  console.log("==> playthrough_report.json summary:");
  console.log(
    JSON.stringify(
      { run: report.run, failure: report.failure, counters: report.counters },
      null,
      2,
    ),
  );
  return { failure: report.failure, counters: report.counters };
}

//============================================
/**
 * Entry point: parse args, run the bootstrap or the full phase loop, print
 * PASS/FAIL, and exit with the matching status code.
 */
async function main() {
  const options = parseArgs(process.argv.slice(2));
  const label = `seed=${options.seed} mode=${options.mode} ${options.active ? "active" : "passive"}`;
  try {
    if (options.bootstrapOnly) {
      await runBootstrap(options);
      console.log(`e2e_walkthrough: PASS (${label} bootstrap-only)`);
      return;
    }

    const { reachedScoring, reportPath } = await runWalkthrough(options);
    const { failure } = printReportSummary(reportPath);
    if (!reachedScoring || exitCodeForFailure(failure) !== 0) {
      throw new Error(
        `walkthrough did not complete cleanly (reachedScoring=${reachedScoring}, ` +
          `failure=${failure === null ? "none" : failure.failureKind})`,
      );
    }
    console.log(`e2e_walkthrough: PASS (${label})`);
  } catch (error) {
    console.error(`e2e_walkthrough: FAIL - ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}

//============================================
// Run the harness only when this file is executed directly (node
// tests/e2e/e2e_walkthrough.mjs ...), NOT when it is imported by a unit test
// (tests/test_walkthrough_turn_counter.mjs importing
// createHumanDevelopTurnCounter). Keeping the module body import-safe lets the
// counter be exercised without a live browser, the same import-safety
// walkthrough_exec.mjs relies on for its own unit tests.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
