// Human pub gambling contract.
//
// Selector contract: this spec depends on the ?seed= / ?speed= hooks in
// src/ui/main.tsx, the #new-game-button title control, the
// #land-grant-pass-button phase control, the town scene (src/ui/scenes/town_scene.tsx):
// the #town-scene container (mounted at develop-turn start, WP-4B) with its
// [data-gamble-confirming] attribute, its avatar (g[data-actor="player-0"]),
// each door's [data-door-for]/[data-door-state] (WP-4A's open/closed
// hysteresis, used here to detect arrival at the pub door since there is no
// longer a per-avatar "at this door" attribute), the [data-town-notice]
// banner, and the [data-pub-banner]/[data-pub-banner-amount] payout banner
// (appended straight to document.body, outside #town-scene, since gambling
// always ends the turn and unmounts the scene the instant it dispatches); the
// HUD's .hud-player[data-player] .hud-money text (src/ui/solid/hud.tsx); and
// the AI actor layer's [data-ai-actor-player] mount (src/ui/solid/game_screen.tsx),
// used here as proof the turn actually advanced to the next player. Player 0
// is always the human and always picks first in round 1
// (src/engine/land_grant.ts).
//
// Fixed seed 33 has an all-plains town row (row 2) with the town cell at the
// row center (col 4), matching town_street.spec.mjs's own seed choice, so the
// walk from the corral spawn to the pub door stays inside one develop turn's
// tick budget. A modest ?speed=2 keeps the walk-in loop well inside that
// budget while every motion assertion polls a data attribute rather than
// timing a frame.
//
// Town-first navigation (WP-4B/WP-4C): every human develop turn now starts IN
// TOWN at the corral (human_develop_layer.tsx), so reachHumanDevelop below
// waits on #town-scene rather than the overworld avatar, with no walk onto
// the town cell needed.

import { test, expect } from "@playwright/test";

/** Fixed seed with a plains town row; a modest speed for the walk-in loop. */
const GAME_QUERY = "?seed=33&speed=2";
/** Upper bound on land-grant pass clicks before we conclude something is stuck. */
const MAX_PASS_ITERATIONS = 50;
/** Town cell column (row center) for seed 33's 5x9 board. */
const TOWN_COL = 4;
/** Poll intervals (ms) for catching a transient avatar position or attribute. */
const TIGHT_POLL = [20, 20, 20];
/** The engine's hard cap on a single gamble's payout (src/engine/constants.ts). */
const PUB_PAYOUT_CAP = 250;
/**
 * Real-ms duration of one bounded town-walk tap: comfortably under a door
 * cell's ~400ms crossing time at this spec's speed, so a tap can never carry
 * the avatar past an entire door untouched. See `walkToDoor`'s own doc
 * comment below (and town_street.spec.mjs's `walkAvatarToX`) for the tap-vs-
 * poll rationale; docs/CHANGELOG.md holds the original root-cause writeup.
 */
const WALK_TAP_MS = 120;
/** Upper bound on taps before concluding a door will never be reached. */
const MAX_WALK_TAPS = 60;

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

/**
 * Wait until the land-grant sweep cursor (src/engine/land_grant.ts) reaches
 * (targetRow, targetCol), then claim it with the same Enter key
 * `claim_current_plot` binds to (land_grant_panel.tsx). Clicking a plot
 * locator directly is a no-op unless it already matches the sweep cursor's
 * current position (game_screen.tsx's handlePlotClick), so this test must
 * wait for the cursor to reach the desired plot rather than race an
 * immediate click against it.
 */
async function claimLandGrantPlotAt(page, targetRow, targetCol) {
  const cursoredPlot = page.locator("#game-map .map-svg g.plot-cursor");
  await expect
    .poll(
      async () => {
        const row = await cursoredPlot.getAttribute("data-row");
        const col = await cursoredPlot.getAttribute("data-col");
        return `${row},${col}`;
      },
      {
        timeout: 20_000,
        intervals: TIGHT_POLL,
        message: `sweep cursor never reached (${targetRow}, ${targetCol})`,
      },
    )
    .toBe(`${targetRow},${targetCol}`);
  await page.keyboard.press("Enter");
}

