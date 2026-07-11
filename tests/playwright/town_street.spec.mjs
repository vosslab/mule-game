// Town street camera, chrome, and entry-state-machine browser specs.
//
// Selector contract: this spec depends on the ?seed= / ?speed= / ?mode= hooks
// in src/ui/main.tsx, the #new-game-button title control, the
// #land-grant-pass-button phase control, and the mode-composed camera scene:
//   - src/ui/scenes/town_scene.tsx: #town-scene root with data-town-mode and
//     the interaction-state machine's reactive data-town-state
//     ("street" | "door-opening" | "at-threshold" | "panel-open" | "leaving");
//     .town-world group with data-town-world-width and, written per frame by
//     writeTransforms, data-town-camera-offset; .town-avatar
//     (g[data-actor="player-0"]) with data-town-avatar-x/-y and
//     data-carrying; each facade's [data-facade] group and
//     .town-facade-label text; the .town-facade-band rect, whose height
//     attribute IS town_world.ts's streetTopY (the facade/street boundary),
//     read here rather than duplicating the constant; each door's
//     [data-door-for]/[data-door-state]; each endpoint's [data-exit]; the
//     corral's [data-corral-panel] (src/ui/solid/corral_purchase_panel.tsx,
//     the same contract corral_purchase.spec.mjs documents); the outfit
//     confirm panel's [data-outfit-panel]/[data-outfit-outcome] and its
//     [data-outfit-action="confirm"|"leave"|"dismiss"] buttons
//     (src/ui/solid/outfit_panel.tsx), which mining/energy/farm
//     walk-ins open in every mode; and the Land Office panel's
//     [data-land-panel]/[data-land-outcome="informational"] and its
//     [data-land-action="dismiss"] button (src/ui/solid/land_office_panel.tsx),
//     which composes and opens only in standard mode and up, and
//     dispatches nothing on entry or dismiss. The Assay Office panel
//     (src/ui/solid/assay_office_panel.tsx) also ships, but its facade
//     composes in no shipped engine mode (townCapabilitiesForMode's
//     assayVisible is false for beginner and standard alike), so this spec
//     asserts only its absence, never a walk-in.
//   - src/ui/solid/town_chrome.tsx: [data-town-chrome], [data-town-ticks-bar],
//     [data-town-ticks]; the nearest-storefront [data-town-nearest] stub is an
//     intentional placeholder this spec does not assert content on.
//   - src/ui/solid/hud.tsx: .hud-player[data-player] .hud-money, read here to
//     prove a walk-in dispatches no economic side effect until confirm.
//   - src/ui/scenes/town_world.ts: TOWN_REFERENCE_VIEWPORT_WIDTH, the
//     storefront catalog and per-mode composition table, and
//     townCapabilitiesForMode.
//   - src/ui/scenes/town_camera.ts: townCameraOffset's clamp to
//     [0, worldWidth - viewportWidth].
//   - src/ui/scenes/overworld_scene.tsx: .overworld-svg
//     g[data-actor="player-0"], asserted here only as proof an endpoint exit
//     actually returned control to the overworld.
//
// Town-first navigation: every human develop turn now starts
// IN TOWN at the corral (human_develop_layer.tsx), so reachHumanDevelop below
// waits on #town-scene rather than the overworld avatar, and no ArrowRight
// walk-onto-the-town-cell step is needed at all -- that old enterTown() step
// would otherwise nudge the avatar off its corral spawn alignment before any
// test runs, which corral_purchase.spec.mjs's single north-hold walk-in
// depends on staying exact.
//
// Fixed seed 33 has an all-plains town row (row 2) with the town cell at the
// row center (col 4), matching the sibling town specs' seed choice. Town
// street geometry itself (facade order, world width, spawn, camera clamp) is
// derived purely from town_world.ts's mode composition and is independent of
// the overworld seed; the claimed plot only needs to be a valid one so land
// grant can pass through to the develop turn.
//
// Contrast policy: docs/COLOR_CONTRAST_ACCESSIBILITY.md documents the WCAG
// relative-luminance and contrast-ratio formulas and this repo's house
// target (5.5:1, above WCAG AA's 4.5:1 floor). This spec applies that
// documented formula once per viewport and checks against the AA floor;
// the full house-target audit across every facade and interaction state is
// the automated visual-acceptance pass's job, not this spec's.

import { test, expect } from "@playwright/test";

/** Fixed seed with a plains town row; a modest speed for the camera walk. */
const GAME_QUERY = "?seed=33&speed=2";
/** Upper bound on land-grant pass clicks before we conclude something is stuck. */
const MAX_PASS_ITERATIONS = 50;
/** Town cell column (row center) for seed 33's 5x9 board. */
const TOWN_COL = 4;
/** town_world.ts:142 -- the fixed camera window width every composed street exceeds. */
const TOWN_REFERENCE_VIEWPORT_WIDTH = 576;
/** docs/COLOR_CONTRAST_ACCESSIBILITY.md's documented WCAG AA floor for normal text. */
const WCAG_AA_MIN_CONTRAST_RATIO = 4.5;
/**
 * Real-ms duration of one directional hold used to cross a door's walk-in
 * entry line (town_world.ts's DOOR_ENTRY_BAND_PX sits only a few px north of
 * the street-lane spawn line). Matches corral_purchase.spec.mjs's
 * DOOR_HOLD_MS at this spec's ?speed=2.
 */
