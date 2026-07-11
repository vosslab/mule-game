// Walkable town interior for the human's develop turn.
//
// This scene renders the mode-composed scrolling street from town_world.ts
// through the horizontal camera in town_camera.ts. When the overworld avatar
// steps onto the town cell it enters here, a self-contained walkable interior.
// The player walks an avatar (species by player slot, tinted the player color)
// along the street, tows a bought M.U.L.E. behind it, and uses storefront doors
// by walking through them: the corral buys a M.U.L.E. (buy_mule), the outfit
// facades outfit the carried M.U.L.E. (outfit_mule), the pub gambles (gamble),
// and the assay office arms an assay so the next plot the avatar stands on back
// in the overworld is assayed. The two street-endpoint exits return to the
// overworld.
//
// Camera and reactivity (the risk-register concern): the composed street's
// facades, doors, and exits render ONCE inside a world-space group -- the street
// never re-composes mid-turn (mode is fixed for the game). The camera scrolls by
// writing that group's `transform` imperatively in the rAF loop (bypassing
// reactivity for 60fps), the same imperative-write pattern the avatar and tow
// use. Only two things are reactive: each door's open/closed state (a
// fine-grained signal, so approaching a door re-renders just that one door
// marker) and the notice/gamble-confirm/corral-panel derived state. The camera
// offset and the avatar/tow transforms are never signals, so the per-frame
// imperative writes and Solid's fine-grained reactivity never fight over the
// same DOM.
//
// Pub gambling always ends the turn, so it needs a confirm step (one
// accidental keypress must not end a turn) and its payout banner cannot live
// in this component's own reactive tree: dispatching `gamble` synchronously
// flips the human's develop payload away (game_screen.tsx's HumanDevelopLayer
// mount is gated on `activePlayer === HUMAN_ID`), which tears this whole scene
// down as part of that same dispatch call, before any code after it in this
// module could render. `showPubBanner` (town_scene_render.tsx) sidesteps that by
// appending a plain DOM node straight to `document.body`, outside Solid's
// ownership, so it survives the teardown.
//
// Town is a UI sub-state of the human's develop turn, not an engine phase: the
// engine stays in `develop`, so the scene manager keeps draining the turn's
// tick budget the whole time the player is in town (this scene owns no ticks --
// it only moves presentation state and dispatches semantic Actions at doors).
// When the tick budget runs out the develop turn ends, the phase changes, and
// the whole develop overlay (this scene included) unmounts.
//
// The presentational SVG (facades, doors, emblems, street surface, exit
// markers, pub banner) lives in town_scene_render.tsx; this file owns the
// component shell, the rAF movement/camera loop, the interaction state machine,
// and the panel wiring.

import { createSignal, createMemo, onMount, onCleanup, untrack, Show, For } from "solid-js";
import type { JSX } from "solid-js";
import type { DevelopPayload } from "../../engine/game_state";
import type { Resource } from "../../engine/player";
import type { GameStore } from "../game_store";
import { HUMAN_ID } from "../game_driver";
import { createKeyState } from "../input";
import { playerColor } from "../sprites";
import { CorralPurchasePanel } from "../solid/corral_purchase_panel";
import { OutfitPanel } from "../solid/outfit_panel";
import { LandOfficePanel } from "../solid/land_office_panel";
import { AssayOfficePanel } from "../solid/assay_office_panel";
import { pickSpeciesFrameId, buildSpeciesSpriteDefsMarkup } from "../sprites/sprites_species";
import {
  MULE_TOWED_ID,
  muleOutfitSymbolId,
  buildMuleSpriteDefsMarkup,
} from "../sprites/sprites_mule";
import { buildTownSpriteDefsMarkup } from "../sprites/sprites_town";
import {
  WALKER_SPEED_PX_PER_SEC,
  TOW_FOLLOW_DISTANCE,
  directionFromKeys,
  stepPosition,
  stepTowFollower,
} from "./walker";
import type { Vec2, Bounds } from "./walker";
import type { TownExit } from "./zones";
import {
  composeTownStreetForMode,
  TOWN_AVATAR_SIZE,
  TOWN_AVATAR_RADIUS,
  TOWN_REFERENCE_VIEWPORT_WIDTH,
} from "./town_world";
import type {
  TownStreet,
  ComposedFacade,
  StorefrontId,
  OpenDoorSet,
  PanelKind,
} from "./town_world";
import {
  resolveTownWalk,
  computeOpenDoors,
  townDoorAtThreshold,
  townExitAt,
} from "./town_collision";
import { townCameraOffset } from "./town_camera";
import { WornStreetPatches, FacadeView, ExitMarker, showPubBanner } from "./town_scene_render";
import type { DoorOpenAccessor } from "./town_scene_render";
import {
  doorSetsEqual,
  endpointToTownExit,
  movementPhaseAt,
  movementDoorEqual,
  streetSideOfDoor,
} from "./town_interaction";
import type { TownInteractionState } from "./town_interaction";

