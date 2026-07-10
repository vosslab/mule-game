// Selector contract: this spec depends on src/ui/main.tsx's #new-game-button
// wiring, src/ui/solid/game_screen.tsx's `?crash-test=1` dev-only escape hatch
// (ForcedCrashProbe, mounted only inside the human develop layer's
// <ErrorBoundary>), and src/ui/solid/error_fallback.tsx's
// [data-error-boundary] / [data-action="error-reload"] markup.
//
// Proves the develop layer's <ErrorBoundary> actually catches a real thrown
// error instead of only being reachable in theory: with `?crash-test=1` set,
// the first mount of the human's develop-turn layer throws synchronously, and
// this spec asserts the fallback panel renders in its place -- with the HUD
// still intact alongside it, since the boundary around the develop layer is
// separate from the outer one wrapping the whole screen.

import { test, expect } from "@playwright/test";

/** Upper bound on land-grant pass clicks before we conclude something is stuck. */
const MAX_PASS_ITERATIONS = 50;

/**
 * Claim whichever plot the land-grant sweep cursor is currently on, via the
 * same Enter key `claim_current_plot` binds to. Matches game_flow.spec.mjs's
 * helper of the same name.
 */
async function claimCurrentLandGrantPlot(page) {
  await page.locator("#game-map .map-svg g[data-row][data-col]").first().waitFor();
  await page.keyboard.press("Enter");
}

/**
 * Click the land-grant Pass button until it disappears (AI turns finish and
 * the develop phase takes over), or throw if it never does within
 * MAX_PASS_ITERATIONS attempts. Matches game_flow.spec.mjs's helper.
 */
async function passThroughLandGrant(page) {
  const passButton = page.locator("#land-grant-pass-button");
  for (let i = 0; i < MAX_PASS_ITERATIONS; i++) {
    if (!(await passButton.isVisible().catch(() => false))) {
      return;
    }
    await passButton.click();
    await page.waitForTimeout(50);
  }
  if (await passButton.isVisible().catch(() => false)) {
    throw new Error(`land-grant Pass button still visible after ${MAX_PASS_ITERATIONS} clicks`);
  }
}

test("error boundary: a forced develop-layer crash shows the fallback panel, not a dead screen", async ({
  page,
}) => {
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/?speed=8&crash-test=1");
  await page.locator("#new-game-button").click();

  await claimCurrentLandGrantPlot(page);
  await passThroughLandGrant(page);

  // The develop layer's ForcedCrashProbe throws on its first mount for the
  // human's develop turn; the nearest <ErrorBoundary> catches it and renders
  // the fallback panel in the develop layer's place.
  const fallback = page.locator("[data-error-boundary]");
  await expect(fallback).toBeVisible({ timeout: 30_000 });
  await expect(fallback.locator(".error-boundary-title")).toHaveText("Something went wrong.");
  await expect(fallback.locator(".error-boundary-detail")).toHaveText(
    "forced crash for ErrorBoundary test (?crash-test=1)",
  );
  await expect(page.locator('[data-action="error-reload"]')).toBeVisible();

  // Only the develop layer's own boundary caught the crash: the HUD (rendered
  // by the outer, sibling boundary) is unaffected.
  await expect(page.locator("#game-hud .hud-player")).toHaveCount(4);

  // Solid's <ErrorBoundary> catches the throw inside its own reactive graph;
  // it never escapes to a top-level uncaught page error.
  expect(pageErrors).toEqual([]);
});
