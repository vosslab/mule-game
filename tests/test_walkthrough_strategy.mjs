// Node unit tests for the walkthrough strategy adapter's marshalling seam
// (tests/e2e/walkthrough_strategy.mjs).
//
// Proves the two properties every later walker package leans on:
//   1. The walker projection JSON-round-trips losslessly into engine types.
//      The test drives the real engine reducer to genuine mid-game states,
//      serializes each through the EXPORTED projection builder the browser
//      installs (buildWalkerProjection -- one code path, no test-only shape),
//      transports it exactly as Playwright's page.evaluate would
//      (JSON.parse(JSON.stringify(...))), marshals it back, and asserts the
//      reducer produces byte-identical next states from the original and the
//      marshalled copy. Reducer-equality after one step is stronger than a bare
//      deep-equal: it proves the marshalled object is a valid reducer INPUT,
//      not merely a look-alike.
//   2. structuredClone/JSON plain data is sufficient input for the whole AI
//      surface: every src/ai decide function the balance sim imports runs
//      without error on the marshalled copy at a phase where it applies.
//
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyAction } from "../src/engine/game_state.ts";
import { createInitialGameState } from "../src/engine/turn.ts";
import { decideLandGrantAction, decideLandAuctionAction } from "../src/ai/land_ai.ts";
import { decideDevelopAction } from "../src/ai/develop_ai.ts";
import { decideAuctionActions } from "../src/ai/auction_ai.ts";
import { buildWalkerProjection } from "../src/ui/walker_debug.ts";
import {
  marshalProjection,
  decideLandGrant,
  decideLandAuction,
  decideDevelopPlan,
  decideAuctionIntent,
  PLAN_KINDS,
} from "./e2e/walkthrough_strategy.mjs";

// Standard mode over a fixed seed so the drive reaches every target phase
// (land grant, colony land auction, develop, goods auction) deterministically.
// Seed 1000 matches the balance sim's seed base; the value is not asserted on.
const SEED = 1000;
const MODE = "standard";

// The four phases whose states the marshalling seam must carry, each paired
// with the decide function the balance sim calls at that phase. Land-auction
// and goods-auction deciders return Action|null (a player with nothing to do
// sits out); land-grant and develop always return an Action.
const TARGET_PHASES = ["land_grant", "land_auction", "develop", "auction"];

// Watchdog: fail loud instead of hanging if the drive never reaches a phase.
const WATCHDOG_LIMIT = 200000;

//============================================
// Drive one all-AI game forward from the start, capturing the FIRST engine
// state seen at each target phase. Mirrors the balance sim's reducer loop
// (tests/e2e/e2e_balance_sim.mjs) so the captured states are real mid-game
// snapshots, not hand-built fixtures. Returns a map phaseKind -> GameState.
function captureTargetPhaseStates() {
  const captured = {};
  let state = applyAction(createInitialGameState(SEED, MODE), { type: "start_game" });
  let steps = 0;
  while (Object.keys(captured).length < TARGET_PHASES.length) {
    steps += 1;
    if (steps > WATCHDOG_LIMIT) {
      throw new Error(`captureTargetPhaseStates: watchdog hit before capturing all phases`);
    }
    const phase = state.phase;
    // Record the first state seen at each target phase.
    if (TARGET_PHASES.includes(phase.kind) && captured[phase.kind] === undefined) {
      captured[phase.kind] = state;
    }
    // Advance exactly as the balance sim does, so the drive terminates.
    if (phase.kind === "land_grant") {
      const picker = phase.payload.pickOrder[phase.payload.pickIndex];
      state = applyAction(state, decideLandGrantAction(state, picker));
    } else if (phase.kind === "land_auction") {
      if (phase.payload.finished) {
        state = applyAction(state, { type: "end_land_auction" });
      } else {
        for (let playerId = 0; playerId < 4; playerId += 1) {
          const action = decideLandAuctionAction(state, playerId);
          if (action !== null) {
            state = applyAction(state, action);
          }
        }
        state = applyAction(state, { type: "tick" });
      }
    } else if (phase.kind === "develop") {
      const active = phase.payload.activePlayer;
      state = applyAction(state, decideDevelopAction(state, active));
      if (state.phase.kind === "develop" && state.phase.payload.activePlayer === active) {
        state = applyAction(state, { type: "tick" });
      }
    } else if (phase.kind === "production") {
      state = applyAction(state, { type: "tick" });
    } else if (phase.kind === "auction") {
      if (phase.payload.finished) {
        state = applyAction(state, { type: "end_auction" });
      } else {
        for (let playerId = 0; playerId < 4; playerId += 1) {
          const action = decideAuctionActions(state, playerId);
          if (action !== null) {
            state = applyAction(state, action);
          }
        }
        state = applyAction(state, { type: "tick" });
      }
    } else {
      throw new Error(`captureTargetPhaseStates: unexpected phase ${phase.kind}`);
    }
  }
  return captured;
}

