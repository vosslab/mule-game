// Town collision and door state: solid facades, bounded door thresholds, and
// open-on-approach door hysteresis, extracted from town_world.ts.
//
// DOM-free and framework-free, like town_world.ts. This module owns the movement
// clamp and the door-open decisions; town_world.ts owns the catalog, the per-mode
// composition, the geometry types, and the tunable constants these functions read.
// The renderer, the camera, the transaction panels, the browser specs, and the
// E2E walker all derive from the SAME composed street, so a drawn facade, its
// solid wall, its door, and a walker's route can never drift apart. The node
// tests (tests/test_town_world.mjs) exercise this pure geometry directly.
//
// Collision. The north band [0, facadeBottomY) is solid EVERYWHERE except
// at open-door notches. It is modeled as: one full-width top lintel [0, 0,
// worldWidth, thresholdTopY] (always solid, above every notch) plus a bottom strip
// over [thresholdTopY, facadeBottomY) filled everywhere except the open-door notch
// x-spans. So closed doors, facade jambs, gaps between facades, and the end pads
// all present a solid street-north wall; an open door leaves a shallow notch the
// avatar can push north into, bounded by the lintel (back wall) and the adjacent
// bottom-strip fillers (jambs). The avatar is confined to the street lane except
// when entering an open door -- there is no occupiable point behind a facade.
//
// Door state. The town interaction model (docs/HUMAN_GUIDANCE.md "Town
// interaction model", a fixed user-facing requirement): a door slides open as the
// avatar approaches, and pushing north through the open door into its threshold IS
// the entry gesture -- no keypress. A closed door is solid. These pure helpers are
// the single source of truth: the renderer draws each door open or closed and the
// movement clamp reads the SAME open set, so the drawn door and the solid door can
// never disagree. The scene owns only the mutable open-set and the single-fire
// entry latch; every geometry decision lives here and is node-tested.

import type { Vec2 } from "./walker";
import { rectContainsPoint, type Rect } from "./zones";
import {
  THRESHOLD_TOP_Y,
  STREET_TOP_Y,
  TOWN_THRESHOLD_DEPTH,
  DOOR_OPEN_RADIUS_PX,
  DOOR_CLOSE_RADIUS_PX,
  DOOR_ENTRY_BAND_PX,
} from "./town_world";
import type {
  TownStreet,
  ComposedFacade,
  StorefrontId,
  TownEndpoint,
  OpenDoorSet,
} from "./town_world";

//============================================
/**
 * The x-span of a facade's threshold notch: [left, right).
 *
 * @param facade - The composed facade.
 * @returns The notch's left and right world x.
 */
function notchSpan(facade: ComposedFacade): { left: number; right: number } {
  return {
    left: facade.thresholdRect.x,
    right: facade.thresholdRect.x + facade.thresholdRect.width,
  };
}

//============================================
/**
 * Build the town's solid collision rectangles for the current open-door set: a
 * full-width top lintel plus the bottom-strip fillers around every open notch.
 * Closed doors contribute no gap (their notch x-span is filled), so the whole
 * facade stays solid to the street.
 *
 * @param street - The composed street.
 * @param openDoors - The set of currently open doors.
 * @returns The solid rectangles the movement clamp resolves against.
 */
function buildTownSolidRects(street: TownStreet, openDoors: OpenDoorSet): Rect[] {
  const rects: Rect[] = [];
  // Top lintel: the whole facade band above every notch, always solid.
  rects.push({ x: 0, y: 0, width: street.worldWidth, height: THRESHOLD_TOP_Y });
  // Bottom strip: solid everywhere in [thresholdTopY, facadeBottomY) except the
  // open-door notch x-spans. Collect the open spans, sort them, and fill the
  // complementary intervals.
  const openSpans: { left: number; right: number }[] = [];
  for (const facade of street.facades) {
    if (openDoors.has(facade.id)) {
      openSpans.push(notchSpan(facade));
    }
  }
  openSpans.sort((a, b) => a.left - b.left);
  let x = 0;
  for (const span of openSpans) {
    if (span.left > x) {
      rects.push({ x, y: THRESHOLD_TOP_Y, width: span.left - x, height: TOWN_THRESHOLD_DEPTH });
    }
    x = Math.max(x, span.right);
  }
  if (x < street.worldWidth) {
    rects.push({
      x,
      y: THRESHOLD_TOP_Y,
      width: street.worldWidth - x,
      height: TOWN_THRESHOLD_DEPTH,
    });
  }
  return rects;
}

