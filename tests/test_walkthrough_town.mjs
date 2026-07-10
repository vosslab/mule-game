// Fake-page unit tests for the town commerce drivers in
// tests/e2e/walkthrough_town.mjs. These cover the pure door mapping
// (plan-kind -> door, outfit-resource -> counter door) and the three executor
// verify paths (corral buy via data-carrying, counter outfit via the
// projection carriedMule, pub gamble via the payout banner + money delta and
// its counters.gambles increment) without launching a browser: a fake "page"
// supplies just the handful of methods each executor touches (page.$,
// page.keyboard.down/up/press, page.waitForTimeout). Doors fire on walk-in
// (an ArrowUp tap crossing the door-enter line), not a keypress, so the fakes
// model an ArrowUp tap's up() as the door-entry trigger; the pub's turn-ending
// confirm still uses an explicit Space press. The real browser walk is
// exercised separately by the seed-33 live runner.

import assert from "node:assert/strict";
import { test } from "node:test";

import { TOWN_AVATAR } from "./e2e/walkthrough_helpers.mjs";
import { createWalkReport } from "./e2e/walkthrough_report.mjs";
import {
  doorForPlanKind,
  counterDoorForResource,
  walkDirForDoor,
  executeBuyMule,
  executeOutfitMule,
  executeGamblePub,
} from "./e2e/walkthrough_town.mjs";

//============================================
/** A fresh walk report, whose counters start zeroed. */
function newReport() {
  return createWalkReport({ seed: 33, mode: "test", speed: 1 });
}

//============================================
/**
 * Build a fake element handle over a plain attribute map, exposing the async
 * getAttribute/isVisible reads the executors and their helpers use.
 *
 * @param attrs - `() => Record<string, string | null>` supplier read fresh
 *   each getAttribute so a test can mutate state between reads.
 * @returns A fake handle.
 */
function fakeHandle(attrs) {
  return {
    async isVisible() {
      return true;
    },
    async getAttribute(name) {
      const current = attrs();
      return name in current ? current[name] : null;
    },
  };
}

//============================================
/**
 * Build a fake Playwright page over a small mutable town state, whose avatar
 * is already at the target door (no x-seek exercised). `$` resolves the
 * town-scene container, the town avatar, the door-state marker (always
 * "open"), and the pub banner from that state. `keyboard.down`/`up` model a
 * bounded walk tap: an ArrowUp tap's `up()` runs `onAction("ArrowUp")`, the
 * door-entry trigger; `keyboard.press` (Space) runs `onAction("Space")`, the
 * pub's turn-ending confirm.
 *
 * @param state - Mutable state object the handles and onAction read/write.
 * @param onAction - `(key) => void` applied on a completed ArrowUp tap or an
 *   explicit key press.
 * @returns A fake page object.
 */
function fakePage(state, onAction) {
  state.held = null;
  return {
    async $(selector) {
      if (selector === "#town-scene") {
        return fakeHandle(() => ({ "data-gamble-confirming": state.confirming }));
      }
      if (selector === TOWN_AVATAR) {
        return fakeHandle(() => ({
          "data-at-door": state.atDoor,
          "data-carrying": state.carrying,
          // Fixed street y: this fake never models a real north/south
          // depth, so walkBackToStreet's positional check reads the same
          // recorded streetY it captured moments earlier and arrives on the
          // first check -- exercising the outcome-verification logic this
          // fake targets, not real door geometry (movingTownPage below
          // covers that).
          transform: "translate(96 149.312)",
        }));
      }
      if (selector === "[data-pub-banner]") {
        if (state.bannerAmount === null) {
          return null;
        }
        return fakeHandle(() => ({ "data-pub-banner-amount": String(state.bannerAmount) }));
      }
      if (/^\[data-door-for='.+'\]$/.test(selector)) {
        return fakeHandle(() => ({ "data-door-state": "open" }));
      }
      if (selector === "[data-corral-panel]") {
        if (!state.panelOpen) {
          return null;
        }
        return fakeHandle(() => ({ "data-corral-outcome": state.corralOutcome }));
      }
      return null;
    },
    keyboard: {
      async down(key) {
        state.held = key;
      },
      async up(key) {
        if (key === "ArrowUp") {
          state.presses.push("ArrowUp");
          onAction("ArrowUp");
        }
        state.held = null;
      },
      async press(key) {
        state.presses.push(key);
        onAction(key);
      },
    },
    async waitForTimeout() {},
  };
}

