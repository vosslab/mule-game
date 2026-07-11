// Node unit tests for the pure town interaction helpers (town_interaction.ts).
// Run via check_codebase.sh: node --import tsx --test tests/test_*.mjs
//
// Every function under test is a plain function of its arguments (no signals,
// no DOM); the module's own header docstring calls this out as designed for
// isolated testing. Fixtures come from composeTownStreetForMode, the same
// real, deterministic composition town_world.ts's own tests fixture against,
// so a threshold or door-center point here always matches the geometry these
// helpers actually run on.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  doorSetsEqual,
  endpointToTownExit,
  movementPhaseAt,
  movementDoorEqual,
  streetSideOfDoor,
} from "../src/ui/scenes/town_interaction.ts";
import {
  composeTownStreetForMode,
  facadeById,
  TOWN_THRESHOLD_DEPTH,
} from "../src/ui/scenes/town_world.ts";
import { townDoorAtThreshold } from "../src/ui/scenes/town_collision.ts";

const STREET = composeTownStreetForMode("beginner");
const CORRAL = facadeById(STREET, "corral");
const PUB = facadeById(STREET, "pub");

//============================================
// doorSetsEqual: pure set-membership comparison.
//============================================

test("doorSetsEqual is true for distinct Set instances with the same members", () => {
  assert.equal(doorSetsEqual(new Set(["corral", "pub"]), new Set(["pub", "corral"])), true);
});

test("doorSetsEqual is false when sizes differ", () => {
  assert.equal(doorSetsEqual(new Set(["corral"]), new Set(["corral", "pub"])), false);
});

test("doorSetsEqual is false when sizes match but membership differs", () => {
  assert.equal(doorSetsEqual(new Set(["corral"]), new Set(["pub"])), false);
});

//============================================
// endpointToTownExit: fixed left/right -> west/east mapping.
//============================================

test("endpointToTownExit maps left to west and right to east", () => {
  assert.equal(endpointToTownExit("left"), "west");
  assert.equal(endpointToTownExit("right"), "east");
});

//============================================
// movementPhaseAt: derives the movement phase from position and open doors.
//============================================

test("movementPhaseAt returns street when no door is open and the avatar is on the lane", () => {
  const state = movementPhaseAt(STREET, STREET.spawn, new Set());
  assert.deepEqual(state, { phase: "street" });
});

test("movementPhaseAt returns door-opening for the nearest open door, street-side", () => {
  const nearOpenDoor = { x: CORRAL.doorCenterX, y: STREET.streetLaneY };
  const state = movementPhaseAt(STREET, nearOpenDoor, new Set([CORRAL.id]));
  assert.deepEqual(state, { phase: "door-opening", door: CORRAL.id });
});

test("movementPhaseAt returns at-threshold once the avatar crosses into an open notch", () => {
  const insideNotch = { x: CORRAL.doorCenterX, y: STREET.facadeBottomY - TOWN_THRESHOLD_DEPTH / 2 };
  const state = movementPhaseAt(STREET, insideNotch, new Set([CORRAL.id]));
  assert.deepEqual(state, { phase: "at-threshold", door: CORRAL.id });
});

test("movementPhaseAt prefers the nearer open door when two doors are both open", () => {
  const nearPub = { x: PUB.doorCenterX, y: STREET.streetLaneY };
  const state = movementPhaseAt(STREET, nearPub, new Set([CORRAL.id, PUB.id]));
  assert.deepEqual(state, { phase: "door-opening", door: PUB.id });
});

//============================================
// movementDoorEqual: compares only the named door, ignoring phase.
//============================================

test("movementDoorEqual is true when two states name the same door, even across phases", () => {
  const opening = { phase: "door-opening", door: CORRAL.id };
  const atThreshold = { phase: "at-threshold", door: CORRAL.id };
  assert.equal(movementDoorEqual(opening, atThreshold), true);
});

test("movementDoorEqual is true when neither state names a door", () => {
  assert.equal(movementDoorEqual({ phase: "street" }, { phase: "street" }), true);
});

test("movementDoorEqual is false when the states name different doors", () => {
  const atCorral = { phase: "door-opening", door: CORRAL.id };
  const atPub = { phase: "door-opening", door: PUB.id };
  assert.equal(movementDoorEqual(atCorral, atPub), false);
});

//============================================
// streetSideOfDoor: the dismissed-panel rest point stays outside the door's
// own threshold zone, so re-approaching fires a fresh walk-in rather than
// latching immediately.
//============================================

test("streetSideOfDoor sits on the door's x but outside its own threshold zone", () => {
  const restPoint = streetSideOfDoor(CORRAL, STREET);
  assert.equal(restPoint.x, CORRAL.doorCenterX);
  assert.equal(townDoorAtThreshold(STREET, restPoint), null);
});
