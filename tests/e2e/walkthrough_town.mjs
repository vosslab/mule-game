// Town commerce drivers for the browser walkthrough harness.
//
// The human's develop turn plays out inside a walkable town interior
// (src/ui/scenes/town_scene.tsx): the avatar walks a single street row past a
// fixed left-to-right sequence of building doors and presses the action key at
// a door to use it. This module owns the three commerce doors the seat-0
// strategy adapter can decide on during develop -- the corral (buy a M.U.L.E.),
// the four outfit counters (outfit the carried M.U.L.E. for a resource), and
// the pub (gamble, which always ends the turn) -- as three plan executors the
// orchestrator wires into its develop loop later (that wiring is a separate
// integration step; this module only exports the executors and the pure door
// mapping helpers they share).
//
// Door names come straight from town_scene.tsx's [data-door-for] markers and
// src/ui/scenes/zones.ts's TOWN_DOOR_IDS: "corral", "counter-food",
// "counter-energy", "counter-smithore", "counter-crystite", "pub", "assay".
// The corral sits at the westmost street cell (also the spawn cell) and every
// other door lies east of it, so a door walk heads west only for the corral.
//
// Each executor follows the same shape: ensure the town scene is mounted
// (enterTown if the avatar is still on the overworld), walk the town avatar to
// the target door, press the action key, then verify the move through the
// stated live observable -- the avatar's data-carrying attribute for a buy, the
// develop payload's carriedMule (read through the projection) for an outfit,
// and the [data-pub-banner] payout plus the human's money delta for a gamble.
// A completed gamble increments report.counters.gambles. Every wait is
// state-based (a bounded walk tap or an attribute/projection poll), never a
// bare sleep hoping an animation finished.

import {
  TOWN_AVATAR,
  walkTownAvatarToDoor,
  enterTown,
  isVisible,
  readGameState,
  actAndWaitProgress,
} from "./walkthrough_helpers.mjs";

//============================================
// Door mapping (pure; unit-tested without a browser).
//============================================

// town_scene.tsx binds both Enter and Space as the door/confirm action key
// (ACTION_KEYS = new Set(["Enter", " "])). Playwright's keyboard.press("Space")
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
 * corral door, presses the action key, and verifies the buy through the
 * avatar's data-carrying attribute flipping off "none" (town_scene.tsx renders
 * the towed-M.U.L.E. state there; a fresh buy moves it to "unoutfitted").
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
  // Snapshot data-carrying, press the action key, and poll for it to change:
  // a corral buy moves it off "none", while a no-op (already carrying, or out
  // of money) leaves it unchanged and correctly fails the run.
  const bought = await actAndWaitProgress(page, report, {
    snapshot: (p) => readAttribute(p, TOWN_AVATAR, "data-carrying"),
    act: () => page.keyboard.press(ACTION_KEY),
    failureKind: "act_did_not_advance",
    failureMessage: "corral buy did not change the avatar's data-carrying state",
    budgetMs: deps.verifyBudgetMs,
    pollIntervalMs: deps.verifyPollMs,
  });
  return bought;
}

//============================================
/**
 * Outfit the carried M.U.L.E. for `resource` at its counter. Ensures the town
 * is mounted, walks to the counter-<resource> door, presses the action key,
 * and verifies the outfit through the develop payload's carriedMule (read via
 * the projection) becoming that resource.
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
  // Press the action key, then poll the projection until carriedMule reflects
  // the resource. A no-op outfit (no M.U.L.E. in tow, already outfitted, or out
  // of money) never reaches the resource and correctly fails the run.
  await page.keyboard.press(ACTION_KEY);
  const outfitted = await pollUntil(
    page,
    async () => carriedMuleFromProjection(await deps.readProjection(page)) === resource,
    deps.verifyBudgetMs,
    deps.verifyPollMs,
  );
  if (!outfitted) {
    report.fail(
      "act_did_not_advance",
      `outfit at ${door} never set the projection carriedMule to ${resource}`,
    );
    return false;
  }
  return true;
}

//============================================
/**
 * Visit the pub and gamble. Ensures the town is mounted, walks to the pub door,
 * then drives town_scene.tsx's two-keypress confirm affordance (gambling always
 * ends the turn, so one action press only opens the "gamble and end turn?"
 * confirm; a second confirms). Verifies the payout through the [data-pub-banner]
 * amount and the human's money growing by exactly that amount, then increments
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

  const moneyBefore = (await deps.readProjection(page)).humanMoney;

  // First action press only opens the confirm affordance -- town_scene.tsx
  // gates the turn-ending gamble behind a second explicit keypress.
  await page.keyboard.press(ACTION_KEY);
  const confirming = await pollUntil(
    page,
    async () => (await readAttribute(page, "#town-scene", "data-gamble-confirming")) === "true",
    deps.verifyBudgetMs,
    deps.verifyPollMs,
  );
  if (!confirming) {
    report.fail("act_did_not_advance", "pub gamble confirm affordance never appeared");
    return false;
  }

  // Second action press confirms: the engine pays out, the banner appears, and
  // the turn ends (unmounting the town scene). The banner is appended to
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
