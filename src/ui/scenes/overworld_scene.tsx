// Walkable overworld scene for the human's develop turn.
//
// This is the spatial layer over the develop-phase map. During the human's
// develop turn it renders a controllable avatar (species by player slot, tinted
// the player color) over the MapLayer, moves it in real time from held keys
// sampled in its own rAF loop, tows a bought M.U.L.E. behind it, and fires the
// overworld's spatial triggers: stepping onto the town cell enters the town
// scene (`onEnterTown`, M7's walkable town replaces M5's interim store overlay);
// standing on an owned empty plot with an outfitted M.U.L.E. and pressing the
// action key installs it (dispatch place_mule); and, when the town's assay
// office has armed an assay, pressing the action key on any assayable plot
// reveals its crystite (dispatch assay_plot). It also draws a minimal HUD timer
// bar off the turn's tick budget.
//
// The scene owns no engine ticks -- the scene manager remains the sole tick
// scheduler; this rAF loop only moves presentation state (avatar/tow pixel
// positions written through refs) and dispatches semantic Actions on discrete
// triggers. The avatar spawns off the town cell (at `spawnCell`) so it does not
// enter town the instant the turn begins, and the parent re-spawns it beside the
// town cell when the player exits town.
//
// Solid discipline: run-once component, props read through the props object,
// per-frame motion written imperatively through refs (bypassing reactivity for
// 60fps), and only cell/carry/timer derived state rendered reactively from the
// store. Listeners and the rAF loop are bound in onMount and released in
// onCleanup.

import { createSignal, createMemo, onMount, onCleanup, untrack, Show } from "solid-js";
import type { JSX } from "solid-js";
import type { DevelopPayload, GameState, Plot } from "../../engine/game_state";
import { PLOT_COLS, PLOT_ROWS } from "../../engine/game_state";
import { ASSAY_TICK_COST } from "../../engine/constants";
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
  WALKER_CELL_PX,
  WALKER_SPEED_PX_PER_SEC,
  TOW_FOLLOW_DISTANCE,
  directionFromKeys,
  slowdownForTerrain,
  cellFromPosition,
  stepPosition,
  stepTowFollower,
  cellCenter,
  manhattanDistance,
} from "./walker";
import type { Cell, Vec2 } from "./walker";
import { findTownCell, cellsEqual } from "./zones";
import { initialWampusPresentation, stepWampusPresentation } from "./wampus_presentation";
import type { WampusPresentationState } from "./wampus_presentation";
import { WAMPUS_SYMBOL_ID, buildWampusSpriteDefsMarkup } from "../sprites/sprites_wampus";

/** Rendered avatar size in overworld pixel units (a bit under one 64px cell). */
const AVATAR_SIZE = 44;
/** Rendered towed-M.U.L.E. size in overworld pixel units. */
const MULE_SIZE = 34;
/** Outfit-badge size drawn on the towed M.U.L.E. */
const BADGE_SIZE = 14;
/** Real milliseconds between walk-cycle frame swaps while moving. */
const WALK_FRAME_MS = 180;
/** Largest real frame delta consumed, so a backgrounded tab does not lurch. */
const MAX_FRAME_MS = 100;
/** Rendered size of the wampus glyph in overworld pixel units. */
const WAMPUS_SIZE = 36;
/**
 * Grid distance (Manhattan) within which the avatar can hunt the wampus:
 * standing on its cell or one orthogonal step away ("walk-adjacent" per the
 * dispatch note).
 */
const WAMPUS_HUNT_ADJACENCY = 1;
/** How long the wampus catch banner stays up, in ms. */
const WAMPUS_CATCH_BANNER_MS = 2200;

/** Movement key sets, sampled each frame from the held-key poller. */
const UP_KEYS = ["ArrowUp", "w", "W"] as const;
const DOWN_KEYS = ["ArrowDown", "s", "S"] as const;
const LEFT_KEYS = ["ArrowLeft", "a", "A"] as const;
const RIGHT_KEYS = ["ArrowRight", "d", "D"] as const;
/** Keys that install a carried, outfitted M.U.L.E. on the avatar's own plot. */
const ACTION_KEYS = new Set(["Enter", " "]);

/** Props for the overworld scene. */
export interface OverworldSceneProps {
  /** The live game store, for dispatch and current-state reads. */
  readonly store: GameStore;
  /** Reactive accessor for the human develop payload. */
  readonly payload: () => DevelopPayload;
  /**
   * Cell to spawn the avatar at. Kept off the town cell so the turn does not
   * begin inside town; the parent passes the town-adjacent return cell after an
   * exit. When omitted, defaults to the town's left neighbor.
   */
  readonly spawnCell?: Cell;
  /** Called when the avatar steps onto the town cell, to enter the town scene. */
  readonly onEnterTown: () => void;
  /** Whether the town's assay office has armed an overworld plot assay. */
  readonly assayArmed: () => boolean;
  /** Called after an armed assay fires on a plot, to disarm it. */
  readonly onAssayed: () => void;
}

