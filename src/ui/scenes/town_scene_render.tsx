// Presentational SVG for the walkable town interior (town_scene.tsx).
//
// This module holds the pure render layer extracted from town_scene.tsx: the
// composed-street facades, doors, resource/identity emblems, worn-street
// surface patches, and endpoint-exit markers, plus the pub payout banner. Every
// export here is presentational -- props in, SVG out. Nothing in this module
// owns signals, mutates avatar/camera state, or drives the rAF loop; the scene
// shell (town_scene.tsx) owns all of that and wires these components with the
// reactive accessors and the live store they read.

import { For } from "solid-js";
import type { JSX } from "solid-js";
import { computeOutfitCost } from "../../engine/store";
import type { GameStore } from "../game_store";
import { townExitSymbolId } from "../sprites/sprites_town";
import { TOWN_DOOR_WIDTH } from "./town_world";
import type { TownStreet, ComposedFacade, StorefrontId, TownEndpoint } from "./town_world";

/** Rendered size of an endpoint-exit marker in world pixel units. */
const EXIT_MARKER_SIZE = 34;

// ============================================================================
// Facade signage layout: fixed offsets from a facade's top-left
// corner (facadeRect.x, facadeRect.y), shared by every composed facade
// regardless of width, so the trim band, label, emblem badge, ambient slot,
// and door all line up on the same rows across a street of any length.
// ============================================================================

/** Height of the colored trim/awning band capping every facade. */
const FACADE_TRIM_HEIGHT = 14;
/** Baseline y (from the facade top) of the persistent signage label. */
const FACADE_LABEL_BASELINE_Y = 34;
/** Center y (from the facade top) of the resource-emblem badge. */
const FACADE_EMBLEM_CENTER_Y = 70;
/** Radius of the emblem badge backdrop circle. */
const FACADE_EMBLEM_BADGE_RADIUS = 20;
/** Baseline y (from the facade top) of the reserved ambient-economics slot. */
const FACADE_AMBIENT_BASELINE_Y = 102;
/**
 * Visual door height in world px, taller than town_world.ts's
 * TOWN_THRESHOLD_DEPTH collision notch so the door reads as a real doorway a
 * person could walk through -- only the shallow bottom slice is ever
 * solid/enterable; this is a render-only choice, town_world.ts alone owns
 * collision geometry.
 */
const FACADE_DOOR_VISUAL_HEIGHT = 58;
/** Half the door width, one leaf's width (TOWN_DOOR_WIDTH is the pair). */
const FACADE_DOOR_LEAF_WIDTH = TOWN_DOOR_WIDTH / 2;
/** Fixed spacing between worn-street surface patches, in world px. */
const STREET_WORN_PATCH_SPACING = 96;
/**
 * How long the pub payout banner stays up, in ms, matching the overworld
 * scene's wampus-catch-banner hold (WAMPUS_CATCH_BANNER_MS).
 */
const PUB_BANNER_HOLD_MS = 2200;

/** Reactive accessor a door marker uses to render its open/closed state. */
export type DoorOpenAccessor = (id: StorefrontId) => boolean;

//============================================
/**
 * Draw a worn/sandy street surface: a row of flat, low-opacity ellipse
 * patches at fixed spacing across the street lane, standing in for wear and
 * grit (no editor-grid lines, per the visual contract). Positions are a
 * deterministic function of world x (a fixed modulo pattern), never
 * randomized, so the street renders identically every mount and stays stable
 * for screenshot-based visual acceptance.
 *
 * @param props - Carries the composed street to lay patches across.
 * @returns A `<g>` of patch ellipses.
 */
export function WornStreetPatches(props: { street: TownStreet }): JSX.Element {
  const street = props.street;
  const laneY = street.streetLaneY;
  const patchCount = Math.floor(street.worldWidth / STREET_WORN_PATCH_SPACING);
  const patchXs = Array.from(
    { length: patchCount },
    (_, index) => (index + 0.5) * STREET_WORN_PATCH_SPACING,
  );
  return (
    <g class="town-street-worn" aria-hidden="true">
      <For each={patchXs}>
        {(patchX, index) => (
          <ellipse cx={patchX} cy={laneY + (index() % 2 === 0 ? -14 : 12)} rx={22} ry={7} />
        )}
      </For>
    </g>
  );
}

