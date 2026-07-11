// Town world model: storefront catalog, per-mode street composition, collision,
// and door state. DOM-free and framework-free by design, like walker.ts and
// zones.ts: this is the SINGLE SOURCE OF TRUTH for the town's geometry. The
// renderer (town_scene.tsx), the camera (town_camera.ts), the collision clamp,
// the transaction panels, the browser specs, and the E2E walker all derive from
// the composed street this module produces, so a drawn facade, its solid wall,
// its door, and a walker's route can never drift apart. The node tests
// (tests/test_town_world.mjs) exercise the pure geometry directly, no browser.
//
// This module replaces the retired 9x5 grid town (zones.ts town constants +
// town_layout.ts). Per docs/THE_TOWN_ANALYSIS.md the old grid modeled the wrong
// space (pass-through building tunnels, four exits, entry zones reaching the
// roof); the target is the 1990 NES horizontally scrolling street: one world
// wider than the viewport, a camera that scrolls, two endpoint exits, the corral
// as the turn spawn anchor, and Planet M.U.L.E.-style industrial facades.
//
// ============================================================================
// Coordinate space
// ============================================================================
//
// World-space pixels, shared with walker.ts. One horizontal street. Origin
// (0, 0) is the world's top-left. Up (north) is decreasing y; the avatar walks
// the street lane and pushes north into an open door. Three vertical bands, top
// to bottom:
//
//   SOLID FACADE     y in [0, facadeBottomY)      never occupiable
//   DOOR THRESHOLD   a shallow notch cut into the BOTTOM of a facade at its
//                    door span, depth TOWN_THRESHOLD_DEPTH; enterable only when
//                    the door is open
//   STREET LANE      y in [facadeBottomY, worldHeight)   the normal walkable band
//
// The threshold is a shallow pocket in FRONT OF an always-solid facade (the bulk
// of the facade rectangle is never subtracted -- only a shallow bottom notch of
// depth TOWN_THRESHOLD_DEPTH forms the door). This is the core bug fix from the
// analysis: do NOT model a doorway by subtracting a full-depth slot from a
// building.
//
// ============================================================================
// Confirmed per-mode composition table (docs/THE_TOWN_ANALYSIS.md, Resolved
// decisions in the town_street_rebuild plan; user decision 2026-07-10; SETTLED)
// ============================================================================
//
//   Facade             Beginner  Standard  Tournament (catalog-ready, no engine mode)
//   Mining Outfitting   smithore  smithore  smithore + crystite
//   Energy Outfitting   yes       yes       yes
//   Farm Outfitting     yes       yes       yes
//   M.U.L.E. Corral     yes       yes       yes   (spawn anchor)
//   Pub                 yes       yes       yes
//   Land Office         no        yes       yes
//   Assay Office        no        no        yes
//
// So: Beginner street = Mining, Energy, Farm, Corral, Pub (5). Standard street =
// + Land Office (6). Tournament (a catalog entry rendered by no current engine
// mode) = + Assay Office and the crystite option inside Mining (7). Composition
// is driven by town-layer capability flags (landOfficeVisible, assayVisible,
// miningOutfits) -- NOT by inferring engine behavior. The engine gates nothing
// by mode except round count (ROUND_COUNT_BY_MODE, constants.ts). This layer is
// presentation-only and changes NO engine mechanics. NES order among included
// facades: Mining, Energy, Farm, Corral, Pub, Land, Assay.
//
// ============================================================================
// Transaction-state selector list (single source of truth the facades, panels,
// and walker all read)
// ============================================================================
//
//   mule price          store.state.store.mulePrice        (src/engine/store.ts)
//   mule stock          store.state.store.muleStock        (src/engine/store.ts)
//   outfit prices       OUTFIT_COST (src/engine/constants.ts) via
//                       computeOutfitCost / computeMulePurchaseCost
//                       (src/engine/store.ts)
//   player money        store.state.players[id].money
//   carried / tow state DevelopPayload.carriedMule ("none" | "unoutfitted" |
//                       a Resource) (src/engine/game_state.ts)
//   active game mode    store.state.mode (GameMode) (src/engine/game_state.ts)
//
// The Mining panel's offered resources come from the composed facade's
// outfitResources list, which is caps.miningOutfits for the active mode -- so
// the facade, the panel, and the walker read one truth for what mining offers.

