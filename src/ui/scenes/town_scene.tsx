// Walkable town interior for the human's develop turn.
//
// This scene replaces the interim store-menu overlay: when the overworld avatar
// steps onto the town cell it enters here, a self-contained walkable interior.
// The player walks an avatar (species by player slot, tinted the player color)
// down the town street, tows a bought M.U.L.E. behind it, and uses building
// doors: the corral buys a M.U.L.E. (buy_mule), the four outfit counters outfit
// the carried M.U.L.E. (outfit_mule), the pub gambles (gamble),
// and the assay office arms an assay so the next plot the avatar stands on
// back in the overworld is assayed. The four edge exits return to the
// overworld.
//
// Pub gambling always ends the turn, so it needs a confirm step (one
// accidental keypress must not end a turn) and its payout banner cannot live
// in this component's own reactive tree: dispatching `gamble` synchronously
// flips the human's develop payload away (game_screen.tsx's HumanDevelopLayer
// mount is gated on `activePlayer === HUMAN_ID`), which tears this whole scene
// down as part of that same dispatch call, before any code after it in this
// module could render. `showPubBanner` below sidesteps that by appending a
// plain DOM node straight to `document.body`, outside Solid's ownership, so it
// survives the teardown.
//
// Town is a UI sub-state of the human's develop turn, not an engine phase: the
// engine stays in `develop`, so the scene manager keeps draining the turn's
// tick budget the whole time the player is in town (this scene owns no ticks --
// it only moves presentation state and dispatches semantic Actions at doors).
// When the tick budget runs out the develop turn ends, the phase changes, and
// the whole develop overlay (this scene included) unmounts.
//
// Solid discipline: run-once component, props read through the props object,
// per-frame motion written imperatively through refs (bypassing reactivity for
// 60fps), and only carry / at-door / notice / gamble-confirm derived state
// rendered reactively. Listeners and the rAF loop are bound in onMount and
// released in onCleanup.

import { createSignal, createMemo, onMount, onCleanup, untrack, Show } from "solid-js";
import type { JSX } from "solid-js";
import type { DevelopPayload } from "../../engine/game_state";
import type { Resource } from "../../engine/player";
import { canBuyMule } from "../../engine/turn";
import { computeOutfitCost } from "../../engine/store";
import type { GameStore } from "../game_store";
import { HUMAN_ID } from "../game_driver";
import { createKeyState } from "../input";
import { playerColor } from "../sprites";
import { pickSpeciesFrameId, buildSpeciesSpriteDefsMarkup } from "../sprites/sprites_species";
import {
  MULE_TOWED_ID,
  muleOutfitSymbolId,
  buildMuleSpriteDefsMarkup,
} from "../sprites/sprites_mule";
import {
  TOWN_BUILDING_HEIGHT,
  TOWN_DOOR_SYMBOL_ID,
  TOWN_GROUND_SYMBOL_ID,
  buildTownSpriteDefsMarkup,
  townBuildingSymbolId,
  townBuildingWidth,
  townExitSymbolId,
  townStoreCounterSymbolId,
} from "../sprites/sprites_town";
import {
  WALKER_SPEED_PX_PER_SEC,
  TOW_FOLLOW_DISTANCE,
  directionFromKeys,
  cellCenter,
  stepPosition,
  stepTowFollower,
} from "./walker";
import type { Vec2 } from "./walker";
import {
  TOWN_BOUNDS,
  TOWN_CELL_PX,
  TOWN_COLS,
  TOWN_EXITS,
  TOWN_SPAWN_CELL,
  townDoorAt,
  townDoorCenter,
  townExitAt,
  townExitCenter,
} from "./zones";
import type { TownDoorId, TownExit } from "./zones";

/** Rendered avatar size in town pixel units (a bit under one cell). */
const AVATAR_SIZE = 44;
/** Rendered towed-M.U.L.E. size in town pixel units. */
const MULE_SIZE = 34;
/** Outfit-badge size drawn on the towed M.U.L.E. */
const BADGE_SIZE = 14;
/** Real milliseconds between walk-cycle frame swaps while moving. */
const WALK_FRAME_MS = 180;
/** Largest real frame delta consumed, so a backgrounded tab does not lurch. */
const MAX_FRAME_MS = 100;
/** Rendered size of a building door marker in town pixel units. */
const DOOR_MARKER_SIZE = 28;
/** Rendered size of an edge-exit marker in town pixel units. */
const EXIT_MARKER_SIZE = 34;
/** Rendered size of a standalone outfit-counter station in town pixel units. */
const COUNTER_SIZE = 44;
/**
 * How long the pub payout banner stays up, in ms, matching the overworld
 * scene's wampus-catch-banner hold (WAMPUS_CATCH_BANNER_MS).
 */