//============================================
// Town street geometry mirrored from src/ui/scenes/zones.ts: a 64px cell, door
// centers at col*64+32 in left-to-right door order. Used by the moving-avatar
// fake so a walk-to-door executor test exercises the real position-aware seek.
const CELL_PX = 64;
const DOOR_CENTERS = {
  corral: 96,
  "counter-food": 160,
  "counter-energy": 224,
  "counter-smithore": 288,
  "counter-crystite": 352,
  pub: 416,
  assay: 480,
};

//============================================
/**
 * The door whose 64px cell contains `x`, mirroring town_scene.tsx's townDoorAt.
 *
 * @param x - The avatar center x in town pixel space.
 * @returns The door id, or null in the gaps.
 */
function doorAtX(x) {
  for (const [door, center] of Object.entries(DOOR_CENTERS)) {
    if (x >= center - CELL_PX / 2 && x < center + CELL_PX / 2) {
      return door;
    }
  }
  return null;
}

//============================================
/**
 * Build a fake town page whose avatar walks the street: each horizontal seek
 * tap advances it `pxPerMs * ms` in the held direction and data-at-door tracks
 * the pixel column; the door-state marker always reads "open"; an ArrowUp tap's
 * `up()` decrements `state.y` by `pxPerMsY * ms` (north), pushes "ArrowUp", and
 * runs `onAction("ArrowUp")` (the door-entry trigger); an ArrowDown tap's `up()`
 * increments `state.y` back by the same step and pushes "ArrowDown", so a
 * caller can assert walkBackToStreet's positional return actually presses
 * ArrowDown rather than reporting arrival off the coarse cell check alone.
 * `pxPerMsY` defaults to 0 (y stays fixed at 0 for callers that only exercise
 * the horizontal seek), so this drives a commerce executor end to end through
 * the real walkTownAvatarToDoor seek, the north-press walk-in, and (when
 * pxPerMsY is nonzero) the positional walk-back.
 *
 * @param state - Mutable `{ x, y, carrying, presses }` town state (`y`
 *   defaults to 0 if omitted).
 * @param pxPerMs - Pixels per real-ms of held horizontal key (0 = motionless).
 * @param onAction - `(key) => void` applied on a completed ArrowUp tap.
 * @param pxPerMsY - Pixels per real-ms of held vertical key (0 = no y depth).
 * @returns A fake page object.
 */
function movingTownPage(state, pxPerMs, onAction, pxPerMsY = 0) {
  state.held = null;
  state.lastTapMs = 0;
  state.y = state.y ?? 0;
  return {
    async $(selector) {
      if (selector === "#town-scene") {
        return fakeHandle(() => ({ "data-gamble-confirming": "false" }));
      }
      if (selector === TOWN_AVATAR) {
        return fakeHandle(() => ({
          transform: `translate(${state.x} ${state.y})`,
          "data-at-door": doorAtX(state.x),
          "data-carrying": state.carrying,
        }));
      }
      if (/^\[data-door-for='.+'\]$/.test(selector)) {
        return fakeHandle(() => ({ "data-door-state": "open" }));
      }
      const marker = selector.match(/^\[data-door-for='(.+)'\] use$/);
      if (marker !== null) {
        const center = DOOR_CENTERS[marker[1]];
        if (center === undefined) {
          return null;
        }
        return fakeHandle(() => ({ x: String(center - 14), width: "28" }));
      }
      return null;
    },
    keyboard: {
      async down(key) {
        state.held = key;
      },
      async up(key) {
        if (state.held === "ArrowRight") {
          state.x += pxPerMs * state.lastTapMs;
        } else if (state.held === "ArrowLeft") {
          state.x -= pxPerMs * state.lastTapMs;
        } else if (key === "ArrowUp") {
          state.y -= pxPerMsY * state.lastTapMs;
          state.presses.push("ArrowUp");
          onAction("ArrowUp");
        } else if (key === "ArrowDown") {
          state.y += pxPerMsY * state.lastTapMs;
          state.presses.push("ArrowDown");
        }
        state.held = null;
      },
      async press(key) {
        state.presses.push(key);
        onAction(key);
      },
    },
    async waitForTimeout(ms) {
      state.lastTapMs = ms;
    },
  };
}

