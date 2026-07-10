// Town commerce drivers for the browser walkthrough harness.
//
// The human's develop turn plays out inside a walkable town interior
// (src/ui/scenes/town_scene.tsx): the avatar walks a single street row past a
// fixed left-to-right sequence of building doors, and walking through an open
// door IS the entry action -- doors open on proximity and fire their
// interaction the instant the avatar's center crosses the door-enter line
// (a push north into an open doorway, or flush against a solid counter
// podium); no keypress is involved in reaching a door's interaction. This
// module owns the three commerce doors the seat-0 strategy adapter can decide
// on during develop -- the corral (buy a M.U.L.E.), the four outfit counters
// (outfit the carried M.U.L.E. for a resource), and the pub (gamble, which
// always ends the turn) -- as three plan executors the orchestrator wires
// into its develop loop later (that wiring is a separate integration step;
// this module only exports the executors and the pure door mapping helpers
// they share).
//
// Door names come straight from town_scene.tsx's [data-door-for] markers and
// src/ui/scenes/zones.ts's TOWN_DOOR_IDS: "corral", "counter-food",
// "counter-energy", "counter-smithore", "counter-crystite", "pub", "assay".
// The corral sits at the westmost street cell (also the spawn cell) and every
// other door lies east of it, so a door walk heads west only for the corral.
//
// Each executor follows the same shape: ensure the town scene is mounted
// (enterTown if the avatar is still on the overworld), walk the town avatar to
// the target door's street column, wait for that door to report
// data-door-state="open" (proximity-driven; already true by the time the
// column seek lands, but the wait is a cheap defensive poll), press north
// into the door (walkTownAvatarNorthUntil), then verify the move through the
// stated live observable -- the corral purchase panel's data-corral-outcome
// plus the avatar's data-carrying attribute for a buy (see executeBuyMule's
// own doc comment for the panel contract), the develop payload's carriedMule
// (read through the projection) for an outfit, and the pub's confirm
// affordance appearing for a gamble (which the second, still-keyed Enter
// press then confirms; a payout banner plus the human's money delta verify
// that). A completed gamble increments report.counters.gambles. Every wait
// is state-based (a bounded walk tap or an attribute/projection poll), never
// a bare sleep hoping an animation finished.
//
// A successful north press leaves the avatar north of the street, inside the
// building's doorway/interior (that displacement is what fires the entry, so
// it cannot be skipped). Only the door's own street column is guaranteed
// passable at that height -- a neighboring building's jamb walls the avatar in
// on either side -- so a buy or an outfit walks the avatar back south onto the
// street (walkBackToStreet) before returning, keeping the horizontal-only
// walkTownAvatarToDoor seek free to reach the next commerce door. Gambling
// always ends the turn (the pub confirm's Enter press tears down the whole
// town scene), so its executor has no next door to reach and skips the return
// walk.

import {
  TOWN_AVATAR,
  WALK_BACK_TAP_MS,
  walkTo,
  walkTownAvatarToDoor,
  walkTownAvatarNorthUntil,
  enterTown,
  isVisible,
  readGameState,
  parseTranslateY,
} from "./walkthrough_helpers.mjs";
import { TOWN_STREET_TOP_Y } from "../../src/ui/scenes/town_layout.ts";
import { TOWN_CELL_PX } from "../../src/ui/scenes/zones.ts";

//============================================
// Door mapping (pure; unit-tested without a browser).
//============================================

// town_scene.tsx binds both Enter and Space as the pub confirm/decline key
// while a gamble confirm is pending (ACTION_KEYS = new Set(["Enter", " "])).
// Doors themselves fire on walk-in, not a keypress; this key only confirms
// the pub's "gamble and end turn?" dialog. Playwright's keyboard.press("Space")
// produces the " " key that set contains, matching pub_gamble.spec.mjs.
const ACTION_KEY = "Space";

