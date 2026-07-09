// Human develop-turn map layer: overworld <-> town coordinator.
//
// During the human's develop turn the map area shows one of two walkable
// scenes: the OverworldScene (avatar over the board) or the TownScene (the
// walkable town interior). This component owns the UI-only sub-state that flips
// between them -- there is no separate engine phase for town; the engine stays
// in `develop` the whole time, so the scene manager keeps draining the turn's
// tick budget while the player is in town.
//
// Stepping onto the overworld town cell enters town; walking into a town edge
// exit returns to the overworld, respawned one cell off the town cell in the
// exit's direction so the avatar does not immediately re-enter. The town's
// assay office arms an assay that the overworld's action key then spends on the
// next assayable plot.
//
// This component is mounted keyed per human develop turn (see game_screen.tsx),
// so its sub-state (in-town, spawn, assay-armed) resets fresh each turn: every
// human turn begins on the overworld beside the town.
//
// Solid discipline: run-once component, props read through the props object, the
// scene swap driven by two <Show> branches over a signal, and the fixed board
// geometry read once (untracked) at mount.

import { Show, createSignal, createEffect, onCleanup, untrack } from "solid-js";
import type { JSX } from "solid-js";
import type { DevelopPayload } from "../../engine/game_state";
import { PLOT_COLS, PLOT_ROWS } from "../../engine/game_state";
import type { GameStore } from "../game_store";
import { OverworldScene } from "./overworld_scene";
import { TownScene } from "./town_scene";
import { Dpad } from "./dpad";
import type { Cell } from "./walker";
import { findTownCell, overworldReturnCell } from "./zones";
import type { TownExit } from "./zones";
import { TutorialHint } from "../solid/tutorial_hint";

/** Props for the human develop-turn map layer. */
export interface HumanDevelopLayerProps {
  /** The live game store, for dispatch and current-state reads. */
  readonly store: GameStore;
  /** Reactive accessor for the human develop payload. */
  readonly payload: () => DevelopPayload;
  /**
   * Notified with the current in-town state whenever it changes, and with
   * `false` when this layer unmounts. `game_screen.tsx`'s develop-turn side
   * panel uses this to suppress its own hint-and-End-Turn footer while the
   * town scene's footer is showing, so exactly one footer renders at a time
   * (the town scene and the side panel each render a full instruction line
   * plus an End Turn button, and both mounting together duplicated both).
   */
  readonly onInTownChange?: (inTown: boolean) => void;
}

//============================================
/**
 * Render the human develop-turn map layer, swapping between the overworld and
 * town scenes.
 *
 * @param props - Carries the store and the human develop payload accessor.
 * @returns The map-layer fragment (overworld or town scene).
 */
export function HumanDevelopLayer(props: HumanDevelopLayerProps): JSX.Element {
  // The board is fixed for the game; read its town cell and dimensions once.
  const initialState = untrack(() => props.store.state);
  const terrainGrid = initialState.plots.map((row) => row.map((plot) => plot.terrain));
  const townCell = findTownCell(terrainGrid);

  const [inTown, setInTown] = createSignal(false);
  const [spawnCell, setSpawnCell] = createSignal<Cell | undefined>(undefined);
  const [assayArmed, setAssayArmed] = createSignal(false);

  // Publish inTown to the parent so it can suppress its own duplicate footer;
  // reset to false on unmount so a stale "in town" reading does not linger
  // into the next human develop turn.
  createEffect(() => props.onInTownChange?.(inTown()));
  onCleanup(() => props.onInTownChange?.(false));

  //------------------------------------------
  // Enter the town scene (the overworld avatar just stepped onto the town cell).
  function enterTown(): void {
    setInTown(true);
  }

  //------------------------------------------
  // Leave town through an edge exit: respawn the overworld avatar one cell off
  // the town cell in the exit's direction, then swap back to the overworld.
  function handleExit(exit: TownExit): void {
    if (townCell !== null) {
      setSpawnCell(overworldReturnCell(townCell, exit, PLOT_ROWS, PLOT_COLS));
    }
    setInTown(false);
  }

  return (
    <>
      <Show when={!inTown()}>
        <OverworldScene
          store={props.store}
          payload={props.payload}
          spawnCell={spawnCell()}
          onEnterTown={enterTown}
          assayArmed={assayArmed}
          onAssayed={() => setAssayArmed(false)}
        />
      </Show>
      <Show when={inTown()}>
        <TutorialHint
          kind="town"
          message="Walk into a building to shop, then step through an edge exit to return to your plots."
          variant="overlay"
        />
        <TownScene
          store={props.store}
          payload={props.payload}
          onExit={handleExit}
          onArmAssay={() => setAssayArmed(true)}
        />
      </Show>
      {/* Touch d-pad: mounted once here rather than inside
          each scene, since it only ever dispatches synthetic ArrowUp/Down/
          Left/Right keydown/keyup events on document -- the same input path
          both OverworldScene and TownScene already listen to, so one mount
          covers movement in either scene with no scene-side change. Hidden
          on non-touch pointers via CSS. */}
      <Dpad />
    </>
  );
}
