// Event banner contract.
//
// Selector contract: this spec depends on the ?seed= / ?speed= hooks in
// src/ui/main.tsx, the #new-game-button title control, the
// #land-grant-pass-button / .develop-end-turn-button / .auction-screen-role-button
// phase controls, and src/ui/solid/event_banner.tsx's own markup:
// [data-event-banner], [data-event-id], [data-event-polarity], and
// [data-event-kind] on the banner root, with an `<svg><use href="#...">` icon
// matching src/ui/sprites/sprites_events.ts's symbol ids. Player 0 is always
// the human and always picks first in round 1 (src/engine/land_grant.ts).
//
// Fixed seed 30 (probed directly against src/engine/turn.ts and events.ts via
// an all-AI playthrough, including player 0's decisions, before writing this
// spec): the human's first personal event fires at round 2's FIRST develop
// turn (queueIndex 0, so no AI turns need to be sat through first) -- a bad
// "bat_lizard" event, -$100. A colony event (acid_rain, category A) fires in
// round 1, before round 1's production interstitial, so it is the very first
// colony event the game ever shows. No personal event ever fires in round 1
// (src/engine/events.ts's fairness rule), so seed selection was necessarily a
// round-2-earliest search, not round-1.
//
// Speed choice: ?speed=4 keeps round 1's land grant / develop / production /
// 4-good auction well inside this spec's wall-clock budgets even under heavy
// parallel-worker CPU contention (the scene manager's fixed-timestep loop
// caps how much sim time a starved frame can catch up, so a slow-scheduled
// tab runs its sim clock slower in real time, not just later), while still
// leaving PERSONAL_EVENT_BANNER_HOLD_MS / 4 (~450ms) of real time to catch
// the personal-event banner -- comfortably inside Playwright's own locator
// polling cadence.

import { test, expect } from "@playwright/test";

/** Fixed seed with an early human personal event (round 2) and an early
 * colony event (round 1); see the module doc for how it was probed. */
const HUMAN_EVENT_QUERY = "?seed=30&speed=4";

/** Upper bound on land-grant pass clicks before we conclude something is stuck. */
const MAX_PASS_ITERATIONS = 50;

/** Wall-clock budget for driving round 1 to round 2's human develop turn. */
const REACH_ROUND_TWO_BUDGET_MS = 150_000;

/**
 * Claim whichever plot the land-grant sweep cursor (src/engine/land_grant.ts)
 * is currently on, via the same Enter key `claim_current_plot` binds to
 * (land_grant_panel.tsx). The cursor's position is engine-driven and
 * timing-dependent, so this is the robust way to claim a plot in a spec --
 * clicking a specific locator would race the sweep and could miss.
 */
async function claimCurrentLandGrantPlot(page) {
  await page.locator("#game-map .map-svg g[data-row][data-col]").first().waitFor();
  await page.keyboard.press("Enter");
}

/**
 * Click the land-grant Pass button until it disappears (AI turns finish and
 * the develop phase takes over), or throw if it never does. A detached button
 * between the visibility check and the click (a concurrent phase advance) is
 * ignored, matching e2e_full_game.mjs's actForCurrentPhase pattern -- under
 * heavy parallel-worker load the button can unmount mid-click, and the next
 * poll iteration re-checks fresh state rather than hanging on a stale click.
 */
async function passThroughLandGrant(page) {
  const passButton = page.locator("#land-grant-pass-button");
  for (let i = 0; i < MAX_PASS_ITERATIONS; i++) {
    if (!(await passButton.isVisible().catch(() => false))) {
      return;
    }
    await passButton.click().catch(() => undefined);
    await page.waitForTimeout(30);
  }
  if (await passButton.isVisible().catch(() => false)) {
    throw new Error(`land-grant Pass button still visible after ${MAX_PASS_ITERATIONS} clicks`);
  }
}

/**
 * End the human's develop turn immediately if the End Turn button is up (a
 * no-op when it never appears, e.g. the human is not the active player). See
 * passThroughLandGrant's doc for why the click ignores a detached target.
 *
 * Never clicks while a personal-event banner is up: End Turn and the develop
 * panel render as siblings of the banner (game_screen.tsx), so both are
 * visible simultaneously while the engine holds the tick clock for the
 * human's own event -- this guard is what lets reachRoundTwo's poll loop stop
 * on the banner without a same-iteration race ending that very turn first.
 */
async function endDevelopTurnIfUp(page) {
  const personalBanner = page.locator("[data-event-banner][data-event-kind='personal']");
  if (await personalBanner.isVisible().catch(() => false)) {
    return;
  }
  const endTurnButton = page.locator(".develop-end-turn-button");
  if (await endTurnButton.isVisible().catch(() => false)) {
    await endTurnButton.click().catch(() => undefined);
  }
}

/**
 * Sit out the current good's auction role-choice bar if it is up (a no-op
 * when no role bar is showing). See passThroughLandGrant's doc for why the
 * click ignores a detached target: the role bar unmounts as soon as any tick
 * advances, which under heavy parallel-worker load can race the click itself.
 */