//============================================
/**
 * Whether a rect, expanded outward by `radius`, contains a point. Expanding the
 * rect by the avatar radius and treating the avatar as a point is the standard
 * circle-vs-AABB approximation. Edges are exclusive so a point resting exactly
 * on an expanded face reads as just outside.
 *
 * @param rect - The solid rect.
 * @param point - The avatar center to test.
 * @param radius - The avatar collision radius to expand the rect by.
 * @returns True when the avatar center lies inside the expanded rect.
 */
function expandedRectContains(rect: Rect, point: Vec2, radius: number): boolean {
  return (
    point.x > rect.x - radius &&
    point.x < rect.x + rect.width + radius &&
    point.y > rect.y - radius &&
    point.y < rect.y + rect.height + radius
  );
}

//============================================
/**
 * Whether the avatar centered at `point` (radius `radius`) is blocked on the
 * given street: either it overlaps a solid rect or it lies outside the world
 * bounds by less than its radius. Used by the reachability flood fill and as the
 * clamp's guard.
 *
 * @param street - The composed street.
 * @param point - The avatar center to test.
 * @param radius - The avatar collision radius.
 * @param openDoors - The set of currently open doors.
 * @returns True when the avatar cannot occupy this point.
 */
export function isTownPointBlocked(
  street: TownStreet,
  point: Vec2,
  radius: number,
  openDoors: OpenDoorSet,
): boolean {
  if (
    point.x < radius ||
    point.x > street.worldWidth - radius ||
    point.y < radius ||
    point.y > street.worldHeight - radius
  ) {
    return true;
  }
  for (const rect of buildTownSolidRects(street, openDoors)) {
    if (expandedRectContains(rect, point, radius)) {
      return true;
    }
  }
  return false;
}

//============================================
/**
 * Slide one horizontal move against the solid walls: move from `fromX` toward
 * `toX` at fixed height `y`, stopping flush against the near face of any wall
 * the avatar would otherwise enter. Only walls the avatar's row overlaps can
 * block it, so a horizontal move alongside a wall face passes freely.
 *
 * @param rects - The solid rects to resolve against.
 * @param fromX - The avatar's current x.
 * @param toX - The desired x this frame.
 * @param y - The avatar's y for this axis pass (held fixed).
 * @param radius - The avatar collision radius.
 * @returns The resolved x, clamped to the first blocking wall face.
 */
function sweepX(
  rects: readonly Rect[],
  fromX: number,
  toX: number,
  y: number,
  radius: number,
): number {
  const direction = Math.sign(toX - fromX);
  if (direction === 0) {
    return toX;
  }
  let x = toX;
  for (const rect of rects) {
    // Skip walls the avatar does not vertically overlap; they cannot block this
    // horizontal move (the avatar slides past their face).
    if (y <= rect.y - radius || y >= rect.y + rect.height + radius) {
      continue;
    }
    if (direction > 0) {
      const face = rect.x - radius;
      if (fromX <= face && x > face) {
        x = face;
      }
    } else {
      const face = rect.x + rect.width + radius;
      if (fromX >= face && x < face) {
        x = face;
      }
    }
  }
  return x;
}

//============================================
/**
 * Slide one vertical move against the solid walls, the vertical mirror of
 * sweepX. Move from `fromY` toward `toY` at fixed `x`, stopping flush against
 * the near face of any wall the avatar would enter.
 *
 * @param rects - The solid rects to resolve against.
 * @param fromY - The avatar's current y.
 * @param toY - The desired y this frame.
 * @param x - The avatar's x for this axis pass (held fixed).
 * @param radius - The avatar collision radius.
 * @returns The resolved y, clamped to the first blocking wall face.
 */
function sweepY(
  rects: readonly Rect[],
  fromY: number,
  toY: number,
  x: number,
  radius: number,
): number {
  const direction = Math.sign(toY - fromY);
  if (direction === 0) {
    return toY;
  }
  let y = toY;
  for (const rect of rects) {
    if (x <= rect.x - radius || x >= rect.x + rect.width + radius) {
      continue;
    }
    if (direction > 0) {
      const face = rect.y - radius;
      if (fromY <= face && y > face) {
        y = face;
      }
    } else {
      const face = rect.y + rect.height + radius;
      if (fromY >= face && y < face) {
        y = face;
      }
    }
  }
  return y;
}

