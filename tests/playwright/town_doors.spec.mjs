// Town collision and door walk-in gesture contract.
//
// Selector contract: this spec depends on the ?seed= / ?speed= hooks in
// src/ui/main.tsx, the #new-game-button title control, the
// #land-grant-pass-button phase control, and the town scene
// (src/ui/scenes/town_scene.tsx): the #town-scene container, its avatar
// g[data-actor="player-0"] with data-carrying and data-at-door (whose
// transform is written every frame by writeTransforms, town_scene.tsx:349),
// each door marker's [data-door-for]/[data-door-state] pair
// (town_scene.tsx:792), and the [data-town-notice] banner. Player 0 is always
// the human and always picks first in round 1 (src/engine/land_grant.ts).
//
// Town's interaction model (docs/HUMAN_GUIDANCE.md "Town interaction model"):
// a door slides open as the avatar approaches (computeOpenDoors,
// src/ui/scenes/town_layout.ts:494, opens within DOOR_OPEN_RADIUS_PX=48px of
// the door's street-cell center) and walking north through it IS the entry
// action -- no keypress (detectWalkIn, town_scene.tsx:327). A closed
// pass-through doorway and every outfit-counter podium are solid walls
// (resolveTownWalkWithDoors, town_layout.ts:469; TOWN_SOLID_RECTS,
// town_layout.ts:188), so walking a counter's column stops the avatar at its
// south face.
//
// Fixed seed 33 has an all-plains town row (row 2) with the town cell at the
// row center (col 4), matching town_scene.spec.mjs's own seed choice. A
// modest ?speed=2 keeps every walk-in loop well inside the develop tick
// budget while assertions poll data attributes or the avatar's transform
// rather than timing a frame.

import { test, expect } from "@playwright/test";

/** Fixed seed with a plains town row; a modest speed for the walk-in loop. */
const GAME_QUERY = "?seed=33&speed=2";
/** Upper bound on land-grant pass clicks before we conclude something is stuck. */
const MAX_PASS_ITERATIONS = 50;
/** Town cell column (row center) for seed 33's 5x9 board. */
const TOWN_COL = 4;
/** Poll intervals (ms) for catching a transient avatar position or attribute. */
const TIGHT_POLL = [20, 20, 20];
/**
 * Real-ms duration of one bounded east/west alignment tap: comfortably under
 * a door cell's ~400ms crossing time at this spec's speed, so a tap can never
 * carry the avatar past the target door's column untouched. See
 * town_scene.spec.mjs's `useDoor` doc comment for the full root-cause
 * writeup this mirrors.
 */
const WALK_TAP_MS = 120;
/** Upper bound on alignment taps before concluding a door will never be reached. */
const MAX_WALK_TAPS = 60;
/**
 * Real-ms duration of one directional hold used to cross a door's walk-in
 * entry line (town_layout.ts's DOOR_ENTER_Y sits only ~8px north of the
 * street-row spawn line at this scene's geometry). At this spec's speed
 * (WALKER_SPEED_PX_PER_SEC * speed=2 = 160px/s) this hold covers roughly
 * 32px, comfortably past the crossing distance without walking far enough to
 * drift into a neighboring door's column once released.
 */
const DOOR_HOLD_MS = 200;

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
 * `claim_current_plot` binds to (land_grant_panel.tsx).
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
 * Walk the town avatar in `walkDir` until it stands at `door`'s street cell,
 * in bounded taps (hold `walkDir` for WALK_TAP_MS, release, then check
 * data-at-door) so a slow attribute read can only delay noticing arrival, not
 * carry the avatar past the door. Skips the walk when already there.
 */
async function alignToDoor(page, townAvatar, door, walkDir) {
  for (let tap = 0; tap < MAX_WALK_TAPS; tap++) {
    if ((await townAvatar.getAttribute("data-at-door")) === door) {
      return;
    }
    await page.keyboard.down(walkDir);
    await page.waitForTimeout(WALK_TAP_MS);
    await page.keyboard.up(walkDir);
  }
  throw new Error(`avatar never reached the ${door} door after ${MAX_WALK_TAPS} taps`);
}