const DOOR_HOLD_MS = 200;
/**
 * Real-ms duration held against a street x offset that clears every door's
 * notch (the negative-regression hold that guards against walking through a
 * closed facade), long enough to prove the avatar's y stays put rather than
 * merely sampling it once.
 */
const HOLD_NEGATIVE_MS = 400;
/** How often the hold-Up negative samples the avatar's y during HOLD_NEGATIVE_MS. */
const NEGATIVE_SAMPLE_MS = 60;

/**
 * Poll `readValue` every 20ms until it satisfies `predicate`, or throw after
 * `timeoutMs`. A manual tight loop rather than `expect.poll`'s default
 * growing backoff (100/250/500/1000ms...): the land-grant sweep cursor
 * (scene_manager.ts's LAND_GRANT_SWEEP_TICK_MS=300ms, halved to ~150ms by
 * this spec's ?speed=2) and the town camera offset (written every animation
 * frame) both change faster than that backoff schedule samples, so a poll
 * that only checks a handful of times near the start and then waits out a
 * multi-second gap can miss every matching window and time out reporting a
 * stale value.
 */
async function pollUntil(page, readValue, predicate, { timeoutMs, message }) {
  const deadline = Date.now() + timeoutMs;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await readValue();
    if (predicate(lastValue)) {
      return lastValue;
    }
    await page.waitForTimeout(20);
  }
  throw new Error(`${message} (last observed value: ${JSON.stringify(lastValue)})`);
}

/**
 * Click the land-grant Pass button until it disappears (AI turns finish and
 * the develop phase takes over), or throw if it never does.
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
  const targetKey = `${targetRow},${targetCol}`;
  await pollUntil(
    page,
    async () => {
      const row = await cursoredPlot.getAttribute("data-row");
      const col = await cursoredPlot.getAttribute("data-col");
      return `${row},${col}`;
    },
    (key) => key === targetKey,
    { timeoutMs: 20_000, message: `sweep cursor never reached (${targetRow}, ${targetCol})` },
  );
  await page.keyboard.press("Enter");
}

/**
 * Start a game, claim the plot at (claimRow, claimCol), pass the rest of the
 * land grant, and wait until the human's develop turn is up. Every human
 * develop turn now starts IN TOWN at the corral, so this waits on the
 * town scene mounting -- there is no overworld avatar to wait on at turn
 * start, and no walk onto the town cell is needed.
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
}

/** Read a numeric data-* attribute off the composed street's world group. */
async function readTownWorldAttr(page, attrName) {
  const raw = await page.locator(".town-world").getAttribute(attrName);
  return Number(raw);
}

/** The composed street's total world width (town_world.ts's TownStreet.worldWidth). */
async function readWorldWidth(page) {
  return readTownWorldAttr(page, "data-town-world-width");
}

/** The camera offset town_scene.tsx's writeTransforms writes every frame. */
async function readCameraOffset(page) {
  return readTownWorldAttr(page, "data-town-camera-offset");
}

/** The rendered [data-facade] ids, in DOM order (the composed NES street order). */
async function readFacadeIds(page) {
  return page
    .locator("[data-facade]")
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-facade")));
}

/**
 * World y where the solid facade band ends and the street lane begins
 * (town_world.ts's streetTopY/facadeBottomY), read straight off the rendered
 * .town-facade-band rect's height rather than duplicating the constant.
 */
async function readStreetTopY(page) {
  const height = await page.locator(".town-facade-band").getAttribute("height");
  return Number(height);
}

/** A composed facade's world-space rect (x, width), read off its rendered <rect>. */
async function readFacadeRect(page, facadeId) {
  const rectLocator = page.locator(`[data-facade="${facadeId}"] .town-facade-rect`);
  const [x, width] = await Promise.all([
    rectLocator.getAttribute("x"),
    rectLocator.getAttribute("width"),
  ]);
  return { x: Number(x), width: Number(width) };
}

/** The town avatar's live world position, from the attributes writeTransforms writes. */
async function readAvatarPos(page) {
  const avatar = page.locator("#town-scene [data-actor='player-0']");
  const [x, y] = await Promise.all([
    avatar.getAttribute("data-town-avatar-x"),
    avatar.getAttribute("data-town-avatar-y"),
  ]);
  return { x: Number(x), y: Number(y) };
}