// ============================================================================
// Facade signage helpers: the industrial-facade art layer. Every
// facade shares one plate look, one trim band, one emblem-badge slot, one
// ambient-economics slot, and one integrated door -- what makes each facade
// recognizable is its trim/emblem accent color and its emblem shape, keyed
// off the catalog's stable `icon` string (town_world.ts), never a hand-listed
// per-facade branch. An icon this map does not know about still renders (a
// neutral accent plus a generic ring glyph), so a future catalog addition
// draws something reasonable with no code change here.
// ============================================================================

/** Per-icon accent color (trim band, emblem glyph), each 5.5:1+ on the plate. */
const FACADE_ACCENT_BY_ICON: Readonly<Record<string, string>> = {
  smithore: "#c0c0c0",
  energy: "#ffe066",
  food: "#8fd14f",
  corral: "#d9ac6c",
  pub: "#ffd23f",
  land: "#6ea8fe",
  assay: "#ff85d1",
};
/** Fallback accent for a catalog icon this map has not been taught yet. */
const FACADE_ACCENT_FALLBACK = "#9a9ac0";

//============================================
/**
 * The trim/emblem accent color for a facade's icon, or the neutral fallback
 * for an icon not yet in the table.
 *
 * @param icon - The composed facade's `icon` key (town_world.ts catalog).
 * @returns A hex color at or above the house 5.5:1 contrast target on the
 *   facade plate fill.
 */
function facadeAccentColor(icon: string): string {
  return FACADE_ACCENT_BY_ICON[icon] ?? FACADE_ACCENT_FALLBACK;
}

/** Props for a facade's reactive ambient-economics slot content. */
interface FacadeAmbientProps {
  /** The composed facade whose ambient slot this renders. */
  readonly facade: ComposedFacade;
  /** The live game store, read through the transaction-state selector list. */
  readonly store: GameStore;
}

//============================================
/**
 * Render a facade's live ambient-economics text. Every branch reads from the
 * transaction-state selector list (town_world.ts module doc comment) -- the
 * SAME store paths CorralPurchasePanel reads and the SAME helper
 * outfitAtFacade uses to compute a cost -- so the facade, the panel, and the
 * walker can never disagree on a figure. The corral's price and stock are
 * live store accessors read directly in the JSX text position, which Solid
 * keeps reactive with no local signal or memo needed. The pub's label is a
 * fixed fact about the door, not a value. The Land Office and Assay Office
 * render a truthful neutral label: the engine exposes no per-town land-sale
 * or assay-arm state reachable from this scene today, and inventing one
 * would violate the truthful-ambient-text contract.
 *
 * @param props - Carries the composed facade and the live game store.
 * @returns The ambient slot's child content (text / tspans).
 */
function FacadeAmbientContent(props: FacadeAmbientProps): JSX.Element {
  switch (props.facade.ambientKind) {
    case "mule-price-stock":
      return (
        <>
          <tspan data-ambient-price>{`Price $${props.store.state.store.mulePrice}`}</tspan>
          {" / "}
          <tspan data-ambient-stock>{`Stock ${props.store.state.store.muleStock}`}</tspan>
        </>
      );
    case "outfit-price":
      return <OutfitAmbientPrice facade={props.facade} />;
    case "turn-end":
      return <>Ends turn</>;
    case "land-availability":
      // TODO: the engine's land-grant/land-auction phases are
      // colony-wide systems, not a per-town Land Office concept, so no
      // availability state exists for this facade to read yet. The Land
      // Office panel is where that state should first be modeled.
      return <>Land office</>;
    case "assay-status":
      // TODO: the armed/idle assay signal lives in
      // human_develop_layer.tsx (assayArmed) and is not passed down to this
      // scene today. Wire it through TownSceneProps when the Assay Office
      // panel needs it, rather than duplicating a second assay-state source.
      return <>Assay office</>;
  }
}

