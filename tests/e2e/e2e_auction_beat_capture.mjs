// Deterministic goods-auction beat-capture driver, part of the
// docs/active_plans/active/auction_native_recompose.md plan. Reaches every named
// auction beat with no human in the loop and screenshots each one at both
// supported viewports (1024x640 -- the MINIMUM supported stage and the
// binding legibility case; 1280x800 -- nominal), so the automated
// image-evaluator gate always judges a complete, correctly-labeled evidence set.
//
// Per docs/E2E_TESTS.md (non-browser tier, tests/e2e/, e2e_* naming,
// self-contained, run directly rather than via pytest). Uses playwright-core
// (not "playwright" / "@playwright/test"), matching every other driver in
// this directory, so this file may live under tests/e2e/ without tripping
// the tests/playwright-only import rule (tests/test_test_naming_conventions.py).
//
// Run:
//   node --import tsx tests/e2e/e2e_auction_beat_capture.mjs
// Writes 14 PNGs into output_smoke/auction_beats/ (7 beats x 2 viewports),
// reusing that stable directory name across runs (docs/REPO_STYLE.md: reuse
// one output folder rather than minting a one-off name). Deliberately NOT
// under test-results/: Playwright CLEARS its outputDir at the start of every
// "npx playwright test" run, and that path was a real collision in this
// repo, where many concurrent lanes run the Playwright suite while this
// driver is also running (confirmed by observation: a run's 14 files were
// wiped down to 1 by a concurrent Playwright invocation before this fix).
// playwright.config.ts now scopes outputDir to test-results/playwright/ so
// Playwright only clears its own subtree, but this driver still avoids
// test-results/ entirely -- output_smoke/ makes ownership unambiguous
// without depending on Playwright's config staying scoped. Exits non-zero
// if any beat fails to capture -- a run that quietly produces fewer than 14
// files and exits 0 is the exact failure mode this driver is designed
// against, since the automated judge would silently accept an incomplete set.
//
// SEED AND GOOD ORDER (seed 1234, both modes; discovered by direct engine
// simulation -- see the header note on the skipped-window beat below):
// AUCTION_GOOD_ORDER (src/engine/turn.ts, not exported) is
// [smithore, crystite, food, energy]. At seed 1234 smithore's round-1 window
// is live with store stock (matches tests/playwright/auction_scene.spec.mjs's
// header comment: "reaches a smithore window whose store holds stock"), and
// crystite's round-1 window is ALREADY skipped -- confirmed both by a direct
// engine scan (see below) and by the existing node test
// tests/test_auction.mjs's "crystite ... is skipped when no crystite exists"
// case, which uses the same seed-independent fact (no plot has produced
// crystite yet at round 1). This lets six of the seven beats -- everything
// but the sit-out fast-forward beat -- come from ONE continuous playthrough:
// smithore's declare/status/live/trade/finished beats, then crystite's
// already-skipped window, in natural sequence with no synthetic fixture
// needed.
//
// SKIPPED-WINDOW DISCOVERY METHOD (per the work order: "scan seeds via the
// projection... hard-code the discovered seed with a comment recording how
// it was found"): rather than scanning seeds through a live browser (slow --
// each seed needs a full land-grant/develop/production playthrough before
// any auction window exists), the scan ran directly against the engine
// reducer in Node (src/engine/game_state.ts's applyAction +
// src/engine/turn.ts's createInitialGameState, driven by the same all-AI
// decision functions tests/e2e/e2e_balance_sim.mjs already uses for its
// balance sim), which is the SAME state the browser's window.muleGameState()
// projection is built from -- just reached without paying browser/DOM cost
// per seed. A one-off scratch script (deleted after use) played seeds 1..50
// in both modes and found crystite's round-1 window skipped in EVERY one of
// them (round-1 crystite requires a player to have already developed and
// worked a crystite plot, which structurally cannot happen before round 1's
// production has run) -- so seed 1234, already fixed for the other beats, was
// confirmed to carry the same property rather than introducing a second seed:
//   node --import tsx <scratch>.mjs  ->
//     mode=beginner seed=1234: [{round:1,good:"smithore",skipped:false},
//       {round:1,good:"crystite",skipped:true}, ...]
//     mode=standard seed=1234: same result
// No synthetic replay_fixture.ts fallback is needed as a result; it stays
// documented in the plan as the escape hatch if a future seed change ever
// breaks this property.
//
// SPEED CHOICES (deliberate per beat; see the two traps this plan's work
// order names -- ?speed= compounds with the in-game sit-out fast-forward
// factor, and Locator.isVisible() throws on a multi-match selector):
//   - Session A (speed=8): declare/status, live motion, trade feedback
//     (flash-count proxy), finished, and the skipped window. The human plays
//     BUYER for smithore here, never "out", so the sit-out compounding trap
//     never applies and speed=8 is the same proven cadence
//     tests/playwright/auction_scene.spec.mjs already uses successfully at
//     this seed.
//   - Session B (speed=2): the sit-out fast-forward beat needs the human
//     committed "out". AUCTION_SIT_OUT_FACTOR is 10x (scene_manager.ts) and
//     ?speed= MULTIPLIES on top of it (auctionTickMs's own doc comment: "the
//     two speed-ups compose"), so at speed=8 the effective tick cadence
//     during sit-out would be 500ms / 10 / 8 =~ 6.25ms/tick -- far too fast
//     for a screenshot round-trip to land inside the window before it closes
//     (AUCTION_QUIET_TICK_BUDGET is only 8 ticks). speed=2 keeps that cadence
//     at 500ms / 10 / 2 = 25ms/tick, giving at least ~75-200ms of margin
//     (3-8 quiet ticks) to observe the `[data-fast="true"]` indicator and
//     capture it, while still reaching food's auction window (the third good)
//     in bounded real time. A fresh page session is used for this beat rather
//     than reusing Session A's page, since ?speed= is read once at page load
//     (src/ui/main.tsx) and cannot be changed mid-session.
//
// SELECTOR CONTRACT (the stable contract this driver depends on; unchanged by
// the arena's in-flight recomposition -- see auction_screen.tsx's own header
// comment, the source of truth this comment block summarizes):
//   - [data-action="auction-role"][data-role="buyer|seller|out"]: the three
//     role buttons, present and clickable from tick 0's first frame.
//   - [data-action="auction-intent-up"] / "-down": while the window is live.
//   - [data-action="auction-continue"]: while the window is finished
//     (including an already-finished skipped window).
//   - .auction-screen[data-beat="declare|live|finished"]: which beat the
//     shell itself believes it is showing, for a driver-side cross-check.
//   - .auction-trade-layer[data-flash-count]: monotonic trade counter.
//   - [data-fast="true"]: the sit-out fast-forward indicator (rendered
//     conditionally by auction_arena.tsx's TopBand; absent otherwise).
//   - .auction-status-layer: the status/accounting beat's own root.
//
// TRADE-FEEDBACK BEAT: the transient "UNITS TRADED n" banner
// (src/ui/scenes/auction_trade_fx.ts) landed while this driver was under
// construction -- the discovery run against the pre-trade-fx tree found no
// banner (grep confirmed no auction_trade_fx.ts module yet) and used the
// `data-flash-count` increment as a proxy capture point; a later verification
// run against the merged tree confirmed the banner itself is now in frame at
// that same capture point (the moment a store trade fires is exactly when the
// banner appears), so no re-capture is needed per this driver's own
// acceptance criteria ("trade-feedback... re-captured after the trade-fx
// layer merges if the dry run predates it"). The `data-flash-count` wait
// condition is kept as the capture trigger regardless of banner text, since
// it is the durable, selector-contract-documented signal (see
// auction_screen.tsx's header comment) rather than a fragile string match on
// the banner's copy.

