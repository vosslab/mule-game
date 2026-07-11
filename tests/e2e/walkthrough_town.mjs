// Town commerce drivers for the browser walkthrough harness (mode-composed
// street model).
//
// The human's develop turn plays out inside the walkable town interior
// (src/ui/scenes/town_scene.tsx), which renders the MODE-COMPOSED horizontally
// scrolling street produced by src/ui/scenes/town_world.ts. There is no fixed
// building list any more: beginner composes a smaller street than standard, and
// a future tournament mode a larger one. So these executors DISCOVER the active
// street by composing it from the live game mode (composeTownStreetForMode),
// then drive the shipped town DOM against whatever facades that mode placed --
// never a hardcoded building list, door-order constant, or grid geometry.
//
// Discovery + geometry, all from the composed street:
//   - the target door's WORLD center x is the composed facade's doorCenterX; the
//     x-seek aligns the avatar's camera-independent data-town-avatar-x to it
//     (walkTownAvatarToDoorX, walkthrough_helpers.mjs), so the camera offset
//     never enters the math;
//   - the street lane the walk-back returns to is the composed street's
//     streetLaneY;
//   - a facade absent from the composition (e.g. the assay office in every
//     current mode, the land office in beginner) is SKIPPED, not walked toward,
//     because resolving it against the composed street returns null.
//
// Each door executor follows the same walk-in-then-confirm shape, matching the
// shipped attempt-then-confirm town interaction model
// (docs/HUMAN_GUIDANCE.md "Town interaction model") and the proven browser specs
// (tests/playwright/town_street.spec.mjs, pub_gamble.spec.mjs):
//   1. ensure the town scene is mounted (every human develop turn now SPAWNS in
//      town at the corral, so this is normally already true and no
//      overworld avatar is waited on);
//   2. x-seek the avatar to the door center (bounded, gap-proportional taps that
//      converge on the door's narrow entry window);
//   3. wait for data-door-state="open" (proximity-driven; a cheap defensive
//      poll);
//   4. push north (ArrowUp) into the open threshold -- walking through IS the
//      entry action, no keypress -- which opens the door's transaction panel
//      with NO economic side effect and freezes movement;
//   5. confirm inside the panel via its roving-focus keyboard affordance (Enter
//      activates the auto-focused confirm), verify the move through the live
//      observable (avatar data-carrying for a corral buy, the develop payload's
//      carriedMule for an outfit, the panel's own outcome attribute for an assay
//      arm, the pub payout banner + money delta for a gamble), then dismiss with
//      Escape;
//   6. walk back south to the composed street lane (walkBackToStreet) so the
//      next door's x-seek starts from clear street space.
// The pub is the exception: gambling always ends the turn, so its walk-in opens
// a notice-driven confirm (#town-scene[data-gamble-confirming]) that a second
// Space press confirms, and it never walks back (the turn-ending dispatch tears
// the whole scene down). A completed gamble increments report.counters.gambles.

import {
  TOWN_AVATAR,
  walkTownAvatarToDoorX,
  walkTownAvatarNorthUntil,
  walkTownAvatarToStreetLaneY,
  enterTown,
  isVisible,
  readGameState,
} from "./walkthrough_helpers.mjs";
import { composeTownStreetForMode, facadeById } from "../../src/ui/scenes/town_world.ts";

//============================================
// Storefront resolution against the composed street (pure; unit-tested without
// a browser).
//============================================

// The corral/pub map straight to their stable storefront id -- buying always
// uses the corral, gambling always the pub, in every mode -- so this is plan
// SEMANTICS, not a town-composition assumption. The outfitter a plan uses,
// however, depends on which composed facade OFFERS the plan's resource (mining
// offers smithore, energy offers energy, farm offers food, and a future
// tournament mining facade also offers crystite), so it is resolved from the
// composed street, never a fixed resource->door table.
const FIXED_PLAN_STOREFRONT = Object.freeze({
  buy_mule: "corral",
  gamble_pub: "pub",
});