const PUB_BANNER_HOLD_MS = 2200;

/** Movement key sets, sampled each frame from the held-key poller. */
const UP_KEYS = ["ArrowUp", "w", "W"] as const;
const DOWN_KEYS = ["ArrowDown", "s", "S"] as const;
const LEFT_KEYS = ["ArrowLeft", "a", "A"] as const;
const RIGHT_KEYS = ["ArrowRight", "d", "D"] as const;
/** Keys that use the building door the avatar is standing at, or confirm a pending gamble. */
const ACTION_KEYS = new Set(["Enter", " "]);
/** Key that declines a pending gamble confirmation. */
const CANCEL_KEY = "Escape";

/** The four outfit-counter doors and the resource each outfits for. */
const COUNTER_RESOURCE: Readonly<Record<string, Resource>> = {
  "counter-food": "food",
  "counter-energy": "energy",
  "counter-smithore": "smithore",
  "counter-crystite": "crystite",
};

/** Props for the town scene. */
export interface TownSceneProps {
  /** The live game store, for dispatch and current-state reads. */
  readonly store: GameStore;
  /** Reactive accessor for the human develop payload. */
  readonly payload: () => DevelopPayload;
  /** Called when the avatar walks into an edge exit, to return to the overworld. */
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
 * @returns The town scene fragment (buildings, avatar, notice, controls).
 */
export function TownScene(props: TownSceneProps): JSX.Element {
  const reducedMotion = prefersReducedMotion();
  const speed = WALKER_SPEED_PX_PER_SEC * readSpeedMultiplier();
  // The human's title-screen species pick: read once at
  // mount, matching overworld_scene.tsx's identical convention -- a
  // player's species never changes mid-game.
  const species = untrack(() => props.store.state.players[HUMAN_ID].species);
  const tint = playerColor(HUMAN_ID);

  // Presentation-only pixel state, mutated in the rAF loop (not reactive).
  const spawn: Vec2 = cellCenter(TOWN_SPAWN_CELL, TOWN_CELL_PX);
  let avatarPos: Vec2 = spawn;
  let towPos: Vec2 = { x: spawn.x - TOW_FOLLOW_DISTANCE, y: spawn.y };
  let walkAccumMs = 0;
  // Latch so the exit callback fires once even though the scene unmounts on it.
  let leaving = false;

  // Reactive derived state (drives data-* attributes and the notice).
  const [facing, setFacing] = createSignal<1 | -1>(1);
  const [walkFrame, setWalkFrame] = createSignal<1 | 2>(1);
  const [atDoor, setAtDoor] = createSignal<TownDoorId | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);
  // Whether the pub's "gamble and end turn?" confirm affordance is showing.
  // Gambling always ends the turn (see the module doc comment), so a single
  // accidental action-key press at the pub door must not trigger it -- this
  // gates a second explicit keypress and freezes movement in the meantime.
  const [confirmingGamble, setConfirmingGamble] = createSignal(false);
  const carrying = createMemo(() => props.payload().carriedMule);
  const frameId = createMemo(() => pickSpeciesFrameId(species, walkFrame(), reducedMotion));

  let avatarRef: SVGGElement | undefined;
  let towRef: SVGGElement | undefined;

  //------------------------------------------
  // Advance one presentation frame: sample held keys, move the avatar and the
  // towed follower, publish the current door, and auto-exit on an edge exit.
  function updateFrame(dtSeconds: number, keys: ReturnType<typeof createKeyState>): void {
    if (leaving) {
      return;
    }
    // Freeze movement while the gamble confirm affordance is up, so the
    // player cannot wander off mid-decision -- Enter/Space or Escape are the
    // only way forward, matching a modal's expected keyboard behavior.
    if (confirmingGamble()) {
      return;
    }
    const direction = directionFromKeys({
      up: keys.anyDown(UP_KEYS),
      down: keys.anyDown(DOWN_KEYS),
      left: keys.anyDown(LEFT_KEYS),
      right: keys.anyDown(RIGHT_KEYS),
    });
    const moving = direction.x !== 0 || direction.y !== 0;
    // Town has no obstacle terrain, so every cell moves at full speed.
    avatarPos = stepPosition(
      avatarPos,
      direction,
      speed,
      1,
      dtSeconds,
      TOWN_BOUNDS,
      AVATAR_SIZE / 2,
    );
    towPos = stepTowFollower(towPos, avatarPos, dtSeconds, TOW_FOLLOW_DISTANCE, speed);
    writeTransforms();
    updateFacing(direction.x);
    const exit = townExitAt(avatarPos);
    if (exit !== null) {
      leaving = true;
      props.onExit(exit);
      return;
    }
    updateDoor();
    updateWalkFrame(moving, dtSeconds);
  }