import path from "node:path";
import {
  REPO_ROOT,
  buildSiteIfStale,
  startServer,
  launchBrowser,
  bootstrapGame,
  clickRequired,
} from "./walkthrough_helpers.mjs";
import { createWalkReport } from "./walkthrough_report.mjs";

/** Fixed deterministic seed shared by every beat (see header note). */
const SEED = 1234;

/** Game mode: the title screen's default, matching the existing safety-net spec. */
const MODE = "beginner";

/** Session A speed: buyer-role beats, proven cadence (see header note). */
const SESSION_A_SPEED = 8;

/** Session B speed: the sit-out beat, chosen to avoid the compounding trap. */
const SESSION_B_SPEED = 2;

/** Stable, reused output directory (docs/REPO_STYLE.md smoke-test convention;
 * output_smoke/ matches tests/e2e/e2e_balance_sim.mjs's own convention and
 * stays clear of Playwright's test-results/ outputDir -- see header note). */
const OUTPUT_DIR = path.join(REPO_ROOT, "output_smoke", "auction_beats");

/** The two supported viewports; 1024x640 is the binding legibility case. */
const VIEWPORTS = [
  { name: "1024x640", width: 1024, height: 640 },
  { name: "1280x800", width: 1280, height: 800 },
];

/** Generous ceiling for reaching the auction's first role buttons (land grant
 * + develop + production autoplay entirely on timers at this driver's chosen
 * speeds; slow at Session B's speed=2, bounded well above the observed cost). */