//============================================
/**
 * The primary outfit resource's live price for an outfitter facade, read via
 * `computeOutfitCost` (src/engine/store.ts) -- the SAME helper
 * `outfitAtFacade` uses to price a purchase, so the facade and the dispatch
 * path can never disagree. `outfitResources[0]` is the facade's primary
 * resource (mining's is smithore in every mode the catalog currently
 * composes; see town_world.ts's confirmed per-mode table).
 *
 * @param props - Carries the composed outfitter facade.
 * @returns The priced ambient text, or a neutral fallback for a facade whose
 *   catalog record carries no outfit resources (never true for an
 *   `outfit-price` facade today, kept only so the switch stays total).
 */
function OutfitAmbientPrice(props: { facade: ComposedFacade }): JSX.Element {
  const resource = props.facade.outfitResources?.[0];
  if (resource === undefined) {
    return <>Price --</>;
  }
  return <tspan data-ambient-price>{`Price $${computeOutfitCost(resource)}`}</tspan>;
}

//============================================
/**
 * The point string for a regular gear/cog silhouette centered on the origin,
 * alternating an outer tooth-tip radius and an inner root radius around the
 * circle.
 *
 * @param outerRadius - Distance from center to each tooth tip.
 * @param innerRadius - Distance from center to each tooth root.
 * @param toothCount - Number of teeth around the gear.
 * @returns An SVG `points` attribute value.
 */
function gearPolygonPoints(outerRadius: number, innerRadius: number, toothCount: number): string {
  const points: string[] = [];
  const stepAngle = Math.PI / toothCount;
  for (let toothIndex = 0; toothIndex < toothCount * 2; toothIndex++) {
    const angle = toothIndex * stepAngle;
    const radius = toothIndex % 2 === 0 ? outerRadius : innerRadius;
    points.push(
      `${(radius * Math.cos(angle)).toFixed(1)},${(radius * Math.sin(angle)).toFixed(1)}`,
    );
  }
  return points.join(" ");
}

/** Props for one facade's resource/identity emblem. */
interface FacadeEmblemProps {
  /** The catalog icon key selecting which glyph shape to draw. */
  readonly icon: string;
  /** World x of the emblem badge center (the facade's door center). */
  readonly centerX: number;
  /** World y of the emblem badge center. */
  readonly centerY: number;
}

//============================================
/**
 * Draw a facade's resource/identity emblem: a dark badge circle with an
 * icon-specific glyph in the facade's accent color, so a player reads
 * identity by shape and color, not by memorizing text position. Mirrors the
 * resource-emblem convention in docs/SCREEN_DESIGNS.md (a sheaf for food, a
 * bolt for energy, a gear for smithore) and extends it to the non-resource
 * storefronts (a mule for the corral, a mug for the pub, a deed for the land
 * office, a balance for the assay office). An icon this component does not
 * recognize still draws a generic ring, per the module doc comment.
 *
 * @param props - Carries the icon key and the badge center in world space.
 * @returns The emblem `<g>` group (badge backdrop plus glyph).
 */
function FacadeEmblem(props: FacadeEmblemProps): JSX.Element {
  const accent = facadeAccentColor(props.icon);
  return (
    <g
      class="town-facade-emblem"
      transform={`translate(${props.centerX} ${props.centerY})`}
      aria-hidden="true"
    >
      <circle class="town-facade-emblem-badge" r={FACADE_EMBLEM_BADGE_RADIUS} />
      <FacadeEmblemGlyph icon={props.icon} accent={accent} />
    </g>
  );
}

//============================================
/**
 * Draw the icon-specific glyph inside an emblem badge, centered on the
 * origin at roughly +-13 world px, in the facade's accent color.
 *
 * @param props - Carries the icon key and the resolved accent color.
 * @returns The glyph shape(s) for that icon, or a generic ring fallback.
 */