/**
 * Start a game, claim the plot at (claimRow, claimCol), pass the rest of the
 * land grant, and wait until the human's develop turn is up. Every human
 * develop turn now starts IN TOWN at the corral (WP-4B), so this waits on the
 * town scene mounting -- there is no overworld avatar to wait on at turn
 * start, and no walk onto the town cell is needed. Returns the town avatar
 * locator.
 */
async function reachHumanDevelop(page, claimRow, claimCol) {
  await page.locator("#new-game-button").click();
  await claimLandGrantPlotAt(page, claimRow, claimCol);
  const claimedPlot = page.locator(
    `#game-map .map-svg g[data-row="${claimRow}"][data-col="${claimCol}"]`,
  );
  await expect(claimedPlot).toHaveAttribute("data-owner", "0");
  await passThroughLandGrant(page);
  await expect(page.locator("#town-scene")).toBeVisible({ timeout: 30_000 });
  return page.locator("#town-scene [data-actor='player-0']");
}

/**
 * Real-ms duration of one directional hold used to walk through the pub's
 * walk-in entry line (town_world.ts's DOOR_ENTRY_BAND_PX sits only a few px
 * north of the street-lane spawn line). At this spec's speed
 * (WALKER_SPEED_PX_PER_SEC * speed=2 = 160px/s) this hold covers roughly
 * 32px, comfortably past the crossing distance.
 */
const DOOR_HOLD_MS = 200;

/**
 * A composed facade's door-center world x, read off its rendered
 * .town-facade-rect (town_scene.tsx) rather than duplicating town_world.ts's
 * spacing constants here.
 */
async function readDoorCenterX(page, facadeId) {
  const rect = page.locator(`[data-facade="${facadeId}"] .town-facade-rect`);
  const [x, width] = await Promise.all([rect.getAttribute("x"), rect.getAttribute("width")]);
  return Number(x) + Number(width) / 2;
}

/**
 * Walk the town avatar until its world x is aligned with `facadeId`'s door
 * center, then walk it north through the doorway to open the pub's confirm
 * affordance -- the town interaction model (docs/HUMAN_GUIDANCE.md "Town
 * interaction model") treats walking through an open doorway as the entry
 * action itself (detectWalkIn, src/ui/scenes/town_scene.tsx), no keypress.
 * This does not walk back south afterward: the pub flow needs fine-grained
 * control over each subsequent keypress (decline, reopen, confirm), and
 * walking into the pub freezes movement anyway once its confirm affordance is
 * up (the WP-4A panel-open phase), so a return walk would be a no-op.
 *
 * Advances the sideways walk in bounded taps toward whichever direction
 * currently closes the gap, shrinking each tap's hold in proportion to the
 * remaining distance (mirrors town_street.spec.mjs's walkAvatarToX). A fixed
 * tap length at this spec's walk speed overshoots the door's narrow alignment
 * window every time and, with only one fixed direction, would carry the
 * avatar straight past the door and out the far edge exit; shrinking taps as
 * the gap closes converges on the target instead.
 */
async function walkToDoor(page, townAvatar, facadeId) {
  const MIN_TAP_MS = 15;
  const MAX_TAP_MS = WALK_TAP_MS;
  // Mirrors TOWN_DOOR_ALIGN_TOLERANCE_PX (tests/e2e/walkthrough_helpers.mjs),
  // the source of truth; this spec runs built HTML over HTTP and cannot
  // import that module, so update both together.
  const ARRIVAL_TOLERANCE_PX = 8;
  const targetX = await readDoorCenterX(page, facadeId);
  for (let tap = 0; tap < MAX_WALK_TAPS; tap++) {
    const currentX = Number(await townAvatar.getAttribute("data-town-avatar-x"));
    const remaining = targetX - currentX;
    if (Math.abs(remaining) < ARRIVAL_TOLERANCE_PX) {
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(DOOR_HOLD_MS);
      await page.keyboard.up("ArrowUp");
      return;
    }
    const walkDir = remaining > 0 ? "ArrowRight" : "ArrowLeft";
    const tapMs = Math.min(MAX_TAP_MS, Math.max(MIN_TAP_MS, Math.abs(remaining) / 6));
    await page.keyboard.down(walkDir);
    await page.waitForTimeout(tapMs);
    await page.keyboard.up(walkDir);
  }
  throw new Error(`avatar never reached the ${facadeId} door after ${MAX_WALK_TAPS} taps`);
}