//============================================
/**
 * The composed facade offering `resource`, or null when no facade on the street
 * offers it. Discovers the outfitter from the composed street's outfitResources
 * lists (town_world.ts), so a mode that composes a different set of outfitters
 * resolves correctly with no code change here.
 *
 * @param street - The composed town street (composeTownStreetForMode).
 * @param resource - The resource an outfit_mule plan carries.
 * @returns The composed facade offering that resource, or null.
 */
export function facadeOfferingResource(street, resource) {
  for (const facade of street.facades) {
    if (facade.outfitResources !== undefined && facade.outfitResources.includes(resource)) {
      return facade;
    }
  }
  return null;
}

//============================================
/**
 * The composed facade a develop commerce plan acts at, or null when the active
 * mode's composed street does not include it (so the executor SKIPS the errand
 * rather than walking toward a facade that is not there). buy_mule/gamble_pub
 * map to their fixed storefront id; outfit_mule is resolved by the resource its
 * plan carries (facadeOfferingResource). A plan kind with no town storefront is
 * a caller bug and throws.
 *
 * @param street - The composed town street.
 * @param plan - A develop gesture plan (`{ kind, resource? }`).
 * @returns The composed facade the plan acts at, or null when absent from the
 *   composition.
 */
export function resolveStorefront(street, plan) {
  if (plan.kind === "outfit_mule") {
    return facadeOfferingResource(street, plan.resource);
  }
  const id = FIXED_PLAN_STOREFRONT[plan.kind];
  if (id === undefined) {
    throw new Error(`resolveStorefront: plan kind "${plan.kind}" has no town storefront`);
  }
  return facadeById(street, id) ?? null;
}

//============================================
// Shipped-DOM selectors and panel-outcome constants (confirmed against
// town_scene.tsx and the src/ui/solid/*_panel.tsx components; the walker only
// reads/drives these, it adds nothing to the UI).
//============================================

// town_scene.tsx binds Enter/Space as the pub gamble confirm key while a gamble
// confirm is pending (ACTION_KEYS = new Set(["Enter", " "])). Doors themselves
// fire on walk-in, not a keypress; this key only confirms the pub's turn-ending
// gamble. Playwright's keyboard.press("Space") produces the " " that set
// contains, matching pub_gamble.spec.mjs.
const PUB_CONFIRM_KEY = "Space";

// The panels bind a document-level Escape dismiss (bindKeys, src/ui/input.ts) at
// mount, so Escape reliably closes a panel regardless of which element holds DOM
// focus after a confirm (a confirmed Buy/Outfit removes the focused confirm
// button and focus falls to <body>, so a second Enter would not re-activate the
// post-confirm Continue action -- Escape is the one reliable dismiss).
const PANEL_DISMISS_KEY = "Escape";

// Corral purchase panel (src/ui/solid/corral_purchase_panel.tsx). Walking into
// the corral always opens this panel; buy_mule dispatches only on the explicit
// confirm inside it.
const CORRAL_PANEL = "[data-corral-panel]";
// The panel outcome that means "buy would succeed now". Every other outcome
// ("carrying", "out_of_stock", "insufficient_funds") is a no-op the develop AI
// should never have decided to walk in for.
const CORRAL_OUTCOME_BUYABLE = "buyable";

// Outfit confirm panel (src/ui/solid/outfit_panel.tsx). Walking into an
// outfitter always opens this panel; outfit_mule dispatches only on the explicit
// per-resource confirm inside it.
const OUTFIT_PANEL = "[data-outfit-panel]";
const OUTFIT_OUTCOME_BUYABLE = "buyable";

// Assay office panel (src/ui/solid/assay_office_panel.tsx). Composes only
// in a future tournament mode (townCapabilitiesForMode's assayVisible is false
// for beginner and standard), so executeArmAssay reaches it only when a mode
// that turns the office on is active.
const ASSAY_PANEL = "[data-assay-panel]";
const ASSAY_OUTCOME_IDLE = "idle";
const ASSAY_OUTCOME_ARMED = "armed";

// Default poll budget/interval for the post-action verify loops (ms). A few
// multiples above a single reactive attribute update so a loaded headless
// machine still observes the change, while a genuine no-op still fails promptly.
const DEFAULT_VERIFY_BUDGET_MS = 5_000;
const DEFAULT_VERIFY_POLL_MS = 100;

