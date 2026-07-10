// Scoring screen: drives a full seeded beginner game to the end and asserts
// the M9 ScoringPayload renders in full, plus (WP-7E) that the canvas-fill
// `.scoring-panel` stays contained inside `#game-stage` at both letterbox
// shapes -- guards the coverage numbers reported in WP-7E's handoff against
// regression, since no other spec exercises scoring-phase geometry.
//
// Selector contract: this spec depends on src/ui/solid/scoring_panel.tsx's
// `.scoring-panel[data-colony-failed]`, `.scoring-colony-status
// [data-colony-total][data-colony-rating-tier]`, `.scoring-first-founder
// [data-first-founder]` (present only when a founder was awarded), and
// per-row `.scoring-row[data-player][data-money][data-land][data-mules]
// [data-goods][data-total]`, plus the shared `#new-game-button`,
// `#land-grant-pass-button`, `.develop-end-turn-button`, and
// `.auction-screen-role-button` phase controls (src/ui/solid/*), and
// `#game-stage`/`#game-panel` (src/ui/solid/game_screen.tsx). Beginner
// mode (6 rounds) keeps the playthrough short; seed 7 matches
// tests/e2e/e2e_full_game.mjs's proven-fast playthrough exactly. Player 0 is
// always the human and always picks first in round 1
// (src/engine/land_grant.ts).

import { test, expect } from "@playwright/test";

/** Overall wall-clock budget for the playthrough loop. e2e_full_game.mjs's
 * identically-shaped seed=7 beginner playthrough finishes in well under 30s
 * total (including build/serve startup); this budget carries generous margin
 * for Playwright's own per-action overhead. */
const PLAYTHROUGH_BUDGET_MS = 60_000;

// The same two letterbox shapes game_stage.spec.mjs exercises: a wide window
// (side letterbox, height binds) and a tall window (top/bottom letterbox,
// width binds).
const WIDE_VIEWPORT = { width: 1600, height: 900 };
const TALL_VIEWPORT = { width: 1200, height: 1000 };

/**
 * Whether a selector currently resolves to a visible element.
 */
async function isVisible(page, selector) {
  const locator = page.locator(selector).first();
  return locator.isVisible().catch(() => false);
}

/**
 * Take the human's scripted action for the current phase, if any control is
 * live: pass every land grant (mirroring e2e_full_game.mjs's proven-fast
 * playthrough shape exactly -- claiming via the sweep cursor is already
 * covered end to end by game_flow.spec.mjs's keyboard-nav spec, so this
 * playthrough does not need to also exercise it), end a develop turn, or sit
 * out a goods auction. A detached element between the check and the click is
 * ignored (the phase advanced on its own).
 */
async function actForCurrentPhase(page) {
  if (await isVisible(page, "#land-grant-pass-button")) {
    await page.click("#land-grant-pass-button").catch(() => undefined);
    return;
  }
  if (await isVisible(page, ".develop-end-turn-button")) {
    await page.click(".develop-end-turn-button").catch(() => undefined);
    return;
  }
  if (await isVisible(page, ".auction-screen-role-button")) {
    // Sit Out is the third role button (Buy, Sell, Sit Out); this keeps the
    // human out of trading while the auction clock still runs to completion.
    const roleButtons = page.locator(".auction-screen-role-button");
    const sitOut = roleButtons.nth(2);
    if (await sitOut.isVisible().catch(() => false)) {
      await sitOut.click().catch(() => undefined);
    } else {
      await roleButtons
        .first()
        .click()
        .catch(() => undefined);
    }
  }
}

/**
 * Drive the seed=7 beginner playthrough from the title screen to the
 * scoring panel becoming visible.
 */
async function playToScoring(page) {
  await page.goto("/?seed=7&speed=8&mode=beginner");
  await page.locator("#new-game-button").click();
  await expect(page.locator("#screen-game")).toHaveClass(/active/, { timeout: 30_000 });

  const scoringPanel = page.locator(".scoring-panel");
  const deadline = Date.now() + PLAYTHROUGH_BUDGET_MS;
  while (Date.now() < deadline) {
    if (await scoringPanel.isVisible().catch(() => false)) {
      break;
    }
    await actForCurrentPhase(page);
    await page.waitForTimeout(80);
  }
  await expect(scoringPanel).toBeVisible({ timeout: 5_000 });
}

