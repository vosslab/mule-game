// Solid town geometry: building footprints, doorway gaps, and the collide-and-
// slide movement clamp.
//
// DOM-free and framework-free by design, like walker.ts and zones.ts: this is
// the single source of truth for where the town's buildings sit. BOTH the town
// renderer (town_scene.tsx draws each building sprite at its footprint) AND the
// movement clamp (the rAF loop resolves the avatar against these same rects)
// consume this module, so a drawn wall and the solid wall behind it can never
// drift apart. The node tests (tests/test_town_layout.mjs) exercise the pure
// geometry and the clamp directly, without a browser.
//
// Coordinate space: the town's pixel space (zones.ts). The buildings line the
// north side of the single street row every door sits on, so the street stays a
// fully open east-west thoroughfare -- every [data-door-for] door and the
// west/east edge exits are reachable by walking the street, exactly as before
// collision existed. Each building's south face carries a doorway gap the avatar
// can pass through; the gap width is specified in avatar-widths, not raw pixels,
// so it stays proportional to the avatar's collision radius. The store's central
// bay (the smithore counter) is its walk-in doorway, deliberately aligned with
// the town's north/south cross-street so the north and south edge exits stay
// reachable by a straight vertical walk.

import type { Bounds, Vec2 } from "./walker";
import type { Rect } from "./zones";
import type { TownDoorId } from "./zones";
import {
  TOWN_BOUNDS,
  TOWN_CELL_PX,
  TOWN_DOOR_IDS,
  rectContainsPoint,
  townDoorCenter,
  townDoorRect,
} from "./zones";
import { TOWN_BUILDING_HEIGHT, townBuildingWidth } from "../sprites/sprites_town";

/**
 * The buildings the avatar walks into through a south-facing doorway. Their
 * names are also their door ids. The store is excluded: it is a row of counter
 * podiums approached from the street, not a single walk-in room.
 */
export type PassThroughBuilding = "corral" | "pub" | "assay";

/** Avatar collision size in town pixels (matches town_scene's rendered sprite). */
export const TOWN_AVATAR_SIZE = 44;

/** Avatar collision radius: half the sprite, the margin the clamp keeps clear. */
export const TOWN_AVATAR_RADIUS = TOWN_AVATAR_SIZE / 2;

/** Footprint size of one outfit-counter podium (matches its rendered sprite). */
export const TOWN_COUNTER_SIZE = 44;

/**
 * Doorway gap width, in avatar-widths. One and a half avatar-widths leaves a
 * comfortable passable lane once both jambs are inset by the avatar radius, so
 * a walk-in never snags on a doorframe.
 */
export const DOORWAY_GAP_AVATAR_WIDTHS = 1.5;

/** Doorway gap width in pixels, derived from the avatar-width specification. */
export const DOORWAY_GAP_PX = DOORWAY_GAP_AVATAR_WIDTHS * TOWN_AVATAR_SIZE;

/**
 * Smallest total jamb width a doorway leaves on a building's south face, so even
 * the single-tile pub and assay keep a solid wall on either side of their door
 * rather than opening their whole frontage.
 */
const MIN_JAMB_TOTAL_PX = 8;

/** The three buildings the avatar walks into through a south-facing doorway. */
const PASS_THROUGH_BUILDINGS: readonly PassThroughBuilding[] = ["corral", "pub", "assay"];

/**
 * The store counters modeled as solid podiums the avatar walks up to from the
 * street. The fourth counter (smithore) is the store's central walk-in bay and
 * is intentionally left passable (see the module doc comment), so it is not in
 * this list.
 */
const STORE_SOLID_COUNTERS: readonly TownDoorId[] = [
  "counter-food",
  "counter-energy",
  "counter-crystite",
];

//============================================
/**
 * The rendered footprint of one pass-through building (`corral`, `pub`, or
 * `assay`). The building sits bottom-anchored directly above its street door,
 * matching the bottom-center anchoring the sprites use. The building name is
 * also its door id.
 *
 * @param name - The building to bound.
 * @returns The building's footprint rect in town pixel space.
 */
export function townBuildingFootprint(name: PassThroughBuilding): Rect {
  const width = townBuildingWidth(name);
  const center = townDoorCenter(name);
  const streetTop = center.y - TOWN_CELL_PX / 2;
  return {
    x: center.x - width / 2,
    y: streetTop - TOWN_BUILDING_HEIGHT,
    width,
    height: TOWN_BUILDING_HEIGHT,
  };
}

//============================================
/**
 * The rendered footprint of one outfit-counter podium, bottom-anchored above its
 * street door like the buildings.
 *
 * @param door - The counter door to bound.
 * @returns The counter podium's footprint rect in town pixel space.
 */
