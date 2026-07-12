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
import { clickIfPresent, clickRequired } from "./e2e/walkthrough_helpers.mjs";
import { createWalkReport } from "./e2e/walkthrough_report.mjs";

//============================================
// A fake Playwright page: resolves waitForTimeout() immediately, and $()
// resolves every selector to a visible fake element handle whose click()
// records the selector into `clicks` (both clickIfPresent and clickRequired
// click the handle they resolved from $(), not the page, so the fake handle
// -- not page -- is where clicks get recorded; every selector is treated as
// mounted, mirroring the real role/intent/continue buttons being present,
// just conditionally active, rather than only recognizing one selector).
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
    // Defaults to the good's opening tick, before the required role commit
    // has landed; most call sites override this to model the clock advancing
    // after commit (see buildTradingRun's per-state comments).
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
// A trading run: role committed (verified), intent walked up then down, held
// once, then the good finishes with the human three units richer and $30
// poorer, and the phase advances to production after the Continue click.
//
// driveAuction's required, VERIFIED role commit costs one extra
// readProjection call beyond the old 1-read-per-decision model: the entry
// read (round 0, tick 0, pre-commit, role "out") is followed by a dedicated
// commit-verify read (round 1, tick 1 -- the clock advancing past tick 0 is
// exactly the evidence the verify step is proving the commit landed) before
// the main loop resumes its normal one-read-per-decision cadence. Every
// state after that keeps the committed "buyer" role; only tick and the
// price/intent fields move.
function buildTradingRun() {
  const states = [
    auctionState(0), // entry read: pre-commit, tick 0, role "out"
    auctionState(1, {
      payload: {
        tick: 1,
        participants: [{ playerId: 0, role: "buyer", price: 10, intent: "hold" }],
      },
    }), // commit-verify read: tick advanced to 1 -- proves the commit landed
    auctionState(2, {
      payload: {
        tick: 1,
        participants: [{ playerId: 0, role: "buyer", price: 10, intent: "hold" }],
      },
    }), // decision read: round 2 -> intent up
    auctionState(3, {
      payload: {
        tick: 2,
        participants: [{ playerId: 0, role: "buyer", price: 11, intent: "up" }],
      },
    }), // decision read: round 3 -> intent down
    auctionState(4, {
      payload: {
        tick: 3,
        participants: [{ playerId: 0, role: "buyer", price: 10, intent: "down" }],
      },
    }), // decision read: round 4 -> continue (hold)
    auctionState(5, {
      payload: {
        tick: 4,
        finished: true,
        priceFloor: 12,
        priceCeiling: 22,
        participants: [{ playerId: 0, role: "buyer", price: 10, intent: "hold" }],
      },
      human: { id: 0, goods: { food: 5, energy: 0, smithore: 0, crystite: 0 }, money: 70 },
    }),
    {
      round: 6,
      phase: { kind: "production", payload: {} },
      players: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }],
    },
  ];
  // Only the main-loop decision reads reach decideAuctionIntent: round 0 (the
  // pre-commit read, consulted only for its role.kind), round 2 (up), round 3
  // (down), round 4 (continue). Round 1 (the commit-verify read) and round 5
  // (finished) are never decided on.
  const plansByRound = {
    0: { kind: "auction_role", role: "buyer" },
    2: { kind: "auction_intent", direction: "up" },
    3: { kind: "auction_intent", direction: "down" },
    4: { kind: "auction_continue" },
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
  // itself never asks for a role click. The window happens to quiesce
  // straight to finished (a legitimate zero-tick outcome the commit-verify
  // step treats as progress just as validly as a tick advancing).
  const states = [
    auctionState(0, {
      payload: { participants: [{ playerId: 0, role: "seller", price: 10, intent: "hold" }] },
    }), // entry read: pre-commit
    auctionState(1, {
      payload: {
        tick: 1,
        finished: true,
        participants: [{ playerId: 0, role: "seller", price: 10, intent: "hold" }],
      },
    }), // commit-verify read: finished flips true -- proves the commit landed
    auctionState(2, {
      payload: {
        tick: 1,
        finished: true,
        participants: [{ playerId: 0, role: "seller", price: 10, intent: "hold" }],
      },
    }), // decision read: the main loop now observes the finished window itself
    {
      round: 3,
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
  // real unknown_plan_kind report failure). The bad plan is decided on an
  // ALREADY-COMMITTED good: the required role commit only ever sees
  // "auction_role"/other plan kinds via roleToCommit's fallback, so a bad
  // kind must arrive after commit to reach the real unmapped-kind dispatch.
  const states = [
    auctionState(0), // entry read: pre-commit, tick 0
    auctionState(1, {
      payload: { tick: 1, participants: [{ playerId: 0, role: "out", price: 10, intent: "hold" }] },
    }), // commit-verify read: tick advances -- proves the commit landed
    auctionState(2, {
      payload: { tick: 1, participants: [{ playerId: 0, role: "out", price: 10, intent: "hold" }] },
    }), // decision read: already committed, bad plan kind decided here
  ];
  const plansByRound = {
    0: { kind: "auction_continue" },
    2: { kind: "not_a_real_plan_kind" },
  };
  const decideAuctionIntent = (state) => plansByRound[state.round];
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

  // A sit-out run: role stays "out" the whole way, goods and money never
  // move. The window quiesces straight to finished, which the commit-verify
  // step reads as progress just as validly as a tick advancing.
  const sitOutStates = [
    auctionState(0), // entry read: pre-commit
    auctionState(1, {
      payload: {
        tick: 1,
        finished: true,
        participants: [{ playerId: 0, role: "out", price: 10, intent: "hold" }],
      },
    }), // commit-verify read: finished flips true -- proves the commit landed
    auctionState(2, {
      payload: {
        tick: 1,
        finished: true,
        participants: [{ playerId: 0, role: "out", price: 10, intent: "hold" }],
      },
    }), // decision read: the main loop now observes the finished window itself
    {
      round: 3,
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
// The required, verified role commit: two distinguishable failure causes
// (WP-H). "the UI never presented the control" fails fast via
// required_control_missing (see the clickRequired tests below); "the click
// landed but the engine never responded" fails via act_did_not_advance with
// ENGINE EVIDENCE (the actual observed tick/finished state), not a bare
// assertion. The old MAX_TICKS_PER_AUCTION spin is no longer the way a
// stalled commit surfaces -- it now only guards a stall somewhere else in
// the phase, once every good's commit has already succeeded.
//============================================

test("a commit that lands but never unblocks the clock fails fast with engine evidence, not a throw", async () => {
  // The state never changes across any read: the click is verified to land
  // (the fake page resolves every selector as clickable), but tick/finished
  // never move, which is exactly the "click landed, engine stalled" shape
  // the commit-verify step exists to catch and diagnose correctly.
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  const { page } = makeFakePage();
  const stuckState = auctionState(0);
  const readProjection = async () => ({ phaseKind: stuckState.phase.kind, state: stuckState });
  const decideAuctionIntent = () => ({ kind: "auction_continue" });

  // Resolves (does not throw): report.fail already recorded the failure, and
  // driveAuction returns early the same way driveLandGrant/driveLandAuction
  // do on a failed act, trusting the caller's report.hasFailed() check. A
  // short commitVerifyBudgetMs override keeps this test fast without
  // changing what it proves (the fake page's timers are already no-ops; only
  // the real wall-clock budget check gates the loop).
  await driveAuction(page, report, {
    readProjection,
    decideAuctionIntent,
    commitVerifyBudgetMs: 50,
  });

  assert.equal(report.hasFailed(), true);
  const errorEntries = report.getLog().filter((entry) => entry.severity === "error");
  assert.equal(errorEntries.length, 1, "expected exactly one recorded failure");
  assert.match(errorEntries[0].message, /auction clock never advanced/);
  assert.match(errorEntries[0].message, /engine evidence, not a UI defect/);
  // The observed post-click state is embedded in the message, not just
  // asserted -- the whole point of engine evidence over a bare claim.
  assert.match(errorEntries[0].message, /"tick":0/);
  assert.match(errorEntries[0].message, /"finished":false/);
});

test("the tick-ceiling guard still classifies auction_stalled for a stall elsewhere in the phase", async () => {
  // The commit itself succeeds immediately every time (tick keeps advancing
  // on every read, so the verify step never has to wait), but the window
  // never finishes and the good never changes, so only the whole-phase tick
  // ceiling can end this run -- proving MAX_TICKS_PER_AUCTION still catches a
  // genuine non-commit stall rather than being fully retired by the fix.
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  const { page } = makeFakePage();
  let callCount = 0;
  const readProjection = async () => {
    callCount += 1;
    const state = auctionState(callCount, {
      payload: {
        tick: callCount,
        finished: false,
        participants: [{ playerId: 0, role: "buyer", price: 10, intent: "hold" }],
      },
    });
    return { phaseKind: state.phase.kind, state };
  };
  const decideAuctionIntent = () => ({ kind: "auction_continue" });

  await assert.rejects(
    driveAuction(page, report, { readProjection, decideAuctionIntent }),
    /exceeded 4000 ticks without the auction phase ending \(stalled on good "food"\)/,
  );

  assert.equal(report.hasFailed(), true);
});

//============================================
// A mid-window role-change request is a NEUTRAL, best-effort click (WP-H):
// the driver no longer knows or asserts WHERE OR WHEN a screen's role
// control exists past the opening commit. It tries the click regardless of
// tick, and logs once per good for visibility only -- no assumption baked
// in about why a screen might or might not still expose the control.
//============================================

test("a mid-window auction_role plan is a best-effort click, logged once per good", async () => {
  const states = [
    auctionState(0, {
      payload: { tick: 0, participants: [{ playerId: 0, role: "out", price: 10, intent: "hold" }] },
    }), // entry read: pre-commit
    auctionState(1, {
      payload: {
        tick: 1,
        participants: [{ playerId: 0, role: "buyer", price: 10, intent: "hold" }],
      },
    }), // commit-verify read: tick advances -- proves the buyer commit landed
    auctionState(2, {
      payload: {
        tick: 1,
        participants: [{ playerId: 0, role: "buyer", price: 10, intent: "hold" }],
      },
    }), // decision read: already committed; adapter now wants "seller"
    auctionState(3, {
      payload: {
        tick: 2,
        finished: true,
        participants: [{ playerId: 0, role: "seller", price: 10, intent: "hold" }],
      },
    }),
    {
      round: 4,
      phase: { kind: "production", payload: {} },
      players: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }],
    },
  ];
  const plansByRound = {
    0: { kind: "auction_role", role: "buyer" },
    2: { kind: "auction_role", role: "seller" },
  };
  const decideAuctionIntent = (state) => plansByRound[state.round];
  const { page, clicks } = makeFakePage();
  const { report, logs } = makeFakeReport();

  await driveAuction(page, report, {
    readProjection: makeFakeReadProjection(states),
    decideAuctionIntent,
  });

  // Both the opening commit AND the mid-window change fire: the driver tries
  // the click regardless of tick, rather than assuming it is unreachable.
  assert.ok(
    clicks.includes('[data-action="auction-role"][data-role="buyer"]'),
    "expected the opening role commit to fire",
  );
  assert.ok(
    clicks.includes('[data-action="auction-role"][data-role="seller"]'),
    "expected the mid-window role-change click to be attempted",
  );

  const changeEntries = logs.filter((entry) => entry.message === "auction_role_change_requested");
  assert.equal(
    changeEntries.length,
    1,
    "expected exactly one mid-window role-change info per good",
  );
  assert.equal(changeEntries[0].severity, "info");
  assert.equal(changeEntries[0].extra.good, "food");
  assert.equal(changeEntries[0].extra.requestedRole, "seller");
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

//============================================
// clickRequired: the REQUIRED counterpart -- fails fast and loud, never
// silently returns false, and carries rich diagnostics (WP-H).
//============================================

test("clickRequired throws and records required_control_missing when the element is absent", async () => {
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  const page = {
    async $() {
      return null;
    },
    // clickRequired's best-effort failure screenshot must never throw even
    // when the fake page has no screenshot() method; the catch(() => null)
    // contract is exercised implicitly by omitting it here.
  };

  await assert.rejects(
    clickRequired(page, "[data-action=missing]", report, {
      detail: "a required test control",
      extra: { phaseKind: "auction", good: "food", tick: 3 },
    }),
    /clickRequired: the UI did not present a required control "\[data-action=missing\]"/,
  );

  assert.equal(report.hasFailed(), true);
  const errorEntries = report.getLog().filter((entry) => entry.severity === "error");
  assert.equal(errorEntries.length, 1);
  assert.match(errorEntries[0].message, /a required test control/);
  assert.match(errorEntries[0].message, /not that an engine stalled/);
  // The caller's extra diagnostics (phase/good/tick) and the selector both
  // land in the structured extra, not just the free-text message.
  assert.equal(errorEntries[0].extra.selector, "[data-action=missing]");
  assert.equal(errorEntries[0].extra.phaseKind, "auction");
  assert.equal(errorEntries[0].extra.good, "food");
  assert.equal(errorEntries[0].extra.tick, 3);
});

test("clickRequired throws and records required_control_missing when the click itself rejects", async () => {
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

  await assert.rejects(
    clickRequired(page, "[data-action=detaches]", report),
    /clickRequired: required control "\[data-action=detaches\]" was present but the click failed/,
  );

  assert.equal(report.hasFailed(), true);
  const errorEntries = report.getLog().filter((entry) => entry.severity === "error");
  assert.equal(errorEntries.length, 1);
  assert.match(errorEntries[0].message, /element is not attached to the DOM/);
  assert.equal(errorEntries[0].extra.reason, "element is not attached to the DOM");
});

test("clickRequired resolves true and records nothing when the click succeeds", async () => {
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  const clicks = [];
  const page = {
    async $(selector) {
      return {
        isVisible: async () => true,
        async click() {
          clicks.push(selector);
        },
      };
    },
  };

  const result = await clickRequired(page, "[data-action=present]", report);

  assert.equal(result, true);
  assert.deepEqual(clicks, ["[data-action=present]"]);
  assert.equal(report.hasFailed(), false);
  assert.equal(report.getLog().length, 0);
});