// The four resources an outfit counter can outfit a M.U.L.E. for, drawn from
// town_scene.tsx's COUNTER_RESOURCE map. Each maps to a "counter-<resource>"
// door id.
const OUTFIT_RESOURCES = Object.freeze(["food", "energy", "smithore", "crystite"]);

// The commerce door each fixed develop plan kind uses. outfit_mule is resolved
// separately (below) because its door depends on the plan's resource.
const PLAN_KIND_DOORS = Object.freeze({
  buy_mule: "corral",
  gamble_pub: "pub",
});

// The [data-town-notice] text town_scene.tsx's useDoor sets on a successful
// assay-door walk-in (town_scene.tsx :429). No dedicated data-* attribute
// exposes the assayArmed signal (it lives in human_develop_layer.tsx, one
// level up from town_scene.tsx), so this exact string is the only DOM
// observable the assay executor can verify arming against.
const ASSAY_ARMED_NOTICE = "Assay ready: leave town and press action on a plot.";

// The corral purchase panel's root selector (WP-4A/4B,
// src/ui/solid/corral_purchase_panel.tsx). Walking into the corral always
// opens this panel now -- the buy_mule dispatch fires only on an explicit
// confirm inside it -- so executeBuyMule waits for it rather than for a
// direct data-carrying flip.
const CORRAL_PANEL = "[data-corral-panel]";

// The panel's live data-corral-outcome value that means "buy_mule would
// succeed right now" (corral_purchase_panel.tsx's CorralOutcome type). Every
// other outcome ("carrying", "out_of_stock", "insufficient_funds") is a
// no-op the develop AI should never have decided to walk in for.
const CORRAL_OUTCOME_BUYABLE = "buyable";

// Key that dismisses the corral panel via its document-level Escape binding
// (bindKeys, src/ui/input.ts), bound once at panel mount so it works
// regardless of which element currently has DOM focus. Confirming a buy
// removes the focused Buy button from the DOM and browser focus falls back
// to <body> (verified empirically against a live run), so a second Enter
// press does NOT activate the panel's post-buy "Continue" action -- Escape
// is the reliable dismiss for every outcome, not just failures.
const CORRAL_DISMISS_KEY = "Escape";

// Default poll budget/interval for the post-action verify loops (ms). Kept a
// few multiples above a single reactive attribute update so a loaded headless
// machine still observes the change, while a genuine no-op action still fails
// promptly.
const DEFAULT_VERIFY_BUDGET_MS = 5_000;
const DEFAULT_VERIFY_POLL_MS = 100;

//============================================
/**
 * The [data-door-for] town door a fixed-shape develop plan uses. outfit_mule
 * carries a resource, so its counter door is resolved through
 * counterDoorForResource; buy_mule and gamble_pub map to a single fixed door.
 * A plan kind with no commerce door is a caller bug and throws.
 *
 * @param plan - A develop gesture plan (`{ kind, resource? }`).
 * @returns The town door id the plan acts at.
 */
export function doorForPlanKind(plan) {
  if (plan.kind === "outfit_mule") {
    return counterDoorForResource(plan.resource);
  }
  const door = PLAN_KIND_DOORS[plan.kind];
  if (door === undefined) {
    throw new Error(`doorForPlanKind: plan kind "${plan.kind}" has no town commerce door`);
  }
  return door;
}

//============================================
/**
 * The outfit-counter door id for a resource (`food` -> `counter-food`). An
 * unknown resource is a caller bug and throws rather than fabricating a door
 * that town_scene.tsx does not render.
 *
 * @param resource - One of the four outfittable resources.
 * @returns The `counter-<resource>` door id.
 */
export function counterDoorForResource(resource) {
  if (!OUTFIT_RESOURCES.includes(resource)) {
    throw new Error(`counterDoorForResource: "${resource}" is not an outfittable resource`);
  }
  return `counter-${resource}`;
}

//============================================
/**
 * The arrow key that walks the town avatar toward a door along the single
 * street row. The corral is the westmost door (street col 1, on the spawn
 * cell), so only it is reached by heading west; every other door lies east.
 *
 * @param door - The target town door id.
 * @returns "ArrowLeft" for the corral, "ArrowRight" for every other door.
 */
