// Behavior-only safety net for the goods-auction screen. This is the TRUSTED,
// auction-scoped release gate for the auction_native_recompose plan
// (docs/active_plans/active/auction_native_recompose.md): it runs on its own
// command against the deterministic seed 1234 and has no dependency on the
// full-game walkthrough sweep, which stays informational while suspended (see
// docs/active_plans/decisions/walkthrough_gate_suspension.md).
//
// Assertions read game state through the same testing seam
// tests/e2e/walkthrough_helpers.mjs's readGameState polls
// (window.muleGameState(), installed by src/ui/game_driver.ts) and read DOM
// values that describe what the PLAYER can do and what the GAME does in
// response. Geometry correctness (pixel positions, region constants) belongs
// to the node-tested geometry module (src/ui/scenes/auction_geometry.ts) and
// the automated visual gate, not here.
//
// Selector contract (the composition this spec drives):
//   - src/ui/solid/auction_screen.tsx:294-296 -- [data-action="auction-role"]
//     [data-role="buyer"|"seller"|"out"]: all three, clickable from tick 0.
//   - src/ui/solid/auction_screen.tsx:365-374 -- [data-action="auction-intent-up"]
//     / [data-action="auction-intent-down"]: press-and-hold, while the window is live.
//   - src/ui/solid/auction_screen.tsx:338-339 -- [data-action="auction-continue"]:
//     while the window is finished.
//   - src/ui/solid/auction_screen.tsx:189-192 -- .auction-screen[data-reduced-motion]
//     [data-beat]: the emulated-preference readback and the current beat.
//   - src/ui/scenes/auction_arena.tsx:1242-1249,319-324 -- .auction-avatar
//     [data-actor="player-N"][data-role]: [data-x]/[data-y] written each frame
//     by the tween loop.
//   - src/ui/scenes/auction_arena.tsx:614-620 -- .auction-trade-layer
//     [data-flash-count]: monotonic trade-animation counter.
//   - src/ui/scenes/auction_arena.tsx:698 -- .auction-fast-indicator[data-fast]:
//     the sit-out fast-forward indicator.
//   - src/ui/scenes/auction_dock.tsx:266,320-322,210-212 -- .auction-dock-row
//     [data-player=N] addresses one player's lane row by player, and
//     data-col="money"|"units"|"traded" on each numeric text (lane rows,
//     header row, and .auction-dock-store-row) names which column a value is
//     -- money, units-held, and units-traded all share the base
//     .auction-dock-data-text class with no other distinguishing mark, so a
//     lane's TRADED value is read via
//     .auction-dock-row[data-player=N] [data-col="traded"], never a
//     DOM-index selector.
//   - src/ui/scenes/auction_status.tsx:225-227 -- .auction-status-layer
//     [data-reduced-motion].
//   - src/ui/scenes/auction_trade_fx.ts:129,150,190 -- .auction-trade-flash-burst,
//     .auction-trade-goods, .auction-trade-banner: the trade-feedback layer's
//     imperative DOM children.
//   - src/ui/scenes/scene_manager.ts:80,148,257-258,499-501 -- the clock-hold
//     invariant (isAuctionTickable / humanAuctionCommitted) and
//     AUCTION_SIT_OUT_FACTOR (10x), read indirectly through payload.tick and
//     the FAST indicator rather than through any private engine state.
//   - src/ui/solid/game_screen.tsx:170-171,389-391 -- #game-hud's visibility,
//     driven by phaseOwnsFullStage(kind) === (kind === "auction").
//
// Seed 1234 is fixed (matching tick_ownership.spec.mjs) and reaches a smithore
// window whose store holds stock, so a human Buyer holding the raise key rises
// toward the store's sell quote and a store trade fires. Smithore is the first
// good in AUCTION_GOOD_ORDER (src/engine/turn.ts); crystite is second and is
// structurally skipped in round 1 (nothing has mined any yet, so the store
// holds no crystite stock and tradePossible() is false -- src/engine/
// auction.ts's tradePossible), which several tests below rely on rather than
// re-deriving. Player 0 is always the human and always picks first in round 1
// (src/engine/land_grant.ts).
//
// Speed choice: every test below drives the title-screen -> land-grant ->
// develop -> production -> auction run at ?speed=8, matching the rest of this
// suite; a lower speed pushes that run past this file's test timeout (measured:
// speed=2 alone exceeded 30s just reaching the role-choice panel). The one test
// that needs animation-frame-granularity sampling (the tween regression test)
// was verified empirically at speed=8 to still yield multiple distinct
// intermediate data-x values per tick (5 in one measured run) -- comfortably
// more than the 1 a snap-to-target regression would produce -- so no test here
// needs a slower speed.

