// Corral purchase panel contract: the attempt-then-confirm M.U.L.E. buying
// screen (WP-4A/4B) that walking into the corral door always opens.
//
// Selector contract: this spec depends on the ?seed= / ?speed= hooks in
// src/ui/main.tsx, the #new-game-button title control, the
// #land-grant-pass-button phase control, the town scene's #town-scene
// container (mounted at develop-turn start, WP-4B) and avatar
// g[data-actor="player-0"] with data-carrying (src/ui/scenes/town_scene.tsx),
// and the corral purchase panel itself (src/ui/solid/corral_purchase_panel.tsx):
// its [data-corral-panel]
// root with role="dialog"/aria-modal, a reactive
// data-corral-outcome="buyable|purchased|carrying|out_of_stock|insufficient_funds"
// attribute, the .corral-purchase-figures dl (price/stock/funds), the
// [data-corral-message] reason line, and its [data-corral-action="buy"|
// "leave"|"dismiss"] buttons. Player 0 is always the human and always picks
// first in round 1 (src/engine/land_grant.ts).
//
// Town interaction model (docs/HUMAN_GUIDANCE.md "Town interaction model:
// walk-in doors, attempt-then-confirm transactions"): walking through an open
// doorway is the complete entry action (no keypress), entering a shop opens
// its transaction panel with no side effects, and the state-changing dispatch
// fires only on an explicit confirm -- Enter, or a mouse click on the focused
// action. Arrow keys move focus between a panel's actions and the focused
// action is visibly highlighted (`button:focus-visible` per
// corral_purchase_panel.tsx's module doc comment).
//
// Reachable outcomes: this spec drives `buyable`, `purchased`, and `carrying`
// through real play (buy once, then walk back into the corral with a M.U.L.E.
// still in tow). `out_of_stock` (a 14-M.U.L.E. stock cap,
// src/engine/constants.ts MULE_STOCK_CAP) and `insufficient_funds` (a fixed
// $100 M.U.L.E. price against $1000 starting funds, src/engine/constants.ts
// MULE_BASE_PRICE/STARTING_MONEY) are NOT covered here: each buy only clears
// the carry slot by placing the M.U.L.E. on a distinct owned, empty plot, so
// exhausting the stock or the funds needs roughly 10-14 full
// buy-outfit-exit-place-return cycles across that many owned plots and several
// develop turns' tick budgets -- impractical to drive deterministically inside
// one browser test's time budget, and there is no test-only hook to seed the
// store or a player's money directly (see docs/PLAYWRIGHT_TEST_STYLE.md's
// "Behavior and visibility assertions" -- faking the engine state without such
// a hook is out of scope for this spec).

import { test, expect } from "@playwright/test";

/** Fixed seed with a plains town row; a modest speed for the walk-in loop. */
const GAME_QUERY = "?seed=33&speed=2";
/** Upper bound on land-grant pass clicks before we conclude something is stuck. */
const MAX_PASS_ITERATIONS = 50;
/** Town cell column (row center) for seed 33's 5x9 board. */
const TOWN_COL = 4;
/** Poll intervals (ms) for catching a transient panel attribute. */
const TIGHT_POLL = [20, 20, 20];
/**
 * Real-ms duration of one directional hold used to cross the corral door's
 * walk-in entry line (town_layout.ts's DOOR_ENTER_Y sits only ~8px north of
 * the street-row spawn line). At this spec's speed (WALKER_SPEED_PX_PER_SEC *
 * speed=2 = 160px/s) this hold covers roughly 32px: comfortably past the
 * crossing distance. Movement freezes the instant the panel opens
 * (town_scene.tsx's updateFrame early-returns while corralPanelOpen()), so
 * holding the key past that point has no further effect.
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
 * land grant, and wait until the human's develop turn is up. Every human
 * develop turn now starts IN TOWN at the corral (WP-4B), so this waits on the
 * town scene mounting -- there is no overworld avatar to wait on at turn
 * start, and no walk onto the town cell is needed (an extra walk here would
 * nudge the avatar off the exact corral-column alignment walkIntoCorral below
 * depends on). Returns the town avatar locator.
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
 * Walk the town avatar north through the corral doorway to fire the walk-in
 * interaction and open the corral purchase panel. The avatar spawns already
 * aligned to the corral's column (src/ui/scenes/zones.ts TOWN_SPAWN_CELL), so
 * this only needs the single north hold that crosses the entry line -- no
 * sideways alignment tap and no south return (movement is frozen the instant
 * the panel opens, and the following helpers drive the panel itself, not
 * further walking).
 */
async function walkIntoCorral(page) {
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(DOOR_HOLD_MS);
  await page.keyboard.up("ArrowUp");
  const panel = page.locator("[data-corral-panel]");
  await expect(panel).toBeVisible({ timeout: 10_000 });
  return panel;
}

/**
 * Parse a `$<amount>` or bare `<amount>` figure rendered inside one of the
 * corral panel's `.corral-purchase-figure` dd elements.
 */
function parseFigure(text) {
  return Number(text.replace("$", "").trim());
}

/** Read the corral panel's price, stock, and funds figures as numbers. */
async function readCorralFigures(panel) {
  const figures = panel.locator(".corral-purchase-figure dd");
  const [priceText, stockText, fundsText] = await Promise.all([
    figures.nth(0).textContent(),
    figures.nth(1).textContent(),
    figures.nth(2).textContent(),
  ]);
  return {
    price: parseFigure(priceText),
    stock: parseFigure(stockText),
    funds: parseFigure(fundsText),
  };
}