import type { Vec2 } from "./walker";
import type { Rect } from "./zones";
import type { Resource } from "../../engine/player";
import type { GameMode } from "../../engine/game_state";

// ============================================================================
// Spacing and geometry tunables (LOCKED by the 2026-07-10 spacing/travel-budget experiment)
// ============================================================================
//
// These named tunables are the ONLY hand-set geometry. World width, facade
// positions, door centers, spawn, camera bounds, and the exit zones are all
// COMPUTED from the composed facade list using these constants, so tuning the
// town's scale and travel budget is a matter of adjusting these values, never a
// geometry rewrite. The 2026-07-10 spacing/travel-budget experiment
// (docs/active_plans/audits/town_spacing_experiment.md) LOCKED these AT THEIR
// CURRENT VALUES (unchanged): it proved spacing is not the travel lever -- a
// fed develop turn completes the REALISTIC
// mule-swap-to-close-plot errand (the acceptance bar) with ~94% margin in both
// modes, and even the maximal full-street trip with ~88%; only a fully
// food-starved player cannot finish the maximal trip, an intended M.U.L.E.
// penalty (user decision 2026-07-10). World width stays derived (beginner
// 964 px, standard 1136 px).

/** Avatar collision size in world pixels (matches the rendered sprite). */
export const TOWN_AVATAR_SIZE = 44;

/** Avatar collision radius: half the sprite, the margin the clamp keeps clear. */
export const TOWN_AVATAR_RADIUS = TOWN_AVATAR_SIZE / 2;

/**
 * Full-height solid facade band, in world pixels. Tall enough that a facade
 * "looms" at human-and-building scale (docs/SCREEN_DESIGNS.md town looms), well
 * above the old 64px grid tile.
 */
export const TOWN_FACADE_HEIGHT = 168;

/** Walkable street-lane band height, in world pixels. */
export const TOWN_STREET_HEIGHT = 104;

/**
 * Depth of the shallow door-threshold notch cut into the bottom of a facade at
 * its door span. Shallow relative to the facade height, so the bulk of every
 * facade stays solid at all depths and only the door forms a bounded pocket.
 */
export const TOWN_THRESHOLD_DEPTH = 24;

/** Horizontal gap between two adjacent composed facades, in world pixels. */
export const TOWN_FACADE_GAP = 44;

/**
 * Street length beyond the outermost facade on each end, in world pixels. Holds
 * the endpoint exit zone and gives the corner facades breathing room.
 */
export const TOWN_STREET_END_PADDING = 80;

/** Width of each endpoint exit zone, in world pixels. */
export const TOWN_EXIT_WIDTH = 44;

/**
 * Door opening width within a facade, in world pixels. Wider than the avatar so
 * an aligned walk-in passes through the jambs into the threshold notch.
 */
export const TOWN_DOOR_WIDTH = 64;

/**
 * Reference camera viewport width, in world pixels, that every composed street
 * must exceed so the camera has to scroll. LOCKED by the 2026-07-10
 * spacing/travel-budget experiment at 576 (the old
 * fixed town width): both composed worlds (beginner 964, standard 1136) exceed
 * it, so the camera always scrolls.
 */
export const TOWN_REFERENCE_VIEWPORT_WIDTH = 576;

/**
 * Radius (world px) at which a closed door opens as the avatar approaches its
 * street-level door center. Larger than the street-lane-to-door distance so the
 * door reads as anticipatory, open by the time the avatar reaches it.
 */
export const DOOR_OPEN_RADIUS_PX = 70;

