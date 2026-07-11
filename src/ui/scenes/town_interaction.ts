// Town interaction state machine: the TownInteractionState union plus the pure
// decision/geometry helpers the scene shell (town_scene.tsx) drives.
//
// Everything here is a plain function of its arguments -- no signals, no mutable
// module state, no DOM. The shell owns the townState signal, the per-frame
// avatar/camera position, and the walk-in latch; each frame it feeds those
// values into these helpers and applies the returned phase/geometry. Keeping the
// decisions pure makes the walk-in / attempt-then-confirm contract
// (docs/HUMAN_GUIDANCE.md "Town interaction model") testable in isolation,
// independent of the rAF loop and Solid reactivity.

import type { Vec2 } from "./walker";
import type { TownExit } from "./zones";
import { TOWN_AVATAR_RADIUS } from "./town_world";
import { townDoorAtThreshold } from "./town_collision";
import type {
  TownStreet,
  ComposedFacade,
  StorefrontId,
  PanelKind,
  OpenDoorSet,
  TownEndpoint,
} from "./town_world";

/**
 * The explicit town interaction state (docs/THE_TOWN_ANALYSIS.md "Interaction
 * state"; the fixed contract in docs/HUMAN_GUIDANCE.md "Town interaction
 * model"). One signal of this discriminated union replaces the old scattered
 * booleans, so the walk-in / attempt-then-confirm rules are enforced
 * structurally rather than derived ad hoc from avatar position:
 *
 *   street        walking the lane; arrows move, doors open on approach.
 *   door-opening  the nearest door has slid open as the avatar approaches it.
 *   at-threshold  the avatar occupies an open door's inner threshold (the frame
 *                 before its walk-in latches panel-open).
 *   panel-open    a transaction panel/confirm is up; world movement is FROZEN
 *                 and input is panel-scoped; entry itself dispatched nothing.
 *   leaving       an endpoint exit fired; the scene is handing back to the
 *                 overworld (terminal; movement stays frozen through teardown).
 *
 * street / door-opening / at-threshold are movement phases derived each frame
 * from avatar position; panel-open and leaving are latched by a transition and
 * cleared only by an explicit dismiss/confirm or scene teardown.
 */
export type TownInteractionState =
  | { readonly phase: "street" }
  | { readonly phase: "door-opening"; readonly door: StorefrontId }
  | { readonly phase: "at-threshold"; readonly door: StorefrontId }
  | { readonly phase: "panel-open"; readonly door: StorefrontId; readonly panel: PanelKind }
  | { readonly phase: "leaving"; readonly exit: TownEndpoint };

//============================================
/**
 * Whether two door-id sets hold the same doors, so the per-frame door refresh
 * only pushes a new reactive value when membership actually changes.
 *
 * @param a - First door set.
 * @param b - Second door set.
 * @returns True when both sets contain exactly the same doors.
 */
export function doorSetsEqual(a: OpenDoorSet, b: OpenDoorSet): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const id of a) {
    if (!b.has(id)) {
      return false;
    }
  }
  return true;
}

//============================================
/**
 * Map a composed-street endpoint to the four-direction overworld exit the
 * parent's `onExit` handler still consumes. The mode-composed street exposes
 * only two endpoint exits (left/right); until a future change migrates the
 * overworld spawn/exit wiring to that two-endpoint model, the horizontal
 * endpoints map to the horizontal overworld directions (left -> west,
 * right -> east).
 *
 * @param side - The street endpoint the avatar walked into.
 * @returns The overworld exit direction to return through.
 */
export function endpointToTownExit(side: TownEndpoint): TownExit {
  return side === "left" ? "west" : "east";
}

//============================================
/**
 * The open door nearest the avatar's street-level position, or null when none
 * is open. Only names the door for the door-opening movement phase.
 *
 * @param street - The composed street, for the facade list and street top y.
 * @param avatarPos - The avatar's current world position.
 * @param openDoors - The set of currently open doors.
 * @returns The nearest open door's id, or null when no door is open.
 */
function nearestOpenDoor(
  street: TownStreet,
  avatarPos: Vec2,
  openDoors: OpenDoorSet,
): StorefrontId | null {
  let nearest: StorefrontId | null = null;
  let bestDistSq = Infinity;
  for (const facade of street.facades) {
    if (!openDoors.has(facade.id)) {
      continue;
    }
    const dx = avatarPos.x - facade.doorCenterX;
    const dy = avatarPos.y - street.streetTopY;
    const distSq = dx * dx + dy * dy;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      nearest = facade.id;
    }
  }
  return nearest;
}

//============================================
/**
 * The movement phase for the avatar's current position: at-threshold when it
 * occupies an open door's inner threshold (the frame before a walk-in latches
 * panel-open), door-opening when the nearest door is open as it is approached,
 * else street.
 *
 * @param street - The composed street.
 * @param avatarPos - The avatar's current world position.
 * @param openDoors - The set of currently open doors.
 * @returns The derived movement-phase state for this position.
 */
export function movementPhaseAt(
  street: TownStreet,
  avatarPos: Vec2,
  openDoors: OpenDoorSet,
): TownInteractionState {
  const thresholdDoor = townDoorAtThreshold(street, avatarPos);
  if (thresholdDoor !== null) {
    return { phase: "at-threshold", door: thresholdDoor };
  }
  const opening = nearestOpenDoor(street, avatarPos, openDoors);
  if (opening !== null) {
    return { phase: "door-opening", door: opening };
  }
  return { phase: "street" };
}

//============================================
/**
 * Whether two movement-phase states name the same door, so the shell's
 * syncMovementPhase skips a redundant setTownState when only object identity
 * changed.
 *
 * @param a - First interaction state.
 * @param b - Second interaction state.
 * @returns True when both states name the same door (or both name none).
 */
export function movementDoorEqual(a: TownInteractionState, b: TownInteractionState): boolean {
  const doorA = "door" in a ? a.door : null;
  const doorB = "door" in b ? b.door : null;
  return doorA === doorB;
}

//============================================
/**
 * The street-side rest point just south of a door's threshold: the door
 * center x, an avatar radius into the street lane and clear of the door's
 * inner-threshold entry zone, so a dismissed panel leaves the avatar outside
 * the doorway and re-approaching fires a fresh walk-in.
 *
 * @param facade - The composed facade whose door was dismissed.
 * @param street - The composed street, for the street top y.
 * @returns The world position to rest the avatar at, street-side of the door.
 */
export function streetSideOfDoor(facade: ComposedFacade, street: TownStreet): Vec2 {
  return { x: facade.doorCenterX, y: street.streetTopY + TOWN_AVATAR_RADIUS + 2 };
}