/**
 * Walk the town avatar along the street lane toward targetX via bounded taps
 * in whichever direction currently closes the gap, so a slow attribute read
 * only delays noticing arrival and can never carry the avatar past the target
 * (mirrors pub_gamble.spec.mjs's walkToDoor tap pattern). Each tap's hold
 * shrinks in proportion to the remaining distance (clamped to
 * [MIN_TAP_MS, MAX_TAP_MS]) so a fast walker converges on the narrow target
 * window instead of overshooting past it every tap and oscillating forever.
 * Pure horizontal taps never cross a door's threshold notch (that needs an Up
 * hold), so this cannot accidentally trigger a walk-in while it repositions
 * the avatar.
 */
async function walkAvatarToX(page, targetX, { maxTaps = 120 } = {}) {
  const MIN_TAP_MS = 15;
  const MAX_TAP_MS = 90;
  // The smallest reliable tap (MIN_TAP_MS) still covers roughly 10-12 world
  // px at this spec's walk speed, so the arrival tolerance must clear that
  // per-tap step or the loop bounces either side of targetX forever without
  // ever landing inside a narrower window.
  // Mirrors TOWN_DOOR_ALIGN_TOLERANCE_PX (tests/e2e/walkthrough_helpers.mjs),
  // the source of truth; this spec runs built HTML over HTTP and cannot
  // import that module, so update both together.
  const ARRIVAL_TOLERANCE_PX = 8;
  for (let tap = 0; tap < maxTaps; tap++) {
    const { x } = await readAvatarPos(page);
    const remaining = targetX - x;
    if (Math.abs(remaining) < ARRIVAL_TOLERANCE_PX) {
      return;
    }
    const direction = remaining > 0 ? "ArrowRight" : "ArrowLeft";
    const tapMs = Math.min(MAX_TAP_MS, Math.max(MIN_TAP_MS, Math.abs(remaining) / 6));
    await page.keyboard.down(direction);
    await page.waitForTimeout(tapMs);
    await page.keyboard.up(direction);
  }
  throw new Error(`avatar never reached x~=${targetX} after ${maxTaps} taps`);
}

/**
 * Hold ArrowUp for holdMs, sampling the avatar's world y periodically and
 * asserting it never rises north of streetTopY (i.e., never slips behind a
 * facade) -- the negative regression against walking through a closed
 * facade, exercised here at the browser level rather than only against the
 * pure town_world.ts geometry.
 */
async function holdUpAssertStreetSide(page, streetTopY, holdMs) {
  await page.keyboard.down("ArrowUp");
  const samples = Math.max(1, Math.floor(holdMs / NEGATIVE_SAMPLE_MS));
  for (let i = 0; i < samples; i++) {
    await page.waitForTimeout(NEGATIVE_SAMPLE_MS);
    const { y } = await readAvatarPos(page);
    expect(y).toBeGreaterThanOrEqual(streetTopY);
  }
  await page.keyboard.up("ArrowUp");
}

/** Read the human's (player 0) current money from the HUD (src/ui/solid/hud.tsx). */
async function readHumanMoney(page) {
  const text = await page.locator('.hud-player[data-player="0"] .hud-money').textContent();
  return Number(text.replace("$", "").trim());
}

/** Read the town avatar's current data-carrying value (src/ui/scenes/town_scene.tsx). */
async function readCarrying(page) {
  return page.locator("#town-scene [data-actor='player-0']").getAttribute("data-carrying");
}

/**
 * Read a facade's live ambient `$` price (town_scene.tsx's FacadeAmbientContent),
 * the same transaction-state figure the facade, panel, and walker all
 * read from one truth (town_world.ts's selector list).
 */
async function readAmbientPrice(page, facadeId) {
  const text = await page.locator(`[data-facade="${facadeId}"] [data-ambient-price]`).textContent();
  const match = text.match(/\$(\d+)/);
  if (match === null) {
    throw new Error(`ambient price text did not contain "$N": ${text}`);
  }
  return Number(match[1]);
}

/**
 * Walk the avatar to `facadeId`'s door center and hold Up long enough to cross
 * its walk-in entry line, opening whatever panel that door's walk-in fires.
 * Pure horizontal taps (walkAvatarToX) never cross a threshold notch, so this
 * cannot accidentally fire the walk-in before the deliberate north hold below.
 */
async function enterFacadeDoor(page, facadeId) {
  const rect = await readFacadeRect(page, facadeId);
  await walkAvatarToX(page, rect.x + rect.width / 2);
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(DOOR_HOLD_MS);
  await page.keyboard.up("ArrowUp");
}

/**
 * Buy a M.U.L.E. at the corral (the turn's spawn door) and leave the panel, so
 * a following case can outfit it at an outfitter. The avatar spawns already
 * aligned to the corral door, so this is the same walk-in-then-confirm shape
 * as the dedicated corral tests above, just packaged for reuse.
 */