//============================================
// Transport an engine state through the exact browser path: build the frozen
// projection the page installs, then JSON-round-trip it the way page.evaluate
// serializes its return value, then marshal it back to a GameState.
function roundTripThroughProjection(state) {
  const projection = buildWalkerProjection(state);
  const transported = JSON.parse(JSON.stringify(projection));
  return marshalProjection(transported);
}

//============================================
// A single reducer step that is valid for the given phase, so both the
// original and the marshalled copy can be advanced identically. Land grant has
// no plain clock tick, so it steps by the AI's own land-grant decision; the
// timer-driven phases step by `tick`.
function reducerStepFor(state) {
  const phase = state.phase;
  if (phase.kind === "land_grant") {
    const picker = phase.payload.pickOrder[phase.payload.pickIndex];
    return decideLandGrantAction(state, picker);
  }
  return { type: "tick" };
}

//============================================
// The decide function and player id the balance sim uses at each phase, so the
// AI-surface test calls each imported decider exactly where it applies.
function decideAtPhase(state) {
  const phase = state.phase;
  if (phase.kind === "land_grant") {
    const picker = phase.payload.pickOrder[phase.payload.pickIndex];
    return decideLandGrantAction(state, picker);
  }
  if (phase.kind === "land_auction") {
    return decideLandAuctionAction(state, 0);
  }
  if (phase.kind === "develop") {
    return decideDevelopAction(state, phase.payload.activePlayer);
  }
  if (phase.kind === "auction") {
    return decideAuctionActions(state, 0);
  }
  throw new Error(`decideAtPhase: no decider for phase ${phase.kind}`);
}

//============================================
// Drive the same all-AI game forward and capture the FIRST state where seat 0
// is the actor at land grant (its own pick) and at develop (its own active
// turn), so the wrapper tests exercise seat 0's real decision branch rather
// than the out-of-turn pass/end_turn guards. Uses the same advancement rules as
// captureTargetPhaseStates so the drive terminates.
function captureSeat0ActorStates() {
  const captured = {};
  let state = applyAction(createInitialGameState(SEED, MODE), { type: "start_game" });
  let steps = 0;
  while (captured.land_grant === undefined || captured.develop === undefined) {
    steps += 1;
    if (steps > WATCHDOG_LIMIT) {
      throw new Error(`captureSeat0ActorStates: watchdog hit before seat 0 acted at both phases`);
    }
    const phase = state.phase;
    if (phase.kind === "land_grant") {
      const picker = phase.payload.pickOrder[phase.payload.pickIndex];
      if (picker === 0 && captured.land_grant === undefined) {
        captured.land_grant = state;
      }
      state = applyAction(state, decideLandGrantAction(state, picker));
    } else if (phase.kind === "land_auction") {
      if (phase.payload.finished) {
        state = applyAction(state, { type: "end_land_auction" });
      } else {
        for (let playerId = 0; playerId < 4; playerId += 1) {
          const action = decideLandAuctionAction(state, playerId);
          if (action !== null) {
            state = applyAction(state, action);
          }
        }
        state = applyAction(state, { type: "tick" });
      }
    } else if (phase.kind === "develop") {
      const active = phase.payload.activePlayer;
      if (active === 0 && captured.develop === undefined) {
        captured.develop = state;
      }
      state = applyAction(state, decideDevelopAction(state, active));
      if (state.phase.kind === "develop" && state.phase.payload.activePlayer === active) {
        state = applyAction(state, { type: "tick" });
      }
    } else if (phase.kind === "production") {
      state = applyAction(state, { type: "tick" });
    } else if (phase.kind === "auction") {
      if (phase.payload.finished) {
        state = applyAction(state, { type: "end_auction" });
      } else {
        for (let playerId = 0; playerId < 4; playerId += 1) {
          const action = decideAuctionActions(state, playerId);
          if (action !== null) {
            state = applyAction(state, action);
          }
        }
        state = applyAction(state, { type: "tick" });
      }
    } else {
      throw new Error(`captureSeat0ActorStates: unexpected phase ${phase.kind}`);
    }
  }
  return captured;
}