//============================================
test("doorForPlanKind maps each develop commerce plan to its town door", () => {
  assert.equal(doorForPlanKind({ kind: "buy_mule" }), "corral");
  assert.equal(doorForPlanKind({ kind: "gamble_pub" }), "pub");
  assert.equal(doorForPlanKind({ kind: "outfit_mule", resource: "smithore" }), "counter-smithore");
});

//============================================
test("doorForPlanKind rejects a plan kind with no commerce door", () => {
  assert.throws(() => doorForPlanKind({ kind: "place_mule" }), /no town commerce door/);
});

//============================================
test("counterDoorForResource maps every outfittable resource to its counter door", () => {
  assert.equal(counterDoorForResource("food"), "counter-food");
  assert.equal(counterDoorForResource("energy"), "counter-energy");
  assert.equal(counterDoorForResource("smithore"), "counter-smithore");
  assert.equal(counterDoorForResource("crystite"), "counter-crystite");
});

//============================================
test("counterDoorForResource rejects a non-outfittable resource", () => {
  assert.throws(() => counterDoorForResource("gold"), /not an outfittable resource/);
});

//============================================
test("walkDirForDoor heads west only for the corral", () => {
  assert.equal(walkDirForDoor("corral"), "ArrowLeft");
  assert.equal(walkDirForDoor("pub"), "ArrowRight");
  assert.equal(walkDirForDoor("counter-food"), "ArrowRight");
});

//============================================
test("executeBuyMule opens the purchase panel, confirms via Enter, and dismisses via Escape", async () => {
  const state = {
    atDoor: "corral",
    carrying: "none",
    confirming: "false",
    bannerAmount: null,
    presses: [],
    panelOpen: false,
    corralOutcome: "buyable",
  };
  // Walking into the corral doorway opens the purchase panel (WP-4A/4B);
  // Enter (Buy is auto-focused) flips the towed-M.U.L.E. state off "none";
  // Escape dismisses the panel regardless of which element has DOM focus
  // (bindKeys' document-level Escape listener, src/ui/input.ts).
  const page = fakePage(state, (key) => {
    if (key === "ArrowUp") {
      state.panelOpen = true;
    } else if (key === "Enter") {
      state.carrying = "unoutfitted";
    } else if (key === "Escape") {
      state.panelOpen = false;
    }
  });
  const report = newReport();

  const bought = await executeBuyMule(page, report, { verifyPollMs: 0 });

  assert.equal(bought, true);
  assert.equal(report.hasFailed(), false);
  // One north tap opens the panel, Enter confirms the buy, Escape dismisses.
  assert.deepEqual(state.presses, ["ArrowUp", "Enter", "Escape"]);
});

