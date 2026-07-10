// Unit test for e2e_walkthrough.mjs's createHumanDevelopTurnCounter: the human
// develop-turn counter must count a completed turn from the observed engine
// phase, so a turn that ends WITHOUT the walker's own end-turn gesture (a
// tick-budget truncation, a gamble, or the engine exhausting the tick budget)
// still counts. This is the regression the counter redesign fixes: the old
// design incremented only on the walker's confirmed end-turn click, so an
// auto-advanced turn was silently dropped and humanTurnsCompleted disagreed
// with the rounds reached at scoring -- flakily, since whether the click or an
// auto-advance won was a wall-clock race.
//
// The counter keys on the develop PHASE leaving, not on the human seat's own
// activePlayerId window, because that window can collapse to nearly zero (seed
// 7: every develop sample showed an AI seat active, never the human). The
// AI-only test below pins that scenario.
//
// Pure Node test: no browser. Feeds hand-built WalkerProjection-shaped
// snapshots (src/ui/walker_debug.ts: only phaseKind is read) straight to
// observe(). Importing e2e_walkthrough.mjs does not launch the harness because
// its main() is guarded to run only on direct execution.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createHumanDevelopTurnCounter } from "../tests/e2e/e2e_walkthrough.mjs";
import { createWalkReport } from "../tests/e2e/walkthrough_report.mjs";

/** Seat 0 is the human; ids 1..3 are AI (matches src/ui/walker_debug.ts). */
const HUMAN_ID = 0;
const AI_ID = 2;

//============================================
/**
 * Build the minimal projection the counter reads. activePlayerId is included
 * for realism but the counter reads only phaseKind.
 *
 * @param phaseKind - The projection's phaseKind.
 * @param activePlayerId - The projection's activePlayerId (or null).
 * @returns A WalkerProjection-shaped stub.
 */
function projection(phaseKind, activePlayerId) {
  return { phaseKind, activePlayerId };
}

//============================================
/**
 * A fresh report and counter pair for one test.
 *
 * @returns `{ report, counter }`.
 */
function freshCounter() {
  const report = createWalkReport({ seed: 1, mode: "beginner", speed: 8 });
  const counter = createHumanDevelopTurnCounter(report);
  return { report, counter };
}

test("counts a develop phase that ends after the walker's end-turn click", () => {
  const { report, counter } = freshCounter();
  // Human held the develop turn, then the click advanced the phase.
  counter.observe(projection("develop", HUMAN_ID));
  counter.observe(projection("production", null));
  assert.equal(report.counters.humanTurnsCompleted, 1);
});

test("counts a develop phase that ends with no end-turn gesture (auto-advance)", () => {
  const { report, counter } = freshCounter();
  // The engine exhausts the tick budget mid-plan: several develop samples, then
  // the phase advances to production with NO end-turn click ever observed. The
  // old click-gated counter dropped this; the phase-leave counter must count it.
  counter.observe(projection("develop", HUMAN_ID));
  counter.observe(projection("develop", HUMAN_ID));
  counter.observe(projection("production", null));
  assert.equal(report.counters.humanTurnsCompleted, 1);
});

test("counts a develop phase where only AI seats were ever observed active", () => {
  const { report, counter } = freshCounter();
  // The seed-7 regression: an AI seat leads the develop queue and the human's
  // active window collapses to nearly zero, so every observed develop sample
  // shows an AI active and the human is never caught holding the turn. The
  // human still completed a develop turn that round, so the phase leaving
  // develop must count it -- an activePlayerId-edge counter would report 0.
  counter.observe(projection("develop", AI_ID));
  counter.observe(projection("develop", AI_ID));
  counter.observe(projection("production", null));
  assert.equal(report.counters.humanTurnsCompleted, 1);
});

test("counts exactly one per round across a full run driven by non-click endings", () => {
  const { report, counter } = freshCounter();
  // Six develop phases interleaved with other phases, each ending by a
  // non-click route: assert the count equals the rounds reached.
  for (let round = 1; round <= 6; round += 1) {
    counter.observe(projection("land_grant", HUMAN_ID)); // not develop
    counter.observe(projection("develop", AI_ID)); // an AI leads the queue
    counter.observe(projection("develop", HUMAN_ID)); // human's turn
    counter.observe(projection("production", null)); // develop phase ends
    counter.observe(projection("auction", null)); // still not develop
  }
  assert.equal(report.counters.humanTurnsCompleted, 6);
});

test("does not double-count repeated samples within or after one develop phase", () => {
  const { report, counter } = freshCounter();
  counter.observe(projection("develop", HUMAN_ID));
  counter.observe(projection("develop", HUMAN_ID));
  counter.observe(projection("auction", null));
  counter.observe(projection("auction", null));
  counter.observe(projection("scoring", null));
  assert.equal(report.counters.humanTurnsCompleted, 1);
});

test("does not count when a develop phase is never observed", () => {
  const { report, counter } = freshCounter();
  counter.observe(projection("land_grant", HUMAN_ID));
  counter.observe(projection("production", null));
  counter.observe(projection("auction", null));
  assert.equal(report.counters.humanTurnsCompleted, 0);
});