//============================================
/**
 * Fill in the optional deps a town executor accepts, so a live caller can pass
 * just `{ readProjection }` (or nothing, defaulting to the shared projection
 * reader) while tests inject timing overrides and a fake projection reader.
 *
 * @param rawDeps - `{ readProjection?, walk?, enterTownOptions?, verifyBudgetMs?,
 *   verifyPollMs? }`, all optional.
 * @returns A fully-populated deps object.
 */
function normalizeDeps(rawDeps = {}) {
  return {
    readProjection: rawDeps.readProjection ?? readGameState,
    walk: rawDeps.walk ?? {},
    enterTownOptions: rawDeps.enterTownOptions ?? {},
    verifyBudgetMs: rawDeps.verifyBudgetMs ?? DEFAULT_VERIFY_BUDGET_MS,
    verifyPollMs: rawDeps.verifyPollMs ?? DEFAULT_VERIFY_POLL_MS,
  };
}

//============================================
/**
 * Compose the active mode's town street from the live projection. The mode
 * (store.state.mode) is the ONLY town input that varies by game mode; the
 * street geometry, facade set, door centers, spawn, exits, and lane all fall out
 * of composeTownStreetForMode -- the same single source of truth the scene,
 * camera, collision, and browser specs derive from.
 *
 * @param page - The Playwright page.
 * @param deps - Normalized deps (its readProjection reads the live mode).
 * @returns The composed TownStreet for the active mode.
 */
async function composeStreetForPage(page, deps) {
  const projection = await deps.readProjection(page);
  return composeTownStreetForMode(projection.state.mode);
}

//============================================
/**
 * Read one attribute off the element a selector resolves to, or null when the
 * element is absent. Resolves the handle fresh each call so a scene remount
 * never leaves a stale reference.
 *
 * @param page - The Playwright page (or a fake exposing `$`).
 * @param selector - CSS selector for the element.
 * @param attr - Attribute name to read.
 * @returns The attribute value, or null when the element is absent.
 */
async function readAttribute(page, selector, attr) {
  const handle = await page.$(selector);
  if (handle === null) {
    return null;
  }
  return handle.getAttribute(attr);
}

//============================================
/**
 * Poll a predicate until it holds or the budget expires, sleeping between
 * checks. Checks once more after the deadline so a check that only becomes true
 * right at the budget edge is not lost.
 *
 * @param page - The Playwright page (for its `waitForTimeout`).
 * @param predicate - `() => Promise<boolean>` readiness test.
 * @param budgetMs - Wall-clock budget before giving up.
 * @param pollMs - Delay between checks.
 * @returns True once the predicate held, false if the budget expired.
 */
async function pollUntil(page, predicate, budgetMs, pollMs) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (await predicate()) {
      return true;
    }
    await page.waitForTimeout(pollMs);
  }
  return predicate();
}

//============================================
/**
 * Ensure the town interior is mounted before a commerce executor acts. Returns
 * immediately when #town-scene is already visible (the common case: every human
 * develop turn spawns in town at the corral); otherwise walks the
 * overworld avatar into town via the shared enterTown helper (the fallback path
 * after an assay/hunt errand left the avatar on the overworld).
 *
 * @param page - The Playwright page.
 * @param report - The walk report, for enterTown's walk_stall classification.
 * @param deps - Normalized deps (its enterTownOptions steers the entry walk).
 * @returns True once the town scene is mounted, false on a walk stall.
 */
async function ensureInTown(page, report, deps) {
  if (await isVisible(page, "#town-scene")) {
    return true;
  }
  return enterTown(page, report, deps.enterTownOptions);
}