//============================================
/**
 * Clamp a point to the world bounds, keeping the avatar radius clear of every
 * edge. The north edge is also guarded by the top lintel, so this is mainly the
 * left/right/south safety net plus a top backstop.
 *
 * @param street - The composed street.
 * @param point - The point to clamp.
 * @param radius - The avatar collision radius.
 * @returns The point clamped inside the world bounds.
 */
function clampToWorld(street: TownStreet, point: Vec2, radius: number): Vec2 {
  const x = Math.max(radius, Math.min(street.worldWidth - radius, point.x));
  const y = Math.max(radius, Math.min(street.worldHeight - radius, point.y));
  return { x, y };
}

//============================================
/**
 * Resolve a desired avatar move against the composed street's solid facades and
 * closed/open door thresholds, sliding along faces rather than sticking. The
 * move is resolved one axis at a time -- x first, then y at the already-resolved
 * x -- so a diagonal push into a wall keeps the unobstructed component moving
 * (wall-slide) while the blocked component stops flush. A closed door is solid;
 * an open door admits the avatar into its bounded threshold notch, where the
 * lintel clamps the inner depth at the notch back wall. The street lane is
 * walkable end to end past every facade.
 *
 * @param street - The composed street.
 * @param from - The avatar's current center (assumed already collision-free).
 * @param desired - The intended next center (movement, before collision).
 * @param radius - The avatar collision radius.
 * @param openDoors - The set of currently open doors.
 * @returns The resolved next center, slid clear of every wall and closed door.
 */
export function resolveTownWalk(
  street: TownStreet,
  from: Vec2,
  desired: Vec2,
  radius: number,
  openDoors: OpenDoorSet,
): Vec2 {
  const rects = buildTownSolidRects(street, openDoors);
  const target = clampToWorld(street, desired, radius);
  const x = sweepX(rects, from.x, target.x, from.y, radius);
  const y = sweepY(rects, from.y, target.y, x, radius);
  return { x, y };
}

//============================================
/**
 * The world point of a door's street-level center: the door center x on the
 * street's north edge. Approach distance is measured to this point.
 *
 * @param facade - The composed facade.
 * @returns The door's street-level center point.
 */
function doorCenterPoint(facade: ComposedFacade): Vec2 {
  return { x: facade.doorCenterX, y: STREET_TOP_Y };
}

//============================================
/**
 * Whether the avatar is currently inside a facade's open threshold notch (pushed
 * north of the street edge within the door column). Keeps a door open while the
 * avatar occupies its threshold, so a door never closes onto the avatar.
 *
 * @param facade - The composed facade.
 * @param pos - The avatar center.
 * @returns True when the avatar is inside the facade's threshold notch column.
 */
function insideThresholdColumn(facade: ComposedFacade, pos: Vec2): boolean {
  const span = notchSpan(facade);
  // Notch bottom = the facade's own thresholdRect back edge, not the module
  // STREET_TOP_Y constant, so this facade's notch bound has one source of truth.
  const notchBottomY = facade.thresholdRect.y + facade.thresholdRect.height;
  return pos.x >= span.left && pos.x < span.right && pos.y < notchBottomY;
}

/** One facade's squared distance from the avatar to its street-level door center. */
interface FacadeDistance {
  readonly facade: ComposedFacade;
  readonly distSq: number;
}

//============================================
/**
 * The squared distance from `pos` to every facade's street-level door center,
 * in facade order. Computed once per frame and shared by nearestFacadeIndex and
 * the open/close hysteresis loop below, so neither recomputes the same
 * dx/dy/distSq work.
 *
 * @param street - The composed street.
 * @param pos - The avatar center.
 * @returns The per-facade distance records, in facade order.
 */
function facadeDistancesFrom(street: TownStreet, pos: Vec2): FacadeDistance[] {
  return street.facades.map((facade) => {
    const center = doorCenterPoint(facade);
    const dx = pos.x - center.x;
    const dy = pos.y - center.y;
    return { facade, distSq: dx * dx + dy * dy };
  });
}