const REACH_AUCTION_TIMEOUT_MS = 90_000;

//============================================
/**
 * Claim whichever plot the land-grant sweep cursor (src/engine/land_grant.ts)
 * is currently on, via the same Enter key `claim_current_plot` binds to. The
 * cursor position is engine-driven, so this mirrors
 * tests/playwright/auction_scene.spec.mjs's proven claimCurrentLandGrantPlot
 * rather than a locator race against a specific cell.
 *
 * @param page - The Playwright page.
 */
async function claimCurrentLandGrantPlot(page) {
  await page.locator("#game-map .map-svg g[data-row][data-col]").first().waitFor();
  await page.keyboard.press("Enter");
}

/** Upper bound on land-grant Pass clicks before concluding something is stuck. */
const MAX_PASS_ITERATIONS = 50;

//============================================
/**
 * Click the land-grant Pass button until it disappears (AI turns finish and
 * develop takes over), or throw if it never does. Mirrors
 * tests/playwright/auction_scene.spec.mjs's passThroughLandGrant.
 *
 * @param page - The Playwright page.
 */
async function passThroughLandGrant(page) {
  const passButton = page.locator("#land-grant-pass-button");
  for (let i = 0; i < MAX_PASS_ITERATIONS; i += 1) {
    const visible = await passButton.isVisible().catch(() => false);
    if (!visible) {
      return;
    }
    await passButton.click();
    await page.waitForTimeout(30);
  }
  const stillVisible = await passButton.isVisible().catch(() => false);
  if (stillVisible) {
    throw new Error(`land-grant Pass button still visible after ${MAX_PASS_ITERATIONS} clicks`);
  }
}

//============================================
/**
 * Drive a fresh game from the title screen to the goods-auction's opening
 * role-choice bar: claim a plot, pass the rest of land grant, and wait for
 * the first role button. Develop and production autoplay on their own timers
 * with no action required (matching the proven pattern in
 * tests/playwright/auction_scene.spec.mjs).
 *
 * @param page - The Playwright page.
 */
async function reachAuctionRoleChoice(page) {
  await claimCurrentLandGrantPlot(page);
  await passThroughLandGrant(page);
  await page
    .locator('[data-action="auction-role"]')
    .first()
    .waitFor({ state: "visible", timeout: REACH_AUCTION_TIMEOUT_MS });
}