/**
 * Wider radius (world px) an already-open door stays open out to. The gap
 * between open and close radius is the hysteresis band that stops a door
 * flapping when the avatar lingers at the open threshold.
 */
export const DOOR_CLOSE_RADIUS_PX = 96;

/**
 * Height (world px) of a door's inner-threshold entry zone, measured south from
 * the notch back wall. Reaching it (pushing north into an open door) is the
 * walk-in entry gesture; walking the street lane stays well south of it.
 */
export const DOOR_ENTRY_BAND_PX = TOWN_AVATAR_RADIUS + 8;

// ============================================================================
// Catalog types
// ============================================================================

/** Stable storefront ids, in NES street order. */
export type StorefrontId = "mining" | "energy" | "farm" | "corral" | "pub" | "land" | "assay";

/** Which live economic text a facade shows before entry. */
export type AmbientTextKind =
  "mule-price-stock" | "outfit-price" | "turn-end" | "land-availability" | "assay-status";

/** Which transaction panel a door opens on walk-in. */
export type PanelKind = "corral" | "outfit" | "pub" | "land-office" | "assay-office";

/** The two endpoint exits: only the street ends return to the overworld. */
export type TownEndpoint = "left" | "right";

/** A door-open set is a set of the composed storefront ids currently open. */
export type OpenDoorSet = ReadonlySet<StorefrontId>;

/**
 * Town-layer capability flags that drive composition. Presentation-only: they
 * change which facades render and what the Mining panel offers, never engine
 * mechanics. A per-mode config maps a GameMode to these flags.
 */
export interface TownCapabilities {
  /** Whether the Land Office facade renders (standard and up). */
  readonly landOfficeVisible: boolean;
  /** Whether the Assay Office facade renders (tournament; no current mode). */
  readonly assayVisible: boolean;
  /** The resource list the Mining panel offers (smithore, plus crystite later). */
  readonly miningOutfits: readonly Resource[];
}

/**
 * One catalog record: everything known about a facade independent of the
 * composed street it lands in. Geometry (world x, rects, door center) is
 * COMPUTED at composition time, not stored here.
 */
export interface StorefrontRecord {
  /** Stable destination id, also the door hook. */
  readonly id: StorefrontId;
  /** Facade width in world pixels (honest human-and-building scale). */
  readonly facadeWidth: number;
  /** Human-readable signage label. */
  readonly label: string;
  /** Resource-emblem / icon key for the facade sprite. */
  readonly icon: string;
  /** Which live economic text the facade shows. */
  readonly ambientKind: AmbientTextKind;
  /** Which panel the door opens on walk-in. */
  readonly panelKind: PanelKind;
  /** Whether this facade renders in a street composed from the given flags. */
  readonly isAvailable: (caps: TownCapabilities) => boolean;
  /**
   * The resources this facade's outfit panel offers, or undefined when the
   * facade is not an outfitter (corral, pub, land, assay). Resolved from the
   * capability flags at composition time.
   */
  readonly outfitResources?: (caps: TownCapabilities) => readonly Resource[];
}

// ============================================================================
// Composed-street types
// ============================================================================

/** One facade placed on a composed street, with world-space geometry. */
export interface ComposedFacade {
  /** Stable destination id, also the door hook. */
  readonly id: StorefrontId;
  /** Human-readable signage label. */
  readonly label: string;
  /** Resource-emblem / icon key for the facade sprite. */
  readonly icon: string;
  /** Which live economic text the facade shows. */
  readonly ambientKind: AmbientTextKind;
  /** Which panel the door opens on walk-in. */
  readonly panelKind: PanelKind;
  /** The outfit resources this facade offers, when it is an outfitter. */
  readonly outfitResources?: readonly Resource[];
  /** The always-solid facade rect (world space): [x, 0, facadeWidth, facadeHeight]. */
  readonly facadeRect: Rect;
  /** World x of the door center (facade center). */
  readonly doorCenterX: number;
  /** The shallow threshold notch (world space), enterable only when the door is open. */
  readonly thresholdRect: Rect;
}

