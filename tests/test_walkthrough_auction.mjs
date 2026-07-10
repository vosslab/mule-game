// Node unit tests for the goods-auction walkthrough driver
// (tests/e2e/walkthrough_auction.mjs).
//
// Drives driveAuction() with a fake page (records clicks, no real browser or
// timers) and a fake strategy (a script indexed by state.round, standing in
// for the real seat-0 adapter), so the tests prove the driver's own gesture
// and bookkeeping logic without needing playwright-core or the real engine.
//
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { driveAuction } from "./e2e/walkthrough_auction.mjs";
import { clickIfPresent } from "./e2e/walkthrough_helpers.mjs";
import { createWalkReport } from "./e2e/walkthrough_report.mjs";

//============================================
// A fake Playwright page: resolves waitForTimeout() immediately, and $()
// resolves every selector to a visible fake element handle whose click()
// records the selector into `clicks` (clickIfPresent clicks the handle it
// resolved from $(), not the page, so the fake handle -- not page -- is
// where clicks get recorded; every selector is treated as mounted, mirroring
// the real role/intent/continue buttons being present, just conditionally
// active, rather than only recognizing one selector).
function makeFakePage() {
  const clicks = [];
  const page = {
    async waitForTimeout() {
      // No real delay; the fake states advance one per readProjection call.
    },
    async $(selector) {
      return {
        isVisible: async () => true,
        async click() {
          clicks.push(selector);
        },
      };
    },
  };
  return { page, clicks };
}

//============================================
// A fake read-projection function that returns each entry of `states` in
// order, one per call, then throws if driveAuction ever asks for more than
// were scripted (a driver bug, not an expected test outcome).
function makeFakeReadProjection(states) {
  let index = 0;
  return async () => {
    if (index >= states.length) {
      throw new Error("makeFakeReadProjection: driveAuction asked for more states than scripted");
    }
    const state = states[index];
    index += 1;
    return { phaseKind: state.phase.kind, state };
  };
}

//============================================
// A minimal fake report exposing only what driveAuction touches: log() and
// counters.trades.
function makeFakeReport() {
  const logs = [];
  return {
    report: {
      log(severity, message, extra) {
        logs.push({ severity, message, extra });
      },
      counters: { trades: 0 },
    },
    logs,
  };
}

//============================================
// Build one auction-phase GameState for round `round`. `overrides` merges
// onto the payload/player fields that change tick to tick (finished,
// participants, priceFloor/priceCeiling, player goods/money).
function auctionState(round, overrides = {}) {
  const payload = {
    good: "food",
    // Defaults to the good's opening tick; the auction_role tick-0 gate
    // tests below override this to exercise later ticks.
    tick: 0,
    finished: false,
    priceFloor: 10,
    priceCeiling: 20,
    participants: [{ playerId: 0, role: "out", price: 10, intent: "hold" }],
    ...overrides.payload,
  };
  const humanPlayer = {
    id: 0,
    goods: { food: 2, energy: 0, smithore: 0, crystite: 0 },
    money: 100,
    ...overrides.human,
  };
  return {
    round,
    phase: { kind: "auction", payload },
    players: [humanPlayer, { id: 1 }, { id: 2 }, { id: 3 }],
  };
}

//============================================
// A trading run: role chosen, intent walked up then down, held once, then
// the good finishes with the human three units richer and $30 poorer, and
// the phase advances to production after the Continue click.
function buildTradingRun() {
  const states = [
    auctionState(0), // entry snapshot: role "out", goods=2, money=100
    auctionState(1, {
      payload: { participants: [{ playerId: 0, role: "buyer", price: 10, intent: "hold" }] },
    }),
    auctionState(2, {
      payload: { participants: [{ playerId: 0, role: "buyer", price: 11, intent: "up" }] },
    }),
    auctionState(3, {
      payload: { participants: [{ playerId: 0, role: "buyer", price: 10, intent: "down" }] },
    }),
    auctionState(4, {
      payload: {
        finished: true,
        priceFloor: 12,
        priceCeiling: 22,
        participants: [{ playerId: 0, role: "buyer", price: 10, intent: "hold" }],
      },
      human: { id: 0, goods: { food: 5, energy: 0, smithore: 0, crystite: 0 }, money: 70 },
    }),
    {
      round: 5,
      phase: { kind: "production", payload: {} },
      players: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }],
    },
  ];
  // Plans are read only on the not-finished states (indices 0-3); index 4 is
  // finished (no decision call) and index 5 exits the loop before deciding.
  const plansByRound = {
    0: { kind: "auction_role", role: "buyer" },
    1: { kind: "auction_intent", direction: "up" },
    2: { kind: "auction_intent", direction: "down" },
    3: { kind: "auction_continue" },
  };
  const decideAuctionIntent = (state) => plansByRound[state.round];
  return { states, decideAuctionIntent };
}