async function sitOutAuctionIfUp(page) {
  const roleButtons = page.locator(".auction-screen-role-button");
  if (
    await roleButtons
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    // Sit Out is the third role button (Buy, Sell, Sit Out).
    await roleButtons
      .nth(2)
      .click()
      .catch(() => undefined);
  }
}

/**
 * Drive the game from the title screen through round 1 (claim a plot, end the
 * human's develop turn, sit out every good's auction) up to the moment the
 * personal-event banner appears on round 2's first develop turn (seed 30's
 * human event), acting on whichever control is live each poll. Round 1's
 * colony event banner (if any) appears during the production interstitial,
 * well before the auction; it is non-blocking, so this loop does not wait on
 * it specifically -- the dedicated colony-banner test does.
 */
async function reachRoundTwo(page) {
  await page.goto(`/${HUMAN_EVENT_QUERY}`);
  await page.locator("#new-game-button").click();

  await claimCurrentLandGrantPlot(page);
  await passThroughLandGrant(page);
  await endDevelopTurnIfUp(page);

  const personalBanner = page.locator("[data-event-banner][data-event-kind='personal']");
  const deadline = Date.now() + REACH_ROUND_TWO_BUDGET_MS;
  while (Date.now() < deadline) {
    if (await personalBanner.isVisible().catch(() => false)) {
      return;
    }
    await sitOutAuctionIfUp(page);
    await endDevelopTurnIfUp(page);
    await passThroughLandGrant(page);
    await page.waitForTimeout(80);
  }
  throw new Error("round 2's personal event banner never appeared within the time budget");
}

test("personal event banner: renders at the human's develop turn, auto-dismisses, and the turn proceeds", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await reachRoundTwo(page);

  const banner = page.locator("[data-event-banner][data-event-kind='personal']");
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await expect(banner).toHaveAttribute("data-event-id", "bat_lizard");
  await expect(banner).toHaveAttribute("data-event-polarity", "bad");

  // The icon references a real sprite symbol defined in the same SVG.
  const iconHref = await banner.locator("use").getAttribute("href");
  expect(iconHref).toBe("#sprite-event-bad-news");
  const symbol = page.locator(`svg symbol#${iconHref.slice(1)}`);
  await expect(symbol).toHaveCount(1);

  // The engine holds the develop tick clock briefly while this banner is up
  // (scene_manager.ts's PERSONAL_EVENT_BANNER_HOLD_MS gate), then ticks
  // resume and the banner auto-dismisses on its own timer. Assert both: it
  // goes away, and the develop panel (proof the turn is progressing, not
  // stalled) is still reachable afterward.
  await expect(banner).toHaveCount(0, { timeout: 10_000 });
  const endTurnButton = page.locator(".develop-end-turn-button");
  await expect(endTurnButton).toBeVisible({ timeout: 10_000 });
  await endTurnButton.click().catch(() => undefined);
  await expect(endTurnButton).toHaveCount(0, { timeout: 10_000 });
});

test("colony event banner: renders during round 1's production interstitial with the matching icon", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto(`/${HUMAN_EVENT_QUERY}`);
  await page.locator("#new-game-button").click();

  await claimCurrentLandGrantPlot(page);
  await passThroughLandGrant(page);
  await endDevelopTurnIfUp(page);

  // Round 1's colony event (acid_rain) fires before production; the
  // production panel shows it as a non-blocking overlay above the yield
  // list. It auto-advances to the auction on its own pause regardless of
  // whether this banner is present (production_panel.tsx never gates the
  // scene manager), so poll for it rather than assuming a fixed frame.
  const banner = page.locator("[data-event-banner][data-event-kind='colony']");
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await expect(banner).toHaveAttribute("data-event-id", "acid_rain");

  const iconHref = await banner.locator("use").getAttribute("href");
  expect(iconHref).toBe("#sprite-event-acid-rain");
  const symbol = page.locator(`svg symbol#${iconHref.slice(1)}`);
  await expect(symbol).toHaveCount(1);

  // The colony banner never blocks the game: production still auto-advances
  // into the auction's role-choice bar without any interaction from here.
  const roleButtons = page.locator(".auction-screen-role-button");
  await expect(roleButtons.first()).toBeVisible({ timeout: 15_000 });
});

test("reduced motion: the personal event banner renders statically and the game still proceeds", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await reachRoundTwo(page);

  const banner = page.locator("[data-event-banner][data-event-kind='personal']");
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await expect(banner).toHaveAttribute("data-reduced-motion", "true");
  await expect(banner).toHaveAttribute("data-event-id", "bat_lizard");

  // Still a plain timed display: it self-dismisses and the turn proceeds,
  // exactly as under full motion.
  await expect(banner).toHaveCount(0, { timeout: 10_000 });
  const endTurnButton = page.locator(".develop-end-turn-button");
  await expect(endTurnButton).toBeVisible({ timeout: 10_000 });
});
