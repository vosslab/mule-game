// AI develop-turn presentation layer.
//
// While an AI player develops, this renders its avatar walking around the
// board -- toward town while it carries a M.U.L.E. through the buy/outfit
// steps, out to the plot it just placed one on the moment it does -- driven
// purely by `ai_actor.ts`'s `aiActorTarget`, computed fresh from the develop
// payload and board every time the AI's turn advances a step (the scene
// manager still owns the pacing between those steps; see scene_manager.ts's
// AI_STEP_MS). A Skip button fast-forwards straight to the turn's end state
// via `runAiTurnToCompletion`, dispatching the same deterministic action
// sequence the scene manager's timer would have, just without the wait.
//
// Solid discipline: run-once component, props read through the props object,
// per-frame motion written imperatively through refs (bypassing reactivity,
// matching overworld_scene.tsx's convention), and only cell/status derived
// state rendered reactively from the store.

import { createSignal, createMemo, onMount, onCleanup, untrack, Show } from "solid-js";
import type { JSX } from "solid-js";
import type { DevelopPayload, GameState, Plot } from "../../engine/game_state";
import { PLOT_COLS, PLOT_ROWS } from "../../engine/game_state";
import type { GameStore } from "../game_store";
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
  slowdownForTerrain,
  cellFromPosition,
  stepPosition,
  stepTowFollower,
  cellCenter,
} from "../scenes/walker";
import type { Cell, Vec2 } from "../scenes/walker";
import { findTownCell } from "../scenes/zones";
import {
  aiActorTarget,
  directionToward,
  reachedTarget,
  runAiTurnToCompletion,
} from "../scenes/ai_actor";

/** Rendered avatar size in overworld pixel units, matching overworld_scene.tsx. */
const AVATAR_SIZE = 44;
/** Rendered towed-M.U.L.E. size in overworld pixel units. */
const MULE_SIZE = 34;
/** Outfit-badge size drawn on the towed M.U.L.E. */
const BADGE_SIZE = 14;
/** Real milliseconds between walk-cycle frame swaps while moving. */
const WALK_FRAME_MS = 180;
/** Largest real frame delta consumed, so a backgrounded tab does not lurch. */
const MAX_FRAME_MS = 100;
/** Pixel tolerance for "arrived at the target cell", so the avatar settles instead of jittering. */
const ARRIVAL_EPSILON_PX = 2;

/**
 * Props for the AI actor layer.
 *
 * Mounting contract: like `HumanDevelopLayer`, this component reads
 * `props.payload().activePlayer` once at mount (`untrack`) to pick the
 * species/tint/spawn -- the caller must remount it fresh for each AI
 * player's turn (key on `queueIndex` or `activePlayer`, the same pattern
 * `game_screen.tsx` already uses to remount `HumanDevelopLayer` per human
 * turn), not keep one instance mounted across a change of active player.
 */
export interface AiActorLayerProps {
  /** The live game store, for the target-cell computation and the Skip dispatch. */
  readonly store: GameStore;
  /** Reactive accessor for the develop payload while an AI player is active. */
  readonly payload: () => DevelopPayload;
}

//============================================
/**
 * Read the scene-speed multiplier from the URL `?speed=` param, matching
 * overworld_scene.tsx's convention so avatar motion speeds up in step with
 * `?speed=` in Playwright specs and headless harnesses.
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
 * Whether the OS/browser requests reduced motion, matching overworld_scene.tsx.
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
 * Render the AI develop-turn avatar layer: a species-tinted avatar that walks
 * toward `aiActorTarget`'s computed destination, plus a Skip control that
 * fast-forwards the turn.
 *
 * @param props - Carries the store and the AI develop payload accessor.
 * @returns The AI actor layer fragment (avatar SVG, status line, Skip button).
 */