//============================================
/**
 * The index of the facade whose door center is nearest the avatar, or -1 when
 * the street has no facades. Approach opens EXACTLY the nearest aligned door.
 *
 * @param distances - The per-facade distance records from facadeDistancesFrom.
 * @returns The nearest facade index, or -1.
 */
function nearestFacadeIndex(distances: readonly FacadeDistance[]): number {
  let bestIndex = -1;
  let bestDistSq = Infinity;
  distances.forEach((entry, index) => {
    if (entry.distSq < bestDistSq) {
      bestDistSq = entry.distSq;
      bestIndex = index;
    }
  });
  return bestIndex;
}

//============================================
/**
 * The set of doors open for an avatar at `pos`, given the previous open set for
 * hysteresis. A door opens when the avatar comes within DOOR_OPEN_RADIUS_PX of
 * its street-level center AND it is the nearest door; it stays open out to
 * DOOR_CLOSE_RADIUS_PX or while the avatar is inside its threshold notch. The
 * open/close gap is the hysteresis band that stops a door flapping. Behavior is
 * identical across mode compositions because it reads only the composed geometry.
 *
 * @param street - The composed street.
 * @param pos - The avatar center this frame.
 * @param prevOpen - The open set from the previous frame (hysteresis input).
 * @returns The new open set.
 */
export function computeOpenDoors(
  street: TownStreet,
  pos: Vec2,
  prevOpen: OpenDoorSet,
): Set<StorefrontId> {
  const next = new Set<StorefrontId>();
  const distances = facadeDistancesFrom(street, pos);
  const nearest = nearestFacadeIndex(distances);
  distances.forEach(({ facade, distSq }, index) => {
    const wasOpen = prevOpen.has(facade.id);
    if (wasOpen) {
      // Stay open out to the wider close radius, or while inside the threshold.
      const closeSq = DOOR_CLOSE_RADIUS_PX * DOOR_CLOSE_RADIUS_PX;
      if (distSq <= closeSq || insideThresholdColumn(facade, pos)) {
        next.add(facade.id);
      }
      return;
    }
    // Open fresh only for the nearest door within the open radius, so approach
    // opens exactly one aligned door. Invariant this relies on: adjacent door
    // centers stay more than 2 * DOOR_OPEN_RADIUS_PX apart (guaranteed today by
    // min facade width plus TOWN_FACADE_GAP), so no two doors are ever both
    // fresh-eligible at once.
    const openSq = DOOR_OPEN_RADIUS_PX * DOOR_OPEN_RADIUS_PX;
    if (index === nearest && distSq <= openSq) {
      next.add(facade.id);
    }
  });
  return next;
}

//============================================
/**
 * The door whose inner-threshold entry zone contains the avatar, or null. The
 * entry zone is the shallow band just south of a facade's notch back wall; the
 * avatar reaches it by pushing north into an open door. Walking the street lane
 * stays south of every entry zone. The scene latches the return value so entry
 * fires exactly once per occupancy (single-fire) and re-arms after the avatar
 * leaves the zone.
 *
 * @param street - The composed street.
 * @param pos - The avatar center.
 * @returns The facade id at whose inner threshold the avatar stands, or null.
 */
export function townDoorAtThreshold(street: TownStreet, pos: Vec2): StorefrontId | null {
  for (const facade of street.facades) {
    // Read the notch top from this facade's own thresholdRect (single source of
    // truth) and cap the zone height at the notch's own depth, so the entry zone
    // can never extend south of the notch's back edge into the street lane.
    const zone: Rect = {
      x: facade.thresholdRect.x,
      y: facade.thresholdRect.y,
      width: facade.thresholdRect.width,
      height: Math.min(DOOR_ENTRY_BAND_PX, facade.thresholdRect.height),
    };
    if (rectContainsPoint(zone, pos)) {
      return facade.id;
    }
  }
  return null;
}

//============================================
/**
 * Which endpoint exit zone, if any, contains the avatar. Only the far-left and
 * far-right endpoint zones leave town.
 *
 * @param street - The composed street.
 * @param pos - The avatar center.
 * @returns The endpoint the avatar stands in, or null.
 */
export function townExitAt(street: TownStreet, pos: Vec2): TownEndpoint | null {
  for (const exit of street.exits) {
    if (rectContainsPoint(exit.rect, pos)) {
      return exit.side;
    }
  }
  return null;
}
