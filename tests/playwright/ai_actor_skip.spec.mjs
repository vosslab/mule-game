// Selector contract: this spec depends on the standalone `?demo=ai_actor`
// fixture route (src/ui/solid/ai_actor_demo.tsx, wired through src/ui/main.tsx
// and src/ui/solid/app.tsx), src/ui/solid/ai_actor_layer.tsx's
// `[data-ai-skip-button]` and `g[data-actor="player-1"][data-carrying]`, and
// the HUD/board selector contracts (`.hud-player[data-player]`,
// `.hud-good[data-resource]`, `g[data-row][data-col][data-owner][data-outfit]`
// -- see hud.tsx and map_layer.tsx). Player 1 always develops first in this
// fixture, with one plot pre-granted so its turn can place a M.U.L.E.
//
// Skip-equivalence: for the same `?seed=`, "watched" (never click Skip, let
// the real scene-manager cadence play the turn out) and "skipped" (click
// Skip immediately) must reach the identical HUD/board outcome for player 1
// -- the property ai_actor.ts's `runAiTurnToCompletion` is built on (it
// dispatches the exact same `decideDevelopAction` sequence, just without the
// timer). See tests/test_ai_actor.mjs for the same property proven directly
// against the engine, without a browser.

import { test, expect } from "@playwright/test";

/** Fixed seed so both runs see the identical starting board and player 1 turn. */
const FIXTURE_SEED = 99;

/**
 * Read the HUD's money and per-resource goods for player 1, plus the board's
 * lone pre-granted plot's owner/outfit -- the observable outcome of player
 * 1's develop turn.
 */
async function readOutcome(page) {
  const money = await page.locator('.hud-player[data-player="1"] .hud-money').innerText();
  const goods = await page
    .locator('.hud-player[data-player="1"] .hud-good')
    .evaluateAll((els) => els.map((el) => [el.getAttribute("data-resource"), el.textContent]));
  const plot = page.locator("#map-container g[data-owner='1']").first();
  const owner = await plot.getAttribute("data-owner");
  const outfitGroup = plot.locator("g[data-outfit]");
  const outfit =
    (await outfitGroup.count()) > 0 ? await outfitGroup.getAttribute("data-outfit") : null;
  return { money, goods, owner, outfit };
}

/** Wait until player 1's develop turn has ended (the AI actor layer unmounts). */
async function waitForTurnToEnd(page) {
  await expect(page.locator("[data-ai-actor-player]")).toHaveCount(0, { timeout: 15_000 });
}

test("ai actor skip: watching the turn play out and skipping it reach the same outcome", async ({
  page,
  context,
}) => {
  // Watched: never click Skip; let the real AI_STEP_MS cadence play out.
  await page.goto(`/?demo=ai_actor&seed=${FIXTURE_SEED}&speed=8`);
  await waitForTurnToEnd(page);
  const watched = await readOutcome(page);

  // Skipped: a fresh page (fresh store), click Skip immediately.
  const skipPage = await context.newPage();
  await skipPage.goto(`/?demo=ai_actor&seed=${FIXTURE_SEED}&speed=8`);
  await skipPage.locator("[data-ai-skip-button]").click();
  await waitForTurnToEnd(skipPage);
  const skipped = await readOutcome(skipPage);
  await skipPage.close();

  expect(skipped).toEqual(watched);
  // Sanity: the turn actually did something observable (money moved, or a
  // M.U.L.E. was placed), so this isn't trivially comparing two no-ops.
  const moneyUnchanged = watched.money === "$1000";
  const nothingPlaced = watched.outfit === null;
  expect(moneyUnchanged && nothingPlaced).toBe(false);
});

test("ai actor skip: the Skip button is visible during an AI develop turn", async ({ page }) => {
  await page.goto(`/?demo=ai_actor&seed=${FIXTURE_SEED}`);
  await expect(page.locator("[data-ai-skip-button]")).toBeVisible();
  await expect(page.locator('[data-ai-actor-player="1"]')).toBeVisible();
});