export function townCounterFootprint(door: TownDoorId): Rect {
  const center = townDoorCenter(door);
  const streetTop = center.y - TOWN_CELL_PX / 2;
  return {
    x: center.x - TOWN_COUNTER_SIZE / 2,
    y: streetTop - TOWN_COUNTER_SIZE,
    width: TOWN_COUNTER_SIZE,
    height: TOWN_COUNTER_SIZE,
  };
}

//============================================
/**
 * The pixel width of a building's doorway gap: the specified avatar-width gap,
 * capped so a narrow building still keeps a minimum solid jamb on each side.
 *
 * @param footprintWidth - The building's footprint width.
 * @returns The doorway gap width in pixels.
 */
function doorwayGapWidth(footprintWidth: number): number {
  return Math.min(DOORWAY_GAP_PX, footprintWidth - MIN_JAMB_TOTAL_PX);
}

//============================================
/**
 * The passable doorway gap rect on a pass-through building's south face: a
 * full-height vertical slot centered on the building's door, wide enough for the
 * avatar to walk through.
 *
 * @param name - The pass-through building.
 * @returns The doorway gap rect (the passable opening in the building).
 */
export function townDoorwayGap(name: PassThroughBuilding): Rect {
  const footprint = townBuildingFootprint(name);
  const gap = doorwayGapWidth(footprint.width);
  const doorX = townDoorCenter(name).x;
  return { x: doorX - gap / 2, y: footprint.y, width: gap, height: footprint.height };
}

//============================================
/**
 * Build the town's solid collision rectangles: the parts of each building that
 * block the avatar, with every doorway gap excluded. The three pass-through
 * buildings contribute the two jambs flanking their doorway; the three solid
 * store counters contribute their whole podium; the store's central smithore bay
 * contributes nothing, staying passable as the store's walk-in doorway.
 *
 * @returns The list of solid wall rectangles the movement clamp resolves against.
 */
function buildTownSolidRects(): Rect[] {
  const rects: Rect[] = [];
  for (const name of PASS_THROUGH_BUILDINGS) {
    const footprint = townBuildingFootprint(name);
    const doorX = townDoorCenter(name).x;
    const halfGap = doorwayGapWidth(footprint.width) / 2;
    // Left jamb: from the footprint's west edge up to the doorway's west side.
    const leftWidth = doorX - halfGap - footprint.x;
    if (leftWidth > 0) {
      rects.push({ x: footprint.x, y: footprint.y, width: leftWidth, height: footprint.height });
    }
    // Right jamb: from the doorway's east side to the footprint's east edge.
    const rightX = doorX + halfGap;
    const rightWidth = footprint.x + footprint.width - rightX;
    if (rightWidth > 0) {
      rects.push({ x: rightX, y: footprint.y, width: rightWidth, height: footprint.height });
    }
  }
  for (const door of STORE_SOLID_COUNTERS) {
    rects.push(townCounterFootprint(door));
  }
  return rects;
}

/** The town's solid wall rectangles (buildings minus their doorway gaps). */
export const TOWN_SOLID_RECTS: readonly Rect[] = buildTownSolidRects();

//============================================
/**
 * Whether a rect, expanded outward by `radius`, contains a point. Expanding the
 * rect by the avatar radius and treating the avatar as a point is the standard
 * circle-vs-AABB approximation the clamp relies on. Edges are exclusive so a
 * point resting exactly on an expanded face reads as just outside.
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
 * Whether the avatar centered at `point` (radius `radius`) is blocked: either it
 * overlaps a solid wall or it lies outside the town bounds by less than its
 * radius. Used by the reachability check and as the clamp's guard.
 *
 * @param point - The avatar center to test.
 * @param radius - The avatar collision radius.
 * @returns True when the avatar cannot occupy this point.
 */