//============================================
/**
 * Wait until `storefrontId`'s door reports data-door-state="open". Doors open on
 * avatar proximity (town_collision.ts's computeOpenDoors) and a door is already
 * within the open radius by the time the x-seek lands at its center, so this is
 * normally an instant pass; the poll is a defensive guard against a frame-timing
 * race. A door that never opens is reported as a walk_stall.
 *
 * @param page - The Playwright page.
 * @param report - The walk report; a stuck-closed door is reported here.
 * @param storefrontId - The composed facade's storefront id (the [data-door-for]
 *   value).
 * @param deps - Normalized deps (its verifyBudgetMs/verifyPollMs bound the poll).
 * @returns True once the door reports open, false if it never does.
 */
async function waitForDoorOpen(page, report, storefrontId, deps) {
  const opened = await pollUntil(
    page,
    async () =>
      (await readAttribute(page, `[data-door-for='${storefrontId}']`, "data-door-state")) ===
      "open",
    deps.verifyBudgetMs,
    deps.verifyPollMs,
  );
  if (!opened) {
    report.fail("walk_stall", `town door ${storefrontId} never reported data-door-state="open"`);
    return false;
  }
  return true;
}

//============================================
/**
 * Align to a composed facade's door and walk in to open its panel. Seeks the
 * avatar's world x to the composed doorCenterX, waits for the door to open, then
 * pushes north through the open threshold until `panelSelector` is visible --
 * the walk-in that opens the panel with no economic side effect and freezes
 * movement. Shared by the corral, outfit, and assay executors (the pub uses a
 * notice-driven confirm instead of a DOM panel).
 *
 * @param page - The Playwright page.
 * @param report - The walk report.
 * @param deps - Normalized deps (its walk overrides steer the seek/north push).
 * @param facade - The composed facade to walk into.
 * @param panelSelector - CSS selector for the panel the walk-in opens.
 * @returns True once the panel is open, false on a seek/door/walk-in failure.
 */
async function alignAndOpenPanel(page, report, deps, facade, panelSelector) {
  if (!(await walkTownAvatarToDoorX(page, report, facade.doorCenterX, deps.walk))) {
    return false;
  }
  if (!(await waitForDoorOpen(page, report, facade.id, deps))) {
    return false;
  }
  const opened = await walkTownAvatarNorthUntil(
    page,
    undefined,
    async () => isVisible(page, panelSelector),
    deps.walk,
  );
  if (!opened) {
    report.fail("act_did_not_advance", `walking into the ${facade.id} door never opened its panel`);
    return false;
  }
  return true;
}

//============================================
/**
 * Walk the avatar back south onto the composed street lane after a panel
 * interaction. Dismissing a panel places the avatar street-side of its door
 * (town_scene.tsx's streetSideOfDoor -- just south of the facade band), but the
 * next door's x-seek should start from the lane center, well clear of the facade
 * jambs. Converges the avatar's world y onto the composed streetLaneY (gap-
 * proportional taps, self-correcting on overshoot -- see
 * walkTownAvatarToStreetLaneY) rather than a one-way "at least there" walk: a
 * fixed-tap walk that stops at the first tap past the lane can overshoot far
 * enough south that the next door's approach falls outside
 * DOOR_OPEN_RADIUS_PX's vertical reach (a seed-1 "mining door never opened"
 * walk_stall found by triage).
 *
 * @param page - The Playwright page.
 * @param report - The walk report; a stuck-north avatar is reported here.
 * @param deps - Normalized deps (its walk.tapMs is unused here; kept for the
 *   caller's shared deps shape).
 * @param street - The composed street, for its streetLaneY target.
 * @param storefrontId - The door just used (for the failure message only).
 * @returns True once the avatar's y reaches the lane, false on stall/budget.
 */
async function walkBackToStreet(page, report, deps, street, storefrontId) {
  const reached = await walkTownAvatarToStreetLaneY(page, undefined, street.streetLaneY);
  if (!reached) {
    report.fail(
      "walk_stall",
      `town avatar never returned to the street lane after using the ${storefrontId} door`,
    );
    return false;
  }
  return true;
}

//============================================
/**
 * Read the develop payload's carriedMule off the live projection, or null when
 * the game is not in the develop phase (so a caller polling for an outfit change
 * never misreads a torn-down turn as an unexpected value).
 *
 * @param projection - A walker projection (see src/ui/walker_debug.ts).
 * @returns The carriedMule value ("none" | "unoutfitted" | Resource), or null.
 */
