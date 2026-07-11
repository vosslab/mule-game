// Fake-page unit tests for the mode-composed town commerce drivers in
// tests/e2e/walkthrough_town.mjs. These cover the pure storefront resolution
// (plan/resource -> composed facade, discovered from the composed street) and
// the executor verify paths (corral buy via data-carrying, outfit via the
// projection carriedMule, pub gamble via the payout banner + money delta and its
// counters.gambles increment, assay-absent skip) without launching a browser: a
// fake "page" supplies just the handful of methods each executor touches
// (page.$, page.keyboard.down/up/press, page.waitForTimeout).
//
// Door centers, the street lane, and facade presence all come from the SAME
// composeTownStreetForMode the production scene and executors use (src/ui/scenes/
// town_world.ts), so the fakes never hardcode geometry: a fake avatar is placed
// at a composed door's world x, and the executor discovers that same center by
// composing the street from the fake projection's mode. Walking into a door is
// an ArrowUp tap crossing the entry line (which opens the door's panel with no
// side effect); the fakes model that tap's up() as the panel-open trigger. The
// real browser walk (x-seek convergence at the shipped speed) is exercised
// separately by the seed-33 live runner.

import assert from "node:assert/strict";
import { test } from "node:test";

import { composeTownStreetForMode, facadeById } from "../src/ui/scenes/town_world.ts";
import { TOWN_AVATAR, TOWN_DOOR_ALIGN_TOLERANCE_PX } from "./e2e/walkthrough_helpers.mjs";
import { createWalkReport } from "./e2e/walkthrough_report.mjs";
import {
  resolveStorefront,
  facadeOfferingResource,
  executeBuyMule,
  executeOutfitMule,
  executeGamblePub,
  executeArmAssay,
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
 * @param attrs - `() => Record<string, string | null>` supplier read fresh each
 *   getAttribute so a test can mutate state between reads.
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
 * Build a fake Playwright page over a small mutable town state. The avatar's
 * world position lives in state.x/state.y (data-town-avatar-x/-y). Horizontal
 * taps move x by `state.pxPerMs * lastTapMs` (0 = the avatar is already aligned,
 * so the x-seek lands in zero taps); an ArrowUp tap's up() runs
 * onAction("ArrowUp"), the walk-in that opens a door's panel; ArrowDown taps
 * move y south for the walk-back; keyboard.press runs onAction for the Enter /
 * Space / Escape confirms and dismisses. Panels, the gamble-confirm flag, the
 * door-state marker (always "open"), and the pub banner all resolve off state.
 *
 * @param state - Mutable state the handles and onAction read/write.
 * @param onAction - `(key) => void` applied on a completed ArrowUp tap or an
 *   explicit key press.
 * @returns A fake page object.
 */
function makeTownPage(state, onAction) {
  state.held = null;
  state.lastTapMs = 0;
  state.pxPerMs = state.pxPerMs ?? 0;
  state.pxPerMsY = state.pxPerMsY ?? 0;
  state.panels = state.panels ?? {};
  state.presses = state.presses ?? [];
  return {
    async $(selector) {
      if (selector === "#town-scene") {
        return fakeHandle(() => ({ "data-gamble-confirming": state.confirming ?? "false" }));
      }
      if (selector === TOWN_AVATAR) {
        return fakeHandle(() => ({
          "data-town-avatar-x": String(Math.round(state.x)),
          "data-town-avatar-y": String(Math.round(state.y)),
          "data-carrying": state.carrying,
          transform: `translate(${state.x} ${state.y})`,
        }));
      }
      if (selector === "[data-pub-banner]") {
        if (state.bannerAmount === undefined || state.bannerAmount === null) {
          return null;
        }
        return fakeHandle(() => ({ "data-pub-banner-amount": String(state.bannerAmount) }));
      }
      if (selector === "[data-corral-panel]") {
        return state.panels.corral
          ? fakeHandle(() => ({ "data-corral-outcome": state.corralOutcome }))
          : null;
      }
      if (selector === "[data-outfit-panel]") {
        return state.panels.outfit
          ? fakeHandle(() => ({ "data-outfit-outcome": state.outfitOutcome }))
          : null;
      }
      if (selector === "[data-assay-panel]") {
        return state.panels.assay
          ? fakeHandle(() => ({ "data-assay-outcome": state.assayOutcome }))
          : null;
      }
      if (/^\[data-door-for='.+'\]$/.test(selector)) {
        return fakeHandle(() => ({ "data-door-state": "open" }));
      }
      return null;
    },
    keyboard: {
      async down(key) {
        state.held = key;
      },
      async up(key) {
        if (state.held === "ArrowRight") {
          state.x += state.pxPerMs * state.lastTapMs;
        } else if (state.held === "ArrowLeft") {
          state.x -= state.pxPerMs * state.lastTapMs;
        } else if (key === "ArrowUp") {
          state.y -= state.pxPerMsY * state.lastTapMs;
          state.presses.push("ArrowUp");
          onAction("ArrowUp");
        } else if (key === "ArrowDown") {
          state.y += state.pxPerMsY * state.lastTapMs;
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
/**
 * A projection reader over the mutable state, reflecting the active mode (so the
 * executor composes the right street), the human's money, and the develop
 * payload's carriedMule.
 *
 * @param state - The mutable town state.
 * @returns An async readProjection compatible with the executors.
 */
function projectionReaderFor(state) {
  return async () => ({
    humanMoney: state.money ?? 0,
    state: {
      mode: state.mode,
      phase: { kind: "develop", payload: { carriedMule: state.carrying } },
    },
  });
}

//============================================
test("resolveStorefront routes fixed plans to their storefront and outfit plans by resource", () => {
  const beginner = composeTownStreetForMode("beginner");
  assert.equal(resolveStorefront(beginner, { kind: "buy_mule" }).id, "corral");
  assert.equal(resolveStorefront(beginner, { kind: "gamble_pub" }).id, "pub");
  // smithore is offered by the mining facade; food by farm; energy by energy.
  assert.equal(
    resolveStorefront(beginner, { kind: "outfit_mule", resource: "smithore" }).id,
    "mining",
  );
  assert.equal(resolveStorefront(beginner, { kind: "outfit_mule", resource: "food" }).id, "farm");
  assert.equal(
    resolveStorefront(beginner, { kind: "outfit_mule", resource: "energy" }).id,
    "energy",
  );
});

//============================================
test("resolveStorefront returns null for a facade the composed street omits", () => {
  const beginner = composeTownStreetForMode("beginner");
  // crystite is offered by no beginner facade (mining offers only smithore in
  // the current modes), so an outfit_mule for it resolves to null (skip).
  assert.equal(resolveStorefront(beginner, { kind: "outfit_mule", resource: "crystite" }), null);
});

//============================================
test("resolveStorefront throws on a plan kind with no town storefront", () => {
  const beginner = composeTownStreetForMode("beginner");
  assert.throws(() => resolveStorefront(beginner, { kind: "place_mule" }), /no town storefront/);
});

//============================================
test("facadeOfferingResource finds the composed outfitter for each offered resource", () => {
  const standard = composeTownStreetForMode("standard");
  assert.equal(facadeOfferingResource(standard, "smithore").id, "mining");
  assert.equal(facadeOfferingResource(standard, "energy").id, "energy");
  assert.equal(facadeOfferingResource(standard, "food").id, "farm");
  assert.equal(facadeOfferingResource(standard, "crystite"), null);
});

//============================================
test("executeBuyMule opens the purchase panel, confirms via Enter, and dismisses via Escape", async () => {
  const street = composeTownStreetForMode("beginner");
  const corral = facadeById(street, "corral");
  const state = {
    mode: "beginner",
    x: corral.doorCenterX,
    y: street.streetLaneY,
    carrying: "none",
    corralOutcome: "buyable",
    presses: [],
  };
  // Walking into the corral doorway opens the purchase panel (WP-4A/4B); Enter
  // (Buy is auto-focused) flips the towed-M.U.L.E. state off "none"; Escape
  // dismisses the panel via bindKeys' document-level Escape listener.
  const page = makeTownPage(state, (key) => {
    if (key === "ArrowUp") {
      state.panels.corral = true;
    } else if (key === "Enter") {
      state.carrying = "unoutfitted";
    } else if (key === "Escape") {
      state.panels.corral = false;
    }
  });
  const report = newReport();

  const bought = await executeBuyMule(page, report, {
    readProjection: projectionReaderFor(state),
    verifyPollMs: 0,
  });

  assert.equal(bought, true);
  assert.equal(report.hasFailed(), false);
  // One north tap opens the panel, Enter confirms the buy, Escape dismisses.
  assert.deepEqual(state.presses, ["ArrowUp", "Enter", "Escape"]);
});

//============================================
test("executeBuyMule dismisses and fails the plan on a non-buyable outcome", async () => {
  const street = composeTownStreetForMode("beginner");
  const corral = facadeById(street, "corral");
  const state = {
    mode: "beginner",
    x: corral.doorCenterX,
    y: street.streetLaneY,
    carrying: "unoutfitted",
    // Already carrying a M.U.L.E.: the panel opens straight to the "carrying"
    // outcome with no Buy action available.
    corralOutcome: "carrying",
    presses: [],
  };
  const page = makeTownPage(state, (key) => {
    if (key === "ArrowUp") {
      state.panels.corral = true;
    } else if (key === "Escape") {
      state.panels.corral = false;
    }
  });
  const report = newReport();

  const bought = await executeBuyMule(page, report, {
    readProjection: projectionReaderFor(state),
    verifyPollMs: 0,
  });

  assert.equal(bought, false);
  assert.equal(report.hasFailed(), true);
  const lastEntry = report.getLog().at(-1);
  assert.equal(lastEntry.severity, "error");
  assert.match(lastEntry.message, /non-buyable/);
  // One north tap opens the panel, then Escape dismisses it immediately -- no
  // Enter, since there is no Buy action to confirm.
  assert.deepEqual(state.presses, ["ArrowUp", "Escape"]);
});

//============================================
test("executeOutfitMule confirms in the panel and verifies via the projection carriedMule", async () => {
  const street = composeTownStreetForMode("beginner");
  const energy = facadeById(street, "energy");
  const state = {
    mode: "beginner",
    x: energy.doorCenterX,
    y: street.streetLaneY,
    carrying: "unoutfitted",
    outfitOutcome: "buyable",
    money: 100,
    presses: [],
  };
  // Walking into the energy outfitter opens the outfit panel; Enter (the
  // resource's confirm is auto-focused) outfits the carried M.U.L.E.; Escape
  // dismisses.
  const page = makeTownPage(state, (key) => {
    if (key === "ArrowUp") {
      state.panels.outfit = true;
    } else if (key === "Enter") {
      state.carrying = "energy";
    } else if (key === "Escape") {
      state.panels.outfit = false;
    }
  });
  const report = newReport();

  const outfitted = await executeOutfitMule(
    page,
    report,
    { readProjection: projectionReaderFor(state), verifyPollMs: 0 },
    "energy",
  );

  assert.equal(outfitted, true);
  assert.equal(report.hasFailed(), false);
  assert.deepEqual(state.presses, ["ArrowUp", "Enter", "Escape"]);
});

//============================================
test("executeOutfitMule seeks a moving avatar across the street to the right outfitter", async () => {
  // The avatar spawns at the corral and must walk left to the farm counter
  // (NES order: mining, energy, farm, corral, pub). The gap-proportional x-seek
  // must converge on the farm door center before the walk-in.
  const street = composeTownStreetForMode("beginner");
  const corral = facadeById(street, "corral");
  const farm = facadeById(street, "farm");
  const state = {
    mode: "beginner",
    x: corral.doorCenterX,
    y: street.streetLaneY,
    carrying: "unoutfitted",
    outfitOutcome: "buyable",
    money: 100,
    // Move ~1 world px per real ms of held key, so gap-proportional taps
    // converge monotonically on the target door center.
    pxPerMs: 1,
    presses: [],
  };
  const page = makeTownPage(state, (key) => {
    if (key === "ArrowUp") {
      state.panels.outfit = true;
    } else if (key === "Enter") {
      state.carrying = "food";
    } else if (key === "Escape") {
      state.panels.outfit = false;
    }
  });
  const report = newReport();

  const outfitted = await executeOutfitMule(
    page,
    report,
    { readProjection: projectionReaderFor(state), verifyPollMs: 0 },
    "food",
  );

  assert.equal(outfitted, true);
  assert.equal(report.hasFailed(), false);
  // The seek landed the avatar within the door-entry window of the farm center.
  assert.ok(Math.abs(state.x - farm.doorCenterX) <= TOWN_DOOR_ALIGN_TOLERANCE_PX);
  // The walk-in opened the panel; Enter confirmed; Escape dismissed.
  assert.deepEqual(
    state.presses.filter((p) => p !== "ArrowLeft" && p !== "ArrowRight"),
    ["ArrowUp", "Enter", "Escape"],
  );
});

//============================================
test("executeOutfitMule skips (no fail) when no composed facade offers the resource", async () => {
  const street = composeTownStreetForMode("beginner");
  const corral = facadeById(street, "corral");
  const state = {
    mode: "beginner",
    x: corral.doorCenterX,
    y: street.streetLaneY,
    carrying: "unoutfitted",
    money: 100,
    presses: [],
  };
  const page = makeTownPage(state, () => {});
  const report = newReport();

  // crystite is offered by no beginner facade, so the errand is skipped.
  const outfitted = await executeOutfitMule(
    page,
    report,
    { readProjection: projectionReaderFor(state), verifyPollMs: 0 },
    "crystite",
  );

  assert.equal(outfitted, false);
  assert.equal(report.hasFailed(), false);
  assert.deepEqual(state.presses, []);
});

//============================================
test("executeGamblePub confirms, verifies the payout, and increments counters.gambles", async () => {
  const moneyBefore = 100;
  const payout = 50;
  const street = composeTownStreetForMode("beginner");
  const pub = facadeById(street, "pub");
  const state = {
    mode: "beginner",
    x: pub.doorCenterX,
    y: street.streetLaneY,
    carrying: "unoutfitted",
    confirming: "false",
    money: moneyBefore,
    presses: [],
  };
  // Walking into the pub doorway opens the confirm prompt; the following Space
  // press confirms: the banner appears with the payout and money grows by it.
  const page = makeTownPage(state, (key) => {
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
  const report = newReport();

  const gambled = await executeGamblePub(page, report, {
    readProjection: projectionReaderFor(state),
    verifyPollMs: 0,
  });

  assert.equal(gambled, true);
  // One north tap opens the confirm, then one Space press confirms it.
  assert.deepEqual(state.presses, ["ArrowUp", "Space"]);
  // A completed gamble bumps the gambles counter exactly once.
  assert.equal(report.counters.gambles, 1);
});

//============================================
test("executeGamblePub fails when the confirm affordance never appears", async () => {
  const street = composeTownStreetForMode("beginner");
  const pub = facadeById(street, "pub");
  const state = {
    mode: "beginner",
    x: pub.doorCenterX,
    y: street.streetLaneY,
    carrying: "unoutfitted",
    confirming: "false",
    money: 100,
    presses: [],
  };
  // North taps do nothing: the confirm prompt never opens, so the executor must
  // give up rather than press on toward a phantom banner.
  const page = makeTownPage(state, () => {});
  const report = newReport();

  const gambled = await executeGamblePub(page, report, {
    readProjection: projectionReaderFor(state),
    verifyPollMs: 0,
    verifyBudgetMs: 5,
  });

  assert.equal(gambled, false);
  assert.equal(report.counters.gambles, 0);
});

//============================================
test("executeArmAssay skips (no fail) when the mode composes no assay office", async () => {
  // Neither beginner nor standard composes an assay office, so the arm is
  // skipped gracefully rather than failing the run.
  const street = composeTownStreetForMode("standard");
  const corral = facadeById(street, "corral");
  const state = {
    mode: "standard",
    x: corral.doorCenterX,
    y: street.streetLaneY,
    carrying: "none",
    presses: [],
  };
  const page = makeTownPage(state, () => {});
  const report = newReport();

  const armed = await executeArmAssay(page, report, {
    readProjection: projectionReaderFor(state),
    verifyPollMs: 0,
  });

  assert.equal(armed, false);
  assert.equal(report.hasFailed(), false);
  assert.deepEqual(state.presses, []);
});
