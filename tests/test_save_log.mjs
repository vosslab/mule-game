// Unit tests for the autosave persistence and action-log replay module
// (src/ui/save_log.ts). Runs in node through tsx, so there is no real
// localStorage: each test installs a fresh in-memory fake on globalThis before
// exercising the storage helpers, which read `localStorage` lazily at call time.
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BUILD_VERSION,
  SAVE_STORAGE_KEY,
  buildSpeciesTuple,
  clearSave,
  initialStateFromSave,
  isResumable,
  loadSavedGame,
  replayToState,
  writeSave,
} from "../src/ui/save_log.ts";
import { SPECIES } from "../src/engine/player.ts";
import { REPLAY_FIXTURE } from "../src/ui/scenes/replay_fixture.ts";

// A minimal in-memory Storage stand-in backed by a Map.
function installFakeStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
  return map;
}

// A small valid save for round-trip tests: an empty action log is a legal
// (freshly started) game.
function sampleSave() {
  return {
    buildVersion: BUILD_VERSION,
    seed: 123,
    mode: "beginner",
    species: SPECIES[0],
    relaxedTimer: false,
    speed: 4,
    actions: [],
  };
}

test("writeSave then loadSavedGame round-trips a save", () => {
  installFakeStorage();
  const save = sampleSave();
  writeSave(save);
  const loaded = loadSavedGame();
  assert.deepEqual(loaded, save);
});

test("loadSavedGame returns null when the slot is empty", () => {
  installFakeStorage();
  assert.equal(loadSavedGame(), null);
});

test("clearSave empties the slot", () => {
  installFakeStorage();
  writeSave(sampleSave());
  clearSave();
  assert.equal(loadSavedGame(), null);
});

test("loadSavedGame returns null on corrupt stored JSON", () => {
  const map = installFakeStorage();
  map.set(SAVE_STORAGE_KEY, "{ not json");
  assert.equal(loadSavedGame(), null);
});

test("loadSavedGame returns null on a wrong-shape stored object", () => {
  const map = installFakeStorage();
  map.set(SAVE_STORAGE_KEY, JSON.stringify({ seed: 1 }));
  assert.equal(loadSavedGame(), null);
});

test("isResumable is true for the running build and false for another", () => {
  const save = sampleSave();
  assert.equal(isResumable(save), true);
  assert.equal(isResumable({ ...save, buildVersion: `${BUILD_VERSION}-other` }), false);
});

test("buildSpeciesTuple puts the human species first and derives the AI slots", () => {
  const tuple = buildSpeciesTuple(SPECIES[3]);
  assert.equal(tuple.length, 4);
  assert.equal(tuple[0], SPECIES[3]);
  assert.equal(tuple[1], SPECIES[1]);
  assert.equal(tuple[2], SPECIES[2]);
  assert.equal(tuple[3], SPECIES[3]);
});

test("initialStateFromSave opens at land grant, round 1, on the save's seed", () => {
  const save = { ...sampleSave(), seed: 777 };
  const state = initialStateFromSave(save);
  assert.equal(state.phase.kind, "land_grant");
  assert.equal(state.round, 1);
  assert.equal(state.seed, 777);
});

test("replayToState on the committed fixture reaches the scoring phase", () => {
  const state = replayToState(REPLAY_FIXTURE);
  assert.equal(state.phase.kind, "scoring");
  assert.equal(state.round, 6);
});

test("two replays of the fixture produce deep-equal final states", () => {
  const first = replayToState(REPLAY_FIXTURE);
  const second = replayToState(REPLAY_FIXTURE);
  assert.deepEqual(first, second);
});