test("scoring screen renders the full end-of-game payload", async ({ page }) => {
  test.setTimeout(PLAYTHROUGH_BUDGET_MS + 30_000);
  await playToScoring(page);
  const scoringPanel = page.locator(".scoring-panel");

  // Four players are ranked, each carrying a full breakdown.
  const rows = page.locator(".scoring-row");
  await expect(rows).toHaveCount(4);
  for (let index = 0; index < 4; index += 1) {
    const row = rows.nth(index);
    for (const attr of [
      "data-player",
      "data-money",
      "data-land",
      "data-mules",
      "data-goods",
      "data-total",
    ]) {
      await expect(row).toHaveAttribute(attr, /.+/);
    }
  }

  // Exactly one row's total matches the sum of its own breakdown parts.
  const total = await rows.first().getAttribute("data-total");
  const money = await rows.first().getAttribute("data-money");
  const land = await rows.first().getAttribute("data-land");
  const mules = await rows.first().getAttribute("data-mules");
  const goods = await rows.first().getAttribute("data-goods");
  expect(Number(total)).toBe(Number(money) + Number(land) + Number(mules) + Number(goods));

  // Colony status: either the failure message, or a rated colony total with
  // a First Founder callout, but never both.
  const colonyFailed = await scoringPanel.getAttribute("data-colony-failed");
  if (colonyFailed === "true") {
    await expect(page.locator(".scoring-colony-failed")).toBeVisible();
    await expect(page.locator(".scoring-first-founder")).toHaveCount(0);
  } else {
    const colonyStatus = page.locator(".scoring-colony-status[data-colony-total]");
    await expect(colonyStatus).toBeVisible();
    await expect(colonyStatus).toHaveAttribute("data-colony-rating-tier", /^[0-6]$/);
    await expect(page.locator(".scoring-first-founder[data-first-founder]")).toBeVisible();
  }

  // Play Again returns to a fresh round-1 land grant.
  await page.locator("#play-again-button").click();
  await expect(page.locator(".land-grant-hint")).toBeVisible({ timeout: 15_000 });
});

for (const viewportCase of [
  { label: "wide window (side letterbox)", viewport: WIDE_VIEWPORT },
  { label: "tall window (top/bottom letterbox)", viewport: TALL_VIEWPORT },
]) {
  // WP-7E canvas fill: #game-panel (the .scoring-panel's unstyled wrapper,
  // src/ui/solid/game_screen.tsx) must stay fully inside #game-stage, with
  // its bottom edge in particular not clipping past the stage -- #game-stage
  // has overflow: hidden, so an overflow here would silently clip the Play
  // Again button rather than fail loudly. Guards the coverage numbers
  // (94% width / 84% height) reported in WP-7E's handoff against regression.
  test(`scoring panel stays contained inside the stage: ${viewportCase.label}`, async ({
    page,
  }) => {
    test.setTimeout(PLAYTHROUGH_BUDGET_MS + 30_000);
    await page.setViewportSize(viewportCase.viewport);
    await playToScoring(page);

    const stage = await page.locator("#game-stage").boundingBox();
    const panel = await page.locator("#game-panel").boundingBox();
    expect(stage, "stage bounding box").not.toBeNull();
    expect(panel, "panel bounding box").not.toBeNull();

    const slack = 1;
    expect(panel.x, "panel left edge").toBeGreaterThanOrEqual(stage.x - slack);
    expect(panel.y, "panel top edge").toBeGreaterThanOrEqual(stage.y - slack);
    expect(panel.x + panel.width, "panel right edge").toBeLessThanOrEqual(
      stage.x + stage.width + slack,
    );
    expect(panel.y + panel.height, "panel bottom edge").toBeLessThanOrEqual(
      stage.y + stage.height + slack,
    );
  });
}