/** Rendered towed-M.U.L.E. size in town pixel units. */
const MULE_SIZE = 34;
/** Outfit-badge size drawn on the towed M.U.L.E. */
const BADGE_SIZE = 14;
/** Real milliseconds between walk-cycle frame swaps while moving. */
const WALK_FRAME_MS = 180;
/** Largest real frame delta consumed, so a backgrounded tab does not lurch. */
const MAX_FRAME_MS = 100;

/** Movement key sets, sampled each frame from the held-key poller. */
const UP_KEYS = ["ArrowUp", "w", "W"] as const;
const DOWN_KEYS = ["ArrowDown", "s", "S"] as const;
const LEFT_KEYS = ["ArrowLeft", "a", "A"] as const;
const RIGHT_KEYS = ["ArrowRight", "d", "D"] as const;
/**
 * Keys that confirm a pending gamble dialog. Door entry is walk-in (no keypress)
 * per the town interaction model, so these keys now only drive the pub's
 * gamble-and-end-turn confirmation, never a door.
 */
const ACTION_KEYS = new Set(["Enter", " "]);
/** Key that declines a pending gamble confirmation. */
const CANCEL_KEY = "Escape";

/** Props for the town scene. */
export interface TownSceneProps {
  /** The live game store, for dispatch and current-state reads. */
  readonly store: GameStore;
  /** Reactive accessor for the human develop payload. */
  readonly payload: () => DevelopPayload;
  /** Called when the avatar walks into a street-endpoint exit, to return to the overworld. */
  readonly onExit: (exit: TownExit) => void;
  /** Called when the avatar uses the assay door, to arm an overworld assay. */
  readonly onArmAssay: () => void;
}

//============================================
/**
 * Read the scene-speed multiplier from the URL `?speed=` param so avatar motion
 * speeds up in step with the develop tick budget under `?speed=`.
 *
 * @returns A positive speed multiplier; 1 when absent or malformed.
 */