//============================================
/**
 * Read the current auction window's payload fields off the live page, or
 * null when the phase is not "auction". Uses the same
 * window.muleGameState().state.phase seam
 * tests/playwright/auction_scene.spec.mjs already reads successfully.
 *
 * @param page - The Playwright page.
 * @returns `{ good, tick, finished, skipped }`, or null.
 */
async function readAuctionPayload(page) {
  return page.evaluate(() => {
    const phase = window.muleGameState().state.phase;
    if (phase.kind !== "auction") {
      return null;
    }
    const payload = phase.payload;
    return {
      good: payload.good,
      tick: payload.tick,
      finished: payload.finished,
      skipped: payload.skipped,
    };
  });
}

//============================================
/**
 * Poll readAuctionPayload until `predicate` holds or the timeout expires,
 * throwing a message naming both the predicate's intent and the last
 * observed payload -- the same "engine evidence, not a bare timeout" shape
 * tests/e2e/walkthrough_auction.mjs's actAndWaitProgress uses, kept local
 * here since this driver's polling needs (payload field predicates, not
 * click-then-verify) do not need that helper's act()/beforeSnapshot shape.
 *
 * @param page - The Playwright page.
 * @param predicate - `(payload) => boolean`; payload is never null here since
 *   every call site polls from inside a known-live auction phase.
 * @param description - Human-readable description of what is being awaited,
 *   used in the timeout error.
 * @param timeoutMs - Wall-clock budget.
 * @returns The payload snapshot the moment the predicate first held.
 */
async function waitForAuctionPayload(page, predicate, description, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await readAuctionPayload(page);
    if (last !== null && predicate(last)) {
      return last;
    }
    await page.waitForTimeout(50);
  }
  throw new Error(
    `waitForAuctionPayload: timed out after ${timeoutMs}ms waiting for "${description}". ` +
      `Last observed payload: ${JSON.stringify(last)}`,
  );
}

//============================================
/**
 * Save one beat's screenshot and log its path, failing loudly (not silently)
 * if the write itself throws -- the exact "quietly produces fewer files"
 * failure mode this driver is designed against.
 *
 * @param page - The Playwright page.
 * @param report - The walk report, for its screenshot helper.
 * @param beatFileStem - File stem (no extension), e.g. "01_status_accounting".
 * @param viewportName - The viewport label, e.g. "1024x640".
 * @param captured - Accumulator array this call appends the absolute path to.
 */
async function captureBeat(page, report, beatFileStem, viewportName, captured) {
  const fileName = `${beatFileStem}_${viewportName}.png`;
  await report.screenshot(page, fileName, OUTPUT_DIR);
  const fullPath = path.join(OUTPUT_DIR, fileName);
  console.log(`==> captured ${fileName}`);
  captured.push(fullPath);
}

//============================================
/**
 * Session A: declare/status (tick 0), live motion, trade feedback, finished,
 * and the already-skipped crystite window -- six of the seven beats, all
 * reachable from ONE continuous smithore-then-crystite playthrough with the
 * human playing buyer (never "out", so the sit-out speed trap never applies).
 *
 * @param page - The Playwright page, already sized to one viewport.
 * @param baseUrl - The static server's origin.
 * @param report - The walk report.
 * @param viewportName - The viewport label for file naming.
 * @param captured - Accumulator array every capture appends its path to.
 */