//============================================
test("executeBuyMule dismisses and fails the plan on a non-buyable outcome", async () => {
  const state = {
    atDoor: "corral",
    carrying: "unoutfitted",
    confirming: "false",
    bannerAmount: null,
    presses: [],
    panelOpen: false,
    // Already carrying a M.U.L.E.: the panel opens straight to the
    // "carrying" outcome with no Buy action available.
    corralOutcome: "carrying",
  };
  const page = fakePage(state, (key) => {
    if (key === "ArrowUp") {
      state.panelOpen = true;
    } else if (key === "Escape") {
      state.panelOpen = false;
    }
  });
  const report = newReport();

  const bought = await executeBuyMule(page, report, { verifyPollMs: 0 });

  assert.equal(bought, false);
  assert.equal(report.hasFailed(), true);
  const lastEntry = report.getLog().at(-1);
  assert.equal(lastEntry.severity, "error");
  assert.match(lastEntry.message, /non-buyable/);
  // One north tap opens the panel, then Escape dismisses it immediately --
  // no Enter, since there is no Buy action to confirm.
  assert.deepEqual(state.presses, ["ArrowUp", "Escape"]);
});

//============================================
test("executeOutfitMule verifies the outfit through the projection carriedMule", async () => {
  const state = {
    atDoor: "counter-energy",
    carrying: "unoutfitted",
    confirming: "false",
    bannerAmount: null,
    presses: [],
  };
  // Walking flush into the counter podium outfits the carried M.U.L.E.
  const page = fakePage(state, (key) => {
    if (key === "ArrowUp") {
      state.carrying = "energy";
    }
  });
  // readProjection reflects the current carried state as the develop payload.
  const readProjection = async () => ({
    humanMoney: 100,
    state: { phase: { kind: "develop", payload: { carriedMule: state.carrying } } },
  });
  const report = newReport();

  const outfitted = await executeOutfitMule(
    page,
    report,
    { readProjection, verifyPollMs: 0 },
    "energy",
  );

  assert.equal(outfitted, true);
  assert.deepEqual(state.presses, ["ArrowUp"]);
});

//============================================
test("executeGamblePub confirms, verifies the payout, and increments counters.gambles", async () => {
  const moneyBefore = 100;
  const payout = 50;
  const state = {
    atDoor: "pub",
    carrying: "unoutfitted",
    confirming: "false",
    bannerAmount: null,
    money: moneyBefore,
    presses: [],
  };
  // Walking into the pub doorway opens the confirm affordance; the following
  // Space press confirms: the banner appears with the payout and the human's
  // money grows by that amount.
  const page = fakePage(state, (key) => {
    if (key === "ArrowUp") {
      state.confirming = "true";
      return;
    }
    if (key === "Space") {
      state.confirming = "false";
      state.bannerAmount = payout;
      state.money += payout;
    }
  });
  const readProjection = async () => ({
    humanMoney: state.money,
    state: { phase: { kind: "develop", payload: { carriedMule: state.carrying } } },
  });
  const report = newReport();

  const gambled = await executeGamblePub(page, report, { readProjection, verifyPollMs: 0 });

  assert.equal(gambled, true);
  // One north tap opens the confirm, then one Space press confirms it.
  assert.deepEqual(state.presses, ["ArrowUp", "Space"]);
  // A completed gamble bumps the gambles counter exactly once.
  assert.equal(report.counters.gambles, 1);
});

//============================================
test("executeOutfitMule walks a moving avatar past the overshoot to the counter", async () => {
  // Avatar spawns at the corral and must walk right past two counters to reach
  // smithore, at the fast-speed overshoot regime (0.64 px/ms * 120ms > one
  // cell). The position-aware seek must correct the overshoot and arrive.
  const state = { x: DOOR_CENTERS.corral, carrying: "unoutfitted", presses: [] };
  const page = movingTownPage(state, 0.64, (key) => {
    if (key === "ArrowUp") {
      state.carrying = "smithore";
    }
  });
  const readProjection = async () => ({
    humanMoney: 100,
    state: { phase: { kind: "develop", payload: { carriedMule: state.carrying } } },
  });
  const report = newReport();

  const outfitted = await executeOutfitMule(
    page,
    report,
    { readProjection, verifyPollMs: 0 },
    "smithore",
  );

  assert.equal(outfitted, true);
  assert.equal(doorAtX(state.x), "counter-smithore");
  assert.deepEqual(state.presses, ["ArrowUp"]);
});