//============================================
// Drive a full all-AI game to the scoring phase, capturing the state at the
// FIRST tick of every good-window seat 0 has a participant entry for (the
// window's auto-assigned entry state, before any role/intent decision has
// been applied to it). Used to pin the role-equivalence premise across many
// real windows rather than the single auction state captureTargetPhaseStates
// stops at.
function captureAuctionEntryStates() {
  const entries = [];
  let state = applyAction(createInitialGameState(SEED, MODE), { type: "start_game" });
  let steps = 0;
  let lastGoodSeen = null;
  while (state.phase.kind !== "scoring") {
    steps += 1;
    if (steps > WATCHDOG_LIMIT) {
      throw new Error("captureAuctionEntryStates: watchdog hit before reaching scoring");
    }
    const phase = state.phase;
    if (phase.kind === "land_grant") {
      const picker = phase.payload.pickOrder[phase.payload.pickIndex];
      state = applyAction(state, decideLandGrantAction(state, picker));
    } else if (phase.kind === "land_auction") {
      if (phase.payload.finished) {
        state = applyAction(state, { type: "end_land_auction" });
      } else {
        for (let playerId = 0; playerId < 4; playerId += 1) {
          const action = decideLandAuctionAction(state, playerId);
          if (action !== null) {
            state = applyAction(state, action);
          }
        }
        state = applyAction(state, { type: "tick" });
      }
    } else if (phase.kind === "develop") {
      const active = phase.payload.activePlayer;
      state = applyAction(state, decideDevelopAction(state, active));
      if (state.phase.kind === "develop" && state.phase.payload.activePlayer === active) {
        state = applyAction(state, { type: "tick" });
      }
    } else if (phase.kind === "production") {
      state = applyAction(state, { type: "tick" });
    } else if (phase.kind === "auction") {
      if (phase.payload.good !== lastGoodSeen) {
        lastGoodSeen = phase.payload.good;
        if (findParticipantForTest(phase.payload, 0) !== null) {
          entries.push(state);
        }
      }
      if (phase.payload.finished) {
        state = applyAction(state, { type: "end_auction" });
        lastGoodSeen = null;
      } else {
        for (let playerId = 0; playerId < 4; playerId += 1) {
          const action = decideAuctionActions(state, playerId);
          if (action !== null) {
            state = applyAction(state, action);
          }
        }
        state = applyAction(state, { type: "tick" });
      }
    } else if (phase.kind === "scoring") {
      break;
    } else {
      throw new Error(`captureAuctionEntryStates: unexpected phase ${phase.kind}`);
    }
  }
  return entries;
}

//============================================
// Seat 0's participant entry, or null if it has none this window (mirrors
// walkthrough_auction.mjs's findHumanRole lookup, kept local to this test
// file so this test does not depend on the browser-driver module).
function findParticipantForTest(payload, playerId) {
  const participant = payload.participants.find((entry) => entry.playerId === playerId);
  return participant === undefined ? null : participant;
}

const CAPTURED = captureTargetPhaseStates();
const SEAT0 = captureSeat0ActorStates();

// ============================================================
// Marshalling: lossless JSON round-trip into engine types
// ============================================================

test("every target phase is reached and captured", () => {
  for (const phaseKind of TARGET_PHASES) {
    assert.ok(CAPTURED[phaseKind] !== undefined, `expected to capture a ${phaseKind} state`);
    assert.equal(CAPTURED[phaseKind].phase.kind, phaseKind);
  }
});

test("marshalled copy deep-equals the original state (no field lost in transport)", () => {
  for (const phaseKind of TARGET_PHASES) {
    const original = CAPTURED[phaseKind];
    const marshalled = roundTripThroughProjection(original);
    // deepStrictEqual catches any own-key dropped or retyped by the JSON
    // transport (undefined keys, NaN/Infinity, non-plain values). A pass here
    // is the direct proof that GameState is lossless plain data.
    assert.deepStrictEqual(marshalled, original);
  }
});