/**
 * Read the town avatar's current pixel center from the `transform` SVG
 * attribute town_scene.tsx's writeTransforms writes every frame
 * (`translate(x y)`), the only numeric position town exposes (unlike the
 * overworld's data-cell-row/col).
 */
async function readAvatarPixelPos(townAvatar) {
  const transform = await townAvatar.getAttribute("transform");
  const match = transform?.match(/translate\(([-\d.]+)\s+([-\d.]+)\)/);
  if (match === null || match === undefined) {
    throw new Error(`avatar transform did not match translate(x y): ${transform}`);
  }
  return { x: Number(match[1]), y: Number(match[2]) };
}

test("town: walking into a solid counter stops the avatar at the wall, no wall-through", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto(`/${GAME_QUERY}`);
  await reachHumanDevelop(page, 2, TOWN_COL - 1);
  const townAvatar = await enterTown(page);

  // Align to the food counter's column, still on the street (same y as spawn:
  // only the sideways taps above have moved the avatar so far).
  await alignToDoor(page, townAvatar, "counter-food", "ArrowRight");
  const beforeNorth = await readAvatarPixelPos(townAvatar);

  // Press firmly north into the solid podium for well longer than the ~10px
  // crossing distance to its collision face, so a real wall-through bug (the
  // avatar sailing past the counter) would show up as a still-changing y.
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(DOOR_HOLD_MS * 3);
  const stoppedPos = await readAvatarPixelPos(townAvatar);
  await page.waitForTimeout(DOOR_HOLD_MS);
  const stillStoppedPos = await readAvatarPixelPos(townAvatar);
  await page.keyboard.up("ArrowUp");

  // The avatar actually moved north from the street (proves the walk itself
  // worked)...
  expect(stoppedPos.y).toBeLessThan(beforeNorth.y);
  // ...but froze at the same y a full DOOR_HOLD_MS later despite the key
  // still held down: the counter's south face blocked it, it did not walk
  // through into the podium.
  expect(stillStoppedPos.y).toBe(stoppedPos.y);
});

test("town: a door far from the avatar stays closed and fires no entry", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/${GAME_QUERY}`);
  await reachHumanDevelop(page, 2, TOWN_COL - 1);
  const townAvatar = await enterTown(page);

  // The assay door sits five street cells east of the corral spawn, well
  // outside DOOR_OPEN_RADIUS_PX (48px) -- it starts closed.
  const assayDoor = page.locator('[data-door-for="assay"]');
  await expect(assayDoor).toHaveAttribute("data-door-state", "closed");
  await expect(townAvatar).not.toHaveAttribute("data-at-door", "assay");

  // A short walk toward it (one bounded tap) still leaves the avatar far
  // outside the open radius: the door stays closed and no entry fires.
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(WALK_TAP_MS);
  await page.keyboard.up("ArrowRight");
  await expect(assayDoor).toHaveAttribute("data-door-state", "closed");
  await expect(page.locator("[data-town-notice]")).not.toContainText("Assay ready");
});

test("town: walking through an open door fires its interaction with no key press", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto(`/${GAME_QUERY}`);
  await reachHumanDevelop(page, 2, TOWN_COL - 1);
  const townAvatar = await enterTown(page);

  await alignToDoor(page, townAvatar, "assay", "ArrowRight");
  // By the time the avatar's column matches the door, it is already well
  // inside DOOR_OPEN_RADIUS_PX, so the door has already slid open.
  await expect(page.locator('[data-door-for="assay"]')).toHaveAttribute("data-door-state", "open");

  // Walk north through the open doorway. No Enter/Space is pressed anywhere
  // in this test -- the walk-in itself is the entry action.
  await page.keyboard.down("ArrowUp");
  await expect(page.locator("[data-town-notice]")).toContainText("Assay ready", {
    timeout: 10_000,
  });
  await page.keyboard.up("ArrowUp");
});