async function buyMuleAtCorral(page) {
  await enterFacadeDoor(page, "corral");
  const panel = page.locator("[data-corral-panel]");
  await expect(panel).toHaveAttribute("data-corral-outcome", "buyable");
  await panel.locator('[data-corral-action="buy"]').click();
  await expect(panel).toHaveAttribute("data-corral-outcome", "purchased");
  await panel.locator('[data-corral-action="leave"]').click();
  await expect(panel).toHaveCount(0);
}

/** Gamma-correct one 8-bit sRGB channel to linear light (COLOR_CONTRAST_ACCESSIBILITY.md). */
function linearizeChannel(channelValue) {
  const fraction = channelValue / 255;
  return fraction <= 0.04045 ? fraction / 12.92 : Math.pow((fraction + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance of an [r, g, b] color (COLOR_CONTRAST_ACCESSIBILITY.md). */
function relativeLuminance([red, green, blue]) {
  return (
    0.2126 * linearizeChannel(red) +
    0.7152 * linearizeChannel(green) +
    0.0722 * linearizeChannel(blue)
  );
}

/** WCAG contrast ratio between two [r, g, b] colors (COLOR_CONTRAST_ACCESSIBILITY.md). */
function contrastRatio(colorA, colorB) {
  const luminanceA = relativeLuminance(colorA);
  const luminanceB = relativeLuminance(colorB);
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Parse a computed "rgb(r, g, b)" / "rgba(r, g, b, a)" CSS color string into [r, g, b]. */
function parseRgbChannels(cssColor) {
  const match = cssColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
  if (match === null) {
    throw new Error(`could not parse CSS color as rgb()/rgba(): ${cssColor}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

test("town street: camera offset changes while walking and clamps at both world ends", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto(`/${GAME_QUERY}`);
  await reachHumanDevelop(page, 2, TOWN_COL - 1);

  const worldWidth = await readWorldWidth(page);
  const maxOffset = worldWidth - TOWN_REFERENCE_VIEWPORT_WIDTH;

  // Walk toward the street's left end until the camera offset settles at its
  // left clamp of 0 (town_camera.ts:69's Math.max(0, ...) floor).
  await page.keyboard.down("ArrowLeft");
  await pollUntil(
    page,
    () => readCameraOffset(page),
    (offset) => offset === 0,
    {
      timeoutMs: 20_000,
      message: "camera offset never reached its left clamp of 0",
    },
  );
  await page.keyboard.up("ArrowLeft");
  expect(await readCameraOffset(page)).toBe(0);

  // Walk back toward the right: the offset must rise off its left clamp
  // while mid-street (proving it tracks the avatar, not a fixed value)...
  await page.keyboard.down("ArrowRight");
  await pollUntil(
    page,
    () => readCameraOffset(page),
    (offset) => offset > 0,
    {
      timeoutMs: 20_000,
      message: "camera offset never rose off its left clamp while walking right",
    },
  );
  // ...then clamp at the right end (town_camera.ts:68's maxOffset ceiling).
  await pollUntil(
    page,
    () => readCameraOffset(page),
    (offset) => offset === maxOffset,
    {
      timeoutMs: 20_000,
      message: `camera offset never clamped at maxOffset (${maxOffset})`,
    },
  );
  // Keep walking briefly past the clamp point: the offset must hold at
  // maxOffset rather than exceeding the composed world's bounds.
  await page.waitForTimeout(200);
  const offsetPastClamp = await readCameraOffset(page);
  await page.keyboard.up("ArrowRight");
  expect(offsetPastClamp).toBe(maxOffset);
});

test("town street: beginner mode composes mining, energy, farm, corral, pub with no land or assay office", async ({
  page,
}) => {
  test.setTimeout(60_000);
  // Beginner is the title-screen default (species_mode_select.spec.mjs); no
  // ?mode= needed.
  await page.goto(`/${GAME_QUERY}`);
  await reachHumanDevelop(page, 2, TOWN_COL - 1);

  // NES order among the included facades (town_world.ts:59), filtered by
  // beginner's capability flags (town_world.ts:410-411: no Land Office, no
  // Assay Office).
  const facadeIds = await readFacadeIds(page);
  expect(facadeIds).toEqual(["mining", "energy", "farm", "corral", "pub"]);
  await expect(page.locator('[data-facade="land"]')).toHaveCount(0);
  await expect(page.locator('[data-facade="assay"]')).toHaveCount(0);
  // Office absence: a facade absent from the composition renders no
  // door at all, so no beginner walk-in can ever reach a Land or Assay panel.
  await expect(page.locator('[data-door-for="land"]')).toHaveCount(0);
  await expect(page.locator('[data-door-for="assay"]')).toHaveCount(0);
});

test("town street: standard mode adds the Land Office but still composes no Assay Office", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto(`/${GAME_QUERY}&mode=standard`);
  await reachHumanDevelop(page, 2, TOWN_COL - 1);

  // Standard adds Land Office (town_world.ts:407: landOfficeVisible: true)
  // but still composes no Assay Office (assayVisible stays false for every
  // shipped mode; tournament, the only mode that turns it on, has no engine
  // entry point today).
  const facadeIds = await readFacadeIds(page);
  expect(facadeIds).toEqual(["mining", "energy", "farm", "corral", "pub", "land"]);
  await expect(page.locator('[data-facade="land"]')).toHaveCount(1);
  await expect(page.locator('[data-facade="assay"]')).toHaveCount(0);
  // Office absence: standard renders the Land Office's own door but
  // still no Assay Office door (no shipped mode turns assayVisible on).
  await expect(page.locator('[data-door-for="land"]')).toHaveCount(1);
  await expect(page.locator('[data-door-for="assay"]')).toHaveCount(0);
});

test("town street: exactly two exit markers render, one left and one right, no north or south", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto(`/${GAME_QUERY}`);
  await reachHumanDevelop(page, 2, TOWN_COL - 1);

  await expect(page.locator("[data-exit]")).toHaveCount(2);
  await expect(page.locator('[data-exit="left"]')).toHaveCount(1);
  await expect(page.locator('[data-exit="right"]')).toHaveCount(1);
  await expect(page.locator('[data-exit="north"]')).toHaveCount(0);
  await expect(page.locator('[data-exit="south"]')).toHaveCount(0);
});

test("town street: the chrome timer stays visible and its ticks count decreases", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto(`/${GAME_QUERY}`);
  await reachHumanDevelop(page, 2, TOWN_COL - 1);

  const chrome = page.locator("[data-town-chrome]");
  const ticksLabel = page.locator("[data-town-ticks]");
  await expect(chrome).toBeVisible();
  await expect(ticksLabel).toBeVisible();
  await expect(ticksLabel).toHaveText(/^Ticks left: \d+$/);

  const readTicksRemaining = async () => {
    const text = await ticksLabel.textContent();
    const match = text.match(/^Ticks left: (\d+)$/);
    if (match === null) {
      throw new Error(`ticks label did not match "Ticks left: N": ${text}`);
    }
    return Number(match[1]);
  };

  const initialTicks = await readTicksRemaining();
  // The develop turn's tick budget drains on a real-time clock the whole
  // time the human is in town (town_scene.tsx's module doc comment), so
  // ticks fall with no further input required.
  await expect.poll(readTicksRemaining, { timeout: 20_000 }).toBeLessThan(initialTicks);
  await expect(chrome).toBeVisible();
});

// Legibility validated at the supported viewport widths (1200x750 minimum
// and up).
const LEGIBILITY_VIEWPORTS = [
  { label: "1200x750", width: 1200, height: 750 },
  { label: "desktop", width: 1280, height: 800 },
];

for (const viewport of LEGIBILITY_VIEWPORTS) {
  test.describe(`town street: facade label legibility at ${viewport.label}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test(`the corral facade label renders with positive, in-viewport, contrast-checked size at ${viewport.label}px`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await page.goto(`/${GAME_QUERY}`);
      await reachHumanDevelop(page, 2, TOWN_COL - 1);

      // The corral is the town's spawn anchor (town_world.ts's corralSpawn),
      // and the camera window is a fixed 576 world px regardless of the
      // browser's actual pixel viewport (TOWN_REFERENCE_VIEWPORT_WIDTH is a
      // constant, not derived from page.viewportSize()), so the corral
      // facade's label sits inside the camera window at mount for every
      // viewport width tested here -- a stable, deterministic legibility
      // target rather than a viewport-dependent one.
      const label = page.locator('[data-facade="corral"] .town-facade-label');
      await expect(label).toBeVisible();
      const box = await label.boundingBox();
      expect(box).not.toBeNull();
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);

      // Contrast-checked values: the label's fill against its facade rect's
      // fill, via the documented WCAG formula (COLOR_CONTRAST_ACCESSIBILITY.md).
      const rect = page.locator('[data-facade="corral"] .town-facade-rect');
      const [labelColor, rectColor] = await Promise.all([
        label.evaluate((el) => getComputedStyle(el).fill),
        rect.evaluate((el) => getComputedStyle(el).fill),
      ]);
      const ratio = contrastRatio(parseRgbChannels(labelColor), parseRgbChannels(rectColor));
      expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_MIN_CONTRAST_RATIO);
    });
  });
}

// ============================================================================
// Entry state machine specs: pin the fixed walk-in / attempt-then-
// confirm contract in docs/HUMAN_GUIDANCE.md "Town interaction model" against
// the shipped state machine (town_scene.tsx's TownInteractionState).
// ============================================================================

test("town street: the human develop turn starts at the corral", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`/${GAME_QUERY}`);
  await reachHumanDevelop(page, 2, TOWN_COL - 1);

  // The corral is the composed street's spawn anchor (town_world.ts's
  // corralSpawn): the avatar's world x lands exactly on the corral door's
  // center before any key is pressed.
  const corralRect = await readFacadeRect(page, "corral");
  const corralDoorCenterX = corralRect.x + corralRect.width / 2;
  const { x } = await readAvatarPos(page);
  expect(Math.abs(x - corralDoorCenterX)).toBeLessThanOrEqual(1);
});