test("corral: walking in shows the buyable outcome, figures, and auto-focuses Buy", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto(`/${GAME_QUERY}`);
  await reachHumanDevelop(page, 2, TOWN_COL - 1);

  const panel = await walkIntoCorral(page);
  await expect(panel).toHaveAttribute("data-corral-outcome", "buyable");
  await expect(panel).toHaveAttribute("role", "dialog");
  await expect(panel).toHaveAttribute("aria-modal", "true");
  await expect(panel.locator("[data-corral-message]")).toHaveText("Buy a M.U.L.E.?");

  // The panel echoes the store's live price/stock and the human's own funds
  // (corral_purchase_panel.tsx reads these straight off the engine state, no
  // pricing math of its own): all three figures render as positive numbers
  // before any purchase.
  const before = await readCorralFigures(panel);
  expect(before.price).toBeGreaterThan(0);
  expect(before.stock).toBeGreaterThan(0);
  expect(before.funds).toBeGreaterThan(0);

  // Buy is pre-focused on open (docs/HUMAN_GUIDANCE.md "Town interaction
  // model": Enter confirms after entry), so Enter can confirm immediately
  // with no prior click.
  await expect(panel.locator('[data-corral-action="buy"]')).toBeFocused();
});

test("corral: a mouse click on Buy confirms the purchase and updates the figures", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto(`/${GAME_QUERY}`);
  const townAvatar = await reachHumanDevelop(page, 2, TOWN_COL - 1);

  const panel = await walkIntoCorral(page);
  const before = await readCorralFigures(panel);

  await panel.locator('[data-corral-action="buy"]').click();

  await expect(panel).toHaveAttribute("data-corral-outcome", "purchased");
  await expect(panel.locator("[data-corral-message]")).toHaveText(
    "Bought a M.U.L.E. -- outfit it at a counter.",
  );
  await expect(townAvatar).toHaveAttribute("data-carrying", "unoutfitted");

  const after = await readCorralFigures(panel);
  expect(after.stock).toBe(before.stock - 1);
  expect(after.funds).toBe(before.funds - before.price);

  // Continue (rendered under the same data-corral-action="leave" hook the
  // pre-confirm Leave button uses) dismisses back to the town scene.
  await panel.locator('[data-corral-action="leave"]').click();
  await expect(page.locator("[data-corral-panel]")).toHaveCount(0);
});

test("corral: an Enter keypress confirms the pre-focused Buy button", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`/${GAME_QUERY}`);
  const townAvatar = await reachHumanDevelop(page, 2, TOWN_COL - 1);

  const panel = await walkIntoCorral(page);
  // Re-assert (not just trust) that Buy carries focus right before the
  // keyboard confirm, so this test proves the Enter path independent of the
  // auto-focus test above.
  await expect(panel.locator('[data-corral-action="buy"]')).toBeFocused();

  await page.keyboard.press("Enter");

  await expect(panel).toHaveAttribute("data-corral-outcome", "purchased");
  await expect(townAvatar).toHaveAttribute("data-carrying", "unoutfitted");
});

test("corral: an arrow key moves focus to Leave before Enter, which declines the purchase", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto(`/${GAME_QUERY}`);
  const townAvatar = await reachHumanDevelop(page, 2, TOWN_COL - 1);

  const panel = await walkIntoCorral(page);
  const buyButton = panel.locator('[data-corral-action="buy"]');
  const leaveButton = panel.locator('[data-corral-action="leave"]');
  await expect(buyButton).toBeFocused();

  // Arrow-key roving focus (bindRovingFocus, src/ui/input.ts) moves from Buy
  // to Leave -- the visible focus-highlight target (button:focus-visible,
  // corral_purchase_panel.tsx's module doc comment) actually moved off Buy.
  await page.keyboard.press("ArrowDown");
  await expect(leaveButton).toBeFocused();
  await expect(buyButton).not.toBeFocused();

  // Enter now activates the focused Leave button, not Buy: the panel closes
  // with no purchase made (proving arrow-then-Enter targets the moved focus,
  // not a hardcoded default action).
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-corral-panel]")).toHaveCount(0);
  await expect(townAvatar).toHaveAttribute("data-carrying", "none");
});

test("corral: re-entering with a M.U.L.E. already in tow shows the carrying outcome", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto(`/${GAME_QUERY}`);
  const townAvatar = await reachHumanDevelop(page, 2, TOWN_COL - 1);

  // Buy once (mouse click, matching the other success-path test) and dismiss.
  const firstPanel = await walkIntoCorral(page);
  await firstPanel.locator('[data-corral-action="buy"]').click();
  await firstPanel.locator('[data-corral-action="leave"]').click();
  await expect(page.locator("[data-corral-panel]")).toHaveCount(0);
  await expect(townAvatar).toHaveAttribute("data-carrying", "unoutfitted");

  // Step south out of the corral's entry zone, then walk back north to
  // re-arm the walk-in trigger (detectWalkIn only re-fires after the avatar
  // leaves and re-enters the entry zone, town_scene.tsx's `enteredDoor`
  // latch) and open the panel again while still carrying the M.U.L.E.
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(DOOR_HOLD_MS);
  await page.keyboard.up("ArrowDown");

  const secondPanel = await walkIntoCorral(page);
  await expect(secondPanel).toHaveAttribute("data-corral-outcome", "carrying");
  await expect(secondPanel.locator("[data-corral-message]")).toHaveText(
    "You already have a M.U.L.E. in tow.",
  );
  // The carrying outcome offers only Dismiss -- no Buy button to retry.
  await expect(secondPanel.locator('[data-corral-action="buy"]')).toHaveCount(0);
  const dismissButton = secondPanel.locator('[data-corral-action="dismiss"]');
  await expect(dismissButton).toBeVisible();

  await dismissButton.click();
  await expect(page.locator("[data-corral-panel]")).toHaveCount(0);
});