async function runSessionA(page, baseUrl, report, viewportName, captured) {
  await bootstrapGame(page, baseUrl, { seed: SEED, mode: MODE, speed: SESSION_A_SPEED });
  await reachAuctionRoleChoice(page);

  // Beat 1 + 2: status/accounting and declare are the SAME rendered overlay
  // by design (auction_screen.tsx's DeclareOverlay renders AuctionStatusLayer
  // and the role buttons together, in that reading order, above the buttons
  // -- never stacked over them). Two named files record that both are
  // reachable and visible simultaneously at tick 0, matching the plan's
  // "usage is presented inside the status beat" directive.
  const declarePayload = await readAuctionPayload(page);
  if (declarePayload === null || declarePayload.tick !== 0 || declarePayload.good !== "smithore") {
    throw new Error(
      `expected smithore at tick 0 for the declare/status beat, got ${JSON.stringify(declarePayload)}`,
    );
  }
  await captureBeat(page, report, "01_status_accounting", viewportName, captured);
  await captureBeat(page, report, "02_declare", viewportName, captured);

  // Commit Buy: the smithore window at seed 1234 has store stock, so a buyer
  // holding the raise key rises toward the store's sell quote and fires a
  // deterministic trade (matching auction_scene.spec.mjs's proven setup).
  await clickRequired(page, '[data-action="auction-role"][data-role="buyer"]', report, {
    detail: "human buyer commit for smithore",
  });
  await page.keyboard.down("ArrowRight");

  // Beat 3: live motion -- a couple of ticks in, avatars have moved and the
  // price lines are live.
  await waitForAuctionPayload(page, (p) => p.tick >= 2, "smithore tick >= 2 (live motion)", 20_000);
  await captureBeat(page, report, "03_live_motion", viewportName, captured);

  // Beat 4: trade feedback -- the flash counter increments the instant a
  // store trade fires, which is also the moment the "UNITS TRADED n"
  // banner appears (see the header note); the flash-count wait is the
  // capture trigger since it is the durable selector-contract signal, not a
  // fragile match on the banner's copy.
  await page.locator(".auction-trade-layer").waitFor({ state: "attached", timeout: 20_000 });
  await page.waitForFunction(
    () => {
      const layer = document.querySelector(".auction-trade-layer");
      return layer !== null && Number(layer.getAttribute("data-flash-count") ?? "0") > 0;
    },
    null,
    { polling: 50, timeout: 20_000 },
  );
  await captureBeat(page, report, "04_trade_feedback", viewportName, captured);

  // Beat 6: finished overlay -- keep holding the raise key until the window
  // closes on its own (quiet-tick timeout), the same raf-polled detection
  // tests/playwright/auction_scene.spec.mjs uses for its own brief window.
  await page.waitForFunction(
    () => {
      const phase = window.muleGameState().state.phase;
      return phase.kind === "auction" && phase.payload.finished === true;
    },
    null,
    { polling: "raf", timeout: 30_000 },
  );
  await page.keyboard.up("ArrowRight");
  await captureBeat(page, report, "06_finished", viewportName, captured);

  // Beat 7: the skipped window -- crystite's round-1 window is created
  // already skipped+finished (see header note), so Continue advances the
  // sequencer straight to it with no declare step, and it is finished the
  // instant it is observed.
  await clickRequired(page, '[data-action="auction-continue"]', report, {
    detail: "advance past smithore",
  });
  const crystitePayload = await waitForAuctionPayload(
    page,
    (p) => p.good === "crystite",
    "sequencer advances to crystite",
    10_000,
  );
  if (!crystitePayload.skipped || !crystitePayload.finished) {
    throw new Error(
      `expected crystite's round-1 window to be pre-skipped and finished, got ` +
        `${JSON.stringify(crystitePayload)} -- the skipped-window discovery (see header note) ` +
        "no longer holds for this seed/mode; rescan and update the header comment",
    );
  }
  await captureBeat(page, report, "07_skipped_window", viewportName, captured);
}

//============================================
/**
 * Session B: the sit-out fast-forward beat. A fresh page/session is used
 * because ?speed= is read once at page load; see the header note on why
 * SESSION_B_SPEED differs from Session A's.
 *
 * @param page - The Playwright page, already sized to one viewport.
 * @param baseUrl - The static server's origin.
 * @param report - The walk report.
 * @param viewportName - The viewport label for file naming.
 * @param captured - Accumulator array every capture appends its path to.
 */