test("town street: walk-in fires exactly once per approach and does not re-fire while held", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto(`/${GAME_QUERY}`);
  await reachHumanDevelop(page, 2, TOWN_COL - 1);

  // The avatar spawns aligned to the corral door, so a single north hold
  // crosses the walk-in entry line (matches corral_purchase.spec.mjs's
  // walkIntoCorral). Hold well past that crossing distance: a fresh re-fire
  // while the avatar still occupies the threshold would show as a second,
  // duplicate panel.
  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(DOOR_HOLD_MS);
  const panel = page.locator("[data-corral-panel]");
  await expect(panel).toHaveCount(1);
  await expect(page.locator("#town-scene")).toHaveAttribute("data-town-state", "panel-open");

  // Movement is frozen once a panel is open (docs/HUMAN_GUIDANCE.md), so
  // continuing to hold Up cannot move the avatar deeper or open a second panel.
  await page.waitForTimeout(DOOR_HOLD_MS * 2);
  await expect(panel).toHaveCount(1);
  await page.keyboard.up("ArrowUp");

  await panel.locator('[data-corral-action="leave"]').click();
  await expect(panel).toHaveCount(0);
});

// ============================================================================
// Transaction-panel interaction specs: every rendered transaction door
// is proven side-effect free until an explicit confirm, in every mode that
// composes it (docs/HUMAN_GUIDANCE.md "Town interaction model"). Run across
// both current modes since mining/energy/farm/corral compose in both and the
// Land Office only composes in standard and up.
// ============================================================================