export function walkDirForDoor(door) {
  return door === "corral" ? "ArrowLeft" : "ArrowRight";
}

//============================================
// Executors.
//============================================

/**
 * Fill in the optional deps a town executor accepts, so a live caller can pass
 * just `{ readProjection }` (or nothing, defaulting to the shared projection
 * reader) while tests inject timing overrides and a fake projection reader.
 *
 * @param rawDeps - `{ readProjection?, walk?, enterTownOptions?,
 *   verifyBudgetMs?, verifyPollMs? }`, all optional.
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
 * Read the text content of the element a selector resolves to, or null when
 * the element is absent. Resolves the handle fresh each call, matching
 * readAttribute's remount-safe shape. Used for the assay door, whose armed
 * state (human_develop_layer.tsx's assayArmed signal) has no dedicated
 * data-* attribute -- the [data-town-notice] text is the only observable the
 * DOM exposes for it.
 *
 * @param page - The Playwright page (or a fake exposing `$`).
 * @param selector - CSS selector for the element.
 * @returns The element's text content, or null when the element is absent.
 */
async function readTextContent(page, selector) {
  const handle = await page.$(selector);
  if (handle === null) {
    return null;
  }
  return handle.textContent();
}

//============================================
/**
 * Poll a predicate until it holds or the budget expires, sleeping between
 * checks. Checks once more after the deadline so a check that only becomes
 * true right at the budget edge is not lost.
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
 * immediately when #town-scene is already visible; otherwise walks the
 * overworld avatar into town via the shared enterTown helper.
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
 * Walk the town avatar until it stands at `door`, using the position-aware
 * walkTownAvatarToDoor seek. The seek recomputes its heading each tap from the
 * avatar's live x versus the door center, so an overshoot at the fast default
 * speed walks back to the door instead of sailing past it out the far edge (the
 * old fixed-heading walkTo's counter-smithore stall). A stall is classified
 * through the report by the seek itself.
 *
 * @param page - The Playwright page.
 * @param report - The walk report, for walk_stall classification.
 * @param door - The target [data-door-for] door id.
 * @param walkOptions - `{ budget?, tapMs? }` overrides (may be empty).
 * @returns True once the avatar stands at the door, false on stall/budget.
 */
async function walkToDoor(page, report, door, walkOptions) {
  return walkTownAvatarToDoor(page, report, door, {
    budget: walkOptions.budget,
    tapMs: walkOptions.tapMs,
  });
}

//============================================
/**
 * Wait until `door` reports data-door-state="open". Doors open on avatar
 * proximity (town_layout.ts's computeOpenDoors) and a door's street column is
 * already within the open radius the moment walkToDoor lands there, so this
 * is normally an instant pass; the poll exists as a defensive guard against a
 * frame-timing race rather than a genuine wait. A door that never opens is
 * reported as a walk_stall (no walk_stall-worthy scenario is expected in
 * practice -- every commerce door in TOWN_DOOR_IDS opens on proximity alone).
 *
 * @param page - The Playwright page.
 * @param report - The walk report; a stuck-closed door is reported here.
 * @param door - The target [data-door-for] door id.
 * @param deps - Normalized deps (its verifyBudgetMs/verifyPollMs bound the poll).
 * @returns True once the door reports open, false if it never does.
 */
async function waitForDoorOpen(page, report, door, deps) {
  const opened = await pollUntil(
    page,
    async () =>
      (await readAttribute(page, `[data-door-for='${door}']`, "data-door-state")) === "open",
    deps.verifyBudgetMs,
    deps.verifyPollMs,
  );
  if (!opened) {
    report.fail("walk_stall", `town door ${door} never reported data-door-state="open"`);
    return false;
  }
  return true;
}