import { test, expect } from "@playwright/test";

/** Upper bound on land-grant pass clicks before we conclude something is stuck. */
const MAX_PASS_ITERATIONS = 50;

/** Upper bound on auction goods to sit out through in the HUD-restoration test
 * (AUCTION_GOOD_ORDER has 4 entries; extra headroom guards against an infinite
 * loop turning into a hung test rather than a clear failure). */
const MAX_GOODS_TO_SIT_OUT = 6;

//============================================
/**
 * Claim whichever plot the land-grant sweep cursor (src/engine/land_grant.ts)
 * is currently on, via the same Enter key `claim_current_plot` binds to
 * (land_grant_panel.tsx). The cursor's position is engine-driven and
 * timing-dependent, so this is the robust way to claim a plot in a spec --
 * clicking a specific locator would race the sweep and could miss.
 *
 * @param page - The Playwright page.
 */
async function claimCurrentLandGrantPlot(page) {
  await page.locator("#game-map .map-svg g[data-row][data-col]").first().waitFor();
  await page.keyboard.press("Enter");
}

//============================================
/**
 * Click the land-grant Pass button until it disappears (AI turns finish and the
 * develop phase takes over), or throw if it never does.
 *
 * @param page - The Playwright page.
 */
async function passThroughLandGrant(page) {
  const passButton = page.locator("#land-grant-pass-button");
  for (let i = 0; i < MAX_PASS_ITERATIONS; i++) {
    if (!(await passButton.isVisible().catch(() => false))) {
      return;
    }
    await passButton.click();
    await page.waitForTimeout(30);
  }
  if (await passButton.isVisible().catch(() => false)) {
    throw new Error(`land-grant Pass button still visible after ${MAX_PASS_ITERATIONS} clicks`);
  }
}

//============================================
/**
 * Drive a fresh game from the title screen to the auction's role-choice bar:
 * claim a plot, pass the rest of land grant, and wait for the role buttons. The
 * human's own develop turn drains on its tick-budget timer with no action
 * required (no store overlay to skip through); the remaining AI develop turns
 * and the production interstitial autoplay on their own timers too. Returns
 * once the first role button is visible.
 *
 * @param page - The Playwright page.
 */
async function reachAuctionRoleChoice(page) {
  await page.locator("#new-game-button").click();

  await claimCurrentLandGrantPlot(page);

  await passThroughLandGrant(page);

  const roleButtons = page.locator('[data-action="auction-role"]');
  await expect(roleButtons.first()).toBeVisible({ timeout: 30_000 });
}

//============================================
/**
 * Read player 0's live avatar x, the moving coordinate the tween loop writes
 * every frame (writeAvatarTransform, src/ui/scenes/auction_arena.tsx:319-324).
 * Throws if the avatar is not in the DOM, since every participant slot always
 * renders one (the arena's unconditional `<For>` over payload.participants).
 *
 * @param page - The Playwright page.
 * @returns The human avatar's current data-x, as a number.
 */
async function readHumanAvatarX(page) {
  return page.evaluate(() => {
    const avatar = document.querySelector('.auction-avatar[data-actor="player-0"]');
    if (avatar === null) {
      throw new Error("no auction avatar for player 0");
    }
    return Number(avatar.getAttribute("data-x"));
  });
}

