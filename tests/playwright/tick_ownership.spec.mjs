// Tick-ownership invariant: exactly one scheduler drives engine ticks.
//
// Selector contract: this spec depends on the ?seed= / ?speed= hooks in
// src/ui/main.tsx, the #new-game-button title control, the
// #land-grant-pass-button and .auction-screen-role-button phase controls, and
// the dev-only window.__tickOwnership ledger the scene manager
// (src/ui/scenes/scene_manager.ts) maintains. Player 0 is always the human and
// always picks first in round 1 (src/engine/land_grant.ts).
//
// With the setTimeout chains retired, the rAF scene manager is structurally the
// only thing that dispatches { type: "tick" }. The ledger records every tick's
// owner and the phase it fired in; this spec drives a fixed-seed game at high
// speed and asserts the three invariants: a single owner, monotonically
// non-decreasing tick counts, and a tick phase sequence that only ever advances
// through the canonical land_grant (sweep cursor) -> land_auction
// (round-1-only for this seed) -> develop -> production -> auction cycle. The
// land-grant sweep cursor starts ticking the instant the phase is entered
// (src/engine/turn.ts's applyTick land_grant branch), before any pick is made,
// so land_grant is always this sequence's first tick-bearing phase. Seed 1234
// deterministically draws a round-1 colony land auction (confirmed against
// src/engine/turn.ts directly), so land_grant is always followed by
// land_auction here.

import { test, expect } from "@playwright/test";

/** Upper bound on land-grant pass clicks before we conclude something is stuck. */
const MAX_PASS_ITERATIONS = 50;

/** The tick-bearing phases the fixed-seed sequence may legitimately open with. */
const ALLOWED_FIRST_TICK_PHASES = new Set(["land_grant"]);

/** Tick-bearing phases and their allowed forward transitions in the cycle. */
const ALLOWED_TICK_TRANSITIONS = new Set([
  "land_grant>land_auction",
  "land_grant>develop",
  "land_auction>develop",
  "develop>production",
  "production>auction",
  "auction>develop",
  "auction>land_grant",
]);

/**
 * Read the dev-only tick-ownership ledger from the page, or null before the
 * scene manager has started.
 */
async function readTickOwnership(page) {
  return page.evaluate(() => window.__tickOwnership ?? null);
}

/**
 * Click the land-grant Pass button until it disappears (AI turns finish and the
 * develop phase takes over), or throw if it never does.
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

test("tick ownership: one scheduler drives ticks, phases advance in order", async ({ page }) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  // Fixed seed for reproducibility; high speed so develop/production/auction
  // ticks accrue quickly.
  await page.goto("/?seed=1234&speed=8");
  await page.locator("#new-game-button").click();

  // Pass through the human's land grant so AI turns finish and the develop
  // phase (the first tick-bearing phase) begins.
  await passThroughLandGrant(page);

  // Ticks begin accruing in develop; wait until at least one has fired.
  await expect
    .poll(async () => (await readTickOwnership(page))?.ticks ?? 0, {
      timeout: 30_000,
      message: "no ticks dispatched after the land grant",
    })
    .toBeGreaterThan(0);

  // The human sits out its develop turn (budget drains), AI turns run, and
  // production advances to the auction, where the human must declare a role
  // before the auction clock runs. Commit Buy so auction ticks accrue too.
  const roleButton = page.locator(".auction-screen-role-button").first();
  await expect(roleButton).toBeVisible({ timeout: 30_000 });
  await roleButton.click();

  // Wait until the ledger has observed an auction-phase tick, proving the cycle
  // reached develop -> production -> auction.
  await expect
    .poll(async () => (await readTickOwnership(page))?.phaseSequence ?? [], {
      timeout: 30_000,
      message: "tick phase sequence never reached the auction",
    })
    .toContain("auction");

  const before = await readTickOwnership(page);
  expect(before).not.toBeNull();

  // Invariant 1: exactly one scheduler ever dispatched a tick.
  expect(before.owners).toEqual(["scene_manager"]);

  // Invariant 2: the tick phase sequence only advances through the canonical
  // land_auction -> develop -> production -> auction cycle (no out-of-order or
  // foreign phase).
  expect(ALLOWED_FIRST_TICK_PHASES.has(before.phaseSequence[0])).toBe(true);
  for (let i = 1; i < before.phaseSequence.length; i++) {
    const transition = `${before.phaseSequence[i - 1]}>${before.phaseSequence[i]}`;
    expect(
      ALLOWED_TICK_TRANSITIONS.has(transition),
      `unexpected tick transition ${transition}`,
    ).toBe(true);
  }

  // Invariant 3: tick counts are monotonic non-decreasing across time, and the
  // clock is still running (a later sample has strictly more ticks).
  await expect
    .poll(async () => (await readTickOwnership(page))?.ticks ?? 0, {
      timeout: 30_000,
      message: "tick count did not advance after the auction started",
    })
    .toBeGreaterThan(before.ticks);

  // The owner set never grows beyond the single scheduler even as more ticks
  // fire, and the game produced no page errors along the way.
  const after = await readTickOwnership(page);
  expect(after.owners).toEqual(["scene_manager"]);
  expect(pageErrors).toEqual([]);
});