/** One endpoint exit zone on a composed street. */
export interface TownExitZone {
  /** Which street end this exit caps. */
  readonly side: TownEndpoint;
  /** The exit-zone rect in world space (in the street lane at the street end). */
  readonly rect: Rect;
}

/**
 * A fully composed town street: the ordered facades plus every derived quantity
 * the renderer, camera, collision, and tests consume. Everything here is a pure
 * function of the capability flags and the spacing tunables.
 */
export interface TownStreet {
  /** The composed facades, in NES order among the included ones. */
  readonly facades: readonly ComposedFacade[];
  /** Total world width (the camera-bounds input; always exceeds the viewport). */
  readonly worldWidth: number;
  /** Total world height (facade band + street lane). */
  readonly worldHeight: number;
  /** World y of the facade band bottom = the street's north edge. */
  readonly streetTopY: number;
  /** World y of the walkable street-lane center (spawn and lane reference). */
  readonly streetLaneY: number;
  /** World y where the solid facade band ends (equals streetTopY). */
  readonly facadeBottomY: number;
  /** The corral street position: the development-turn spawn anchor. */
  readonly spawn: Vec2;
  /** Exactly two endpoint exit zones (left and right). */
  readonly exits: readonly TownExitZone[];
  /** The capability flags this street was composed from. */
  readonly capabilities: TownCapabilities;
}

// ============================================================================
// Storefront catalog (NES order)
// ============================================================================

/** Every outfitter offers a fixed non-mining resource, or mining's flag list. */
function miningOutfitsOf(caps: TownCapabilities): readonly Resource[] {
  return caps.miningOutfits;
}

/** Energy Outfitting always offers energy. */
function energyOutfitsOf(): readonly Resource[] {
  return ["energy"];
}

/** Farm Outfitting always offers food. */
function farmOutfitsOf(): readonly Resource[] {
  return ["food"];
}

/** Always available, regardless of capability flags. */
function alwaysAvailable(): boolean {
  return true;
}

/** The Land Office renders when the town-layer flag says so (standard and up). */
function landAvailable(caps: TownCapabilities): boolean {
  return caps.landOfficeVisible;
}

/** The Assay Office renders when the town-layer flag says so (tournament). */
function assayAvailable(caps: TownCapabilities): boolean {
  return caps.assayVisible;
}

/**
 * The storefront catalog in NES street order. Composition filters this list by
 * the active capability flags and preserves this order among included facades.
 * Widths are honest human-and-building scale (the corral pen is widest, the pub
 * is narrowest); world width falls out of the composed subset.
 */
export const TOWN_STOREFRONT_CATALOG: readonly StorefrontRecord[] = [
  {
    id: "mining",
    facadeWidth: 132,
    label: "Mining Outfitting",
    icon: "smithore",
    ambientKind: "outfit-price",
    panelKind: "outfit",
    isAvailable: alwaysAvailable,
    outfitResources: miningOutfitsOf,
  },
  {
    id: "energy",
    facadeWidth: 120,
    label: "Energy Outfitting",
    icon: "energy",
    ambientKind: "outfit-price",
    panelKind: "outfit",
    isAvailable: alwaysAvailable,
    outfitResources: energyOutfitsOf,
  },
  {
    id: "farm",
    facadeWidth: 120,
    label: "Farm Outfitting",
    icon: "food",
    ambientKind: "outfit-price",
    panelKind: "outfit",
    isAvailable: alwaysAvailable,
    outfitResources: farmOutfitsOf,
  },
  {
    id: "corral",
    facadeWidth: 148,
    label: "M.U.L.E. Corral",
    icon: "corral",
    ambientKind: "mule-price-stock",
    panelKind: "corral",
    isAvailable: alwaysAvailable,
  },
  {
    id: "pub",
    facadeWidth: 108,
    label: "Pub",
    icon: "pub",
    ambientKind: "turn-end",
    panelKind: "pub",
    isAvailable: alwaysAvailable,
  },
  {
    id: "land",
    facadeWidth: 128,
    label: "Land Office",
    icon: "land",
    ambientKind: "land-availability",
    panelKind: "land-office",
    isAvailable: landAvailable,
  },
  {
    id: "assay",
    facadeWidth: 128,
    label: "Assay Office",
    icon: "assay",
    ambientKind: "assay-status",
    panelKind: "assay-office",
    isAvailable: assayAvailable,
  },
];