//============================================
/**
 * Read the town avatar's live center y in town pixel space, or null when the
 * avatar node is unmounted. The 2D twin of the private readTownAvatarX in
 * walkthrough_helpers.mjs, exposed here because walkBackToStreet needs a raw
 * pixel y (see its doc comment for why data-at-door alone cannot tell "back
 * on the street" from "still in the doorway").
 *
 * @param page - The Playwright page.
 * @returns The avatar center's y, or null when the node is absent.
 */
async function readTownAvatarY(page) {
  const handle = await page.$(TOWN_AVATAR);
  if (handle === null) {
    return null;
  }
  return parseTranslateY(await handle.getAttribute("transform"));
}

// The y (town pixels) the walk-back aims the avatar at: the street row's
// vertical center, derived from the same town geometry the scene renders. This
// is an ABSOLUTE anchor, not the avatar's pre-walk-in y: seeking back to a fresh
// per-door recorded y let the landing drift a little further south each door
// (each walk-back stops at the first tap past its target, so the next door's
// recorded target sat lower again) until a tap finally overshot the row's south
// edge and the following exit/seek stalled off the street. Aiming every
// walk-back at the fixed row center instead keeps the avatar on a stable street
// line across an unbounded chain of doors. The center clears the building south
// wall (TOWN_STREET_TOP_Y + TOWN_AVATAR_RADIUS) with room to spare, so the next
// horizontal seek is never wall-blocked.
const STREET_ROW_CENTER_Y = TOWN_STREET_TOP_Y + TOWN_CELL_PX / 2;

//============================================
/**
 * Walk the avatar back south onto the street after a successful north-press
 * door interaction. The interaction fires only once the avatar's center
 * crosses into the building's interior (north of the street), and a
 * neighboring building's jamb walls that interior off from the rest of the
 * street at that height -- so a caller chaining a second door executor must
 * return to the street row first, or the next horizontal-only
 * walkTownAvatarToDoor seek stalls against a wall it cannot see around.
 *
 * Arrival is POSITIONAL, not the coarse data-at-door attribute: data-at-door
 * reads `door` for the whole street-row cell height (townDoorRect spans the
 * full cell), which includes the doorway interior just north of the actual
 * walkable street line -- declaring arrival there let a caller resume a
 * horizontal seek from a y the wall geometry still treats as blocked (the
 * counter-smithore stall this replaced: walkBackToStreet used to report arrival
 * with zero ArrowDown taps). The target is the fixed STREET_ROW_CENTER_Y, so
 * repeated door visits never drift the avatar south off the row.
 *
 * @param page - The Playwright page.
 * @param report - The walk report; a stuck-north avatar is reported here.
 * @param door - The door whose column the avatar is returning through (used
 *   only for the failure message; arrival no longer reads data-at-door).
 * @param walkOptions - `{ budget?, tapMs? }` overrides (may be empty).
 * @returns True once the avatar's y is back at/south of the row center, false on
 *   stall/budget.
 */
async function walkBackToStreet(page, report, door, walkOptions) {
  return walkTo(
    page,
    TOWN_AVATAR,
    async (p) => {
      const y = await readTownAvatarY(p);
      return y !== null && y >= STREET_ROW_CENTER_Y;
    },
    "ArrowDown",
    undefined,
    {
      report,
      // Smaller than the horizontal seek's tap so one southward step lands the
      // avatar inside the street row instead of sailing clear past it (see
      // WALK_BACK_TAP_MS); an explicit override still wins for tests.
      tapMs: walkOptions.tapMs ?? WALK_BACK_TAP_MS,
      failureMessage: `town avatar never returned to the street after using the ${door} door`,
    },
  );
}