/** Both current modes' query suffixes, shared by every mode-parameterized case below. */
const TRANSACTION_MODES = [
  { label: "beginner", modeQuery: "" },
  { label: "standard", modeQuery: "&mode=standard" },
];

for (const modeCase of TRANSACTION_MODES) {
  test(`town street: entering the corral opens its panel with no dispatch; confirm buys (${modeCase.label})`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(`/${GAME_QUERY}${modeCase.modeQuery}`);
    await reachHumanDevelop(page, 2, TOWN_COL - 1);

    const moneyBeforeEntry = await readHumanMoney(page);

    await enterFacadeDoor(page, "corral");

    const panel = page.locator("[data-corral-panel]");
    await expect(panel).toHaveAttribute("data-corral-outcome", "buyable");
    // Entry alone dispatched nothing (docs/HUMAN_GUIDANCE.md "Town interaction
    // model": attempt-then-confirm): money is exactly what it was before the
    // walk-in.
    expect(await readHumanMoney(page)).toBe(moneyBeforeEntry);
    const stockAtEntry = Number(
      (await panel.locator(".corral-purchase-figure dd").nth(1).textContent())
        .replace("$", "")
        .trim(),
    );

    await panel.locator('[data-corral-action="buy"]').click();
    await expect(panel).toHaveAttribute("data-corral-outcome", "purchased");

    // The dispatch only fires on the explicit confirm: money dropped and stock
    // fell by exactly one M.U.L.E.
    expect(await readHumanMoney(page)).toBeLessThan(moneyBeforeEntry);
    const stockAfterConfirm = Number(
      (await panel.locator(".corral-purchase-figure dd").nth(1).textContent())
        .replace("$", "")
        .trim(),
    );
    expect(stockAfterConfirm).toBe(stockAtEntry - 1);

    await panel.locator('[data-corral-action="leave"]').click();
    await expect(panel).toHaveCount(0);
  });
}

/** Each outfitter facade and the resource its confirm button should carry away. */
const OUTFIT_FACADES = [
  { id: "mining", resource: "smithore" },
  { id: "energy", resource: "energy" },
  { id: "farm", resource: "food" },
];