// ============================================================================
// Per-mode capability config
// ============================================================================

/**
 * Map an engine GameMode to town-layer capability flags. This is the ONLY place
 * a mode name touches the town layer; the engine itself gates nothing here.
 * Beginner and standard both offer smithore mining; tournament (catalog-ready,
 * no engine mode) would add crystite and the assay office.
 *
 * @param mode - The active engine game mode.
 * @returns The town capability flags for that mode.
 */
export function townCapabilitiesForMode(mode: GameMode): TownCapabilities {
  if (mode === "standard") {
    return { landOfficeVisible: true, assayVisible: false, miningOutfits: ["smithore"] };
  }
  // beginner: the smallest town -- no Land Office, no Assay.
  return { landOfficeVisible: false, assayVisible: false, miningOutfits: ["smithore"] };
}

// ============================================================================
// Composition
// ============================================================================

/** The facade-band bottom y (equals the street's north edge). */
const FACADE_BOTTOM_Y = TOWN_FACADE_HEIGHT;

/**
 * The street lane's north edge, where the solid facade band ends. Exported so
 * the collision/door module (town_collision.ts) reads the same street-top y the
 * composition here places facades against.
 */
export const STREET_TOP_Y = FACADE_BOTTOM_Y;

/** Total world height: facade band plus street lane. */
const WORLD_HEIGHT = FACADE_BOTTOM_Y + TOWN_STREET_HEIGHT;

/** The street-lane center y: the walkable reference line and spawn height. */
const STREET_LANE_Y = STREET_TOP_Y + TOWN_STREET_HEIGHT / 2;

/**
 * The threshold notch's north (back) wall y: solid facade resumes above it.
 * Exported so town_collision.ts builds its solid-rect lintel and fillers against
 * the same notch back-wall y this composition cuts the threshold to.
 */
export const THRESHOLD_TOP_Y = FACADE_BOTTOM_Y - TOWN_THRESHOLD_DEPTH;

//============================================
/**
 * Build one composed facade at a given world x. Geometry (facade rect, door
 * center, threshold notch) is derived from the x and the record width.
 *
 * @param record - The catalog record to place.
 * @param x - The facade's world-space left edge.
 * @param caps - The capability flags (resolves the outfit resource list).
 * @returns The placed facade with full world geometry.
 */
function placeFacade(record: StorefrontRecord, x: number, caps: TownCapabilities): ComposedFacade {
  const facadeRect: Rect = { x, y: 0, width: record.facadeWidth, height: TOWN_FACADE_HEIGHT };
  const doorCenterX = x + record.facadeWidth / 2;
  const thresholdRect: Rect = {
    x: doorCenterX - TOWN_DOOR_WIDTH / 2,
    y: THRESHOLD_TOP_Y,
    width: TOWN_DOOR_WIDTH,
    height: TOWN_THRESHOLD_DEPTH,
  };
  const outfitResources = record.outfitResources?.(caps);
  return {
    id: record.id,
    label: record.label,
    icon: record.icon,
    ambientKind: record.ambientKind,
    panelKind: record.panelKind,
    outfitResources,
    facadeRect,
    doorCenterX,
    thresholdRect,
  };
}

