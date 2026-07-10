// Human pub gambling contract.
//
// Selector contract: this spec depends on the ?seed= / ?speed= hooks in
// src/ui/main.tsx, the #new-game-button title control, the
// #land-grant-pass-button phase control, the town scene (src/ui/scenes/town_scene.tsx):
// the #town-scene container with its [data-gamble-confirming] attribute, its
// avatar (g[data-actor="player-0"] with data-at-door), the [data-town-notice]
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
// row center (col 4), matching town_scene.spec.mjs's own seed choice, so the
// walk from the corral spawn to the pub door stays inside one develop turn's
// tick budget. A modest ?speed=2 keeps the walk-in loop well inside that
// budget while every motion assertion polls a data attribute rather than
// timing a frame.

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
 * the avatar past an entire door untouched. See town_scene.spec.mjs's
 * `useDoor` doc comment for the full root-cause writeup.
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
 * land grant, and wait until the human's develop turn is up (the overworld
 * avatar mounts). Returns the overworld avatar locator.
 */
async function reachHumanDevelop(page, claimRow, claimCol) {
  await page.locator("#new-game-button").click();
  await claimLandGrantPlotAt(page, claimRow, claimCol);
  const claimedPlot = page.locator(
    `#game-map .map-svg g[data-row="${claimRow}"][data-col="${claimCol}"]`,
  );
  await expect(claimedPlot).toHaveAttribute("data-owner", "0");
  await passThroughLandGrant(page);
  const avatar = page.locator(".overworld-svg [data-actor='player-0']");
  await expect(avatar).toHaveCount(1, { timeout: 30_000 });
  return avatar;
}

/**
 * Walk the overworld avatar onto the town cell (one cell right of its spawn) and
 * wait for the town interior to mount. Returns the town avatar locator.
 */
async function enterTown(page) {
  await page.keyboard.down("ArrowRight");
  await expect(page.locator("#town-scene")).toBeVisible({ timeout: 15_000 });
  await page.keyboard.up("ArrowRight");
  return page.locator("#town-scene [data-actor='player-0']");
}

/**
 * Real-ms duration of one directional hold used to walk through the pub's
 * walk-in entry line (town_layout.ts's DOOR_ENTER_Y sits only ~8px north of
 * the street-row spawn line). At this spec's speed
 * (WALKER_SPEED_PX_PER_SEC * speed=2 = 160px/s) this hold covers roughly
 * 32px, comfortably past the crossing distance.
 */
const DOOR_HOLD_MS = 200;

/**
 * Walk the town avatar in `walkDir` until it stands at `door`'s street cell,
 * then walk it north through the doorway to open the pub's confirm affordance
 * -- the town interaction model (docs/HUMAN_GUIDANCE.md "Town interaction
 * model") treats walking through an open doorway as the entry action itself
 * (detectWalkIn, src/ui/scenes/town_scene.tsx:327), no keypress. Unlike
 * town_scene.spec.mjs's `walkIntoDoor`, this does not walk back south
 * afterward: the pub flow needs fine-grained control over each subsequent
 * keypress (decline, reopen, confirm), and walking into the pub freezes
 * movement anyway once its confirm affordance is up (confirmingGamble,
 * town_scene.tsx:263), so a return walk would be a no-op.
 *
 * Advances the sideways walk in bounded taps (hold `walkDir` for WALK_TAP_MS,
 * release, then check data-at-door) rather than holding the key down for the
 * whole walk while polling for the exact target door. A continuous hold races
 * the attribute check: town's doors sit one street cell apart and the avatar
 * crosses one every ~400ms at this spec's speed, so once a single
 * `getAttribute` round trip runs slow, the poll can miss the target door's
 * entire window and the avatar keeps walking, straight out the far edge exit
 * (see town_scene.spec.mjs's `walkIntoDoor` doc comment for the full
 * writeup). Tapping bounds each check to a stationary snapshot, so a slow
 * check merely delays noticing arrival -- it can never let the avatar sail
 * past the door.
 */
async function walkToDoor(page, townAvatar, door, walkDir) {
  for (let tap = 0; tap < MAX_WALK_TAPS; tap++) {
    if ((await townAvatar.getAttribute("data-at-door")) === door) {
      await page.keyboard.down("ArrowUp");
      await page.waitForTimeout(DOOR_HOLD_MS);
      await page.keyboard.up("ArrowUp");
      return;
    }
    await page.keyboard.down(walkDir);
    await page.waitForTimeout(WALK_TAP_MS);
    await page.keyboard.up(walkDir);
  }
  throw new Error(`avatar never reached the ${door} door after ${MAX_WALK_TAPS} taps`);
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
  await reachHumanDevelop(page, 2, TOWN_COL - 1);
  const townAvatar = await enterTown(page);

  // Walking into the pub already opens the confirm affordance (the walk-in
  // itself is the entry action); it must not gamble or end the turn by itself.
  await walkToDoor(page, townAvatar, "pub", "ArrowRight");
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
  await reachHumanDevelop(page, 2, TOWN_COL - 1);
  const townAvatar = await enterTown(page);

  await walkToDoor(page, townAvatar, "pub", "ArrowRight");
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
  await reachHumanDevelop(page, 2, TOWN_COL - 1);
  const townAvatar = await enterTown(page);

  await walkToDoor(page, townAvatar, "pub", "ArrowRight");
  await expect(page.locator("#town-scene")).toHaveAttribute("data-gamble-confirming", "true");
  await page.keyboard.press("Space");

  const banner = page.locator("[data-pub-banner]");
  await expect(banner).toBeVisible({ timeout: 10_000 });
  await expect(banner).toHaveAttribute("data-reduced-motion", "true");
});