function carriedMuleFromProjection(projection) {
  const phase = projection.state.phase;
  if (phase.kind !== "develop") {
    return null;
  }
  return phase.payload.carriedMule;
}

//============================================
// Executors.
//============================================

/**
 * Buy a M.U.L.E. at the corral. Composes the active street, resolves the corral
 * facade (always present in every mode), aligns to its door and walks in to open
 * the purchase panel (corral_purchase_panel.tsx). When the panel's
 * data-corral-outcome reads buyable, presses Enter (Buy is auto-focused) to
 * confirm, verifies the buy through the avatar's data-carrying flipping off
 * "none", then dismisses with Escape and walks back to the lane. A non-buyable
 * outcome (already carrying, out of stock, insufficient funds) is a no-op the
 * develop AI should never have decided: dismisses and fails rather than stalling.
 *
 * @param page - The Playwright page.
 * @param report - The walk report.
 * @param rawDeps - Optional deps (see normalizeDeps); its readProjection reads
 *   the live mode.
 * @returns True once the buy is verified, false on any failure (reported).
 */
export async function executeBuyMule(page, report, rawDeps) {
  const deps = normalizeDeps(rawDeps);
  if (!(await ensureInTown(page, report, deps))) {
    return false;
  }
  const street = await composeStreetForPage(page, deps);
  const facade = resolveStorefront(street, { kind: "buy_mule" });
  if (facade === null) {
    report.log("info", "buy_mule skipped: no corral in the composed town street");
    return false;
  }
  if (!(await alignAndOpenPanel(page, report, deps, facade, CORRAL_PANEL))) {
    return false;
  }
  const outcome = await readAttribute(page, CORRAL_PANEL, "data-corral-outcome");
  if (outcome !== CORRAL_OUTCOME_BUYABLE) {
    await page.keyboard.press(PANEL_DISMISS_KEY);
    report.fail(
      "act_did_not_advance",
      `corral purchase panel opened non-buyable (outcome "${outcome}")`,
    );
    return false;
  }
  const before = await readAttribute(page, TOWN_AVATAR, "data-carrying");
  await page.keyboard.press("Enter");
  const bought = await pollUntil(
    page,
    async () => (await readAttribute(page, TOWN_AVATAR, "data-carrying")) !== before,
    deps.verifyBudgetMs,
    deps.verifyPollMs,
  );
  if (!bought) {
    report.fail(
      "act_did_not_advance",
      "corral buy did not change the avatar's data-carrying state",
    );
    return false;
  }
  await page.keyboard.press(PANEL_DISMISS_KEY);
  const panelClosed = await pollUntil(
    page,
    async () => !(await isVisible(page, CORRAL_PANEL)),
    deps.verifyBudgetMs,
    deps.verifyPollMs,
  );
  if (!panelClosed) {
    report.fail("act_did_not_advance", "corral purchase panel never closed after buying");
    return false;
  }
  return walkBackToStreet(page, report, deps, street, facade.id);
}

//============================================
/**
 * Outfit the carried M.U.L.E. for `resource` at whichever composed facade offers
 * it (mining->smithore, energy->energy, farm->food; discovered from the street).
 * Aligns to that facade's door, walks in to open the outfit confirm panel
 * (outfit_panel.tsx), presses Enter (the resource's confirm is
 * auto-focused) when the panel is buyable, verifies the outfit through the
 * develop payload's carriedMule becoming that resource, then dismisses with
 * Escape and walks back. When no composed facade offers the resource (a mode that
 * does not stock it), the errand is SKIPPED rather than failed.
 *
 * @param page - The Playwright page.
 * @param report - The walk report.
 * @param rawDeps - Optional deps (see normalizeDeps); its readProjection reads
 *   the mode and the outfit state.
 * @param resource - The resource to outfit for (from the outfit_mule plan).
 * @returns True once the outfit is verified, false on any failure (reported) or
 *   a skipped errand.
 */
