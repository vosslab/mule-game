// Fake-page unit tests for the town commerce drivers in
// tests/e2e/walkthrough_town.mjs. These cover the pure door mapping
// (plan-kind -> door, outfit-resource -> counter door) and the three executor
// verify paths (corral buy via data-carrying, counter outfit via the
// projection carriedMule, pub gamble via the payout banner + money delta and
// its counters.gambles increment) without launching a browser: a fake "page"
// supplies just the handful of methods each executor touches (page.$,
// page.keyboard.press, page.waitForTimeout). The real browser walk is
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
 * Build a fake Playwright page over a small mutable town state. `$` resolves
 * the town-scene container, the town avatar, and the pub banner from that
 * state; `keyboard.press` mutates it through the supplied `onPress` reducer;
 * `waitForTimeout` is instant.
 *
 * @param state - Mutable state object the handles and onPress read/write.
 * @param onPress - `(key) => void` applied on each keyboard.press.
 * @returns A fake page object.
 */
function fakePage(state, onPress) {
  return {
    async $(selector) {
      if (selector === "#town-scene") {
        return fakeHandle(() => ({ "data-gamble-confirming": state.confirming }));
      }
      if (selector === TOWN_AVATAR) {
        return fakeHandle(() => ({
          "data-at-door": state.atDoor,
          "data-carrying": state.carrying,
        }));
      }
      if (selector === "[data-pub-banner]") {
        if (state.bannerAmount === null) {
          return null;
        }
        return fakeHandle(() => ({ "data-pub-banner-amount": String(state.bannerAmount) }));
      }
      return null;
    },
    keyboard: {
      async press(key) {
        state.presses.push(key);
        onPress(key);
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
 * Build a fake town page whose avatar walks the street: each seek tap advances
 * it `pxPerMs * ms` in the held direction and data-at-door tracks the pixel
 * column, while `keyboard.press` runs the supplied action reducer. This drives
 * a commerce executor end to end through the real walkTownAvatarToDoor seek.
 *
 * @param state - Mutable `{ x, carrying, presses }` town state.
 * @param pxPerMs - Pixels per real-ms of held key (0 = motionless).
 * @param onPress - `(key) => void` applied on each keyboard.press.
 * @returns A fake page object.
 */
function movingTownPage(state, pxPerMs, onPress) {
  state.held = null;
  state.lastTapMs = 0;
  return {
    async $(selector) {
      if (selector === "#town-scene") {
        return fakeHandle(() => ({ "data-gamble-confirming": "false" }));
      }
      if (selector === TOWN_AVATAR) {
        return fakeHandle(() => ({
          transform: `translate(${state.x} 0)`,
          "data-at-door": doorAtX(state.x),
          "data-carrying": state.carrying,
        }));
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
      async up() {
        if (state.held === "ArrowRight") {
          state.x += pxPerMs * state.lastTapMs;
        } else if (state.held === "ArrowLeft") {
          state.x -= pxPerMs * state.lastTapMs;
        }
        state.held = null;
      },
      async press(key) {
        state.presses.push(key);
        onPress(key);
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
test("executeBuyMule verifies the corral buy through data-carrying", async () => {
  const state = {
    atDoor: "corral",
    carrying: "none",
    confirming: "false",
    bannerAmount: null,
    presses: [],
  };
  // The corral action flips the towed-M.U.L.E. state off "none".
  const page = fakePage(state, (key) => {
    if (key === "Space") {
      state.carrying = "unoutfitted";
    }
  });
  const report = newReport();

  const bought = await executeBuyMule(page, report, { verifyPollMs: 0 });

  assert.equal(bought, true);
  assert.deepEqual(state.presses, ["Space"]);
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
  // The counter action outfits the carried M.U.L.E. for the resource.
  const page = fakePage(state, (key) => {
    if (key === "Space") {
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
  assert.deepEqual(state.presses, ["Space"]);
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
  // First Space opens the confirm affordance; the second confirms: the banner
  // appears with the payout and the human's money grows by that amount.
  const page = fakePage(state, (key) => {
    if (key !== "Space") {
      return;
    }
    if (state.confirming === "false" && state.bannerAmount === null) {
      state.confirming = "true";
      return;
    }
    state.confirming = "false";
    state.bannerAmount = payout;
    state.money += payout;
  });
  const readProjection = async () => ({
    humanMoney: state.money,
    state: { phase: { kind: "develop", payload: { carriedMule: state.carrying } } },
  });
  const report = newReport();

  const gambled = await executeGamblePub(page, report, { readProjection, verifyPollMs: 0 });

  assert.equal(gambled, true);
  // Exactly two action presses: open the confirm, then confirm.
  assert.deepEqual(state.presses, ["Space", "Space"]);
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
    if (key === "Space") {
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
  assert.deepEqual(state.presses, ["Space"]);
});

//============================================
test("executeOutfitMule reports a walk stall when the counter is never reached", async () => {
  // Motionless avatar parked at the corral: the seek can never reach smithore,
  // so the executor must report a walk_stall and never press the action key.
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
  // Action presses do nothing: the confirm affordance never opens, so the
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
