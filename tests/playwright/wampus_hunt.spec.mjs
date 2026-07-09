// Selector contract: this spec depends on the standalone `?demo=wampus`
// fixture route (src/ui/solid/wampus_hunt_demo.tsx, wired through
// src/ui/main.tsx and src/ui/solid/app.tsx), and
// src/ui/scenes/overworld_scene.tsx's `[data-wampus]`,
// `[data-wampus-catch-banner]`, and `g[data-actor="player-0"]` markup. The
// fixture spawns the avatar directly on a visible, catchable wampus's site,
// so pressing the action key immediately exercises the hunt trigger.

import { test, expect } from "@playwright/test";

test("wampus hunt: the glyph renders at the avatar's spawn site", async ({ page }) => {
  await page.goto("/?demo=wampus");
  await expect(page.locator("[data-wampus]")).toBeVisible();
  const avatarCell = await page
    .locator('g[data-actor="player-0"]')
    .evaluate((el) => [el.getAttribute("data-cell-row"), el.getAttribute("data-cell-col")]);
  const wampusCell = await page
    .locator("[data-wampus]")
    .evaluate((el) => [el.getAttribute("data-wampus-row"), el.getAttribute("data-wampus-col")]);
  expect(avatarCell).toEqual(wampusCell);
});

test("wampus hunt: pressing the action key while adjacent catches it and awards the bounty", async ({
  page,
}) => {
  await page.goto("/?demo=wampus");
  const moneyBefore = await page.locator(".hud-player[data-player='0'] .hud-money").innerText();

  await page.locator("body").press("Enter");

  await expect(page.locator("[data-wampus-catch-banner]")).toBeVisible();
  await expect(page.locator("[data-wampus]")).toHaveCount(0);
  const moneyAfter = await page.locator(".hud-player[data-player='0'] .hud-money").innerText();
  expect(moneyAfter).not.toBe(moneyBefore);
});

test("wampus hunt: the catch banner self-dismisses", async ({ page }) => {
  await page.goto("/?demo=wampus");
  await page.locator("body").press("Enter");
  await expect(page.locator("[data-wampus-catch-banner]")).toBeVisible();
  await expect(page.locator("[data-wampus-catch-banner]")).toHaveCount(0, { timeout: 5_000 });
});