test("role click matches the decided role via the data-role selector", async () => {
  const { states, decideAuctionIntent } = buildTradingRun();
  const { page, clicks } = makeFakePage();
  const { report } = makeFakeReport();

  await driveAuction(page, report, {
    readProjection: makeFakeReadProjection(states),
    decideAuctionIntent,
  });

  assert.ok(
    clicks.includes('[data-action="auction-role"][data-role="buyer"]'),
    "expected a role click matching the decided buyer role",
  );
});

test("intent clicks follow the decided directions and stop once Continue is clicked", async () => {
  const { states, decideAuctionIntent } = buildTradingRun();
  const { page, clicks } = makeFakePage();
  const { report } = makeFakeReport();

  await driveAuction(page, report, {
    readProjection: makeFakeReadProjection(states),
    decideAuctionIntent,
  });

  const upIndex = clicks.indexOf('[data-action="auction-intent-up"]');
  const downIndex = clicks.indexOf('[data-action="auction-intent-down"]');
  const continueIndex = clicks.indexOf('[data-action="auction-continue"]');
  assert.ok(upIndex >= 0, "expected an intent-up click");
  assert.ok(downIndex >= 0, "expected an intent-down click");
  assert.ok(continueIndex >= 0, "expected a Continue click once finished");
  assert.ok(upIndex < downIndex, "up should click before down (decided order)");
  assert.ok(downIndex < continueIndex, "intent clicks should happen before Continue");
  // Continue is the very last click: the phase advances to production right
  // after, and driveAuction returns without deciding or clicking again.
  assert.equal(clicks.at(-1), '[data-action="auction-continue"]');
});

test("outcome tuple is recorded with the correct role and deltas", async () => {
  const { states, decideAuctionIntent } = buildTradingRun();
  const { page } = makeFakePage();
  const { report, logs } = makeFakeReport();

  await driveAuction(page, report, {
    readProjection: makeFakeReadProjection(states),
    decideAuctionIntent,
  });

  const outcomeEntries = logs.filter((entry) => entry.message === "auction_outcome");
  assert.equal(
    outcomeEntries.length,
    1,
    "expected exactly one recorded outcome for the one good played",
  );
  const tuple = outcomeEntries[0].extra;
  assert.equal(tuple.role, "buyer");
  assert.equal(tuple.aiTargetPrice, null);
  assert.equal(tuple.priceBefore, 15); // midpoint of the entry-tick 10/20 band
  assert.equal(tuple.priceAfter, 17); // midpoint of the finished-tick 12/22 band
  assert.equal(tuple.humanGoodsDelta, 3); // 5 - 2
  assert.equal(tuple.humanMoneyDelta, -30); // 70 - 100
  // buildTradingRun applies one intent-up and one intent-down plan.
  assert.equal(tuple.intentsPushed, 2);
});

test("continue on an uncommitted good still clicks the assigned role button once", async () => {
  // decideAuctionIntent returns "auction_continue" from the very first tick,
  // as it does whenever the auto-assigned role already matches the AI's
  // desired role. A real human still must click a role button before the
  // engine's clock starts (scene_manager.ts's isAuctionTickable), so the
  // driver must commit the ASSIGNED role explicitly even though the plan
  // itself never asks for a role click.
  const states = [
    auctionState(0, {
      payload: { participants: [{ playerId: 0, role: "seller", price: 10, intent: "hold" }] },
    }),
    auctionState(1, {
      payload: {
        finished: true,
        participants: [{ playerId: 0, role: "seller", price: 10, intent: "hold" }],
      },
    }),
    {
      round: 2,
      phase: { kind: "production", payload: {} },
      players: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }],
    },
  ];
  const decideAuctionIntent = () => ({ kind: "auction_continue" });
  const { page, clicks } = makeFakePage();
  const { report } = makeFakeReport();

  await driveAuction(page, report, {
    readProjection: makeFakeReadProjection(states),
    decideAuctionIntent,
  });

  const roleClicks = clicks.filter((selector) => selector.includes("auction-role"));
  assert.deepEqual(
    roleClicks,
    ['[data-action="auction-role"][data-role="seller"]'],
    "expected exactly one commit click for the already-assigned seller role",
  );
});