for (const modeCase of TRANSACTION_MODES) {
  for (const facade of OUTFIT_FACADES) {
    test(`town street: entering ${facade.id} opens its panel with no dispatch; confirm outfits (${modeCase.label})`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await page.goto(`/${GAME_QUERY}${modeCase.modeQuery}`);
      await reachHumanDevelop(page, 2, TOWN_COL - 1);

      // A M.U.L.E. must be in tow before an outfitter has anything to confirm
      // (with none carried, the panel's "no_mule" outcome offers only Dismiss).
      await buyMuleAtCorral(page);

      const priceAtEntry = await readAmbientPrice(page, facade.id);
      const moneyBeforeEntry = await readHumanMoney(page);

      await enterFacadeDoor(page, facade.id);

      const panel = page.locator("[data-outfit-panel]");
      await expect(panel).toHaveAttribute("data-outfit-outcome", "buyable");
      // Entry alone dispatched nothing: no outfit_mule fired just by walking in.
      expect(await readHumanMoney(page)).toBe(moneyBeforeEntry);
      expect(await readCarrying(page)).toBe("unoutfitted");

      // Escape backs out with no dispatch and returns control street-side, the
      // other half of the fixed walk-in / attempt-then-confirm contract.
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      expect(await readHumanMoney(page)).toBe(moneyBeforeEntry);
      expect(await readCarrying(page)).toBe("unoutfitted");

      // Step south clear of the entry zone before walking back north (mirrors
      // corral_purchase.spec.mjs's re-entry pattern) so the single-fire walk-in
      // latch re-arms cleanly for this second entry.
      await page.keyboard.down("ArrowDown");
      await page.waitForTimeout(DOOR_HOLD_MS);
      await page.keyboard.up("ArrowDown");

      await enterFacadeDoor(page, facade.id);
      await expect(panel).toHaveAttribute("data-outfit-outcome", "buyable");
      await panel.locator('[data-outfit-action="confirm"]').first().click();
      await expect(panel).toHaveAttribute("data-outfit-outcome", "outfitted");

      // The dispatch only fires on the explicit confirm: money and carrying
      // both reflect the SAME price the facade's ambient slot advertised
      // before entry (town_world.ts's transaction-state selector list).
      expect(await readHumanMoney(page)).toBe(moneyBeforeEntry - priceAtEntry);
      expect(await readCarrying(page)).toBe(facade.resource);

      await panel.locator('[data-outfit-action="leave"]').click();
      await expect(panel).toHaveCount(0);
    });
  }
}

test("town street: entering the Land Office opens its informational panel with no dispatch on entry or dismiss (standard)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto(`/${GAME_QUERY}&mode=standard`);
  await reachHumanDevelop(page, 2, TOWN_COL - 1);

  const moneyBeforeEntry = await readHumanMoney(page);

  await enterFacadeDoor(page, "land");

  const panel = page.locator("[data-land-panel]");
  await expect(panel).toHaveAttribute("data-land-outcome", "informational");
  await expect(panel).toHaveAttribute("role", "dialog");
  // The Land Office never dispatches on entry -- purely informational.
  expect(await readHumanMoney(page)).toBe(moneyBeforeEntry);

  await panel.locator('[data-land-action="dismiss"]').click();
  await expect(panel).toHaveCount(0);
  // ...nor on dismiss: both halves of a walk-in through this office are inert.
  expect(await readHumanMoney(page)).toBe(moneyBeforeEntry);
  const streetTopY = await readStreetTopY(page);
  const { y } = await readAvatarPos(page);
  expect(y).toBeGreaterThan(streetTopY);
});

test("town street: the live hint describes walk-in-then-confirm, not auto-buy", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto(`/${GAME_QUERY}`);
  await reachHumanDevelop(page, 2, TOWN_COL - 1);

  const hint = page.locator('[data-tutorial-hint="town"]');
  await expect(hint).toBeVisible();
  // Distinguishing phrases, not the full pinned sentence (per PYTEST_STYLE.md's
  // brittle-assertion rules): the hint states that walking through alone is a
  // no-op and that confirming happens inside the panel -- the two halves of
  // the walk-in / attempt-then-confirm contract the retired "walking through
  // buys and outfits" / "is enough to shop" copy contradicted.
  await expect(hint).toContainText("changes nothing");
  await expect(hint).toContainText(/confirm/i);
});

test("town street: buy at the corral, outfit at the farm counter, exit, and place on an owned plot", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto(`/${GAME_QUERY}`);
  // Claim the town's west neighbor: the human spawns there and returns there
  // after the left exit, so placement needs no extra walking.
  await reachHumanDevelop(page, 2, TOWN_COL - 1);

  await buyMuleAtCorral(page);
  expect(await readCarrying(page)).toBe("unoutfitted");

  // Farm sits immediately left of the corral spawn (NES order: mining,
  // energy, farm, corral, pub); walking there is a pure horizontal move,
  // which never crosses a threshold notch (that needs an Up hold).
  await enterFacadeDoor(page, "farm");
  const outfitPanel = page.locator("[data-outfit-panel]");
  await expect(outfitPanel).toHaveAttribute("data-outfit-outcome", "buyable");
  await outfitPanel.locator('[data-outfit-action="confirm"]').first().click();
  await expect(outfitPanel).toHaveAttribute("data-outfit-outcome", "outfitted");
  expect(await readCarrying(page)).toBe("food");
  await outfitPanel.locator('[data-outfit-action="leave"]').click();
  await expect(outfitPanel).toHaveCount(0);

  // Leave through the left exit; the avatar returns to its owned plot.
  await page.keyboard.down("ArrowLeft");
  const returnedAvatar = page.locator(".overworld-svg [data-actor='player-0']");
  await expect(returnedAvatar).toHaveCount(1, { timeout: 20_000 });
  await page.keyboard.up("ArrowLeft");
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

test("town street: Escape from a panel returns control street-side", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`/${GAME_QUERY}`);
  await reachHumanDevelop(page, 2, TOWN_COL - 1);
  const streetTopY = await readStreetTopY(page);

  await page.keyboard.down("ArrowUp");
  await page.waitForTimeout(DOOR_HOLD_MS);
  await page.keyboard.up("ArrowUp");
  await expect(page.locator("[data-corral-panel]")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.locator("[data-corral-panel]")).toHaveCount(0);
  await expect(page.locator("#town-scene")).not.toHaveAttribute("data-town-state", "panel-open");

  // Dismissing places the avatar on the street side of the door
  // (town_scene.tsx's streetSideOfDoor): south of the facade band, clear of
  // the threshold notch it just occupied.
  const { y } = await readAvatarPos(page);
  expect(y).toBeGreaterThan(streetTopY);
});

