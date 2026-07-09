// Tutorial hint dismissal contract.
//
// Selector contract: this spec depends on the ?seed= / ?speed= / ?hints=
// hooks in src/ui/main.tsx and src/ui/hint_store.ts, the #new-game-button
// title control, the #land-grant-pass-button phase control, and src/ui/solid/
// tutorial_hint.tsx's own markup: [data-tutorial-hint] on the hint root and
// .tutorial-hint-dismiss on its "Got it" button. Player 0 is always the human
// and always picks first in round 1 (src/engine/land_grant.ts), so the
// land-grant hint is visible immediately after New Game with no setup.
//
// Each Playwright test gets a fresh, isolated browser context by default, so
// localStorage never leaks between the tests below.

import { test, expect } from "@playwright/test";

test("land-grant hint: shows on first encounter, dismiss persists across reload", async ({
  page,
}) => {
  await page.goto("/?seed=1&speed=4");
  await page.locator("#new-game-button").click();

  const hint = page.locator('[data-tutorial-hint="land_grant"]');
  await expect(hint).toBeVisible({ timeout: 15_000 });

  await hint.locator(".tutorial-hint-dismiss").click();
  await expect(hint).toHaveCount(0);

  // Reload drops in-memory state; localStorage (both the autosave and the
  // hint-dismissed set) survives. New Game overwrites any autosave, but the
  // hint dismissal is a standing preference, not part of the save, so it must
  // still hold for this fresh game.
  await page.reload();
  await page.locator("#new-game-button").click();
  await expect(page.locator("#game-map .map-svg g[data-row][data-col]").first()).toBeVisible();
  await expect(page.locator('[data-tutorial-hint="land_grant"]')).toHaveCount(0);
});

test("land-grant hint: Escape dismisses when focus is inside it, without passing the turn", async ({
  page,
}) => {
  await page.goto("/?seed=2&speed=4");
  await page.locator("#new-game-button").click();

  const hint = page.locator('[data-tutorial-hint="land_grant"]');
  await expect(hint).toBeVisible({ timeout: 15_000 });

  await hint.locator(".tutorial-hint-dismiss").focus();
  await page.keyboard.press("Escape");
  await expect(hint).toHaveCount(0);

  // Escape dismissed the hint only -- it must not have also reached
  // land_grant_panel.tsx's own document-level Escape=pass binding (the hint's
  // handler stops propagation precisely so the two never both fire). The Pass
  // button being present and the human's turn still open is exactly the
  // "no pass happened" signal.
  await expect(page.locator("#land-grant-pass-button")).toBeVisible();
});

test("hints=off query param disables every hint from the start", async ({ page }) => {
  await page.goto("/?seed=1&speed=4&hints=off");
  await page.locator("#new-game-button").click();
  await expect(page.locator("#game-map .map-svg g[data-row][data-col]").first()).toBeVisible();
  await expect(page.locator('[data-tutorial-hint="land_grant"]')).toHaveCount(0);
});