async function runSessionB(page, baseUrl, report, viewportName, captured) {
  await bootstrapGame(page, baseUrl, { seed: SEED, mode: MODE, speed: SESSION_B_SPEED });
  await reachAuctionRoleChoice(page);

  // Sit out smithore too, purely to reach food (the third good) quickly --
  // the sit-out fast-forward applies to any good, so this closes fast.
  await clickRequired(page, '[data-action="auction-role"][data-role="out"]', report, {
    detail: "sit out smithore to reach food quickly",
  });
  await waitForAuctionPayload(
    page,
    (p) => p.finished === true,
    "smithore sit-out window closes",
    20_000,
  );

  await clickRequired(page, '[data-action="auction-continue"]', report, {
    detail: "advance past smithore (session B)",
  });
  await waitForAuctionPayload(
    page,
    (p) => p.good === "crystite",
    "sequencer advances to crystite (session B)",
    10_000,
  );
  await clickRequired(page, '[data-action="auction-continue"]', report, {
    detail: "advance past the skipped crystite window",
  });
  await waitForAuctionPayload(
    page,
    (p) => p.good === "food" && p.tick === 0,
    "sequencer advances to food's declare beat",
    10_000,
  );

  // Beat 5: commit Sit Out for food, then capture the instant the FAST
  // indicator appears -- see the header note's speed reasoning for why
  // SESSION_B_SPEED keeps this catchable.
  await clickRequired(page, '[data-action="auction-role"][data-role="out"]', report, {
    detail: "sit out food for the fast-forward beat",
  });
  await page.waitForFunction(() => document.querySelector('[data-fast="true"]') !== null, null, {
    polling: 50,
    timeout: 5_000,
  });
  const foodPayload = await readAuctionPayload(page);
  if (foodPayload === null || foodPayload.finished) {
    throw new Error(
      `expected the food window still live with the FAST indicator showing, got ` +
        `${JSON.stringify(foodPayload)}`,
    );
  }
  await captureBeat(page, report, "05_sitout_fastforward", viewportName, captured);
}

//============================================
/**
 * Run both sessions at one viewport, returning the list of captured file
 * paths (7 per viewport).
 *
 * @param browser - The launched browser.
 * @param baseUrl - The static server's origin.
 * @param report - The walk report.
 * @param viewport - `{ name, width, height }`.
 * @returns Array of absolute screenshot paths captured this viewport.
 */
async function runViewport(browser, baseUrl, report, viewport) {
  const captured = [];
  console.log(`==> viewport ${viewport.name}: session A (speed=${SESSION_A_SPEED})`);
  const pageA = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
  });
  await runSessionA(pageA, baseUrl, report, viewport.name, captured);
  await pageA.close();

  console.log(`==> viewport ${viewport.name}: session B (speed=${SESSION_B_SPEED})`);
  const pageB = await browser.newPage({
    viewport: { width: viewport.width, height: viewport.height },
  });
  await runSessionB(pageB, baseUrl, report, viewport.name, captured);
  await pageB.close();

  return captured;
}

//============================================
async function main() {
  buildSiteIfStale();
  const { server, port } = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const browser = await launchBrowser();
  const report = createWalkReport({ seed: SEED, mode: MODE, speed: SESSION_A_SPEED });

  const allCaptured = [];
  try {
    for (const viewport of VIEWPORTS) {
      const captured = await runViewport(browser, baseUrl, report, viewport);
      allCaptured.push(...captured);
    }
  } finally {
    await browser.close();
    server.close();
  }

  const expectedCount = 7 * VIEWPORTS.length;
  if (allCaptured.length !== expectedCount) {
    throw new Error(
      `expected ${expectedCount} captured beats, got ${allCaptured.length}: ` +
        `${JSON.stringify(allCaptured)}`,
    );
  }
  console.log(`==> all ${allCaptured.length} beat screenshots captured in ${OUTPUT_DIR}`);
  for (const filePath of allCaptured) {
    console.log(`    ${filePath}`);
  }
  process.exit(0);
}

main().catch((error) => {
  console.error("FAIL: e2e_auction_beat_capture:", error);
  process.exit(1);
});