test("the role commit click fires once per good, not on every tick", async () => {
  // The intent-only run below spends three not-finished ticks on the same
  // good (intent up, intent down, hold) before finishing. Only the first
  // tick should click a role button; the later intent-only ticks must not
  // re-click it.
  const { states, decideAuctionIntent } = buildTradingRun();
  const { page, clicks } = makeFakePage();
  const { report } = makeFakeReport();

  await driveAuction(page, report, {
    readProjection: makeFakeReadProjection(states),
    decideAuctionIntent,
  });

  const roleClicks = clicks.filter((selector) => selector.includes("auction-role"));
  assert.equal(
    roleClicks.length,
    1,
    "expected exactly one role-commit click across the whole good",
  );
});

test("an unmapped plan kind throws the shared unexpected-plan-kind error", async () => {
  // A fabricated kind outside PLAN_KINDS must fail loud so a coverage gap
  // surfaces instead of silently no-opping (walkthrough_exec.mjs's
  // UNEXPECTED_PLAN_KIND_PATTERN reclassifies this exact throw shape into a
  // real unknown_plan_kind report failure).
  const states = [auctionState(0)];
  const decideAuctionIntent = () => ({ kind: "not_a_real_plan_kind" });
  const { page } = makeFakePage();
  const { report } = makeFakeReport();

  await assert.rejects(
    driveAuction(page, report, {
      readProjection: makeFakeReadProjection(states),
      decideAuctionIntent,
    }),
    /driveAuction: unexpected plan kind "not_a_real_plan_kind"/,
  );
});

test("trades counter increments only when the human's goods actually moved", async () => {
  const trading = buildTradingRun();
  const { page: tradingPage } = makeFakePage();
  const { report: tradingReport } = makeFakeReport();
  await driveAuction(tradingPage, tradingReport, {
    readProjection: makeFakeReadProjection(trading.states),
    decideAuctionIntent: trading.decideAuctionIntent,
  });
  assert.equal(tradingReport.counters.trades, 1, "a nonzero goods delta should count as one trade");

  // A sit-out run: role stays "out" the whole way, goods and money never move.
  const sitOutStates = [
    auctionState(0),
    auctionState(1, {
      payload: {
        finished: true,
        participants: [{ playerId: 0, role: "out", price: 10, intent: "hold" }],
      },
    }),
    {
      round: 2,
      phase: { kind: "production", payload: {} },
      players: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }],
    },
  ];
  const sitOutPlansByRound = { 0: { kind: "auction_continue" } };
  const { page: sitOutPage } = makeFakePage();
  const { report: sitOutReport } = makeFakeReport();
  await driveAuction(sitOutPage, sitOutReport, {
    readProjection: makeFakeReadProjection(sitOutStates),
    decideAuctionIntent: (state) => sitOutPlansByRound[state.round],
  });
  assert.equal(sitOutReport.counters.trades, 0, "a zero goods delta should not count as a trade");
});

//============================================
// The tick-ceiling guard: report.fail classification before the throw
//============================================

test("the tick-ceiling guard classifies auction_stalled before throwing", async () => {
  // A good that never finishes (payload.finished stays false forever) and a
  // strategy that never asks for a role/intent click, so driveAuction spins
  // until MAX_TICKS_PER_AUCTION is exceeded.
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  const { page } = makeFakePage();
  const stuckState = auctionState(0);
  const readProjection = async () => ({ phaseKind: stuckState.phase.kind, state: stuckState });
  const decideAuctionIntent = () => ({ kind: "auction_continue" });

  await assert.rejects(
    driveAuction(page, report, { readProjection, decideAuctionIntent }),
    /exceeded 4000 ticks without the auction phase ending \(stalled on good "food"\)/,
  );

  assert.equal(report.hasFailed(), true);
});

//============================================
// The tick-0 gate: an "auction_role" plan proposed after the good's opening
// tick cannot be expressed by the UI (the role buttons only render at
// payload.tick === 0), so the driver must no-op the click and log an info
// once per good instead of attempting a click on a vanished selector.
//============================================