function readSpeedMultiplier(): number {
  if (typeof window === "undefined") {
    return 1;
  }
  const raw = new URLSearchParams(window.location.search).get("speed");
  if (raw === null) {
    return 1;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isNaN(parsed) || parsed <= 0 ? 1 : parsed;
}

//============================================
/**
 * Whether the OS/browser requests reduced motion. Read once at scene mount.
 *
 * @returns True when `prefers-reduced-motion: reduce` matches.
 */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

//============================================
/**
 * Render the walkable town interior for the human's develop turn.
 *
 * @param props - Carries the store, develop payload accessor, and the exit and
 *   arm-assay callbacks.
 * @returns The town scene fragment (composed street, avatar, notice, controls).
 */
export function TownScene(props: TownSceneProps): JSX.Element {
  const reducedMotion = prefersReducedMotion();
  const speed = WALKER_SPEED_PX_PER_SEC * readSpeedMultiplier();
  // The human's title-screen species pick and the active game mode: read once at
  // mount (untracked), matching overworld_scene.tsx's convention -- neither a
  // player's species nor the game mode changes mid-game, so the street is
  // composed exactly once and never re-composed while the scene lives.
  const species = untrack(() => props.store.state.players[HUMAN_ID].species);
  const mode = untrack(() => props.store.state.mode);
  const tint = playerColor(HUMAN_ID);

  // The mode-composed street: the SINGLE source of truth for geometry, doors,
  // exits, spawn, and collision. Composed once; the renderer, camera, and rAF
  // loop below all read from this one object.
  const street: TownStreet = composeTownStreetForMode(mode);
  const worldBounds: Bounds = { width: street.worldWidth, height: street.worldHeight };
  // A door id -> composed facade lookup, so a walk-in can route by panel kind
  // and resolve its outfit resource without re-scanning the facade list.
  const facadesById = new Map<StorefrontId, ComposedFacade>(
    street.facades.map((facade) => [facade.id, facade]),
  );

  // Presentation-only world-pixel state, mutated in the rAF loop (not reactive).
  const spawn: Vec2 = street.spawn;
  let avatarPos: Vec2 = spawn;
  let towPos: Vec2 = { x: spawn.x - TOW_FOLLOW_DISTANCE, y: spawn.y };
  // The camera offset: the world x that maps to screen x = 0. Written to the
  // world group's transform imperatively each frame, never a signal.
  let cameraOffset = townCameraOffset(spawn.x, street.worldWidth, TOWN_REFERENCE_VIEWPORT_WIDTH);
  let walkAccumMs = 0;

  // Reactive derived state (drives the sprite frame, facing, and the notice).
  const [facing, setFacing] = createSignal<1 | -1>(1);
  const [walkFrame, setWalkFrame] = createSignal<1 | 2>(1);
  const [notice, setNotice] = createSignal<string | null>(null);
  // The explicit interaction state machine: one signal of the
  // TownInteractionState union replaces the old confirmingGamble/corralPanelOpen
  // booleans. The fixed walk-in / attempt-then-confirm contract
  // (docs/HUMAN_GUIDANCE.md "Town interaction model") is enforced structurally
  // by this state -- movement freezes in panel-open/leaving, entry opens a panel
  // with no economic side effect, and dismissing a panel returns the avatar to
  // the street side of its door.
  const [townState, setTownState] = createSignal<TownInteractionState>({ phase: "street" });
  // Movement is frozen while a panel/confirm is up (panel-open) or the scene is
  // handing back to the overworld (leaving). The rAF loop reads this each frame;
  // reading a signal outside a tracking scope creates no subscription.
  const isFrozen = (): boolean => {
    const phase = townState().phase;
    return phase === "panel-open" || phase === "leaving";
  };
  // The pub keeps its notice-driven gamble confirm (reuse of the existing
  // dialog); this derives the legacy confirming flag from the unified state so
  // the #town-scene [data-gamble-confirming] hook (pub_gamble.spec.mjs) and the
  // document action-key handler stay pub-scoped.
  const isConfirmingGamble = (): boolean => {
    const state = townState();
    return state.phase === "panel-open" && state.panel === "pub";
  };
  // Derived panel routing: exactly one panel renders for the active panel-open
  // door. Every door kind now has its own dedicated panel component: the
  // corral's CorralPurchasePanel, outfit's OutfitPanel, and the Land
  // Office / Assay Office's LandOfficePanel / AssayOfficePanel.
  const corralPanelOpen = (): boolean => {
    const state = townState();
    return state.phase === "panel-open" && state.panel === "corral";
  };
  // Shared accessor for the three panel kinds that each mount a facade-carrying
  // panel: returns the open door's facade only while townState is parked on
  // panel-open for that specific panel kind, else null.
  function panelFacadeFor(panel: PanelKind): ComposedFacade | null {
    const state = townState();
    if (state.phase === "panel-open" && state.panel === panel) {
      return facadesById.get(state.door) ?? null;
    }
    return null;
  }
  const outfitPanelState = (): ComposedFacade | null => panelFacadeFor("outfit");
  const landPanelState = (): ComposedFacade | null => panelFacadeFor("land-office");
  const assayPanelState = (): ComposedFacade | null => panelFacadeFor("assay-office");
  const carrying = createMemo(() => props.payload().carriedMule);
  const frameId = createMemo(() => pickSpeciesFrameId(species, walkFrame(), reducedMotion));

  // Door open/closed state, driven by avatar proximity (town_world's
  // computeOpenDoors, with hysteresis). Two views of one set: `openDoors` is the
  // mutable per-frame value the rAF loop reads for collision and the walk-in
  // trigger; `openDoorsSignal` mirrors it reactively so each door marker renders
  // its own open/closed state. refreshDoors updates them together, so the drawn
  // door and the solid door can never disagree.
  let openDoors: OpenDoorSet = computeOpenDoors(street, spawn, new Set());
  const [openDoorsSignal, setOpenDoorsSignal] = createSignal<OpenDoorSet>(openDoors);
  const isDoorOpen: DoorOpenAccessor = (id) => openDoorsSignal().has(id);
  // Walk-in edge-trigger latch: the door whose inner threshold the avatar
  // currently occupies. A single walk-in fires its interaction once and does not
  // re-fire while the avatar lingers inside; walking out and back in re-arms it.
  let enteredDoor: StorefrontId | null = null;

  let worldGroupRef: SVGGElement | undefined;
  let avatarRef: SVGGElement | undefined;
  let towRef: SVGGElement | undefined;

  //------------------------------------------
  // Advance one presentation frame: sample held keys, move the avatar and the
  // towed follower against the composed street's collision, scroll the camera,
  // publish door state, and auto-exit at a street endpoint.
  function updateFrame(dtSeconds: number, keys: ReturnType<typeof createKeyState>): void {
    // Freeze all world movement while a panel/confirm is up (panel-open) or the
    // scene is handing back to the overworld (leaving): the rAF loop simply does
    // not integrate motion in those phases (the structural movement-freeze that
    // enforces "movement freezes while a panel is open").
    if (isFrozen()) {
      return;
    }
    // Open/close doors for the avatar's current position before moving, so this
    // frame's collision and walk-in trigger read a door state consistent with
    // where the avatar already stands (a door opens as it is approached).
    refreshDoors();
    const direction = directionFromKeys({
      up: keys.anyDown(UP_KEYS),
      down: keys.anyDown(DOWN_KEYS),
      left: keys.anyDown(LEFT_KEYS),
      right: keys.anyDown(RIGHT_KEYS),
    });
    const moving = direction.x !== 0 || direction.y !== 0;
    // Integrate the open-ground move (full speed, clamped to the world bounds),
    // then slide it clear of the solid facades and any closed door. Splitting the
    // two keeps walker.ts free of town geometry: stepPosition owns speed and
    // bounds, resolveTownWalk owns the solid facades and the door thresholds.
    const stepped = stepPosition(
      avatarPos,
      direction,
      speed,
      1,
      dtSeconds,
      worldBounds,
      TOWN_AVATAR_RADIUS,
    );
    avatarPos = resolveTownWalk(street, avatarPos, stepped, TOWN_AVATAR_RADIUS, openDoors);
    towPos = stepTowFollower(towPos, avatarPos, dtSeconds, TOW_FOLLOW_DISTANCE, speed);
    cameraOffset = townCameraOffset(avatarPos.x, street.worldWidth, TOWN_REFERENCE_VIEWPORT_WIDTH);
    writeTransforms();
    updateFacing(direction.x);
    // Endpoint exit wins: latch the terminal leaving phase and fire the
    // overworld handoff exactly once (the isFrozen guard blocks any re-entry
    // even though onExit tears this scene down mid-call).
    const exit = townExitAt(street, avatarPos);
    if (exit !== null) {
      setTownState({ phase: "leaving", exit });
      props.onExit(endpointToTownExit(exit));
      return;
    }
    // Walk-in edge trigger opens a door's panel (panel-open) with no economic
    // side effect; when none fires, reflect the current movement phase.
    detectWalkIn();
    syncMovementPhase();
    updateWalkFrame(moving, dtSeconds);
  }

  //------------------------------------------
  // Recompute which doors are open for the avatar's current position (with
  // hysteresis) and, when membership changed, publish the new set reactively so
  // the door markers re-render. The mutable `openDoors` is the source the rAF
  // loop reads; the signal is only for rendering.
  function refreshDoors(): void {
    const next = computeOpenDoors(street, avatarPos, openDoors);
    if (!doorSetsEqual(next, openDoors)) {
      openDoors = next;
      setOpenDoorsSignal(next);
    }
  }

  //------------------------------------------
  // Fire a door's interaction when the avatar walks into its inner threshold,
  // once per occupancy. Pushing north through an open door into its threshold IS
  // the entry gesture -- no keypress. A closed (solid) door cannot be reached, so
  // its interaction never fires.
  function detectWalkIn(): void {
    const id = townDoorAtThreshold(street, avatarPos);
    if (id === null) {
      enteredDoor = null;
      return;
    }
    if (id === enteredDoor) {
      return;
    }
    enteredDoor = id;
    if (!openDoors.has(id)) {
      return;
    }
    useDoor(id);
  }

  //------------------------------------------
  // Reflect the avatar's street/door-opening/at-threshold movement phase into
  // townState. Never overrides a latched panel-open or leaving phase, and only
  // pushes a new value on a real phase/door change, so the reactive
  // data-town-state binding is not re-run every frame.
  function syncMovementPhase(): void {
    const current = townState();
    if (current.phase === "panel-open" || current.phase === "leaving") {
      return;
    }
    const next = movementPhaseAt(street, avatarPos, openDoors);
    if (current.phase === next.phase && movementDoorEqual(current, next)) {
      return;
    }
    setTownState(next);
  }

  //------------------------------------------
  // Write the world-group camera translate and the avatar/tow transforms
  // directly (bypass reactivity). The world group scrolls by -cameraOffset; the
  // avatar and tow sit at their world positions inside it. World-coordinate
  // `data-` attributes ride along so tests read camera + world position with no
  // pixel math.
  function writeTransforms(): void {
    if (worldGroupRef !== undefined) {
      worldGroupRef.setAttribute("transform", `translate(${-cameraOffset} 0)`);
      worldGroupRef.setAttribute("data-town-camera-offset", String(Math.round(cameraOffset)));
    }
    if (avatarRef !== undefined) {
      avatarRef.setAttribute("transform", `translate(${avatarPos.x} ${avatarPos.y})`);
      avatarRef.setAttribute("data-town-avatar-x", String(Math.round(avatarPos.x)));
      avatarRef.setAttribute("data-town-avatar-y", String(Math.round(avatarPos.y)));
    }
    towRef?.setAttribute("transform", `translate(${towPos.x} ${towPos.y})`);
  }

  //------------------------------------------
  // Flip the avatar to face its horizontal travel direction.
  function updateFacing(dx: number): void {
    if (dx < 0) {
      setFacing(-1);
    } else if (dx > 0) {
      setFacing(1);
    }
  }

  //------------------------------------------
  // Swap the two walk frames on a timer while moving; hold frame 1 when idle or
  // under reduced motion (a positional snap, no walk-cycle animation).
  function updateWalkFrame(moving: boolean, dtSeconds: number): void {
    if (!moving || reducedMotion) {
      walkAccumMs = 0;
      if (walkFrame() !== 1) {
        setWalkFrame(1);
      }
      return;
    }
    walkAccumMs += dtSeconds * 1000;
    if (walkAccumMs >= WALK_FRAME_MS) {
      walkAccumMs = 0;
      setWalkFrame(walkFrame() === 1 ? 2 : 1);
    }
  }

  //------------------------------------------
  // Capture-phase action-key handler. Doors are entered by walking through them
  // (no keypress), so this handler only serves the pub's gamble dialog: while a
  // confirm is pending, Enter/Space confirms it and Escape declines it. With no
  // dialog up, these keys do nothing here.
  function handleActionKey(event: KeyboardEvent): void {
    if (event.repeat) {
      return;
    }
    if (!isConfirmingGamble()) {
      return;
    }
    if (event.key === CANCEL_KEY) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      declineGamble();
    } else if (ACTION_KEYS.has(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      confirmGamble();
    }
  }

  //------------------------------------------
  // Open a door's panel on walk-in. Entering NEVER changes economic state
  // (docs/HUMAN_GUIDANCE.md attempt-then-confirm): this only transitions to
  // panel-open for the door's panel kind (and seeds the pub's notice prompt).
  // Every state-changing dispatch is deferred to an explicit confirm inside the
  // panel -- corral Buy, outfit's per-resource confirm, pub Enter,
  // assay Arm -- or is an informational placeholder that dispatches nothing
  // (land). detectWalkIn only calls this for an OPEN door, so a closed
  // (solid) door can never open a panel.
  function useDoor(id: StorefrontId): void {
    const facade = facadesById.get(id);
    if (facade === undefined) {
      return;
    }
    setTownState({ phase: "panel-open", door: id, panel: facade.panelKind });
    if (facade.panelKind === "pub") {
      // The pub reuses its existing notice-driven gamble confirm: movement is
      // frozen by the panel-open phase, and the document action-key handler
      // (scoped to isConfirmingGamble) turns Enter into confirm and Escape into
      // decline. No focusable DOM panel is drawn for it.
      setNotice("Gamble and end turn? Press Enter to confirm, Esc to back out.");
    }
  }

  //------------------------------------------
  // Close the open panel and return to the street (docs/THE_TOWN_ANALYSIS.md
  // "Interaction state": closing a panel puts the avatar outside the threshold
  // and restores movement). Places the avatar on the street side of its door
  // (town_interaction.ts's streetSideOfDoor), re-arms the single-fire walk-in
  // latch, restores the street phase, and repaints. One dismiss path for corral
  // Leave, outfit/land Dismiss, assay Cancel, and pub Escape. Movement input is
  // a document-level key poller, so dropping panel focus already restores
  // movement control.
  function dismissPanel(): void {
    const state = townState();
    if (state.phase === "panel-open") {
      const facade = facadesById.get(state.door);
      if (facade !== undefined) {
        avatarPos = streetSideOfDoor(facade, street);
      }
      towPos = { x: avatarPos.x - TOW_FOLLOW_DISTANCE, y: avatarPos.y };
      cameraOffset = townCameraOffset(
        avatarPos.x,
        street.worldWidth,
        TOWN_REFERENCE_VIEWPORT_WIDTH,
      );
    }
    enteredDoor = null;
    setTownState({ phase: "street" });
    refreshDoors();
    writeTransforms();
  }

  //------------------------------------------
  // Back out of the pub confirm with no engine effect and return street-side.
  function declineGamble(): void {
    setNotice("Gamble cancelled.");
    dismissPanel();
  }

  //------------------------------------------
  // Confirm the gamble: dispatch it, then show its payout as a self-dismissing
  // banner. `gamble` always ends the turn, which unmounts this scene as part of
  // the dispatch call itself (see the module doc comment), so the banner renders
  // outside Solid's tree via `showPubBanner` rather than local state. The state
  // flips to street first; repositioning is unnecessary since the scene tears
  // down on the same dispatch.
  function confirmGamble(): void {
    setTownState({ phase: "street" });
    const before = props.store.state.players[HUMAN_ID]?.money ?? 0;
    props.store.dispatch({ type: "gamble", playerId: HUMAN_ID });
    const after = props.store.state.players[HUMAN_ID]?.money ?? 0;
    showPubBanner(after - before, reducedMotion);
  }

  onMount(() => {
    const keys = createKeyState();
    document.addEventListener("keydown", handleActionKey, true);
    // Seed the world-group transform and the avatar/tow positions before the
    // first frame, so the very first paint shows the camera and avatar in place.
    writeTransforms();

    let rafHandle = 0;
    let lastFrame = performance.now();
    // Guards the reschedule below against the onExit-unmount-mid-frame case:
    // updateFrame() can call props.onExit(), which synchronously unmounts this
    // scene and runs onCleanup() while frame() is still on the call stack.
    // Without this flag, the reschedule line runs after cleanup and starts an
    // orphaned rAF loop that nothing ever cancels.
    let disposed = false;
    const frame = (now: number): void => {
      const dtSeconds = Math.min(now - lastFrame, MAX_FRAME_MS) / 1000;
      lastFrame = now;
      updateFrame(dtSeconds, keys);
      if (disposed) {
        return;
      }
      rafHandle = requestAnimationFrame(frame);
    };
    rafHandle = requestAnimationFrame(frame);

    onCleanup(() => {
      disposed = true;
      cancelAnimationFrame(rafHandle);
      keys.stop();
      document.removeEventListener("keydown", handleActionKey, true);
    });
  });

  const defsMarkup =
    buildTownSpriteDefsMarkup() + buildSpeciesSpriteDefsMarkup() + buildMuleSpriteDefsMarkup();

  return (
    <div
      id="town-scene"
      class="town-scene"
      role="group"
      aria-label="Colony town"
      data-town-mode={mode}
      data-town-state={townState().phase}
      data-gamble-confirming={isConfirmingGamble() ? "true" : "false"}
    >
      <svg
        class="town-svg"
        viewBox={`0 0 ${TOWN_REFERENCE_VIEWPORT_WIDTH} ${street.worldHeight}`}
        aria-hidden="true"
      >
        <g innerHTML={defsMarkup} />
        {/* World-space group: the composed street scrolls under the fixed camera
            window by an imperative translate written each frame. Everything
            world-space (street, facades, doors, exits, tow, avatar) lives here so
            one transform scrolls them together. */}
        <g
          class="town-world"
          data-town-world-width={street.worldWidth}
          ref={(el) => {
            worldGroupRef = el;
          }}
        >
          <rect
            class="town-facade-band"
            x={0}
            y={0}
            width={street.worldWidth}
            height={street.facadeBottomY}
          />
          <rect
            class="town-street-surface"
            x={0}
            y={street.streetTopY}
            width={street.worldWidth}
            height={street.worldHeight - street.streetTopY}
          />
          <WornStreetPatches street={street} />
          <rect
            class="town-baseline-curb"
            x={0}
            y={street.facadeBottomY - 3}
            width={street.worldWidth}
            height={6}
          />
          <g class="town-facades">
            <For each={street.facades}>
              {(facade) => (
                <FacadeView facade={facade} isDoorOpen={isDoorOpen} store={props.store} />
              )}
            </For>
          </g>
          <g class="town-exits">
            <For each={street.exits}>
              {(exit) => (
                <ExitMarker
                  side={exit.side}
                  centerX={exitCenterX(exit.rect)}
                  centerY={exit.rect.y + exit.rect.height / 2}
                />
              )}
            </For>
          </g>
          <Show when={carrying() !== "none"}>
            <g
              class="town-tow"
              ref={(el) => {
                towRef = el;
              }}
            >
              <use
                href={`#${MULE_TOWED_ID}`}
                x={-MULE_SIZE / 2}
                y={-MULE_SIZE / 2}
                width={MULE_SIZE}
                height={MULE_SIZE}
                style={{ color: tint }}
              />
              <Show when={isResourceCarry(carrying())}>
                <use
                  href={`#${muleOutfitSymbolId(carrying() as Resource)}`}
                  x={MULE_SIZE / 2 - BADGE_SIZE}
                  y={-MULE_SIZE / 2 - 2}
                  width={BADGE_SIZE}
                  height={BADGE_SIZE}
                />
              </Show>
            </g>
          </Show>
          <g
            class="town-avatar"
            data-actor={`player-${HUMAN_ID}`}
            data-carrying={carrying()}
            ref={(el) => {
              avatarRef = el;
            }}
          >
            <g class="town-avatar-sprite" transform={facing() === -1 ? "scale(-1 1)" : undefined}>
              <use
                href={`#${frameId()}`}
                x={-TOWN_AVATAR_SIZE / 2}
                y={-TOWN_AVATAR_SIZE / 2}
                width={TOWN_AVATAR_SIZE}
                height={TOWN_AVATAR_SIZE}
                style={{ color: tint }}
              />
            </g>
          </g>
        </g>
      </svg>
      <div class="town-hud">
        <p class="town-notice" data-town-notice aria-live="polite">
          {notice() ?? "Walk into the corral to buy a M.U.L.E. Doors open as you approach."}
        </p>
      </div>
      <Show when={corralPanelOpen()}>
        <CorralPurchasePanel store={props.store} payload={props.payload} onDismiss={dismissPanel} />
      </Show>
      <Show when={outfitPanelState()}>
        {(facade) => (
          <OutfitPanel
            store={props.store}
            payload={props.payload}
            facade={facade()}
            onDismiss={dismissPanel}
          />
        )}
      </Show>
      <Show when={landPanelState()}>
        {(facade) => <LandOfficePanel facade={facade()} onDismiss={dismissPanel} />}
      </Show>
      <Show when={assayPanelState()}>
        {(facade) => (
          <AssayOfficePanel
            facade={facade()}
            onArmAssay={props.onArmAssay}
            onDismiss={dismissPanel}
          />
        )}
      </Show>
    </div>
  );
}

//============================================
/**
 * The world x center of an endpoint exit zone.
 *
 * @param rect - The exit zone rect in world space.
 * @returns The zone's horizontal center in world pixels.
 */
function exitCenterX(rect: { x: number; width: number }): number {
  return rect.x + rect.width / 2;
}

//============================================
/**
 * Whether a carried-M.U.L.E. value is an outfitted resource (so its outfit
 * badge should show), as opposed to `none` or `unoutfitted`.
 *
 * @param carried - The develop payload's `carriedMule` value.
 * @returns True when carrying an outfitted M.U.L.E.
 */
function isResourceCarry(carried: DevelopPayload["carriedMule"]): boolean {
  return carried !== "none" && carried !== "unoutfitted";
}