test("reducer produces identical next states from original and marshalled copy", () => {
  for (const phaseKind of TARGET_PHASES) {
    const original = CAPTURED[phaseKind];
    const marshalled = roundTripThroughProjection(original);
    const step = reducerStepFor(original);
    // The reducer is a pure function of (state, action); identical outputs
    // prove the marshalled copy is a valid reducer INPUT, not just a look-alike.
    assert.deepStrictEqual(applyAction(marshalled, step), applyAction(original, step));
  }
});

// ============================================================
// AI surface: structuredClone/JSON data feeds every decide function
// ============================================================

test("every imported src/ai decide function runs on the marshalled copy", () => {
  for (const phaseKind of TARGET_PHASES) {
    const marshalled = roundTripThroughProjection(CAPTURED[phaseKind]);
    let result;
    assert.doesNotThrow(() => {
      result = decideAtPhase(marshalled);
    }, `decider for ${phaseKind} threw on the marshalled copy`);
    // land_grant/develop always decide an action; land_auction/auction may
    // return null (sit out). Either way the return must be null or an Action
    // object carrying a string `type`.
    if (result !== null) {
      assert.equal(typeof result, "object", `${phaseKind} decider returned a non-object`);
      assert.equal(typeof result.type, "string", `${phaseKind} decision lacks a string type`);
    }
  }
});

// ============================================================
// Decision wrappers: seat-0 gesture plans
// ============================================================

// Which seat-0 adapter acts at each captured phase, so one loop can assert
// every adapter yields a well-formed, in-vocabulary plan on a real state.
const ADAPTER_BY_PHASE = {
  land_grant: decideLandGrant,
  land_auction: decideLandAuction,
  develop: decideDevelopPlan,
  auction: decideAuctionIntent,
};

// Independent copy of the module's decision-to-gesture mapping for develop, so
// the test verifies the wrapper's kind mapping rather than trusting it.
const DEVELOP_PLAN_KIND_BY_ACTION = {
  hunt_wampus: "hunt_wampus",
  assay_plot: "assay_plot",
  buy_mule: "buy_mule",
  outfit_mule: "outfit_mule",
  place_mule: "place_mule",
  gamble: "gamble_pub",
  end_turn: "end_turn",
};

test("PLAN_KINDS is a frozen, duplicate-free vocabulary of plan kinds", () => {
  assert.ok(Array.isArray(PLAN_KINDS), "PLAN_KINDS should be an array");
  assert.ok(Object.isFrozen(PLAN_KINDS), "PLAN_KINDS should be frozen");
  for (const kind of PLAN_KINDS) {
    assert.equal(typeof kind, "string", `plan kind ${String(kind)} should be a string`);
  }
  assert.equal(new Set(PLAN_KINDS).size, PLAN_KINDS.length, "PLAN_KINDS should have no duplicates");
});

test("each seat-0 adapter returns an in-vocabulary plan at its phase", () => {
  for (const [phaseKind, adapter] of Object.entries(ADAPTER_BY_PHASE)) {
    const plan = adapter(CAPTURED[phaseKind]);
    assert.notEqual(plan, null, `${phaseKind} adapter returned null`);
    assert.equal(typeof plan, "object", `${phaseKind} adapter returned a non-object`);
    assert.equal(typeof plan.kind, "string", `${phaseKind} plan lacks a string kind`);
    assert.ok(
      PLAN_KINDS.includes(plan.kind),
      `${phaseKind} plan kind ${plan.kind} not in PLAN_KINDS`,
    );
  }
});

test("land-grant adapter mirrors the AI action for seat 0", () => {
  const state = SEAT0.land_grant;
  const action = decideLandGrantAction(state, 0);
  const plan = decideLandGrant(state);
  if (action.type === "claim_plot") {
    assert.equal(plan.kind, "claim_plot");
    assert.equal(plan.row, action.row);
    assert.equal(plan.col, action.col);
    // The plan must name a genuinely claimable target: unowned and not the town.
    const plot = state.plots[plan.row][plan.col];
    assert.equal(plot.owner, null, "claimed plot should be unowned");
    assert.notEqual(plot.terrain, "town", "claimed plot should not be the town");
  } else {
    assert.equal(action.type, "pass");
    assert.equal(plan.kind, "pass_land_grant");
  }
});