test("town street: Enter and Space are inert on the street (no panel to confirm)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.goto(`/${GAME_QUERY}`);
  await reachHumanDevelop(page, 2, TOWN_COL - 1);

  // Walk to the gap between the corral and pub facades: clear of every door's
  // open radius, so the avatar sits squarely in the "street" movement phase.
  const corralRect = await readFacadeRect(page, "corral");
  const pubRect = await readFacadeRect(page, "pub");
  const betweenX = (corralRect.x + corralRect.width + pubRect.x) / 2;
  await walkAvatarToX(page, betweenX);
  await expect(page.locator("#town-scene")).toHaveAttribute("data-town-state", "street");

  // Doors are entered by walking through them, never by a keypress
  // (docs/HUMAN_GUIDANCE.md "Town interaction model"): Enter/Space on the
  // street open nothing.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Space");
  await expect(page.locator("#town-scene")).toHaveAttribute("data-town-state", "street");
  await expect(page.locator("[data-corral-panel]")).toHaveCount(0);
  await expect(page.locator("[data-outfit-panel]")).toHaveCount(0);
  await expect(page.locator("[data-land-panel]")).toHaveCount(0);
});

test("town street: the left exit returns the avatar to the overworld", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`/${GAME_QUERY}`);
  await reachHumanDevelop(page, 2, TOWN_COL - 1);

  await page.keyboard.down("ArrowLeft");
  await expect(page.locator(".overworld-svg [data-actor='player-0']")).toHaveCount(1, {
    timeout: 20_000,
  });
  await page.keyboard.up("ArrowLeft");
  await expect(page.locator("#town-scene")).toHaveCount(0);
});

test("town street: the right exit returns the avatar to the overworld", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(`/${GAME_QUERY}`);
  await reachHumanDevelop(page, 2, TOWN_COL - 1);

  await page.keyboard.down("ArrowRight");
  await expect(page.locator(".overworld-svg [data-actor='player-0']")).toHaveCount(1, {
    timeout: 20_000,
  });
  await page.keyboard.up("ArrowRight");
  await expect(page.locator("#town-scene")).toHaveCount(0);
});

// hold-Up behind-facade negatives run in both current modes: the composed
// street differs (standard adds the Land Office) but corral and pub sit at
// the same NES-order positions in both, so the same three checkpoints apply.
const HOLD_NEGATIVE_MODES = [
  { label: "beginner", modeQuery: "" },
  { label: "standard", modeQuery: "&mode=standard" },
];

for (const modeCase of HOLD_NEGATIVE_MODES) {
  test(`town street: holding Up off a door's notch keeps the avatar street-side, at corral/pub/gap (${modeCase.label})`, async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.goto(`/${GAME_QUERY}${modeCase.modeQuery}`);
    await reachHumanDevelop(page, 2, TOWN_COL - 1);

    const streetTopY = await readStreetTopY(page);
    const corralRect = await readFacadeRect(page, "corral");
    const pubRect = await readFacadeRect(page, "pub");
    const corralDoorCenterX = corralRect.x + corralRect.width / 2;
    const pubDoorCenterX = pubRect.x + pubRect.width / 2;

    // Three checkpoints, walked left to right: off the corral door's notch
    // (still under its facade), the gap between corral and pub (nowhere near
    // either door), and off the pub door's notch. Each offset clears the
    // door notch (half TOWN_DOOR_WIDTH plus the avatar radius) even if that
    // door happens to be open, so only the always-solid facade/gap wall can
    // be hit here -- the pass-through-storefront negative regression, at the
    // browser level.
    const checkpoints = [
      { label: "corral", x: corralDoorCenterX + 60 },
      { label: "gap between corral and pub", x: (corralRect.x + corralRect.width + pubRect.x) / 2 },
      { label: "pub", x: pubDoorCenterX - 60 },
    ];

    for (const checkpoint of checkpoints) {
      await walkAvatarToX(page, checkpoint.x);
      await holdUpAssertStreetSide(page, streetTopY, HOLD_NEGATIVE_MS);
    }
  });
}