//============================================
/**
 * Wait for the current auction window to reach its finished state, polling at
 * animation-frame granularity (not the assertion layer's coarser backoff,
 * which can miss the brief finished-pause window at high speed multipliers).
 *
 * @param page - The Playwright page.
 */
async function waitForAuctionFinished(page) {
  await page.waitForFunction(
    () => {
      const phase = window.muleGameState().state.phase;
      return phase.kind === "auction" && phase.payload.finished === true;
    },
    null,
    { polling: "raf", timeout: 15_000 },
  );
}

//============================================
/**
 * Sample an avatar's live data-x at animation-frame granularity across exactly
 * one engine tick: from the frame a tick boundary is first observed, through
 * every rAF frame, to the frame the NEXT tick boundary is observed. Runs
 * entirely inside the page (not Node-side polling), which matters here: a
 * Node-side poll loop's realized interval degrades under parallel-worker load
 * (measured elsewhere in this suite's development from ~25ms to over 1000ms),
 * which would silently undersample or entirely miss a single ~62ms tick
 * window. An in-page rAF loop cannot fall behind the app's own render loop.
 *
 * @param page - The Playwright page.
 * @param selector - CSS selector for the element carrying data-x.
 * @returns The ordered data-x values sampled across the one tick, as numbers.
 */