export function isTownPointBlocked(point: Vec2, radius: number): boolean {
  if (
    point.x < radius ||
    point.x > TOWN_BOUNDS.width - radius ||
    point.y < radius ||
    point.y > TOWN_BOUNDS.height - radius
  ) {
    return true;
  }
  for (const rect of TOWN_SOLID_RECTS) {
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
 * sweepX. Move from `fromY` toward `toY` at fixed `x`, stopping flush against the
 * near face of any wall the avatar would enter.
 *
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
 * Resolve a desired avatar move against the town's solid walls, sliding along
 * faces rather than sticking. The move is resolved one axis at a time -- x
 * first, then y at the already-resolved x -- so a diagonal push into a wall
 * keeps the unobstructed component moving (wall-slide) while the blocked
 * component stops flush against the wall. A move into a concave corner stops on
 * both axes. The caller passes an already-bounds-clamped `desired` (from
 * stepPosition), so this only adds building collision.
 *
 * @param from - The avatar's current center (assumed already collision-free).
 * @param desired - The intended next center (movement plus bounds clamp).
 * @param radius - The avatar collision radius.
 * @returns The resolved next center, slid clear of every solid wall.
 */
export function resolveTownWalk(from: Vec2, desired: Vec2, radius: number): Vec2 {
  const x = sweepX(TOWN_SOLID_RECTS, from.x, desired.x, from.y, radius);
  const y = sweepY(TOWN_SOLID_RECTS, from.y, desired.y, x, radius);
  return { x, y };
}

//============================================
/**
 * The town's pixel bounds, re-exported so collision consumers pull the movement
 * surface from the same module as the walls.
 */
export const TOWN_COLLISION_BOUNDS: Bounds = TOWN_BOUNDS;

// ============================================================
// Doors: open-on-approach state, closed-door collision, and walk-in entry zones
// ============================================================
//
// The town's interaction model (docs/HUMAN_GUIDANCE.md "Town interaction
// model", a fixed user-facing requirement): a shop door slides open as the
// avatar approaches, and walking through the open doorway IS the entry action --
// no keypress. A closed door is solid. These pure helpers are the single source
// of truth for that behavior: BOTH the renderer (town_scene.tsx draws each door
// open or closed and the movement clamp uses the SAME open set) so the drawn
// door and the solid door can never disagree. The scene owns only the mutable
// open-set and the per-frame edge-trigger; every geometry decision lives here
// and is node-tested (tests/test_town_layout.mjs).

/** The street's north edge: the y where every building's south face sits. */
export const TOWN_STREET_TOP_Y = townDoorCenter("corral").y - TOWN_CELL_PX / 2;

/**
 * Approach radius (px) at which a closed door opens. Comfortably larger than the
 * gap between the street walking lane and a building's south face, so a door is
 * already open by the time the avatar reaches its doorway -- the slide-open
 * reads as anticipatory, never as a wall the avatar bumps first.
 */
export const DOOR_OPEN_RADIUS_PX = 48;

/**
 * Wider radius (px) an already-open door stays open out to. The gap between open
 * and close radius is the hysteresis band that stops a door flapping when the
 * avatar lingers exactly at the open threshold.
 */
export const DOOR_CLOSE_RADIUS_PX = 68;

/**
 * Small south margin (px) past a building's collision face that still counts as
 * "walked into the doorway". Every door's south face -- a pass-through jamb or a
 * counter podium -- sits at the same collision line (the street top expanded by
 * the avatar radius), so a single band serves them all: pressing north into an
 * open door reaches it (aligned walk-ins pass on through), while walking the
 * street at its center stays well south of it.
 */
const DOOR_ENTER_INSET_PX = 2;

/**
 * The y a door's walk-in entry zone extends south to: the building's collision
 * face (its drawn south edge expanded by the avatar radius) plus a small margin.
 * Only a deliberate northward push into the open door reaches it. Using the
 * collision face (not the deep interior) means a walk-in fires even when the
 * narrow single-tile doorways stop a slightly-misaligned avatar flush at the
 * jamb -- the interaction still fires the instant it presses the open doorway.
 */
const DOOR_ENTER_Y = TOWN_STREET_TOP_Y + TOWN_AVATAR_RADIUS + DOOR_ENTER_INSET_PX;

/** The three pass-through buildings, as a door-id set for fast membership. */
const PASS_THROUGH_DOOR_SET: ReadonlySet<TownDoorId> = new Set(PASS_THROUGH_BUILDINGS);

//============================================
/**
 * Whether a door is a pass-through building (walked into through a south-facing
 * doorway) rather than a street-approached counter.
 *
 * @param door - The door to classify.
 * @returns True for `corral`, `pub`, and `assay`.
 */
export function isPassThroughDoor(door: TownDoorId): door is PassThroughBuilding {
  return PASS_THROUGH_DOOR_SET.has(door);
}

//============================================
/**
 * The solid panel that fills a pass-through building's doorway gap while its
 * door is closed. It is exactly the doorway gap, so a closed door blocks the
 * same opening an open door clears -- the closed-door-is-solid guarantee.
 *
 * @param name - The pass-through building.
 * @returns The doorway-covering solid rect for the closed state.
 */
export function townDoorPanelRect(name: PassThroughBuilding): Rect {
  return townDoorwayGap(name);
}

//============================================
/**
 * The closed-door panels to add to collision: one per pass-through building
 * whose door is not currently open. Counters have no doorway gap (they stay
 * solid podiums) and the store's smithore bay is always passable, so neither
 * contributes a panel.
 *
 * @param openDoors - The set of currently open doors.
 * @returns The extra solid rects for every closed pass-through doorway.
 */
function closedDoorPanels(openDoors: ReadonlySet<TownDoorId>): Rect[] {
  const panels: Rect[] = [];
  for (const name of PASS_THROUGH_BUILDINGS) {
    if (!openDoors.has(name)) {
      panels.push(townDoorPanelRect(name));
    }
  }
  return panels;
}

//============================================
/**
 * Resolve a desired avatar move against the town's permanent walls plus the
 * closed-door panels, sliding along faces like `resolveTownWalk`. A closed
 * pass-through door is solid; an open one lets the avatar walk through. Renderer
 * and clamp read the same `openDoors` set, so the door the player sees open is
 * exactly the door the avatar can pass.
 *
 * @param from - The avatar's current center (assumed already collision-free).
 * @param desired - The intended next center (movement plus bounds clamp).
 * @param radius - The avatar collision radius.
 * @param openDoors - The set of currently open doors.
 * @returns The resolved next center, slid clear of every wall and closed door.
 */
export function resolveTownWalkWithDoors(
  from: Vec2,
  desired: Vec2,
  radius: number,
  openDoors: ReadonlySet<TownDoorId>,
): Vec2 {
  const rects = [...TOWN_SOLID_RECTS, ...closedDoorPanels(openDoors)];
  const x = sweepX(rects, from.x, desired.x, from.y, radius);
  const y = sweepY(rects, from.y, desired.y, x, radius);
  return { x, y };
}

//============================================
/**
 * The set of doors open for an avatar at `pos`, given the previous open set for
 * hysteresis. A door opens when the avatar comes within `DOOR_OPEN_RADIUS_PX` of
 * its street center and stays open out to `DOOR_CLOSE_RADIUS_PX`. A pass-through
 * door additionally stays open the whole time the avatar is inside its doorway
 * column north of the street, so a door never closes onto the avatar or traps it
 * behind a re-solidified panel.
 *
 * @param pos - The avatar center this frame.
 * @param prevOpen - The open set from the previous frame (hysteresis input).
 * @returns The new open set.
 */
export function computeOpenDoors(pos: Vec2, prevOpen: ReadonlySet<TownDoorId>): Set<TownDoorId> {
  const next = new Set<TownDoorId>();
  for (const door of TOWN_DOOR_IDS) {
    const center = townDoorCenter(door);
    const dx = pos.x - center.x;
    const dy = pos.y - center.y;
    const wasOpen = prevOpen.has(door);
    const radius = wasOpen ? DOOR_CLOSE_RADIUS_PX : DOOR_OPEN_RADIUS_PX;
    let open = dx * dx + dy * dy <= radius * radius;
    // Hold a pass-through door open while the avatar occupies its doorway column
    // north of the street, even past the close radius.
    if (!open && isPassThroughDoor(door) && pos.y < TOWN_STREET_TOP_Y) {
      const cell = townDoorRect(door);
      if (pos.x >= cell.x && pos.x < cell.x + cell.width) {
        open = true;
      }
    }
    if (open) {
      next.add(door);
    }
  }
  return next;
}

//============================================
/**
 * The walk-in entry zone for a door: the door's street column from the north
 * edge south to the door-enter line (`DOOR_ENTER_Y`). The avatar reaches it by
 * pushing north into the open door -- through the doorway for a pass-through
 * building or the smithore bay, or flush against the podium for a solid counter.
 * Walking the street at its center stays south of the line, so a walk-past never
 * enters.
 *
 * @param door - The door whose entry zone to bound.
 * @returns The entry-zone rect in town pixel space.
 */
export function townDoorEntryZone(door: TownDoorId): Rect {
  const cell = townDoorRect(door);
  return { x: cell.x, y: 0, width: cell.width, height: DOOR_ENTER_Y };
}

//============================================
/**
 * Which door's walk-in entry zone, if any, contains `pos`. Entry zones sit in
 * distinct door columns, so at most one contains the avatar; the pass-through
 * jambs make the tiny column overlaps physically unreachable, so first-match in
 * door order is unambiguous.
 *
 * @param pos - The avatar center to test.
 * @returns The door whose entry zone contains `pos`, or null.
 */
export function townDoorAtEntry(pos: Vec2): TownDoorId | null {
  for (const door of TOWN_DOOR_IDS) {
    if (rectContainsPoint(townDoorEntryZone(door), pos)) {
      return door;
    }
  }
  return null;
}
