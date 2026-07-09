// Walkable town scene contract.
//
// Selector contract: this spec depends on the ?seed= / ?speed= hooks in
// src/ui/main.tsx, the #new-game-button title control, the
// #land-grant-pass-button phase control, the map's data-outfit placed-M.U.L.E.
// group and data-crystite assayed-plot badge (src/ui/solid/map_layer.tsx), the
// overworld avatar (.overworld-svg g[data-actor="player-0"] with
// data-cell-row/col/carrying, src/ui/scenes/overworld_scene.tsx), and the town
// scene (src/ui/scenes/town_scene.tsx): the #town-scene container, its avatar
// g[data-actor="player-0"] with data-carrying and data-at-door, and the
// [data-town-notice] banner. Player 0 is always the human and always picks
// first in round 1 (src/engine/land_grant.ts).
//
// Fixed seed 33 has an all-plains town row (row 2) with the town cell at the row
// center (col 4), so the human's owned plots and the town-adjacent return cells
// are plains the avatar walks at full speed. The town is entered by stepping
// onto the town cell; the compact interior (src/ui/scenes/zones.ts) spawns the
// avatar at the corral so buy -> outfit -> exit fits inside one develop turn.
// A modest ?speed=2 keeps the walk-in loop well inside the tick budget while
// every motion assertion polls a data attribute rather than timing a frame.

import { test, expect } from "@playwright/test";

/** Fixed seed with a plains town row; a modest speed for the walk-in loop. */
const GAME_QUERY = "?seed=33&speed=2";
/** Upper bound on land-grant pass clicks before we conclude something is stuck. */
const MAX_PASS_ITERATIONS = 50;
/** Town cell column (row center) for seed 33's 5x9 board. */
const TOWN_COL = 4;
/** Poll intervals (ms) for catching a transient avatar position. */
const TIGHT_POLL = [20, 20, 20];
/**
 * Real-ms duration of one bounded town-walk tap: comfortably under a door
 * cell's ~400ms crossing time at this spec's speed, so a tap can never carry
 * the avatar past an entire door untouched. See useDoor's doc comment.
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
  // The claim must actually land on the human before the walk assertions
  // below can rely on the human owning this exact plot.
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
 * Walk the town avatar in `walkDir` toward `door`, then use the door with the
 * action key. Skips the walk when already at the door.
 *
 * Advances in bounded taps (hold `walkDir` for WALK_TAP_MS, release, then
 * check data-at-door) rather than holding the key down for the whole walk
 * while polling for the exact target door. A continuous hold races the
 * attribute check: town's doors sit one street cell apart and the avatar
 * crosses one every ~400ms at this spec's speed, so once a single
 * `getAttribute` round trip runs slow (a loaded machine, several Playwright
 * suites at once), the poll can miss the target door's entire window and the
 * avatar keeps walking, straight out the far edge exit -- which unmounts
 * #town-scene and leaves the poll re-reading a detached locator for the rest
 * of its timeout, reporting whatever door it last saw (see docs/CHANGELOG.md
 * for the full root-cause writeup). Tapping bounds each check to a stationary
 * snapshot: the avatar can only move for WALK_TAP_MS of real time between
 * checks, a distance well under one door cell, so a slow check merely delays
 * noticing arrival -- it can never let the avatar sail past the door.
 */
async function useDoor(page, townAvatar, door, walkDir) {
  for (let tap = 0; tap < MAX_WALK_TAPS; tap++) {
    if ((await townAvatar.getAttribute("data-at-door")) === door) {
      await page.keyboard.press("Space");
      return;
    }
    await page.keyboard.down(walkDir);
    await page.waitForTimeout(WALK_TAP_MS);
    await page.keyboard.up(walkDir);
  }
  throw new Error(`avatar never reached the ${door} door after ${MAX_WALK_TAPS} taps`);
}

/**
 * Walk the town avatar into an edge exit in `walkDir` and wait for the town to
 * unmount (back on the overworld). Returns the overworld avatar locator.
 */