//============================================
test("executeOutfitMule's walk-back presses real ArrowDown taps to a positional street y, not a coarse cell-arrival false positive", async () => {
  // Already aligned on the counter-smithore column (no horizontal seek to
  // exercise here); the podium interaction only fires on the third ArrowUp
  // tap, accumulating real northward y each of those three taps. This is the
  // regression walkBackToStreet's OLD data-at-door-only arrival check missed:
  // that coarse per-cell check reads true for the whole street-row cell
  // height, including the doorway interior north of the actual walkable
  // street line, so it used to report the avatar "back on the street" with
  // ZERO ArrowDown taps -- leaving it still north of the wall the next
  // horizontal seek could not see around (the counter-smithore stall).
  const state = { x: DOOR_CENTERS["counter-smithore"], y: 0, carrying: "unoutfitted", presses: [] };
  let upCount = 0;
  const page = movingTownPage(
    state,
    0,
    (key) => {
      if (key !== "ArrowUp") {
        return;
      }
      upCount += 1;
      if (upCount >= 3) {
        state.carrying = "smithore";
      }
    },
    10, // pxPerMsY: each tap moves the avatar 10 * tapMs
  );
  const readProjection = async () => ({
    humanMoney: 100,
    state: { phase: { kind: "develop", payload: { carriedMule: state.carrying } } },
  });
  const report = newReport();

  const outfitted = await executeOutfitMule(
    page,
    report,
    { readProjection, verifyPollMs: 0, walk: { tapMs: 10 } },
    "smithore",
  );

  assert.equal(outfitted, true);
  // Three ArrowUp taps reach the podium (upCount's threshold); the
  // positional walk-back must press ArrowDown a real, nonzero number of
  // times to undo the accumulated northward y -- proving this is an actual
  // walk, not a coarse-check false positive.
  assert.equal(state.presses.filter((p) => p === "ArrowUp").length, 3);
  assert.ok(state.presses.filter((p) => p === "ArrowDown").length >= 1);
  // The avatar's own y ends back at (or south of) the street y it started
  // from (0) -- the real positional criterion walkBackToStreet checks.
  assert.ok(state.y >= 0);
});

//============================================
test("executeOutfitMule reports a walk stall when the counter is never reached", async () => {
  // Motionless avatar parked at the corral: the horizontal seek can never
  // reach smithore, so the executor must report a walk_stall and never even
  // attempt the north press.
  const state = { x: DOOR_CENTERS.corral, carrying: "unoutfitted", presses: [] };
  const page = movingTownPage(state, 0, () => {});
  const readProjection = async () => ({
    humanMoney: 100,
    state: { phase: { kind: "develop", payload: { carriedMule: state.carrying } } },
  });
  const report = newReport();

  const outfitted = await executeOutfitMule(
    page,
    report,
    { readProjection, verifyPollMs: 0 },
    "smithore",
  );

  assert.equal(outfitted, false);
  assert.deepEqual(state.presses, []);
  assert.equal(report.hasFailed(), true);
  // The seek's walk_stall detail names the door it could not reach.
  const stallLogged = report
    .getLog()
    .some((entry) => entry.message.includes("counter-smithore door"));
  assert.equal(stallLogged, true);
});

//============================================
test("executeGamblePub fails when the confirm affordance never appears", async () => {
  const state = {
    atDoor: "pub",
    carrying: "unoutfitted",
    confirming: "false",
    bannerAmount: null,
    money: 100,
    presses: [],
  };
  // North taps do nothing: the confirm affordance never opens, so the
  // executor must give up rather than press on toward a phantom banner.
  const page = fakePage(state, () => {});
  const readProjection = async () => ({
    humanMoney: state.money,
    state: { phase: { kind: "develop", payload: { carriedMule: state.carrying } } },
  });
  const report = newReport();

  const gambled = await executeGamblePub(page, report, {
    readProjection,
    verifyPollMs: 0,
    verifyBudgetMs: 5,
  });

  assert.equal(gambled, false);
  assert.equal(report.counters.gambles, 0);
});