function FacadeEmblemGlyph(props: { icon: string; accent: string }): JSX.Element {
  const accent = props.accent;
  switch (props.icon) {
    case "smithore":
      return (
        <>
          <polygon points={gearPolygonPoints(13, 8, 8)} fill={accent} />
          <circle r={3} class="town-facade-emblem-badge" />
        </>
      );
    case "energy":
      return (
        <polygon points="4.4,-13.2 -6.6,2.2 0,2.2 -2.2,13.2 8.8,-2.2 2.2,-2.2" fill={accent} />
      );
    case "food":
      return (
        <>
          <path d="M -8,10 Q -10,-6 -2,-14" stroke={accent} stroke-width="3" fill="none" />
          <path d="M 0,10 Q 0,-8 0,-15" stroke={accent} stroke-width="3" fill="none" />
          <path d="M 8,10 Q 10,-6 2,-14" stroke={accent} stroke-width="3" fill="none" />
          <rect x={-9} y={7} width={18} height={4} rx={2} fill={accent} />
        </>
      );
    case "corral":
      return (
        <>
          <rect x={-11} y={-3} width={22} height={10} rx={3} fill={accent} />
          <rect x={6} y={-9} width={9} height={8} rx={2} fill={accent} />
          <polygon points="7,-10 5,-14 9,-11" fill={accent} />
          <polygon points="12,-10 14,-14 10,-11" fill={accent} />
          <rect x={-9} y={6} width={3} height={7} fill={accent} />
          <rect x={-2} y={6} width={3} height={7} fill={accent} />
          <rect x={5} y={6} width={3} height={7} fill={accent} />
          <rect x={8} y={6} width={3} height={7} fill={accent} />
        </>
      );
    case "pub":
      return (
        <>
          <rect x={-9} y={-9} width={15} height={18} rx={2} fill={accent} />
          <path d="M 6,-5 a 6,6 0 0 1 0,10" stroke={accent} stroke-width="3" fill="none" />
        </>
      );
    case "land":
      return (
        <>
          <rect x={-11} y={-13} width={22} height={26} rx={1} fill={accent} />
          <line x1={-7} y1={-4} x2={7} y2={-4} stroke="#14142a" stroke-width="1.5" opacity="0.6" />
          <line x1={-7} y1={1} x2={7} y2={1} stroke="#14142a" stroke-width="1.5" opacity="0.6" />
          <line x1={-7} y1={6} x2={3} y2={6} stroke="#14142a" stroke-width="1.5" opacity="0.6" />
        </>
      );
    case "assay":
      return (
        <>
          <line x1={0} y1={-12} x2={0} y2={-4} stroke={accent} stroke-width="2" />
          <line x1={-10} y1={-8} x2={10} y2={-8} stroke={accent} stroke-width="2" />
          <line x1={-10} y1={-8} x2={-10} y2={0} stroke={accent} stroke-width="1.5" />
          <line x1={10} y1={-8} x2={10} y2={0} stroke={accent} stroke-width="1.5" />
          <path d="M -13,0 a 3,2.5 0 0 0 6,0 Z" stroke={accent} stroke-width="1.5" fill="none" />
          <path d="M 7,0 a 3,2.5 0 0 0 6,0 Z" stroke={accent} stroke-width="1.5" fill="none" />
        </>
      );
    default:
      return <circle r={10} fill="none" stroke={accent} stroke-width="2" />;
  }
}

/** Props for one composed facade drawn on the street. */
interface FacadeViewProps {
  /** The composed facade to draw, with its world-space geometry. */
  readonly facade: ComposedFacade;
  /** Accessor for the facade's door open/closed state, passed to its marker. */
  readonly isDoorOpen: DoorOpenAccessor;
  /** The live game store, for the ambient-economics slot's live figures. */
  readonly store: GameStore;
}

//============================================
/**
 * Draw one composed facade as a full-height industrial storefront: a shared
 * plate with a corrugated-panel texture, a colored trim/awning band, a
 * persistent signage label, a resource/identity emblem badge, a live
 * ambient-economics slot, and one integrated door sitting flush in the
 * facade at street level. Every facade shares this same layout keyed only
 * off its catalog fields (label, icon, ambientKind), so a composed street of
 * any length renders correctly with no hardcoded per-facade branch.
 *
 * @param props - Carries the composed facade, its door-open accessor, and
 *   the live game store the ambient slot reads.
 * @returns The facade `<g data-facade>` group.
 */