async function exitTown(page, walkDir) {
  await page.keyboard.down(walkDir);
  await expect(page.locator("#town-scene")).toHaveCount(0, { timeout: 15_000 });
  await page.keyboard.up(walkDir);
  const avatar = page.locator(".overworld-svg [data-actor='player-0']");
  await expect(avatar).toHaveCount(1, { timeout: 15_000 });
  return avatar;
}

test("town: buy at the corral, outfit at a counter, exit, and place on an owned plot", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto(`/${GAME_QUERY}`);
  // Claim the town's left neighbor: the human spawns there and returns there
  // after the west exit, so placement needs no extra walking.
  await reachHumanDevelop(page, 2, TOWN_COL - 1);

  const townAvatar = await enterTown(page);

  // Buy at the corral (the spawn door): the avatar starts carrying an
  // unoutfitted M.U.L.E.
  await useDoor(page, townAvatar, "corral", "ArrowRight");
  await expect(townAvatar).toHaveAttribute("data-carrying", "unoutfitted");

  // Outfit at the food counter (one cell right): the tow now carries food.
  await useDoor(page, townAvatar, "counter-food", "ArrowRight");
  await expect(townAvatar).toHaveAttribute("data-carrying", "food");

  // Leave through the west exit; the avatar returns to its owned plot.
  const returnedAvatar = await exitTown(page, "ArrowLeft");
  await expect(returnedAvatar).toHaveAttribute("data-carrying", "food");
  await expect
    .poll(async () => returnedAvatar.getAttribute("data-cell-col"), {
      timeout: 15_000,
      message: "avatar did not return to the town-adjacent plot",
    })
    .toBe(String(TOWN_COL - 1));

  // Press the action key to install the M.U.L.E. on the owned plot: a placed
  // M.U.L.E. glyph now renders inside the human's own cell specifically (not
  // merely somewhere on the map, which an AI's own placement could also
  // satisfy).
  await page.keyboard.press("Enter");
  const humanPlot = page.locator(`#game-map .map-svg g[data-row="2"][data-col="${TOWN_COL - 1}"]`);
  await expect(humanPlot.locator("g[data-outfit]")).toBeVisible({ timeout: 10_000 });
});

test("town: the pub door opens a confirm affordance, and Escape declines it", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/${GAME_QUERY}`);
  await reachHumanDevelop(page, 2, TOWN_COL - 1);
  const townAvatar = await enterTown(page);

  // Walk to the pub door and use it: the action key only opens the confirm
  // affordance. pub_gamble.spec.mjs owns the full confirm/decline/payout
  // contract (money, notice wording, turn end); this spec checks only that
  // the door itself reacts and that Escape backs out of it.
  await useDoor(page, townAvatar, "pub", "ArrowRight");
  await expect(page.locator("#town-scene")).toHaveAttribute("data-gamble-confirming", "true");

  await page.keyboard.press("Escape");
  await expect(page.locator("#town-scene")).toHaveAttribute("data-gamble-confirming", "false");
});

test("town: the assay office arms an assay that reveals a plot's crystite", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/${GAME_QUERY}`);
  await reachHumanDevelop(page, 2, TOWN_COL - 1);
  const townAvatar = await enterTown(page);

  // Arm the assay at the assay office, then leave through the east exit so the
  // avatar returns to the town's east neighbor (an assayable plains plot).
  await useDoor(page, townAvatar, "assay", "ArrowRight");
  await expect(page.locator("[data-town-notice]")).toContainText("Assay ready", {
    timeout: 10_000,
  });
  const returnedAvatar = await exitTown(page, "ArrowRight");
  await expect
    .poll(async () => returnedAvatar.getAttribute("data-cell-col"), {
      timeout: 15_000,
      message: "avatar did not return to the town's east neighbor",
    })
    .toBe(String(TOWN_COL + 1));

  // Press the action key on the plot to spend the armed assay: a crystite badge
  // now renders on that plot (the revealed level, via visibleCrystite).
  await page.keyboard.press("Enter");
  const badge = page.locator("#game-map .map-svg g[data-crystite]");
  await expect(badge.first()).toBeVisible({ timeout: 10_000 });
});