//============================================
/**
 * Compose the town street for a set of capability flags. The core composition
 * function: total over any flags (a future mode with different availability
 * composes a valid street with no code change). Filters the catalog in NES
 * order, lays the included facades left to right with shared spacing, and
 * derives world width, spawn, exits, and camera bounds from the placed list.
 *
 * @param caps - The town-layer capability flags.
 * @returns The fully composed, world-space town street.
 */
export function composeTownStreet(caps: TownCapabilities): TownStreet {
  const included = TOWN_STOREFRONT_CATALOG.filter((record) => record.isAvailable(caps));
  const facades: ComposedFacade[] = [];
  let cursorX = TOWN_STREET_END_PADDING;
  for (const record of included) {
    const facade = placeFacade(record, cursorX, caps);
    facades.push(facade);
    // Advance past this facade plus the inter-facade gap for the next one.
    cursorX = facade.facadeRect.x + facade.facadeRect.width + TOWN_FACADE_GAP;
  }
  // The last cursor advance added a trailing gap; the world's right pad replaces
  // it, so the world ends one gap short of the cursor plus the end padding.
  const lastFacade = facades[facades.length - 1];
  const contentRight =
    lastFacade === undefined
      ? TOWN_STREET_END_PADDING
      : lastFacade.facadeRect.x + lastFacade.facadeRect.width;
  const worldWidth = contentRight + TOWN_STREET_END_PADDING;
  const spawn = corralSpawn(facades);
  const exits = buildExitZones(worldWidth);
  return {
    facades,
    worldWidth,
    worldHeight: WORLD_HEIGHT,
    streetTopY: STREET_TOP_Y,
    streetLaneY: STREET_LANE_Y,
    facadeBottomY: FACADE_BOTTOM_Y,
    spawn,
    exits,
    capabilities: caps,
  };
}

//============================================
/**
 * Compose the town street for an engine game mode: the convenience wrapper the
 * scene uses. The walker imports composeTownStreet (or this) to DISCOVER the
 * active street, never a hardcoded facade list.
 *
 * @param mode - The active engine game mode.
 * @returns The composed street for that mode.
 */
export function composeTownStreetForMode(mode: GameMode): TownStreet {
  return composeTownStreet(townCapabilitiesForMode(mode));
}

//============================================
/**
 * The corral street position, the development-turn spawn anchor. Falls back to
 * the world center when a (hypothetical) capability set omits the corral, so
 * composition stays total.
 *
 * @param facades - The composed facades.
 * @returns The spawn point in the street lane.
 */
function corralSpawn(facades: readonly ComposedFacade[]): Vec2 {
  for (const facade of facades) {
    if (facade.id === "corral") {
      return { x: facade.doorCenterX, y: STREET_LANE_Y };
    }
  }
  const last = facades[facades.length - 1];
  const centerX = last === undefined ? TOWN_STREET_END_PADDING : last.doorCenterX;
  return { x: centerX, y: STREET_LANE_Y };
}

//============================================
/**
 * The two endpoint exit zones, capping the street lane at each end.
 *
 * @param worldWidth - The composed world width.
 * @returns The left and right exit zones.
 */
function buildExitZones(worldWidth: number): readonly TownExitZone[] {
  const left: TownExitZone = {
    side: "left",
    rect: { x: 0, y: STREET_TOP_Y, width: TOWN_EXIT_WIDTH, height: TOWN_STREET_HEIGHT },
  };
  const right: TownExitZone = {
    side: "right",
    rect: {
      x: worldWidth - TOWN_EXIT_WIDTH,
      y: STREET_TOP_Y,
      width: TOWN_EXIT_WIDTH,
      height: TOWN_STREET_HEIGHT,
    },
  };
  return [left, right];
}

//============================================
/**
 * Look up a composed facade by id.
 *
 * @param street - The composed street.
 * @param id - The storefront id to find.
 * @returns The composed facade, or undefined when the street omits it.
 */
export function facadeById(street: TownStreet, id: StorefrontId): ComposedFacade | undefined {
  return street.facades.find((facade) => facade.id === id);
}