export function FacadeView(props: FacadeViewProps): JSX.Element {
  const facade = props.facade;
  const rect = facade.facadeRect;
  const accent = facadeAccentColor(facade.icon);
  return (
    <g data-facade={facade.id} class="town-facade">
      <rect
        class="town-facade-rect"
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
      />
      <FacadeTexture rect={rect} />
      <rect
        class="town-facade-trim"
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={FACADE_TRIM_HEIGHT}
        fill={accent}
      />
      <text
        class="town-facade-label"
        x={facade.doorCenterX}
        y={rect.y + FACADE_LABEL_BASELINE_Y}
        text-anchor="middle"
      >
        {facade.label}
      </text>
      <FacadeEmblem
        icon={facade.icon}
        centerX={facade.doorCenterX}
        centerY={rect.y + FACADE_EMBLEM_CENTER_Y}
      />
      <text
        class="town-facade-ambient"
        data-ambient-kind={facade.ambientKind}
        x={facade.doorCenterX}
        y={rect.y + FACADE_AMBIENT_BASELINE_Y}
        text-anchor="middle"
      >
        <FacadeAmbientContent facade={facade} store={props.store} />
      </text>
      <TownDoorMarker facade={facade} isDoorOpen={props.isDoorOpen} />
    </g>
  );
}

//============================================
/**
 * Draw a facade's corrugated-panel texture: evenly spaced thin vertical
 * seams across the plate, a flat low-opacity overlay (no gradients, per the
 * house shading budget) rather than a fill on `.town-facade-rect` itself, so
 * that class keeps a single solid computed fill for the label's contrast
 * check (tests/playwright/town_street.spec.mjs).
 *
 * @param props - Carries the facade's rect to texture.
 * @returns A `<g>` of seam lines, or an empty fragment for a very narrow rect.
 */
function FacadeTexture(props: { rect: ComposedFacade["facadeRect"] }): JSX.Element {
  const rect = props.rect;
  const seamSpacing = 18;
  const seamCount = Math.max(0, Math.floor(rect.width / seamSpacing) - 1);
  const seamXs = Array.from(
    { length: seamCount },
    (_, index) => rect.x + (index + 1) * seamSpacing,
  );
  return (
    <g class="town-facade-texture" aria-hidden="true">
      <For each={seamXs}>
        {(seamX) => <line x1={seamX} y1={rect.y} x2={seamX} y2={rect.y + rect.height} />}
      </For>
    </g>
  );
}

/** Props for a storefront door marker sitting in a facade's doorway. */
interface TownDoorMarkerProps {
  /** The composed facade whose doorway this marker fills. */
  readonly facade: ComposedFacade;
  /** Accessor for this door's open/closed state (drives the visible state). */
  readonly isDoorOpen: DoorOpenAccessor;
}

//============================================
/**
 * Draw one integrated two-leaf door sitting flush in a facade's doorway at
 * street level, carrying the `[data-door-for]` hook and a reactive
 * `[data-door-state]` of `open`/`closed` (read by tests, the walker, and the
 * CSS door animation below). The two leaves slide apart into the jambs on
 * open and slide back flush on close, purely via CSS transform driven by the
 * `data-door-state` attribute (see `.town-door-leaf-left`/`-right` in
 * style.css) -- this component only ever writes the state attribute, never a
 * per-frame transform, so the door's own render stays fully declarative.
 *
 * @param props - Carries the composed facade and its open-state accessor.
 * @returns The door marker `<g data-door-for>` group.
 */