export async function executeOutfitMule(page, report, rawDeps, resource) {
  const deps = normalizeDeps(rawDeps);
  if (!(await ensureInTown(page, report, deps))) {
    return false;
  }
  const street = await composeStreetForPage(page, deps);
  const facade = facadeOfferingResource(street, resource);
  if (facade === null) {
    report.log("info", `outfit_mule skipped: no composed facade offers ${resource} in this town`);
    return false;
  }
  if (!(await alignAndOpenPanel(page, report, deps, facade, OUTFIT_PANEL))) {
    return false;
  }
  const outcome = await readAttribute(page, OUTFIT_PANEL, "data-outfit-outcome");
  if (outcome !== OUTFIT_OUTCOME_BUYABLE) {
    await page.keyboard.press(PANEL_DISMISS_KEY);
    report.fail(
      "act_did_not_advance",
      `outfit panel at ${facade.id} opened non-buyable (outcome "${outcome}")`,
    );
    return false;
  }
  await page.keyboard.press("Enter");
  const outfitted = await pollUntil(
    page,
    async () => carriedMuleFromProjection(await deps.readProjection(page)) === resource,
    deps.verifyBudgetMs,
    deps.verifyPollMs,
  );
  if (!outfitted) {
    await page.keyboard.press(PANEL_DISMISS_KEY);
    report.fail(
      "act_did_not_advance",
      `outfit confirm at ${facade.id} never set the projection carriedMule to ${resource}`,
    );
    return false;
  }
  await page.keyboard.press(PANEL_DISMISS_KEY);
  const panelClosed = await pollUntil(
    page,
    async () => !(await isVisible(page, OUTFIT_PANEL)),
    deps.verifyBudgetMs,
    deps.verifyPollMs,
  );
  if (!panelClosed) {
    report.fail(
      "act_did_not_advance",
      `outfit panel at ${facade.id} never closed after outfitting`,
    );
    return false;
  }
  return walkBackToStreet(page, report, deps, street, facade.id);
}

//============================================
/**
 * Visit the pub and gamble. Composes the street, resolves the pub facade (always
 * present), aligns to its door, and walks north through the doorway to open the
 * gamble confirm (gambling always ends the turn, so the walk-in only opens the
 * "gamble and end turn?" prompt; a second Space press confirms it). Verifies the
 * payout through the [data-pub-banner] amount and the human's money growing by
 * exactly that amount, then increments report.counters.gambles. Never walks back
 * -- the turn-ending confirm tears the whole scene down.
 *
 * @param page - The Playwright page.
 * @param report - The walk report; its counters.gambles is bumped on success.
 * @param rawDeps - Optional deps (see normalizeDeps); its readProjection reads
 *   the mode and the human's money before and after.
 * @returns True once the gamble is verified, false on any failure (reported).
 */
export async function executeGamblePub(page, report, rawDeps) {
  const deps = normalizeDeps(rawDeps);
  if (!(await ensureInTown(page, report, deps))) {
    return false;
  }
  const street = await composeStreetForPage(page, deps);
  const facade = resolveStorefront(street, { kind: "gamble_pub" });
  if (facade === null) {
    report.log("info", "gamble_pub skipped: no pub in the composed town street");
    return false;
  }
  if (!(await walkTownAvatarToDoorX(page, report, facade.doorCenterX, deps.walk))) {
    return false;
  }
  if (!(await waitForDoorOpen(page, report, facade.id, deps))) {
    return false;
  }

  const moneyBefore = (await deps.readProjection(page)).humanMoney;

  // Walking through the pub's open doorway opens the confirm prompt --
  // town_scene.tsx's walk-in model fires the pub's interaction on entry, not a
  // keypress; the turn-ending gamble itself still gates behind the second,
  // explicit Space press below.
  const confirming = await walkTownAvatarNorthUntil(
    page,
    undefined,
    async () => (await readAttribute(page, "#town-scene", "data-gamble-confirming")) === "true",
    deps.walk,
  );
  if (!confirming) {
    report.fail("act_did_not_advance", "pub gamble confirm affordance never appeared");
    return false;
  }

  // The confirm key pays out, shows the banner, and ends the turn (unmounting
  // the town scene). The banner is appended to document.body, so it survives
  // that unmount (see town_scene_render.tsx showPubBanner).
  await page.keyboard.press(PUB_CONFIRM_KEY);
  const bannerShown = await pollUntil(
    page,
    async () => (await readAttribute(page, "[data-pub-banner]", "data-pub-banner-amount")) !== null,
    deps.verifyBudgetMs,
    deps.verifyPollMs,
  );
  if (!bannerShown) {
    report.fail(
      "act_did_not_advance",
      "pub payout banner never appeared after confirming the gamble",
    );
    return false;
  }
  const amount = Number(await readAttribute(page, "[data-pub-banner]", "data-pub-banner-amount"));

  // The human's money must have grown by exactly the banner's payout.
  const moneyMatched = await pollUntil(
    page,
    async () => (await deps.readProjection(page)).humanMoney === moneyBefore + amount,
    deps.verifyBudgetMs,
    deps.verifyPollMs,
  );
  if (!moneyMatched) {
    report.fail("act_did_not_advance", `human money never reflected the $${amount} pub payout`);
    return false;
  }

  report.counters.gambles += 1;
  return true;
}