async function sampleDataXAcrossOneTick(page, selector) {
  return page.evaluate((sel) => {
    return new Promise((resolve, reject) => {
      function readTick() {
        return window.muleGameState().state.phase.payload.tick;
      }
      function readX() {
        const el = document.querySelector(sel);
        return el === null ? null : Number(el.getAttribute("data-x"));
      }
      let sampling = false;
      let boundaryTick = readTick();
      let samples = [];
      const timeoutId = setTimeout(() => {
        reject(new Error("timed out waiting for a full engine tick to sample data-x across"));
      }, 10_000);
      function frame() {
        const tick = readTick();
        if (!sampling) {
          if (tick !== boundaryTick) {
            sampling = true;
            boundaryTick = tick;
            samples = [readX()];
          }
        } else {
          samples.push(readX());
          if (tick !== boundaryTick) {
            clearTimeout(timeoutId);
            resolve(samples);
            return;
          }
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }, selector);
}

//============================================
/**
 * Sample the wall-clock milliseconds between successive engine-tick
 * transitions, in page (for the same starvation-avoidance reason
 * `sampleDataXAcrossOneTick` runs in page), stopping once `transitionCount`
 * transitions have been observed.
 *
 * @param page - The Playwright page.
 * @param transitionCount - How many tick transitions to time.
 * @returns The ordered per-transition millisecond deltas.
 */
async function sampleTickCadenceMs(page, transitionCount) {
  return page.evaluate((wanted) => {
    return new Promise((resolve, reject) => {
      function readTick() {
        return window.muleGameState().state.phase.payload.tick;
      }
      let lastTick = readTick();
      let lastTime = performance.now();
      const deltas = [];
      const timeoutId = setTimeout(() => {
        reject(new Error("timed out sampling tick cadence"));
      }, 15_000);
      function frame() {
        const tick = readTick();
        if (tick !== lastTick) {
          const now = performance.now();
          deltas.push(now - lastTime);
          lastTime = now;
          lastTick = tick;
          if (deltas.length >= wanted) {
            clearTimeout(timeoutId);
            resolve(deltas);
            return;
          }
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  }, transitionCount);
}

//============================================
/**
 * The median of a list of numbers, used to summarize a tick-cadence sample
 * without one slow first transition (frame-alignment jitter on the very first
 * sample is common) skewing a plain average.
 *
 * @param values - The numbers to summarize.
 * @returns The median value.
 */
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

//============================================
/**
 * Sample a trade-flash burst's `scale(...)` transform component at
 * animation-frame granularity across its whole on-screen lifetime, entirely
 * in page for the same starvation-avoidance reason `sampleDataXAcrossOneTick`
 * runs in page: the burst pops and settles inside FLASH_MS (320ms,
 * auction_trade_fx.ts), a window a Node-side poll's degraded sampling
 * interval (measured elsewhere in this suite past 1000ms under full-suite
 * parallel-worker load) could sample once or not at all. Locks onto the
 * FIRST burst element once the layer's flash counter increments, and keeps
 * reading that same element's transform every rAF frame until the element is
 * removed from the DOM (FLASH_MS elapsed), so the sample set spans the
 * burst's entire pop.
 *
 * @param page - The Playwright page.
 * @returns The ordered scale values sampled across the burst's lifetime.
 */
async function sampleTradeFlashScale(page) {
  return page.evaluate(() => {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("timed out waiting for the trade flash to spawn and animate"));
      }, 20_000);
      function parseScale(transform) {
        const match = /scale\(([-\d.]+)\)/.exec(transform);
        return match === null ? null : Number(match[1]);
      }
      let burstEl = null;
      const samples = [];
      function frame() {
        if (burstEl === null) {
          const layer = document.querySelector(".auction-trade-layer");
          const flashCount = layer === null ? 0 : Number(layer.getAttribute("data-flash-count"));
          if (flashCount > 0) {
            burstEl = document.querySelector(".auction-trade-flash-burst");
          }
        }
        if (burstEl !== null) {
          if (!burstEl.isConnected) {
            clearTimeout(timeoutId);
            resolve(samples);
            return;
          }
          const scale = parseScale(burstEl.getAttribute("transform") ?? "");
          if (scale !== null) {
            samples.push(scale);
          }
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  });
}

test("auction scene: the status layer and all three role buttons are present and clickable at tick 0", async ({
  page,
}) => {
  await page.goto("/?seed=1234&speed=8");
  await reachAuctionRoleChoice(page);

  // The status/accounting beat renders in the SAME overlay, above the role
  // buttons in reading order (auction_screen.tsx's DeclareOverlay).
  await expect(page.locator(".auction-status-layer")).toBeVisible();

  const roleButtons = page.locator('[data-action="auction-role"]');
  await expect(roleButtons).toHaveCount(3);

  // A trial click runs Playwright's full actionability checks (visible,
  // stable, and receiving pointer events -- i.e. nothing covers it, which is
  // exactly the regression the tutorial hint's pointer-events:none guards
  // against) without performing the click, so all three controls can be
  // proven reachable without spending the one declare beat a real click would.
  for (const role of ["buyer", "seller", "out"]) {
    await page.locator(`[data-action="auction-role"][data-role="${role}"]`).click({ trial: true });
  }

  const tick = await page.evaluate(() => window.muleGameState().state.phase.payload.tick);
  expect(tick).toBe(0);
});

test("auction scene: the auction clock holds at tick 0 until the human commits a role, then advances", async ({
  page,
}) => {
  await page.goto("/?seed=1234&speed=8");
  await reachAuctionRoleChoice(page);

  // Sample tick across several real animation frames with no role committed
  // yet -- this is the invariant the whole deadlock class hangs off
  // (isAuctionTickable / humanAuctionCommitted, scene_manager.ts:499-501): if
  // the clock ever ticked before a commit, the declare beat (and the status
  // layer it carries) would become silently skippable.
  const preCommitTicks = await page.evaluate(() => {
    return new Promise((resolve) => {
      const ticks = [];
      let frames = 0;
      function frame() {
        ticks.push(window.muleGameState().state.phase.payload.tick);
        frames += 1;
        if (frames < 20) {
          requestAnimationFrame(frame);
        } else {
          resolve(ticks);
        }
      }
      requestAnimationFrame(frame);
    });
  });
  expect(preCommitTicks.every((tick) => tick === 0)).toBe(true);

  await page.locator('[data-action="auction-role"][data-role="buyer"]').click();

  await page.waitForFunction(() => window.muleGameState().state.phase.payload.tick > 0, null, {
    polling: "raf",
    timeout: 15_000,
  });
});

test("auction scene: holding ArrowRight moves the human's avatar rightward (data-x)", async ({
  page,
}) => {
  await page.goto("/?seed=1234&speed=8");
  await reachAuctionRoleChoice(page);

  // ArrowRight is the primary, taught raise gesture: a rising price walks the
  // avatar rightward toward the expensive wall, matching the runway's motion
  // (auction_screen.tsx's intentForKey).
  await page.locator('[data-action="auction-role"][data-role="buyer"]').click();

  const startX = await readHumanAvatarX(page);
  await page.keyboard.down("ArrowRight");
  await expect
    .poll(async () => readHumanAvatarX(page), {
      timeout: 15_000,
      message: "human avatar's data-x never rose while ArrowRight was held",
    })
    .toBeGreaterThan(startX);
  await page.keyboard.up("ArrowRight");
});

test("auction scene: the ArrowUp compatibility alias also raises the human's avatar", async ({
  page,
}) => {
  await page.goto("/?seed=1234&speed=8");
  await reachAuctionRoleChoice(page);

  // ArrowUp/ArrowDown stay bound as aliases for the pre-landscape gesture
  // (auction_screen.tsx's intentForKey); this covers that the alias still
  // reaches the same intent path as the primary ArrowRight/ArrowLeft gesture.
  await page.locator('[data-action="auction-role"][data-role="buyer"]').click();

  const startX = await readHumanAvatarX(page);
  await page.keyboard.down("ArrowUp");
  await expect
    .poll(async () => readHumanAvatarX(page), {
      timeout: 15_000,
      message: "human avatar's data-x never rose while the ArrowUp alias was held",
    })
    .toBeGreaterThan(startX);
  await page.keyboard.up("ArrowUp");
});

test("auction scene: the avatar eases smoothly across a tick instead of snapping to its target", async ({
  page,
}) => {
  // Regression lock for the tween: every other assertion in this suite checks
  // that data-x eventually moved rightward, which is equally true whether the
  // avatar eases along the runway or teleports to its target each tick.
  // Nothing else here can tell those apart. This samples data-x at
  // animation-frame granularity across one engine tick and requires
  // INTERMEDIATE values between the tick's start and end position -- a snap
  // regression would collapse this to (at most) two distinct values.
  await page.goto("/?seed=1234&speed=8");
  await reachAuctionRoleChoice(page);

  await page.locator('[data-action="auction-role"][data-role="buyer"]').click();
  await page.keyboard.down("ArrowRight");

  const samples = await sampleDataXAcrossOneTick(page, '.auction-avatar[data-actor="player-0"]');
  await page.keyboard.up("ArrowRight");

  const distinctValues = new Set(samples);
  expect(distinctValues.size).toBeGreaterThan(2);
});

test("auction scene: a store trade increments the human's dock TRADED counter", async ({
  page,
}) => {
  await page.goto("/?seed=1234&speed=8");
  await reachAuctionRoleChoice(page);

  await page.locator('[data-action="auction-role"][data-role="buyer"]').click();
  await page.keyboard.down("ArrowRight");

  // The human is always player 0 (this spec's own module doc). Player 0's
  // lane row carries a TRADED figure summed from trades where player 0 was
  // either party (auction_dock.tsx's DockLaneRow); data-col addresses that
  // specific column by name, distinct from the money and units-held columns
  // that share its base CSS class. The store's own dock row carries the
  // matching TRADED figure summed from trades where the store was either
  // party; it is the only row of its kind, so it is reachable without a
  // DOM-index selector. Both columns derive from the same trade log in the
  // same render pass, so this waits for both atomically, in page: seed
  // 1234's store trade fires around tick 42 of the smithore window and that
  // window finishes about 380ms later (this file's header comment), and a
  // Node-side poll's realized sampling interval has been measured elsewhere
  // in this suite degrading past 1000ms under full-suite parallel-worker
  // load -- too coarse to reliably observe a window that short.
  try {
    await page.waitForFunction(
      () => {
        const humanEl = document.querySelector(
          '.auction-dock-row[data-player="0"] [data-col="traded"]',
        );
        const storeEl = document.querySelector('.auction-dock-store-row [data-col="traded"]');
        if (humanEl === null || storeEl === null) {
          return false;
        }
        return Number(humanEl.textContent ?? "0") > 0 && Number(storeEl.textContent ?? "0") > 0;
      },
      null,
      { polling: "raf", timeout: 20_000 },
    );
  } catch (waitError) {
    // Distinguish an engine problem (the trade itself never happened) from a
    // UI problem (the trade happened but its dock figure never rendered), so
    // a failure here does not need re-diagnosing by hand.
    const diagnostics = await page.evaluate(() => {
      const phase = window.muleGameState().state.phase;
      const trades = phase.kind === "auction" ? phase.payload.trades : [];
      const humanEl = document.querySelector(
        '.auction-dock-row[data-player="0"] [data-col="traded"]',
      );
      const storeEl = document.querySelector('.auction-dock-store-row [data-col="traded"]');
      return {
        tradeCount: trades.length,
        humanText: humanEl === null ? null : humanEl.textContent,
        storeText: storeEl === null ? null : storeEl.textContent,
      };
    });
    const cause =
      diagnostics.tradeCount === 0
        ? "the engine never recorded a smithore trade this window (product problem)"
        : `the engine recorded ${diagnostics.tradeCount} trade(s) but the dock TRADED figures ` +
          `never reflected it (human="${diagnostics.humanText}", store="${diagnostics.storeText}") ` +
          "(rendering problem)";
    throw new Error(`dock TRADED counters never incremented: ${cause}`, { cause: waitError });
  }
  await page.keyboard.up("ArrowRight");

  // The trade-animation counter also fired, backing the walkthrough harness's
  // own poll of this same monotonic counter.
  const flashCount = await page.locator(".auction-trade-layer").getAttribute("data-flash-count");
  expect(Number(flashCount)).toBeGreaterThan(0);
});

test("auction scene: sitting out fast-forwards the tick cadence, with the FAST indicator", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await page.goto("/?seed=1234&speed=8");
  await reachAuctionRoleChoice(page);

  // --- Sit-out cadence: commit Sit Out on smithore. ---
  await page.locator('[data-action="auction-role"][data-role="out"]').click();
  await expect(page.locator('.auction-fast-indicator[data-fast="true"]')).toBeVisible();
  const sitOutDeltasMs = await sampleTickCadenceMs(page, 6);

  await waitForAuctionFinished(page);
  await page.locator('[data-action="auction-continue"]').click({ timeout: 3_000 });

  // Crystite (next in AUCTION_GOOD_ORDER) is structurally skipped in round 1
  // (see this file's header comment): it opens already finished, so continue
  // straight past it to reach food's declare beat.
  await page.waitForFunction(
    () => {
      const phase = window.muleGameState().state.phase;
      return phase.kind === "auction" && phase.payload.good === "crystite";
    },
    null,
    { polling: "raf", timeout: 10_000 },
  );
  await page.locator('[data-action="auction-continue"]').click({ timeout: 3_000 });

  // --- Committed cadence: commit Buy on food (no sit-out speed-up). ---
  await expect(page.locator('[data-action="auction-role"][data-role="buyer"]')).toBeVisible({
    timeout: 15_000,
  });
  await page.locator('[data-action="auction-role"][data-role="buyer"]').click();
  const committedDeltasMs = await sampleTickCadenceMs(page, 6);

  // AUCTION_SIT_OUT_FACTOR is 10x (scene_manager.ts:80); require a wide margin
  // (2x, not 10x) so this stays robust to rAF-granularity coalescing at high
  // ?speed= multipliers while still failing if the speed-up regressed away.
  expect(median(sitOutDeltasMs)).toBeLessThan(median(committedDeltasMs) / 2);
});

test("auction scene: a skipped window (round-1 crystite) shows its treatment and advances", async ({
  page,
}) => {
  await page.goto("/?seed=1234&speed=8");
  await reachAuctionRoleChoice(page);

  // Sit out smithore (the first good) to fast-forward past it.
  await page.locator('[data-action="auction-role"][data-role="out"]').click();
  await waitForAuctionFinished(page);
  await page.locator('[data-action="auction-continue"]').click({ timeout: 3_000 });

  // Crystite is structurally skipped in round 1 (see this file's header
  // comment): the window is created already skipped and finished, with no
  // declare beat -- no role buttons ever render for it.
  await page.waitForFunction(
    () => {
      const phase = window.muleGameState().state.phase;
      return phase.kind === "auction" && phase.payload.good === "crystite";
    },
    null,
    { polling: "raf", timeout: 10_000 },
  );

  const skippedPayload = await page.evaluate(() => {
    const phase = window.muleGameState().state.phase;
    return { skipped: phase.payload.skipped, finished: phase.payload.finished };
  });
  expect(skippedPayload.skipped).toBe(true);
  expect(skippedPayload.finished).toBe(true);

  await expect(page.locator('[data-action="auction-role"]')).toHaveCount(0);
  await expect(page.locator(".auction-finished-overlay")).toContainText(
    "No crystite to trade this round.",
  );

  await page.locator('[data-action="auction-continue"]').click({ timeout: 3_000 });

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const phase = window.muleGameState().state.phase;
          return phase.kind === "auction" ? phase.payload.good : phase.kind;
        }),
      { timeout: 10_000, message: "auction did not advance past the skipped crystite window" },
    )
    .not.toBe("crystite");
});

test("auction scene: reduced motion snaps the avatar across a tick instead of easing", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?seed=1234&speed=8");
  await reachAuctionRoleChoice(page);

  await expect(page.locator(".auction-screen")).toHaveAttribute("data-reduced-motion", "true");

  await page.locator('[data-action="auction-role"][data-role="buyer"]').click();
  await page.keyboard.down("ArrowRight");

  const samples = await sampleDataXAcrossOneTick(page, '.auction-avatar[data-actor="player-0"]');
  await page.keyboard.up("ArrowRight");

  // Under reduced motion the avatar snaps straight to its price-derived
  // target the moment the tick lands (auction_arena.tsx's onFrameTick), so
  // every sample across the tick is the SAME value -- the direct contrast to
  // the multi-value ramp the un-reduced tween test above requires. The final
  // sample is dropped: sampleDataXAcrossOneTick's boundary check runs before
  // the frame's own data-x write, so the very last pushed sample can already
  // belong to the NEXT tick's (already snapped) target, one frame early.
  const distinctValues = new Set(samples.slice(0, -1));
  expect(distinctValues.size).toBe(1);
});

test("auction scene: no-preference motion, the trade flash's entrance pop eases from its peak scale to resting", async ({
  page,
}) => {
  await page.goto("/?seed=1234&speed=8");
  await reachAuctionRoleChoice(page);

  // Drive a real store trade the same way the dock-TRADED-counter test above
  // does (buyer role, hold the raise key toward seed 1234's smithore window).
  await page.locator('[data-action="auction-role"][data-role="buyer"]').click();
  await page.keyboard.down("ArrowRight");

  const samples = await sampleTradeFlashScale(page);

  await page.keyboard.up("ArrowRight");

  // addFlash/advance (auction_trade_fx.ts) write the burst in at
  // FLASH_POP_SCALE (1.6) and ease it DOWN to its resting scale of 1 over
  // FLASH_POP_MS -- the entrance is an overshoot-and-settle pop, not a
  // grow-from-nothing. A broken pop (a burst rendered at one static scale,
  // reduced-motion's un-animated branch firing here by mistake) would
  // collapse every sample to the same value, so requiring more than one
  // distinct sample, and requiring the first sample to exceed the last, is
  // exactly the shape that regression would fail.
  expect(samples.length).toBeGreaterThan(2);
  const distinctValues = new Set(samples.map((value) => value.toFixed(2)));
  expect(distinctValues.size).toBeGreaterThan(1);
  expect(samples[0]).toBeGreaterThan(samples[samples.length - 1]);
  expect(samples[samples.length - 1]).toBeCloseTo(1, 1);
});

test("auction scene: reduced motion shows the trade flash and banner instantly, with no flying goods glyph", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?seed=1234&speed=8");
  await reachAuctionRoleChoice(page);

  await page.locator('[data-action="auction-role"][data-role="buyer"]').click();
  await page.keyboard.down("ArrowRight");

  // The flash and the banner are both created in the SAME synchronous call as
  // the flash-count increment (auction_trade_fx.ts's spawnTrade), regardless
  // of the reduced-motion flag -- only the flying goods glyph is conditional
  // on it. Both are also removed on their own wall-clock timers, independent
  // of game speed (FLASH_MS=320, BANNER_MS=900, auction_trade_fx.ts): a
  // follow-up Node-side query could easily observe them already gone under
  // full-suite parallel-worker load, the same hazard the file header
  // documents for the dock TRADED counters. So this captures burst
  // visibility, banner visibility, and the goods-glyph count all in the SAME
  // in-page rAF frame that first observes the trade, and asserts on that
  // captured snapshot rather than re-querying the DOM from Node afterward.
  const fxSnapshot = await page.evaluate(() => {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("timed out waiting for the trade-fx layer to fire"));
      }, 20_000);
      function frame() {
        const layer = document.querySelector(".auction-trade-layer");
        const flashCount = layer === null ? 0 : Number(layer.getAttribute("data-flash-count"));
        if (flashCount > 0) {
          clearTimeout(timeoutId);
          resolve({
            burstVisible: document.querySelector(".auction-trade-flash-burst") !== null,
            bannerVisible: document.querySelector(".auction-trade-banner") !== null,
            goodsCount: document.querySelectorAll(".auction-trade-goods").length,
          });
          return;
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
  });
  await page.keyboard.up("ArrowRight");

  expect(fxSnapshot.burstVisible).toBe(true);
  expect(fxSnapshot.bannerVisible).toBe(true);
  expect(fxSnapshot.goodsCount).toBe(0);
});