test("develop adapter mirrors the AI action for seat 0", () => {
  const state = SEAT0.develop;
  const action = decideDevelopAction(state, 0);
  const plan = decideDevelopPlan(state);
  // Kind maps exactly as the independent table expects.
  assert.equal(
    plan.kind,
    DEVELOP_PLAN_KIND_BY_ACTION[action.type],
    `unexpected kind for ${action.type}`,
  );
  // Every field the engine action carries survives into the plan.
  if (action.type === "assay_plot" || action.type === "place_mule") {
    assert.equal(plan.row, action.row);
    assert.equal(plan.col, action.col);
  }
  if (action.type === "outfit_mule") {
    assert.equal(plan.resource, action.resource);
  }
  // Free scouting/hunting gestures are flagged opportunistic.
  if (action.type === "hunt_wampus" || action.type === "assay_plot") {
    assert.equal(plan.opportunistic, true, "scouting/hunting gestures are opportunistic");
  }
});

test("land-auction adapter mirrors the AI action for seat 0", () => {
  const state = CAPTURED.land_auction;
  const action = decideLandAuctionAction(state, 0);
  const plan = decideLandAuction(state);
  if (action === null) {
    assert.equal(plan.kind, "pass_land_auction");
  } else {
    assert.equal(action.type, "bid_land");
    assert.equal(plan.kind, "bid_land");
  }
});

test("goods-auction adapter mirrors the AI action for seat 0", () => {
  const state = CAPTURED.auction;
  const action = decideAuctionActions(state, 0);
  const plan = decideAuctionIntent(state);
  if (action === null) {
    assert.equal(plan.kind, "auction_continue");
  } else if (action.type === "set_auction_role") {
    assert.equal(plan.kind, "auction_role");
    assert.equal(plan.role, action.role);
  } else {
    assert.equal(action.type, "set_auction_intent");
    assert.equal(plan.kind, "auction_intent");
    assert.equal(plan.direction, action.intent);
  }
});

// walkthrough_auction.mjs's driver commits the engine's auto-assigned role
// whenever the adapter emits no auction_role plan, on the documented premise
// that decideAuctionIntent only returns an "auction_role" plan when seat 0's
// AI-desired role DISAGREES with the role the engine auto-assigned at window
// entry (src/engine/auction.ts's initialRole). This pins that premise across
// every good-window entry seat 0 sees over a whole real game, deriving both
// sides honestly from decideAuctionActions itself (the AI action returns
// "set_auction_role" precisely when its internally desired role differs from
// the participant's current -- here auto-assigned, undecided-yet -- role; see
// its doc comment), so a future change to either side's role logic that
// breaks the premise fails this test rather than silently mis-committing
// gestures in the walker.
test("adapter returns auction_role iff the AI's desired role disagrees with auto-assignment", () => {
  const entries = captureAuctionEntryStates();
  // Coverage check: the premise is only meaningfully pinned if the drive
  // produced at least one agreeing and one disagreeing window; a vacuous
  // pass (all one branch) would hide a broken assertion.
  let agreeCount = 0;
  let disagreeCount = 0;

  for (const state of entries) {
    const autoAssignedRole = findParticipantForTest(state.phase.payload, 0).role;
    const action = decideAuctionActions(state, 0);
    const plan = decideAuctionIntent(state);
    const aiDisagrees = action !== null && action.type === "set_auction_role";

    assert.equal(
      plan.kind === "auction_role",
      aiDisagrees,
      `seat 0 auto-assigned role "${autoAssignedRole}": plan.kind ${plan.kind} should reflect ` +
        `whether the AI disagrees with auto-assignment`,
    );
    if (aiDisagrees) {
      disagreeCount += 1;
      // The plan's role is exactly the AI's desired role, not merely "some
      // role", so the driver's eventual commit click targets the right button.
      assert.equal(plan.role, action.role);
      assert.notEqual(
        action.role,
        autoAssignedRole,
        "a disagreeing decision must actually name a different role",
      );
    } else {
      agreeCount += 1;
    }
  }

  assert.ok(entries.length > 0, "expected at least one captured auction entry state");
  assert.ok(agreeCount > 0, "expected at least one entry where the AI agrees with auto-assignment");
  assert.ok(
    disagreeCount > 0,
    "expected at least one entry where the AI disagrees with auto-assignment",
  );
});