  //------------------------------------------
  // Write the avatar and towed-M.U.L.E. transforms directly (bypass reactivity).
  function writeTransforms(): void {
    avatarRef?.setAttribute("transform", `translate(${avatarPos.x} ${avatarPos.y})`);
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
  // Publish the building door the avatar currently stands at (or null), which
  // drives data-at-door and gates the action key.
  function updateDoor(): void {
    const next = townDoorAt(avatarPos);
    if (next !== atDoor()) {
      setAtDoor(next);
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
  // Capture-phase action-key handler: while a gamble confirm is pending,
  // Enter/Space confirms it and Escape declines it; otherwise, use the door
  // the avatar stands at.
  function handleActionKey(event: KeyboardEvent): void {
    if (event.repeat) {
      return;
    }
    if (confirmingGamble()) {
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
      return;
    }
    if (!ACTION_KEYS.has(event.key)) {
      return;
    }
    const door = atDoor();
    if (door === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    useDoor(door);
  }

  //------------------------------------------
  // Route a door use to its action, surfacing a notice either way.
  function useDoor(door: TownDoorId): void {
    if (door === "corral") {
      buyAtCorral();
      return;
    }
    if (door === "pub") {
      askGambleConfirm();
      return;
    }
    if (door === "assay") {
      props.onArmAssay();
      setNotice("Assay ready: leave town and press action on a plot.");
      return;
    }
    const resource = COUNTER_RESOURCE[door];
    if (resource !== undefined) {
      outfitAtCounter(resource);
    }
  }

  //------------------------------------------
  // Ask the player to confirm gambling, since it always ends the turn.
  function askGambleConfirm(): void {
    setConfirmingGamble(true);
    setNotice("Gamble and end turn? Press action to confirm, Esc to back out.");
  }

  //------------------------------------------
  // Back out of a pending gamble confirmation with no engine effect.
  function declineGamble(): void {
    setConfirmingGamble(false);
    setNotice("Gamble cancelled.");
  }

  //------------------------------------------
  // Confirm the gamble: dispatch it, then show its payout as a self-dismissing
  // banner. `gamble` always ends the turn, which unmounts this scene as part
  // of the dispatch call itself (see the module doc comment), so the banner
  // renders outside Solid's tree via `showPubBanner` rather than local state.
  function confirmGamble(): void {
    setConfirmingGamble(false);
    const before = props.store.state.players[HUMAN_ID]?.money ?? 0;
    props.store.dispatch({ type: "gamble", playerId: HUMAN_ID });
    const after = props.store.state.players[HUMAN_ID]?.money ?? 0;
    showPubBanner(after - before, reducedMotion);
  }

  //------------------------------------------
  // Buy a M.U.L.E. at the corral, or surface why it is not possible.
  function buyAtCorral(): void {
    const state = props.store.state;
    if (canBuyMule(state, HUMAN_ID)) {
      props.store.dispatch({ type: "buy_mule", playerId: HUMAN_ID });
      setNotice("Bought a M.U.L.E. -- outfit it at a counter.");
      return;
    }
    if (props.payload().carriedMule !== "none") {
      setNotice("You already have a M.U.L.E. in tow.");
      return;
    }
    if (state.store.muleStock <= 0) {
      setNotice("The corral is out of M.U.L.E.s.");
      return;
    }
    setNotice(`Not enough money for a M.U.L.E. ($${state.store.mulePrice}).`);
  }

  //------------------------------------------
  // Outfit the towed M.U.L.E. for a resource at its counter, or surface why not.
  function outfitAtCounter(resource: Resource): void {
    const carried = props.payload().carriedMule;
    if (carried === "none") {
      setNotice("Buy a M.U.L.E. at the corral first.");
      return;
    }
    if (carried !== "unoutfitted") {
      setNotice("This M.U.L.E. is already outfitted.");
      return;
    }
    const cost = computeOutfitCost(resource);
    const player = props.store.state.players[HUMAN_ID];
    if (player === undefined || player.money < cost) {
      setNotice(`Not enough money to outfit for ${resource} ($${cost}).`);
      return;
    }
    props.store.dispatch({ type: "outfit_mule", playerId: HUMAN_ID, resource });
    setNotice(`Outfitted for ${resource} -- exit town and place it.`);
  }

  onMount(() => {
    const keys = createKeyState();
    document.addEventListener("keydown", handleActionKey, true);
    writeTransforms();
    setAtDoor(townDoorAt(avatarPos));

    let rafHandle = 0;
    let lastFrame = performance.now();
    const frame = (now: number): void => {
      const dtSeconds = Math.min(now - lastFrame, MAX_FRAME_MS) / 1000;
      lastFrame = now;
      updateFrame(dtSeconds, keys);
      rafHandle = requestAnimationFrame(frame);
    };
    rafHandle = requestAnimationFrame(frame);

    onCleanup(() => {
      cancelAnimationFrame(rafHandle);
      keys.stop();
      document.removeEventListener("keydown", handleActionKey, true);
    });
  });

  const defsMarkup =
    buildTownSpriteDefsMarkup() + buildSpeciesSpriteDefsMarkup() + buildMuleSpriteDefsMarkup();
  const groundMarkup = buildGroundMarkup();

  return (
    <div
      id="town-scene"
      class="town-scene"
      role="group"
      aria-label="Colony town"
      data-gamble-confirming={confirmingGamble() ? "true" : "false"}
    >
      <svg
        class="town-svg"
        viewBox={`0 0 ${TOWN_BOUNDS.width} ${TOWN_BOUNDS.height}`}
        aria-hidden="true"
      >
        <g innerHTML={defsMarkup} />
        <g class="town-ground" innerHTML={groundMarkup} />
        <BuildingsLayer />
        <ExitsLayer />
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
          data-actor={`player-${HUMAN_ID}`}
          data-carrying={carrying()}
          data-at-door={atDoor() ?? undefined}
          ref={(el) => {
            avatarRef = el;
          }}
        >
          <g class="town-avatar-sprite" transform={facing() === -1 ? "scale(-1 1)" : undefined}>
            <use
              href={`#${frameId()}`}
              x={-AVATAR_SIZE / 2}
              y={-AVATAR_SIZE / 2}
              width={AVATAR_SIZE}
              height={AVATAR_SIZE}
              style={{ color: tint }}
            />
          </g>
        </g>
      </svg>
      <div class="town-hud">
        <p class="town-notice" data-town-notice aria-live="polite">
          {notice() ?? "Walk to the corral to buy a M.U.L.E."}
        </p>
        <button
          type="button"
          class="town-end-turn-button"
          onClick={() => props.store.dispatch({ type: "end_turn", playerId: HUMAN_ID })}
        >
          End turn
        </button>
      </div>
    </div>
  );
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

//============================================
/**
 * Show the pub's payout as a brief, self-dismissing banner appended directly
 * to `document.body`. See the module doc comment: confirming a gamble
 * dispatches an action that always ends the turn, which unmounts this scene
 * synchronously as part of that same dispatch call -- so the banner cannot
 * be local Solid state (it would never render before its own owner tears
 * down). A plain DOM node outside Solid's ownership survives that teardown.
 *
 * @param amount - The dollar payout the engine added to the human's money.
 * @param reducedMotion - Whether to gate the CSS entrance animation, mirroring
 *   the event-banner/wampus-catch-banner `data-reduced-motion` convention.
 */
function showPubBanner(amount: number, reducedMotion: boolean): void {
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

//============================================
/**
 * Build the tiled town ground as a raw `<use>` string (one per interior cell),
 * set via innerHTML so a full floor renders without a JSX node per tile.
 *
 * @returns Raw SVG markup tiling the ground symbol across the interior.
 */
function buildGroundMarkup(): string {
  let markup = "";
  for (let row = 0; row < TOWN_BOUNDS.height / TOWN_CELL_PX; row++) {
    for (let col = 0; col < TOWN_COLS; col++) {
      const x = col * TOWN_CELL_PX;
      const y = row * TOWN_CELL_PX;
      markup += `<use href="#${TOWN_GROUND_SYMBOL_ID}" x="${x}" y="${y}" width="${TOWN_CELL_PX}" height="${TOWN_CELL_PX}" />`;
    }
  }
  return markup;
}

//============================================
/**
 * Render every building with its door marker: the corral, the store (its four
 * outfit-counter stations grouped as one `data-building="store"`), the pub, and
 * the assay. Each interactive door carries a `[data-door-for]` marker and a
 * building group carries `[data-building]`, matching the town selector contract.
 *
 * @returns The buildings layer group.
 */
function BuildingsLayer(): JSX.Element {
  return (
    <g class="town-buildings">
      <BuildingGroup building="corral" door="corral" />
      <g data-building="store" class="town-building">
        <CounterStation door="counter-food" />
        <CounterStation door="counter-energy" />
        <CounterStation door="counter-smithore" />
        <CounterStation door="counter-crystite" />
      </g>
      <BuildingGroup building="pub" door="pub" />
      <BuildingGroup building="assay" door="assay" />
    </g>
  );
}

/** Props for one named building drawn above its door. */
interface BuildingGroupProps {
  /** The building sprite to draw (its footprint symbol). */
  readonly building: "corral" | "pub" | "assay";
  /** The door id whose cell the building sits above and whose marker it carries. */
  readonly door: TownDoorId;
}

//============================================
/**
 * Draw one named building sprite sitting above its street door, plus the door
 * marker on the door cell.
 *
 * @param props - Carries the building sprite name and its door id.
 * @returns The building `<g data-building>` group.
 */
function BuildingGroup(props: BuildingGroupProps): JSX.Element {
  const width = townBuildingWidth(props.building);
  const center = townDoorCenter(props.door);
  const buildingX = center.x - width / 2;
  const buildingY = center.y - TOWN_CELL_PX / 2 - TOWN_BUILDING_HEIGHT;
  return (
    <g data-building={props.building} class="town-building">
      <use
        href={`#${townBuildingSymbolId(props.building)}`}
        x={buildingX}
        y={buildingY}
        width={width}
        height={TOWN_BUILDING_HEIGHT}
      />
      <DoorMarker door={props.door} />
    </g>
  );
}

/** Props for one outfit-counter station. */
interface CounterStationProps {
  /** The counter door id (`counter-<resource>`). */
  readonly door: TownDoorId;
}

//============================================
/**
 * Draw one outfit-counter station above its street door, plus the door marker.
 *
 * @param props - Carries the counter door id.
 * @returns The counter station element.
 */
function CounterStation(props: CounterStationProps): JSX.Element {
  const resource = COUNTER_RESOURCE[props.door]!;
  const center = townDoorCenter(props.door);
  const stationX = center.x - COUNTER_SIZE / 2;
  const stationY = center.y - TOWN_CELL_PX / 2 - COUNTER_SIZE;
  return (
    <g class="town-counter">
      <use
        href={`#${townStoreCounterSymbolId(resource)}`}
        x={stationX}
        y={stationY}
        width={COUNTER_SIZE}
        height={COUNTER_SIZE}
      />
      <DoorMarker door={props.door} />
    </g>
  );
}

/** Props for a door marker sitting on a door cell. */
interface DoorMarkerProps {
  /** The door id this marker belongs to. */
  readonly door: TownDoorId;
}

//============================================
/**
 * Draw the shared door-highlight marker centered on a door cell, carrying the
 * `[data-door-for]` hook.
 *
 * @param props - Carries the door id.
 * @returns The door marker `<g data-door-for>` group.
 */
function DoorMarker(props: DoorMarkerProps): JSX.Element {
  const center = townDoorCenter(props.door);
  return (
    <g data-door-for={props.door} class="town-door">
      <use
        href={`#${TOWN_DOOR_SYMBOL_ID}`}
        x={center.x - DOOR_MARKER_SIZE / 2}
        y={center.y - DOOR_MARKER_SIZE / 2}
        width={DOOR_MARKER_SIZE}
        height={DOOR_MARKER_SIZE}
      />
    </g>
  );
}

//============================================
/**
 * Render the four edge-exit markers, each carrying a `[data-exit]` hook.
 *
 * @returns The exits layer group.
 */
function ExitsLayer(): JSX.Element {
  return (
    <g class="town-exits">
      {TOWN_EXITS.map((exit) => {
        const center = townExitCenter(exit);
        return (
          <g data-exit={exit} class="town-exit">
            <use
              href={`#${townExitSymbolId(exit)}`}
              x={center.x - EXIT_MARKER_SIZE / 2}
              y={center.y - EXIT_MARKER_SIZE / 2}
              width={EXIT_MARKER_SIZE}
              height={EXIT_MARKER_SIZE}
            />
          </g>
        );
      })}
    </g>
  );
}