//============================================
/**
 * Arm the overworld assay at the assay office. Composes the street; when the
 * active mode does not compose an assay office (beginner and standard both hide
 * it -- it belongs to a future tournament mode), the arm is SKIPPED gracefully,
 * mirroring executeHuntWampus's skip of an uncatchable wampus: it logs and
 * returns false rather than failing the run, and the develop loop re-decides.
 * When the office IS composed, aligns to its door, walks in to open the panel
 * (assay_office_panel.tsx), presses Enter (Arm is auto-focused) when the
 * panel is idle, verifies the arm through the panel's data-assay-outcome
 * reaching "armed", then dismisses and walks back. This executor only arms the
 * assay; the orchestrator (e2e_walkthrough.mjs) owns exiting town and firing on
 * the target plot via walkthrough_overworld.mjs's executeAssayPlot.
 *
 * @param page - The Playwright page.
 * @param report - The walk report.
 * @param rawDeps - Optional deps (see normalizeDeps); its readProjection reads
 *   the live mode.
 * @returns True once arming is verified, false on any failure (reported) or a
 *   skipped (assay-absent) errand.
 */
export async function executeArmAssay(page, report, rawDeps) {
  const deps = normalizeDeps(rawDeps);
  if (!(await ensureInTown(page, report, deps))) {
    return false;
  }
  const street = await composeStreetForPage(page, deps);
  const facade = facadeById(street, "assay") ?? null;
  if (facade === null) {
    report.log("info", "arm_assay skipped: no assay office in the composed town street");
    return false;
  }
  if (!(await alignAndOpenPanel(page, report, deps, facade, ASSAY_PANEL))) {
    return false;
  }
  const outcome = await readAttribute(page, ASSAY_PANEL, "data-assay-outcome");
  if (outcome !== ASSAY_OUTCOME_IDLE) {
    await page.keyboard.press(PANEL_DISMISS_KEY);
    report.fail("act_did_not_advance", `assay office panel opened non-idle (outcome "${outcome}")`);
    return false;
  }
  await page.keyboard.press("Enter");
  const armed = await pollUntil(
    page,
    async () =>
      (await readAttribute(page, ASSAY_PANEL, "data-assay-outcome")) === ASSAY_OUTCOME_ARMED,
    deps.verifyBudgetMs,
    deps.verifyPollMs,
  );
  if (!armed) {
    await page.keyboard.press(PANEL_DISMISS_KEY);
    report.fail("act_did_not_advance", "assay office Arm confirm never reached the armed state");
    return false;
  }
  await page.keyboard.press(PANEL_DISMISS_KEY);
  const panelClosed = await pollUntil(
    page,
    async () => !(await isVisible(page, ASSAY_PANEL)),
    deps.verifyBudgetMs,
    deps.verifyPollMs,
  );
  if (!panelClosed) {
    report.fail("act_did_not_advance", "assay office panel never closed after arming");
    return false;
  }
  return walkBackToStreet(page, report, deps, street, facade.id);
}