function TownDoorMarker(props: TownDoorMarkerProps): JSX.Element {
  const facade = props.facade;
  const open = (): boolean => props.isDoorOpen(facade.id);
  const bottomY = facade.facadeRect.y + facade.facadeRect.height;
  const doorTopY = bottomY - FACADE_DOOR_VISUAL_HEIGHT;
  const leftX = facade.doorCenterX - FACADE_DOOR_LEAF_WIDTH;
  return (
    <g data-door-for={facade.id} data-door-state={open() ? "open" : "closed"} class="town-door">
      <rect
        class="town-door-frame"
        x={leftX}
        y={doorTopY}
        width={FACADE_DOOR_LEAF_WIDTH * 2}
        height={FACADE_DOOR_VISUAL_HEIGHT}
      />
      <g class="town-door-leaf town-door-leaf-left">
        <rect
          class="town-door-panel"
          x={leftX}
          y={doorTopY}
          width={FACADE_DOOR_LEAF_WIDTH}
          height={FACADE_DOOR_VISUAL_HEIGHT}
        />
        <rect
          class="town-door-handle"
          x={facade.doorCenterX - 4}
          y={doorTopY + FACADE_DOOR_VISUAL_HEIGHT / 2 - 6}
          width={2.5}
          height={12}
        />
      </g>
      <g class="town-door-leaf town-door-leaf-right">
        <rect
          class="town-door-panel"
          x={facade.doorCenterX}
          y={doorTopY}
          width={FACADE_DOOR_LEAF_WIDTH}
          height={FACADE_DOOR_VISUAL_HEIGHT}
        />
        <rect
          class="town-door-handle"
          x={facade.doorCenterX + 1.5}
          y={doorTopY + FACADE_DOOR_VISUAL_HEIGHT / 2 - 6}
          width={2.5}
          height={12}
        />
      </g>
    </g>
  );
}

/** Props for one endpoint-exit marker. */
interface ExitMarkerProps {
  /** Which street endpoint this marker caps. */
  readonly side: TownEndpoint;
  /** World x of the exit-zone center. */
  readonly centerX: number;
  /** World y of the exit-zone center (the street lane center). */
  readonly centerY: number;
}

//============================================
/**
 * Draw one endpoint-exit marker in the street lane at a street end, carrying a
 * `[data-exit]` hook. The horizontal endpoints reuse the west/east chevron
 * sprites so the arrow points off that end of the street.
 *
 * @param props - Carries the endpoint side and its world-space center.
 * @returns The exit marker `<g data-exit>` group.
 */
export function ExitMarker(props: ExitMarkerProps): JSX.Element {
  const symbolDirection = props.side === "left" ? "west" : "east";
  return (
    <g data-exit={props.side} class="town-exit">
      <use
        href={`#${townExitSymbolId(symbolDirection)}`}
        x={props.centerX - EXIT_MARKER_SIZE / 2}
        y={props.centerY - EXIT_MARKER_SIZE / 2}
        width={EXIT_MARKER_SIZE}
        height={EXIT_MARKER_SIZE}
      />
    </g>
  );
}

//============================================
/**
 * Show the pub's payout as a brief, self-dismissing banner appended directly to
 * `document.body`. See town_scene.tsx's module doc comment: confirming a gamble
 * dispatches an action that always ends the turn, which unmounts the scene
 * synchronously as part of that same dispatch call -- so the banner cannot be
 * local Solid state (it would never render before its own owner tears down). A
 * plain DOM node outside Solid's ownership survives that teardown.
 *
 * @param amount - The dollar payout the engine added to the human's money.
 * @param reducedMotion - Whether to gate the CSS entrance animation, mirroring
 *   the event-banner/wampus-catch-banner `data-reduced-motion` convention.
 */
export function showPubBanner(amount: number, reducedMotion: boolean): void {
  const banner = document.createElement("div");
  banner.className = "pub-banner";
  banner.setAttribute("data-pub-banner", "");
  banner.setAttribute("data-pub-banner-amount", String(amount));
  banner.setAttribute("data-reduced-motion", reducedMotion ? "true" : "false");
  banner.setAttribute("role", "status");
  banner.setAttribute("aria-live", "polite");
  banner.textContent = `Pub payout: +$${amount}`;
  document.body.appendChild(banner);
  window.setTimeout(() => {
    banner.remove();
  }, PUB_BANNER_HOLD_MS);
}
