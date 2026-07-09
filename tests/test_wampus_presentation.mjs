// Node unit tests for the wampus presentation timing buffer
// (wampus_presentation.ts). Run via check_codebase.sh:
// node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  initialWampusPresentation,
  stepWampusPresentation,
  WAMPUS_MIN_VISIBLE_MS,
} from "../src/ui/scenes/wampus_presentation.ts";

function wampus(overrides = {}) {
  return {
    row: null,
    col: null,
    visible: false,
    dead: false,
    caught: false,
    moneyReward: 100,
    blinkTicks: 0,
    blinksRemainingAtSite: 0,
    mountains: [],
    tick: 0,
    events: [],
    ...overrides,
  };
}

test("initialWampusPresentation starts hidden with no prior event", () => {
  const state = initialWampusPresentation();
  assert.equal(state.visible, false);
  assert.equal(state.row, null);
  assert.equal(state.lastEventTick, null);
});

test("stepWampusPresentation shows the sprite the instant a spawn event appears", () => {
  const prev = initialWampusPresentation();
  const w = wampus({
    row: 2,
    col: 5,
    visible: true,
    events: [{ tick: 3, kind: "spawn", row: 2, col: 5 }],
  });
  const next = stepWampusPresentation(prev, w, 16);
  assert.equal(next.visible, true);
  assert.deepEqual({ row: next.row, col: next.col }, { row: 2, col: 5 });
  assert.equal(next.lastEventTick, 3);
  assert.equal(next.elapsedSinceEventMs, 0);
});

test("stepWampusPresentation holds visible through the engine's 1-tick window", () => {
  let state = initialWampusPresentation();
  const spawnEvent = { tick: 3, kind: "spawn", row: 2, col: 5 };
  // Frame 1: the spawn tick, engine visible.
  state = stepWampusPresentation(state, wampus({ visible: true, events: [spawnEvent] }), 16);
  assert.equal(state.visible, true);
  // Frame 2: engine already flipped back to hidden one tick later, but the
  // buffer has not elapsed yet -- still shows.
  state = stepWampusPresentation(state, wampus({ visible: false, events: [spawnEvent] }), 200);
  assert.equal(state.visible, true);
});

test("stepWampusPresentation falls through to the live engine flag once the buffer elapses", () => {
  let state = initialWampusPresentation();
  const spawnEvent = { tick: 3, kind: "spawn", row: 2, col: 5 };
  state = stepWampusPresentation(state, wampus({ visible: true, events: [spawnEvent] }), 0);
  // Advance real time past the minimum-visible window with the engine now hidden.
  state = stepWampusPresentation(
    state,
    wampus({ visible: false, events: [spawnEvent] }),
    WAMPUS_MIN_VISIBLE_MS + 50,
  );
  assert.equal(state.visible, false);
});

test("stepWampusPresentation re-arms the buffer on a later blink event at the same site", () => {
  let state = initialWampusPresentation();
  const spawnEvent = { tick: 3, kind: "spawn", row: 2, col: 5 };
  state = stepWampusPresentation(state, wampus({ visible: true, events: [spawnEvent] }), 0);
  state = stepWampusPresentation(
    state,
    wampus({ visible: false, events: [spawnEvent] }),
    WAMPUS_MIN_VISIBLE_MS + 50,
  );
  assert.equal(state.visible, false);

  const blinkEvent = { tick: 8, kind: "blink", row: 2, col: 5 };
  state = stepWampusPresentation(
    state,
    wampus({ visible: true, events: [spawnEvent, blinkEvent] }),
    16,
  );
  assert.equal(state.visible, true);
  assert.equal(state.lastEventTick, 8);
});

test("stepWampusPresentation hides immediately once the wampus is dead", () => {
  let state = initialWampusPresentation();
  const spawnEvent = { tick: 3, kind: "spawn", row: 2, col: 5 };
  state = stepWampusPresentation(state, wampus({ visible: true, events: [spawnEvent] }), 0);
  const catchEvent = { tick: 4, kind: "catch", row: 2, col: 5, playerId: 0 };
  state = stepWampusPresentation(
    state,
    wampus({ visible: false, dead: true, caught: true, events: [spawnEvent, catchEvent] }),
    16,
  );
  assert.equal(state.visible, false);
});

test("a catch event alone (no spawn/blink) does not re-trigger the appearance buffer", () => {
  let state = initialWampusPresentation();
  const spawnEvent = { tick: 3, kind: "spawn", row: 2, col: 5 };
  state = stepWampusPresentation(state, wampus({ visible: true, events: [spawnEvent] }), 0);
  state = stepWampusPresentation(
    state,
    wampus({ visible: false, events: [spawnEvent] }),
    WAMPUS_MIN_VISIBLE_MS + 50,
  );
  assert.equal(state.visible, false);
  const catchEvent = { tick: 4, kind: "catch", row: 2, col: 5, playerId: 0 };
  state = stepWampusPresentation(
    state,
    wampus({ visible: false, dead: true, caught: true, events: [spawnEvent, catchEvent] }),
    16,
  );
  assert.equal(state.visible, false);
  assert.equal(state.lastEventTick, 3);
});