/**
 * Read the human's (player 0) current money from the HUD, parsing the
 * `$<amount>` text src/ui/solid/hud.tsx renders.
 */
async function readHumanMoney(page) {
  const text = await page.locator('.hud-player[data-player="0"] .hud-money').textContent();
  return Number(text.replace("$", "").trim());
}

test("pub: confirm affordance requires a second keypress, Escape declines with no engine effect", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto(`/${GAME_QUERY}`);
  const townAvatar = await reachHumanDevelop(page, 2, TOWN_COL - 1);

  // Walking into the pub already opens the confirm affordance (the walk-in
  // itself is the entry action); it must not gamble or end the turn by itself.
  await walkToDoor(page, townAvatar, "pub");
  const moneyBeforeAsk = await readHumanMoney(page);
  await expect(page.locator("#town-scene")).toHaveAttribute("data-gamble-confirming", "true");
  await expect(page.locator("[data-town-notice]")).toContainText("Gamble and end turn?");
  await expect(page.locator("#town-scene")).toBeVisible();
  expect(await readHumanMoney(page)).toBe(moneyBeforeAsk);

  // Escape backs out: no dispatch, no payout, no turn end, and the confirm
  // affordance clears.
  await page.keyboard.press("Escape");
  await expect(page.locator("#town-scene")).toHaveAttribute("data-gamble-confirming", "false");
  await expect(page.locator("[data-town-notice]")).toContainText("cancelled");
  await expect(page.locator("#town-scene")).toBeVisible();
  expect(await readHumanMoney(page)).toBe(moneyBeforeAsk);
});

test("pub: confirming a gamble pays out, shows the banner, and ends the turn", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/${GAME_QUERY}`);
  const townAvatar = await reachHumanDevelop(page, 2, TOWN_COL - 1);

  await walkToDoor(page, townAvatar, "pub");
  const moneyBefore = await readHumanMoney(page);

  await expect(page.locator("#town-scene")).toHaveAttribute("data-gamble-confirming", "true");
  await page.keyboard.press("Enter");

  // The payout banner shows a positive amount within the engine's cap.
  const banner = page.locator("[data-pub-banner]");
  await expect(banner).toBeVisible({ timeout: 10_000 });
  const amount = Number(await banner.getAttribute("data-pub-banner-amount"));
  expect(amount).toBeGreaterThan(0);
  expect(amount).toBeLessThanOrEqual(PUB_PAYOUT_CAP);

  // The turn actually ended: the town scene unmounts, the human's money grew
  // by exactly the banner's amount, and the next (AI) player's turn is live.
  await expect(page.locator("#town-scene")).toHaveCount(0, { timeout: 15_000 });
  await expect
    .poll(async () => readHumanMoney(page), {
      timeout: 10_000,
      message: "human money never reflected the pub payout",
    })
    .toBe(moneyBefore + amount);
  await expect(page.locator("#game-map [data-ai-actor-player]")).toBeVisible({ timeout: 15_000 });
});

test("pub: reduced motion still shows the payout banner, flagged accordingly", async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/${GAME_QUERY}`);
  const townAvatar = await reachHumanDevelop(page, 2, TOWN_COL - 1);

  await walkToDoor(page, townAvatar, "pub");
  await expect(page.locator("#town-scene")).toHaveAttribute("data-gamble-confirming", "true");
  await page.keyboard.press("Space");

  const banner = page.locator("[data-pub-banner]");
  await expect(banner).toBeVisible({ timeout: 10_000 });
  await expect(banner).toHaveAttribute("data-reduced-motion", "true");
});
