// Walkable overworld scene contract.
//
// Selector contract: this spec depends on the ?seed= / ?speed= hooks in
// src/ui/main.tsx, the #new-game-button title control, the
// #land-grant-pass-button phase control, and the overworld scene
// (src/ui/scenes/overworld_scene.tsx) attributes: the avatar
// .overworld-svg g[data-actor="player-0"] with data-cell-row / data-cell-col /
// data-carrying, and the [data-timer] HUD bar. Stepping onto the town cell now
// mounts the town scene (#town-scene, src/ui/scenes/town_scene.tsx), which
// replaced the M5 interim store overlay. Player 0 is always the human and always
// picks first in round 1 (src/engine/land_grant.ts).
//
// Fixed seed 33 has an all-plains town row (row 2) with the town cell at the row
// center (col 4). The avatar now spawns one cell left of the town cell (col 3)
// so the develop turn does not begin inside town. ?speed=8 fast-forwards the
// develop clock; every motion assertion polls a data attribute rather than
// timing a frame.

import { test, expect } from "@playwright/test";

/** Query string: fixed seed with a plains town row, high scene speed. */
const GAME_QUERY = "?seed=33&speed=8";
/** Upper bound on land-grant pass clicks before we conclude something is stuck. */
const MAX_PASS_ITERATIONS = 50;
/** The avatar's spawn column: one cell left of the town cell (col 4). */
const SPAWN_COL = 3;

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
 * Start a game, claim the plot at (row, col), pass the rest of the land grant,
 * and wait until the human's develop turn is up (the overworld avatar mounts).
 */
async function reachHumanDevelop(page, claimRow, claimCol) {
  await page.locator("#new-game-button").click();
  const claimPlot = page.locator(
    `#game-map .map-svg g[data-row="${claimRow}"][data-col="${claimCol}"]`,
  );
  await expect(claimPlot).toBeVisible();
  await claimPlot.click();
  await passThroughLandGrant(page);
  const avatar = page.locator(".overworld-svg [data-actor='player-0']");
  await expect(avatar).toHaveCount(1, { timeout: 30_000 });
  return avatar;
}

test("overworld: held arrow keys walk the avatar to a new cell", async ({ page }) => {
  await page.goto(`/${GAME_QUERY}`);
  const avatar = await reachHumanDevelop(page, 2, 0);

  // The avatar spawns one cell left of the town cell (col 3).
  await expect(avatar).toHaveAttribute("data-cell-col", String(SPAWN_COL));

  // Hold ArrowLeft; the avatar walks left and its derived cell column drops.
  await page.keyboard.down("ArrowLeft");
  await expect
    .poll(async () => Number(await avatar.getAttribute("data-cell-col")), {
      timeout: 15_000,
      message: "avatar cell column never decreased while holding ArrowLeft",
    })
    .toBeLessThan(SPAWN_COL);
  await page.keyboard.up("ArrowLeft");
});

test("overworld: HUD timer bar exposes the draining tick budget", async ({ page }) => {
  await page.goto(`/${GAME_QUERY}`);
  await reachHumanDevelop(page, 2, 0);

  // The timer bar renders with a data-timer attribute reading the ticks left,
  // and it drains as the develop clock ticks.
  const timer = page.locator("[data-timer]");
  await expect(timer).toHaveCount(1);
  const startTicks = Number(await timer.getAttribute("data-timer"));
  expect(startTicks).toBeGreaterThan(0);
  await expect
    .poll(async () => Number(await timer.getAttribute("data-timer")), {
      timeout: 15_000,
      message: "timer bar tick count never decreased",
    })
    .toBeLessThan(startTicks);
});

test("overworld: stepping onto the town cell enters the town scene", async ({ page }) => {
  await page.goto(`/${GAME_QUERY}`);
  const avatar = await reachHumanDevelop(page, 2, 0);
  await expect(avatar).toHaveAttribute("data-cell-col", String(SPAWN_COL));

  // Walk right onto the town cell: the town interior mounts and the overworld
  // avatar unmounts (the town scene owns the avatar while inside).
  await page.keyboard.down("ArrowRight");
  await expect(page.locator("#town-scene")).toBeVisible({ timeout: 15_000 });
  await page.keyboard.up("ArrowRight");
  await expect(page.locator("#town-scene [data-actor='player-0']")).toHaveCount(1);
  await expect(page.locator(".overworld-svg [data-actor='player-0']")).toHaveCount(0);
});

test("overworld: reduced motion applies no animated styles to the avatar", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/${GAME_QUERY}`);
  const avatar = await reachHumanDevelop(page, 2, 0);

  // Neither the avatar group nor its sprite carries a CSS transition or
  // animation: motion is written per-frame through the transform attribute, and
  // reduced motion holds the rest frame instead of cycling.
  const styles = await avatar.evaluate((node) => {
    const sprite = node.querySelector(".overworld-avatar-sprite") ?? node;
    const avatarStyle = getComputedStyle(node);
    const spriteStyle = getComputedStyle(sprite);
    return {
      avatarTransition: avatarStyle.transitionDuration,
      avatarAnimation: avatarStyle.animationName,
      spriteTransition: spriteStyle.transitionDuration,
      spriteAnimation: spriteStyle.animationName,
    };
  });
  expect(styles.avatarTransition).toBe("0s");
  expect(styles.avatarAnimation).toBe("none");
  expect(styles.spriteTransition).toBe("0s");
  expect(styles.spriteAnimation).toBe("none");
});