test("an auction_role plan after tick 0 is not clicked and logs one info", async () => {
  // Tick 0: the adapter wants "buyer" and the engine's auto-assigned role is
  // "out", so this role click is legitimate (the UI still renders the role
  // buttons) and should fire as normal. Tick 1: holdings have shifted (the
  // participant's role is already "buyer", mirroring the tick-0 click having
  // landed) and the adapter now wants "seller" -- a role change the UI can no
  // longer express, since the role buttons unmount after tick 0.
  const states = [
    auctionState(0, {
      payload: { tick: 0, participants: [{ playerId: 0, role: "out", price: 10, intent: "hold" }] },
    }),
    auctionState(1, {
      payload: {
        tick: 1,
        participants: [{ playerId: 0, role: "buyer", price: 10, intent: "hold" }],
      },
    }),
    auctionState(2, {
      payload: {
        tick: 2,
        finished: true,
        participants: [{ playerId: 0, role: "buyer", price: 10, intent: "hold" }],
      },
    }),
    {
      round: 3,
      phase: { kind: "production", payload: {} },
      players: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }],
    },
  ];
  const plansByRound = {
    0: { kind: "auction_role", role: "buyer" },
    1: { kind: "auction_role", role: "seller" },
  };
  const decideAuctionIntent = (state) => plansByRound[state.round];
  const { page, clicks } = makeFakePage();
  const { report, logs } = makeFakeReport();

  await driveAuction(page, report, {
    readProjection: makeFakeReadProjection(states),
    decideAuctionIntent,
  });

  // The tick-0 buyer click is legitimate and fires; the tick-1 seller click
  // is gated and never fires.
  assert.ok(
    clicks.includes('[data-action="auction-role"][data-role="buyer"]'),
    "expected the tick-0 role click to still fire",
  );
  const sellerRoleClicks = clicks.filter((selector) => selector.includes('data-role="seller"'));
  assert.equal(sellerRoleClicks.length, 0, "expected no click for the UI-unreachable role change");

  const deferredEntries = logs.filter((entry) => entry.message === "auction_role_deferred");
  assert.equal(deferredEntries.length, 1, "expected exactly one deferred-role info per good");
  assert.equal(deferredEntries[0].severity, "info");
  assert.equal(deferredEntries[0].extra.good, "food");
  assert.equal(deferredEntries[0].extra.requestedRole, "seller");
});

test("an auction_role plan at tick 0 is still clicked as before", async () => {
  const { states, decideAuctionIntent } = buildTradingRun();
  const { page, clicks } = makeFakePage();
  const { report, logs } = makeFakeReport();

  await driveAuction(page, report, {
    readProjection: makeFakeReadProjection(states),
    decideAuctionIntent,
  });

  assert.ok(
    clicks.includes('[data-action="auction-role"][data-role="buyer"]'),
    "expected the tick-0 role click to still fire",
  );
  const deferredEntries = logs.filter((entry) => entry.message === "auction_role_deferred");
  assert.equal(deferredEntries.length, 0, "no deferred-role info expected when tick 0 handles it");
});

//============================================
// clickIfPresent: the shared "safe to miss" click helper
//============================================

test("clickIfPresent returns false without logging when the element is absent", async () => {
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  const page = {
    async $() {
      return null;
    },
  };

  const result = await clickIfPresent(page, "[data-action=missing]", report);

  assert.equal(result, false);
  assert.equal(report.getLog().length, 0);
});

test("clickIfPresent clicks the resolved handle (bounded by a timeout option) and returns true", async () => {
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  const clicks = [];
  const clickOptions = [];
  const page = {
    async $(selector) {
      return {
        isVisible: async () => true,
        async click(options) {
          clicks.push(selector);
          clickOptions.push(options);
        },
      };
    },
  };

  const result = await clickIfPresent(page, "[data-action=present]", report);

  assert.equal(result, true);
  assert.deepEqual(clicks, ["[data-action=present]"]);
  // A bounded timeout is passed so a click on a control that vanishes right
  // after the presence check fails fast instead of hanging on Playwright's
  // default ~30s actionability wait (the seed 7 stuck-auction root cause).
  assert.equal(typeof clickOptions[0].timeout, "number");
  assert.ok(clickOptions[0].timeout < 30_000, "expected a short, explicit click timeout");
  assert.equal(report.getLog().length, 0);
});

test("clickIfPresent logs a warn and returns false when the click itself rejects", async () => {
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  const page = {
    async $() {
      return {
        isVisible: async () => true,
        async click() {
          throw new Error("element is not attached to the DOM");
        },
      };
    },
  };

  const result = await clickIfPresent(page, "[data-action=detaches]", report);

  assert.equal(result, false);
  const warnEntries = report.getLog().filter((entry) => entry.severity === "warn");
  assert.equal(warnEntries.length, 1);
  assert.match(
    warnEntries[0].message,
    /clickIfPresent: click failed on "\[data-action=detaches\]"/,
  );
  assert.equal(warnEntries[0].extra.selector, "[data-action=detaches]");
});

test("clickIfPresent returns false without clicking when the handle is present but not visible", async () => {
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  let clickCalled = false;
  const page = {
    async $() {
      return {
        isVisible: async () => false,
        async click() {
          clickCalled = true;
        },
      };
    },
  };

  const result = await clickIfPresent(page, "[data-action=hidden]", report);

  assert.equal(result, false);
  assert.equal(clickCalled, false);
  assert.equal(report.getLog().length, 0);
});