//============================================
/**
 * Read the develop payload's carriedMule off the live projection, or null when
 * the game is not in the develop phase (so a caller polling for an outfit
 * change never misreads a torn-down turn as an unexpected value).
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
/**
 * Buy a M.U.L.E. at the corral. Ensures the town is mounted, walks to the
 * corral door, waits for it to open, then walks north through the doorway --
 * which always opens the corral purchase panel now (WP-4A/4B,
 * src/ui/solid/corral_purchase_panel.tsx), regardless of outcome. When the
 * panel's data-corral-outcome reads CORRAL_OUTCOME_BUYABLE, presses Enter
 * (Buy is auto-focused on open), verifies the buy through the avatar's
 * data-carrying attribute flipping off "none" (a fresh buy moves it to
 * "unoutfitted"), then dismisses the panel with Escape before walking back
 * to the street. A non-buyable outcome (already carrying, out of stock,
 * insufficient funds) is a no-op the develop AI should never have decided --
 * dismisses the panel and fails the plan instead of stalling.
 *
 * @param page - The Playwright page.
 * @param report - The walk report.
 * @param rawDeps - Optional deps (see normalizeDeps).
 * @returns True once the buy is verified, false on any failure (reported).
 */
export async function executeBuyMule(page, report, rawDeps) {
  const deps = normalizeDeps(rawDeps);
  if (!(await ensureInTown(page, report, deps))) {
    return false;
  }
  const door = doorForPlanKind({ kind: "buy_mule" });
  if (!(await walkToDoor(page, report, door, deps.walk))) {
    return false;
  }
  if (!(await waitForDoorOpen(page, report, door, deps))) {
    return false;
  }
  // Walk north into the corral doorway and wait for the purchase panel to
  // mount -- it always opens on walk-in, so a stall here means the walk
  // never crossed the entry line, not that a buy was rejected.
  const panelOpened = await walkTownAvatarNorthUntil(
    page,
    undefined,
    async () => isVisible(page, CORRAL_PANEL),
    deps.walk,
  );
  if (!panelOpened) {
    report.fail("act_did_not_advance", "corral walk-in never opened the purchase panel");
    return false;
  }
  const outcome = await readAttribute(page, CORRAL_PANEL, "data-corral-outcome");
  if (outcome !== CORRAL_OUTCOME_BUYABLE) {
    await page.keyboard.press(CORRAL_DISMISS_KEY);
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
  await page.keyboard.press(CORRAL_DISMISS_KEY);
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
  return walkBackToStreet(page, report, door, deps.walk);
}

//============================================
/**
 * Outfit the carried M.U.L.E. for `resource` at its counter. Ensures the town
 * is mounted, walks to the counter-<resource> door, waits for it to open,
 * then walks north flush against the podium -- verifying the outfit through
 * the develop payload's carriedMule (read via the projection) becoming that
 * resource. The smithore counter doubles as the store's walk-in bay
 * (town_layout.ts), so the same north press works there too: the podium's
 * outfit only fires while carrying an unoutfitted M.U.L.E., otherwise it is
 * pure navigation.
 *
 * @param page - The Playwright page.
 * @param report - The walk report.
 * @param rawDeps - Optional deps (see normalizeDeps); its readProjection reads
 *   the outfit state.
 * @param resource - The resource to outfit for (one of OUTFIT_RESOURCES).
 * @returns True once the outfit is verified, false on any failure (reported).
 */
export async function executeOutfitMule(page, report, rawDeps, resource) {
  const deps = normalizeDeps(rawDeps);
  if (!(await ensureInTown(page, report, deps))) {
    return false;
  }
  const door = counterDoorForResource(resource);
  if (!(await walkToDoor(page, report, door, deps.walk))) {
    return false;
  }
  if (!(await waitForDoorOpen(page, report, door, deps))) {
    return false;
  }
  // Walk north into the counter podium, then poll the projection until
  // carriedMule reflects the resource. A no-op outfit (no M.U.L.E. in tow,
  // already outfitted, or out of money) never reaches the resource -- the
  // avatar stops changing once flush against the podium, so the north press
  // stalls and correctly fails the run.
  const outfitted = await walkTownAvatarNorthUntil(
    page,
    undefined,
    async () => carriedMuleFromProjection(await deps.readProjection(page)) === resource,
    deps.walk,
  );
  if (!outfitted) {
    report.fail(
      "act_did_not_advance",
      `outfit at ${door} never set the projection carriedMule to ${resource}`,
    );
    return false;
  }
  return walkBackToStreet(page, report, door, deps.walk);
}

//============================================
/**
 * Visit the pub and gamble. Ensures the town is mounted, walks to the pub
 * door, waits for it to open, then walks north through the doorway to trigger
 * the walk-in gamble confirm (gambling always ends the turn, so the walk-in
 * only opens the "gamble and end turn?" dialog; a still-keyed Enter press
 * confirms it). Verifies the payout through the [data-pub-banner] amount and
 * the human's money growing by exactly that amount, then increments
 * report.counters.gambles on the completed gamble.
 *
 * @param page - The Playwright page.
 * @param report - The walk report; its counters.gambles is bumped on success.
 * @param rawDeps - Optional deps (see normalizeDeps); its readProjection reads
 *   the human's money before and after.
 * @returns True once the gamble is verified, false on any failure (reported).
 */
export async function executeGamblePub(page, report, rawDeps) {
  const deps = normalizeDeps(rawDeps);
  if (!(await ensureInTown(page, report, deps))) {
    return false;
  }
  const door = doorForPlanKind({ kind: "gamble_pub" });
  if (!(await walkToDoor(page, report, door, deps.walk))) {
    return false;
  }
  if (!(await waitForDoorOpen(page, report, door, deps))) {
    return false;
  }

  const moneyBefore = (await deps.readProjection(page)).humanMoney;

  // Walking through the pub's open doorway opens the confirm affordance --
  // town_scene.tsx's walk-in model fires the pub's interaction on entry, not
  // a keypress; the turn-ending gamble itself still gates behind a second,
  // explicit Enter/Space press below.
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

  // The action-key press confirms: the engine pays out, the banner appears,
  // and the turn ends (unmounting the town scene). The banner is appended to
  // document.body, so it survives that unmount (see town_scene.tsx).
  await page.keyboard.press(ACTION_KEY);
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
 * Arm the overworld assay at the assay office. Ensures the town is mounted,
 * walks to the assay door, waits for it to open, then walks north through
 * the doorway -- verifying the arm through the [data-town-notice] text
 * flipping to ASSAY_ARMED_NOTICE (town_scene.tsx's useDoor calls
 * props.onArmAssay() and sets that exact notice on an assay-door walk-in;
 * see the constant's doc comment for why text is the only observable
 * available here). This executor only arms the assay -- it does not walk to
 * or fire on the target plot; the orchestrator (e2e_walkthrough.mjs) owns
 * exiting town and calling walkthrough_overworld.mjs's executeAssayPlot for
 * that spatial leg, exactly as it already owns the exitTown transition
 * before executePlaceMule.
 *
 * @param page - The Playwright page.
 * @param report - The walk report.
 * @param rawDeps - Optional deps (see normalizeDeps).
 * @returns True once arming is verified, false on any failure (reported).
 */
export async function executeArmAssay(page, report, rawDeps) {
  const deps = normalizeDeps(rawDeps);
  if (!(await ensureInTown(page, report, deps))) {
    return false;
  }
  const door = "assay";
  if (!(await walkToDoor(page, report, door, deps.walk))) {
    return false;
  }
  if (!(await waitForDoorOpen(page, report, door, deps))) {
    return false;
  }
  // Walk north into the assay doorway, then poll the notice text until it
  // reads the armed string. A no-op walk-in (already armed, or some future
  // gating this executor does not yet know about) never reaches it -- the
  // avatar stops changing once flush in the doorway, so the north press
  // stalls and correctly fails the run.
  const armed = await walkTownAvatarNorthUntil(
    page,
    undefined,
    async () => (await readTextContent(page, "[data-town-notice]")) === ASSAY_ARMED_NOTICE,
    deps.walk,
  );
  if (!armed) {
    report.fail(
      "act_did_not_advance",
      "assay door walk-in did not arm the overworld assay (notice never matched)",
    );
    return false;
  }
  return walkBackToStreet(page, report, door, deps.walk);
}