//============================================
/**
 * Read the scene-speed multiplier from the URL `?speed=` param, matching the
 * value the scene manager runs the engine clock at, so avatar motion speeds up
 * in step with the tick budget under `?speed=` (used by the Playwright spec).
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
 * Whether the OS/browser requests reduced motion. Read once at scene mount; the
 * spec emulates it before navigating.
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
 * Render the walkable overworld avatar layer for the human's develop turn.
 *
 * @param props - Carries the store and the human develop payload accessor.
 * @returns The overworld overlay fragment (avatar SVG, timer bar, store overlay).
 */
export function OverworldScene(props: OverworldSceneProps): JSX.Element {
  const reducedMotion = prefersReducedMotion();
  const speed = WALKER_SPEED_PX_PER_SEC * readSpeedMultiplier();

  // The board is fixed for the game; read its dimensions and the town cell once.
  const initialState = untrack(() => props.store.state);
  // The human's title-screen species pick: read once at
  // mount, matching the board dimensions above -- a player's species never
  // changes mid-game, so there is no reactive dependency to preserve.
  const species = initialState.players[HUMAN_ID].species;
  const tint = playerColor(HUMAN_ID);
  const rows = PLOT_ROWS;
  const cols = PLOT_COLS;
  const bounds = { width: cols * WALKER_CELL_PX, height: rows * WALKER_CELL_PX };
  const terrainGrid = initialState.plots.map((row) => row.map((plot) => plot.terrain));
  const townCell = findTownCell(terrainGrid);

  // Tick budget: captured once at mount (ticksRemaining only decreases within a
  // turn, and the scene re-mounts fresh for each of the human's develop turns).
  const budget = Math.max(
    1,
    untrack(() => props.payload().ticksRemaining),
  );

  // The avatar spawns off the town cell so the develop turn does not begin
  // inside town: the parent's return cell when re-entering the overworld, or the
  // town's left neighbor by default.
  const spawnCell = untrack(() => props.spawnCell) ?? defaultSpawnCell(townCell, rows, cols);
  const spawn: Vec2 =
    spawnCell === null ? { x: bounds.width / 2, y: bounds.height / 2 } : cellCenter(spawnCell);

  // Presentation-only pixel state, mutated in the rAF loop (not reactive).
  let avatarPos: Vec2 = spawn;
  let towPos: Vec2 = { x: spawn.x - TOW_FOLLOW_DISTANCE, y: spawn.y };
  let walkAccumMs = 0;
  // Latch so town entry fires once even though the scene unmounts on it.
  let entering = false;

  // Reactive derived state (drives data-* attributes and the timer).
  const [cell, setCell] = createSignal<Cell>(cellFromPosition(spawn));
  const [facing, setFacing] = createSignal<1 | -1>(1);
  const [walkFrame, setWalkFrame] = createSignal<1 | 2>(1);
  const carrying = createMemo(() => props.payload().carriedMule);
  const ticksLeft = createMemo(() => props.payload().ticksRemaining);
  const frameId = createMemo(() => pickSpeciesFrameId(species, walkFrame(), reducedMotion));

  // Wampus presentation: a UI-side minimum-visible-time
  // buffer over the engine's own single-tick visible window (see
  // wampus_presentation.ts's module doc), advanced every frame in the same
  // rAF loop as avatar motion. A signal, not a ref-written transform, since
  // visibility toggling on its own timer (not per-frame position) is what
  // this drives.
  const [wampusPresentation, setWampusPresentation] = createSignal<WampusPresentationState>(
    initialWampusPresentation(),
  );
  let wampusPresentationValue = initialWampusPresentation();
  const wampusVisible = makeWampusVisibleAccessor(wampusPresentation);
  // The catch event's tick this scene has already shown a banner for, so a
  // stale catch does not keep re-showing the banner every frame.
  let lastShownCatchTick: number | null = null;
  const [catchBanner, setCatchBanner] = createSignal<{ readonly tick: number } | null>(null);

  let avatarRef: SVGGElement | undefined;
  let towRef: SVGGElement | undefined;

  //------------------------------------------
  // Look up the plot at a cell, or null when out of range.
  function plotAt(target: Cell): Plot | null {
    const state: GameState = props.store.state;
    return state.plots[target.row]?.[target.col] ?? null;
  }

  //------------------------------------------
  // Advance one presentation frame: sample held keys, move the avatar and the
  // towed follower, and update the reactive cell / facing / walk-frame state.
  function updateFrame(dtSeconds: number, keys: ReturnType<typeof createKeyState>): void {
    const direction = directionFromKeys({
      up: keys.anyDown(UP_KEYS),
      down: keys.anyDown(DOWN_KEYS),
      left: keys.anyDown(LEFT_KEYS),
      right: keys.anyDown(RIGHT_KEYS),
    });
    const moving = direction.x !== 0 || direction.y !== 0;
    const currentCell = cellFromPosition(avatarPos);
    const terrain = terrainGrid[currentCell.row]?.[currentCell.col] ?? "plain";
    const slowdown = slowdownForTerrain(terrain);
    avatarPos = stepPosition(
      avatarPos,
      direction,
      speed,
      slowdown,
      dtSeconds,
      bounds,
      AVATAR_SIZE / 2,
    );
    towPos = stepTowFollower(towPos, avatarPos, dtSeconds, TOW_FOLLOW_DISTANCE, speed);
    writeTransforms();
    updateFacing(direction.x);
    updateCell();
    updateWalkFrame(moving, dtSeconds);
    updateWampusPresentation(dtSeconds * 1000);
  }

  //------------------------------------------
  // Advance the wampus presentation buffer and surface a fresh catch event as
  // a banner (see wampus_presentation.ts's module doc for the buffer's role).
  function updateWampusPresentation(dtMs: number): void {
    const wampus = props.payload().wampus;
    wampusPresentationValue = stepWampusPresentation(wampusPresentationValue, wampus, dtMs);
    setWampusPresentation(wampusPresentationValue);
    const lastEvent = wampus.events[wampus.events.length - 1];
    if (
      lastEvent !== undefined &&
      lastEvent.kind === "catch" &&
      lastEvent.tick !== lastShownCatchTick
    ) {
      lastShownCatchTick = lastEvent.tick;
      setCatchBanner({ tick: lastEvent.tick });
      window.setTimeout(() => {
        setCatchBanner((current) => (current?.tick === lastEvent.tick ? null : current));
      }, WAMPUS_CATCH_BANNER_MS);
    }
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
  // Publish the avatar's grid cell when it changes (drives data-cell-*), and
  // enter the town scene when the avatar steps onto the town cell.
  function updateCell(): void {
    const next = cellFromPosition(avatarPos);
    if (next.row !== cell().row || next.col !== cell().col) {
      setCell(next);
      if (!entering && cellsEqual(next, townCell)) {
        entering = true;
        props.onEnterTown();
      }
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
  // Capture-phase action-key handler. Hunting a walk-adjacent, catchable
  // wampus takes priority (matching decideDevelopAction's own ordering:
  // "free and strictly beneficial ... always hunt this round's wampus
  // first"), then an armed assay on an assayable plot, then installing a
  // carried, outfitted M.U.L.E. on an owned empty plot. Runs in the capture
  // phase and stops propagation only when it acts.
  function handleActionKey(event: KeyboardEvent): void {
    if (!ACTION_KEYS.has(event.key) || event.repeat) {
      return;
    }
    if (tryHuntWampus(event)) {
      return;
    }
    const here = cellFromPosition(avatarPos);
    const plot = plotAt(here);
    if (tryAssay(event, here, plot)) {
      return;
    }
    tryPlace(event, here, plot);
  }

  //------------------------------------------
  // Hunt the wampus when it is actually catchable by the engine (visible,
  // not dead, not caught -- the presentation buffer's extended visibility is
  // reaction time only and never gates this) and the avatar is standing on
  // or orthogonally adjacent to its site. Returns whether it handled the key.
  function tryHuntWampus(event: KeyboardEvent): boolean {
    const wampus = props.payload().wampus;
    if (
      !wampus.visible ||
      wampus.dead ||
      wampus.caught ||
      wampus.row === null ||
      wampus.col === null
    ) {
      return false;
    }
    const here = cellFromPosition(avatarPos);
    if (manhattanDistance(here, { row: wampus.row, col: wampus.col }) > WAMPUS_HUNT_ADJACENCY) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    props.store.dispatch({ type: "hunt_wampus", playerId: HUMAN_ID });
    return true;
  }

  //------------------------------------------
  // Reveal an assayable plot's crystite when an assay is armed and the turn has
  // ticks to spend it. Returns whether it handled the key.
  function tryAssay(event: KeyboardEvent, here: Cell, plot: Plot | null): boolean {
    if (!props.assayArmed() || plot === null || plot.terrain === "town" || plot.crystiteRevealed) {
      return false;
    }
    if (props.payload().ticksRemaining < ASSAY_TICK_COST) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    props.store.dispatch({ type: "assay_plot", playerId: HUMAN_ID, row: here.row, col: here.col });
    props.onAssayed();
    return true;
  }

  //------------------------------------------
  // Install a carried, outfitted M.U.L.E. on the avatar's own empty plot.
  function tryPlace(event: KeyboardEvent, here: Cell, plot: Plot | null): void {
    const carried = props.payload().carriedMule;
    if (carried === "none" || carried === "unoutfitted") {
      return;
    }
    if (plot === null || plot.owner !== HUMAN_ID || plot.muleOutfit !== null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    props.store.dispatch({ type: "place_mule", playerId: HUMAN_ID, row: here.row, col: here.col });
  }

  onMount(() => {
    const keys = createKeyState();
    document.addEventListener("keydown", handleActionKey, true);
    writeTransforms();

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

  const timerRatio = (): number => Math.max(0, Math.min(1, ticksLeft() / budget));
  const defsMarkup =
    buildSpeciesSpriteDefsMarkup() + buildMuleSpriteDefsMarkup() + buildWampusSpriteDefsMarkup();

  return (
    <>
      <div class="overworld-timer" aria-hidden="true">
        <div
          class="overworld-timer-fill"
          data-timer={ticksLeft()}
          style={{ width: `${timerRatio() * 100}%` }}
        />
      </div>
      <svg
        class="overworld-svg"
        viewBox={`0 0 ${bounds.width} ${bounds.height}`}
        aria-hidden="true"
      >
        <g innerHTML={defsMarkup} />
        <Show when={carrying() !== "none"}>
          <g
            class="overworld-tow"
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
                href={`#${muleOutfitSymbolId(carrying() as "food" | "energy" | "smithore" | "crystite")}`}
                x={MULE_SIZE / 2 - BADGE_SIZE}
                y={-MULE_SIZE / 2 - 2}
                width={BADGE_SIZE}
                height={BADGE_SIZE}
              />
            </Show>
          </g>
        </Show>
        <Show when={wampusVisible()}>
          <WampusGlyph presentation={wampusPresentation} />
        </Show>
        <g
          data-actor={`player-${HUMAN_ID}`}
          data-cell-row={cell().row}
          data-cell-col={cell().col}
          data-carrying={carrying()}
          ref={(el) => {
            avatarRef = el;
          }}
        >
          <g
            class="overworld-avatar-sprite"
            transform={facing() === -1 ? "scale(-1 1)" : undefined}
          >
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
      <Show when={catchBanner()}>
        <div class="overworld-wampus-catch-banner" data-wampus-catch-banner>
          {`Caught the wampus! +$${props.payload().wampus.moneyReward}`}
        </div>
      </Show>
    </>
  );
}

//============================================
/**
 * Whether the wampus glyph should currently render: the presentation buffer
 * is visible and has resolved a site. Kept as its own accessor so the
 * `<Show>` above and `WampusGlyph`'s position read the same condition.
 */
function makeWampusVisibleAccessor(presentation: () => WampusPresentationState): () => boolean {
  return () => {
    const state = presentation();
    return state.visible && state.row !== null && state.col !== null;
  };
}

//============================================
/**
 * Render the wampus glyph: a simple palette-colored creature silhouette (no
 * dedicated sprite art exists for it yet -- see docs/CHANGELOG.md) at its
 * current presentation site.
 *
 * @param props - Carries the reactive wampus presentation state accessor.
 * @returns The wampus glyph `<g>`, or nothing if its site is unresolved.
 */
function WampusGlyph(props: { readonly presentation: () => WampusPresentationState }): JSX.Element {
  const center = (): Vec2 => {
    const state = props.presentation();
    if (state.row === null || state.col === null) {
      return { x: 0, y: 0 };
    }
    return cellCenter({ row: state.row, col: state.col });
  };
  return (
    <g
      data-wampus
      data-wampus-row={props.presentation().row ?? undefined}
      data-wampus-col={props.presentation().col ?? undefined}
      transform={`translate(${center().x - WAMPUS_SIZE / 2} ${center().y - WAMPUS_SIZE / 2})`}
    >
      <use href={`#${WAMPUS_SYMBOL_ID}`} width={WAMPUS_SIZE} height={WAMPUS_SIZE} />
    </g>
  );
}

//============================================
/**
 * The default spawn cell when the parent passes none: the town's left neighbor,
 * clamped to the board, or the board center when there is no town cell. Kept off
 * the town cell so the develop turn does not begin inside town.
 *
 * @param townCell - The overworld town cell, or null.
 * @param rows - Board row count.
 * @param cols - Board column count.
 * @returns The default spawn cell, or null when the board is empty.
 */
function defaultSpawnCell(townCell: Cell | null, rows: number, cols: number): Cell | null {
  if (townCell === null || rows === 0 || cols === 0) {
    return townCell;
  }
  return { row: townCell.row, col: Math.max(0, townCell.col - 1) };
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