export function AiActorLayer(props: AiActorLayerProps): JSX.Element {
  const reducedMotion = prefersReducedMotion();
  const speed = WALKER_SPEED_PX_PER_SEC * readSpeedMultiplier();

  const initialState = untrack(() => props.store.state);
  const rows = PLOT_ROWS;
  const cols = PLOT_COLS;
  const bounds = { width: cols * WALKER_CELL_PX, height: rows * WALKER_CELL_PX };
  const terrainGrid = initialState.plots.map((row) => row.map((plot) => plot.terrain));
  const townCell = findTownCell(terrainGrid);

  const activePlayer = untrack(() => props.payload().activePlayer);
  // The AI's title-screen-configured species, matching
  // overworld_scene.tsx / town_scene.tsx's identical convention -- a
  // player's species never changes mid-game.
  const species = initialState.players[activePlayer]!.species;
  const tint = playerColor(activePlayer);

  const spawn: Vec2 =
    townCell === null ? { x: bounds.width / 2, y: bounds.height / 2 } : cellCenter(townCell);
  let avatarPos: Vec2 = spawn;
  let towPos: Vec2 = { x: spawn.x - TOW_FOLLOW_DISTANCE, y: spawn.y };
  let walkAccumMs = 0;

  // The previous step's payload/board, so aiActorTarget can detect a
  // just-completed placement; null until the first action after mount.
  let prevPayload: DevelopPayload | null = null;
  let prevPlots: readonly (readonly Plot[])[] | null = null;

  const [cell, setCell] = createSignal<Cell>(cellFromPosition(spawn));
  const [facing, setFacing] = createSignal<1 | -1>(1);
  const [walkFrame, setWalkFrame] = createSignal<1 | 2>(1);
  const carrying = createMemo(() => props.payload().carriedMule);
  const frameId = createMemo(() => pickSpeciesFrameId(species, walkFrame(), reducedMotion));

  let avatarRef: SVGGElement | undefined;
  let towRef: SVGGElement | undefined;

  //------------------------------------------
  // The avatar's current walk target: town while carrying, or the plot it
  // just placed a M.U.L.E. on, recomputed against the store's live board.
  function currentTarget(): Cell {
    const state: GameState = props.store.state;
    return aiActorTarget(props.payload(), prevPayload, prevPlots, state.plots, townCell);
  }

  //------------------------------------------
  // Snapshot this step's payload/board as "previous" for the next target
  // computation, once the avatar has settled -- called after each render of
  // a new develop-payload step (see the mount-time createEffect-free polling
  // below, driven from the rAF loop itself so it stays presentation-only).
  function snapshotPrev(): void {
    prevPayload = props.payload();
    prevPlots = props.store.state.plots;
  }

  //------------------------------------------
  // Advance one presentation frame: seek the avatar and its towed follower
  // toward the current target, and update reactive cell/facing/walk-frame state.
  function updateFrame(dtSeconds: number): void {
    const target = cellCenter(currentTarget());
    const arrived = reachedTarget(avatarPos, target, ARRIVAL_EPSILON_PX);
    const direction = arrived ? { x: 0, y: 0 } : directionToward(avatarPos, target);
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
    if (arrived) {
      snapshotPrev();
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
  // Publish the avatar's grid cell when it changes (drives data-cell-*).
  function updateCell(): void {
    const next = cellFromPosition(avatarPos);
    if (next.row !== cell().row || next.col !== cell().col) {
      setCell(next);
    }
  }

  //------------------------------------------
  // Swap the two walk frames on a timer while moving; hold frame 1 when idle
  // or under reduced motion (a positional snap, no walk-cycle animation).
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
  // Fast-forward this AI player's turn to its end state.
  function handleSkip(): void {
    runAiTurnToCompletion(props.store.dispatch, () => props.store.state, activePlayer);
  }

  onMount(() => {
    writeTransforms();
    let rafHandle = 0;
    let lastFrame = performance.now();
    const frame = (now: number): void => {
      const dtSeconds = Math.min(now - lastFrame, MAX_FRAME_MS) / 1000;
      lastFrame = now;
      updateFrame(dtSeconds);
      rafHandle = requestAnimationFrame(frame);
    };
    rafHandle = requestAnimationFrame(frame);
    onCleanup(() => cancelAnimationFrame(rafHandle));
  });

  const defsMarkup = buildSpeciesSpriteDefsMarkup() + buildMuleSpriteDefsMarkup();

  return (
    <>
      <div class="ai-actor-status" data-ai-actor-status data-ai-actor-player={activePlayer}>
        <span>{`Player ${activePlayer + 1} is developing...`}</span>
        <button type="button" class="ai-actor-skip-button" data-ai-skip-button onClick={handleSkip}>
          Skip
        </button>
      </div>
      <svg class="ai-actor-svg" viewBox={`0 0 ${bounds.width} ${bounds.height}`} aria-hidden="true">
        <g innerHTML={defsMarkup} />
        <Show when={carrying() !== "none"}>
          <g
            class="ai-actor-tow"
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
        <g
          data-actor={`player-${activePlayer}`}
          data-cell-row={cell().row}
          data-cell-col={cell().col}
          data-carrying={carrying()}
          ref={(el) => {
            avatarRef = el;
          }}
        >
          <g class="ai-actor-sprite" transform={facing() === -1 ? "scale(-1 1)" : undefined}>
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
    </>
  );
}

//============================================
/**
 * Whether a carried-M.U.L.E. value is an outfitted resource (so its outfit
 * badge should show), as opposed to `none` or `unoutfitted`. Matches
 * overworld_scene.tsx's identical helper.
 *
 * @param carried - The develop payload's `carriedMule` value.
 * @returns True when carrying an outfitted M.U.L.E.
 */
function isResourceCarry(carried: DevelopPayload["carriedMule"]): boolean {
  return carried !== "none" && carried !== "unoutfitted";
}