test("auction scene: the HUD is hidden during the auction and restored after", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/?seed=1234&speed=8");
  await reachAuctionRoleChoice(page);

  // game_screen.tsx:170-171 drives #game-hud's game-hud-hidden class off
  // phaseOwnsFullStage(kind), true exactly while kind === "auction"
  // (game_screen.tsx:389-391); that class sets display:none
  // (src/style.css:1515), so assert the player-visible effect, not the class.
  await expect(page.locator("#game-hud")).toBeHidden();

  // Sit out every remaining good (fast-forwarding each) until the auction
  // phase itself ends, at the round boundary into the next round's land
  // grant.
  for (let i = 0; i < MAX_GOODS_TO_SIT_OUT; i += 1) {
    const phaseKind = await page.evaluate(() => window.muleGameState().state.phase.kind);
    if (phaseKind !== "auction") {
      break;
    }
    const declareOpen = await page
      .locator('[data-action="auction-role"][data-role="out"]')
      .isVisible()
      .catch(() => false);
    if (declareOpen) {
      await page.locator('[data-action="auction-role"][data-role="out"]').click();
    }
    await page.waitForFunction(
      () => {
        const phase = window.muleGameState().state.phase;
        return phase.kind !== "auction" || phase.payload.finished === true;
      },
      null,
      { polling: "raf", timeout: 15_000 },
    );
    const stillAuction = await page.evaluate(
      () => window.muleGameState().state.phase.kind === "auction",
    );
    if (stillAuction) {
      await page.locator('[data-action="auction-continue"]').click({ timeout: 3_000 });
    }
  }

  await expect
    .poll(async () => page.evaluate(() => window.muleGameState().state.phase.kind), {
      timeout: 15_000,
      message: "auction phase never ended after sitting out every good",
    })
    .not.toBe("auction");

  await expect(page.locator("#game-hud")).toBeVisible();
});
