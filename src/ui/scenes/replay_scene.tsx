// Replay viewer as a SolidJS component.
//
// Plays a recorded action log (src/ui/scenes/replay_fixture.ts) back through
// the real game screen. It reconstructs the game's initial post-start state
// from the log's seed/mode/species (save_log.ts's initialStateFromSave), wraps
// it in a plain GameStore -- no autosave recorder, so a replay never touches
// the player's saved game -- and steps the recorded actions into that store one
// at a time on an rAF accumulator scaled by the playback speed. Because the
// store drives the ordinary GameScreen, the board, HUD, and phase panels render
// exactly as they did in the live game.
//
// Transport is keyboard accessible: real <button>s for play/pause, restart, and
// a speed radiogroup. `?speed=` (parsed in main.tsx) sets the initial speed.
// The viewer never dispatches ticks through the scene manager and never mounts
// the scene loop, so it is fully decoupled from live play.
//
// Solid discipline: run-once component, props read through the props object,
// per-frame stepping via an rAF loop torn down in onCleanup, and a <For> over
// the fixed speed options.

import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { createGameStore } from "../game_store";
import type { SavedGame } from "../save_log";
import { initialStateFromSave } from "../save_log";
import { REPLAY_FIXTURE } from "./replay_fixture";
import { GameScreen } from "../solid/game_screen";

/** Selectable playback speeds, in radiogroup display order. */
const SPEED_OPTIONS: readonly number[] = [1, 4, 16, 50];

/**
 * Base real time per recorded action at speed 1. The rAF loop consumes scaled
 * elapsed time in these units, so a step every `REPLAY_BASE_STEP_MS / speed`
 * milliseconds; higher speeds consume several actions per frame.
 */
const REPLAY_BASE_STEP_MS = 40;

/** Props for the replay viewer. */
export interface ReplayScreenProps {
  /** Initial playback speed multiplier (from `?speed=`, see main.tsx). */
  readonly initialSpeed: number;
}

//============================================
/**
 * Render the replay viewer: the live game screen driven by the recorded log,
 * plus a transport bar. Uses the committed fixture as its log source.
 *
 * @param props - Carries the initial playback speed.
 * @returns The replay screen fragment.
 */
export function ReplayScreen(props: ReplayScreenProps): JSX.Element {
  const fixture: SavedGame = REPLAY_FIXTURE;
  const totalSteps = fixture.actions.length;

  // The store is rebuilt from the fixture's opening state on mount and on every
  // restart; `stepIndex` tracks how many recorded actions have been applied.
  const [store, setStore] = createSignal(createGameStore(initialStateFromSave(fixture)));
  const [stepIndex, setStepIndex] = createSignal(0);
  const [playing, setPlaying] = createSignal(true);
  const [speed, setSpeed] = createSignal(normalizeSpeed(props.initialSpeed));

  const phaseKind = createMemo((): string => store().state.phase.kind);
  const done = createMemo((): boolean => stepIndex() >= totalSteps);

  //------------------------------------------
  // Apply the next recorded action, advancing the store one step. A no-op once
  // every action has been replayed.
  function stepOnce(): void {
    const index = stepIndex();
    if (index >= totalSteps) {
      return;
    }
    const action = fixture.actions[index];
    if (action === undefined) {
      return;
    }
    store().dispatch(action);
    setStepIndex(index + 1);
  }

  //------------------------------------------
  // Rebuild the store at the fixture's opening state and rewind to step 0,
  // leaving playback running so Restart immediately replays from the top.
  function restart(): void {
    setStore(createGameStore(initialStateFromSave(fixture)));
    setStepIndex(0);
    setPlaying(true);
  }

  // rAF stepping loop: consume scaled elapsed time in REPLAY_BASE_STEP_MS units,
  // firing one recorded action per whole unit. Runs only while playing and while
  // recorded actions remain; auto-pauses at the end. Torn down on unmount.
  let rafHandle = 0;
  let lastFrame = 0;
  let accumulator = 0;
  function onFrame(now: number): void {
    const delta = lastFrame === 0 ? 0 : Math.min(now - lastFrame, 100);
    lastFrame = now;
    if (playing() && stepIndex() < totalSteps) {
      accumulator += delta * speed();
      while (accumulator >= REPLAY_BASE_STEP_MS && stepIndex() < totalSteps) {
        accumulator -= REPLAY_BASE_STEP_MS;
        stepOnce();
      }
    } else {
      accumulator = 0;
    }
    rafHandle = requestAnimationFrame(onFrame);
  }
  rafHandle = requestAnimationFrame(onFrame);
  onCleanup(() => {
    if (rafHandle !== 0) {
      cancelAnimationFrame(rafHandle);
    }
  });

  return (
    <div class="replay-screen">
      <div
        class="replay-transport"
        data-replay-transport
        data-replay-step={stepIndex()}
        data-replay-total={totalSteps}
        data-replay-phase={phaseKind()}
        data-replay-done={done() ? "true" : "false"}
      >
        <button
          type="button"
          id="replay-play-pause"
          class="replay-transport-button"
          aria-pressed={playing()}
          onClick={() => setPlaying(!playing())}
        >
          {playing() ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          id="replay-restart"
          class="replay-transport-button"
          onClick={() => restart()}
        >
          Restart
        </button>
        <div class="replay-speed" role="radiogroup" aria-label="Playback speed">
          <For each={SPEED_OPTIONS}>
            {(option) => (
              <button
                type="button"
                class="replay-speed-option"
                data-replay-speed={option}
                role="radio"
                aria-checked={speed() === option}
                onClick={() => setSpeed(option)}
              >
                {`${option}x`}
              </button>
            )}
          </For>
        </div>
        <span class="replay-progress" aria-live="polite">
          {`Step ${stepIndex()} / ${totalSteps}`}
        </span>
      </div>
      <div class="replay-stage">
        {/* Keyed on the store identity so Restart (which swaps in a fresh store)
            remounts GameScreen cleanly, matching app.tsx's live-store pattern. */}
        <Show when={store()} keyed>
          {(activeStore) => <GameScreen store={activeStore} />}
        </Show>
      </div>
    </div>
  );
}

//============================================
/**
 * Clamp an incoming speed to one of the supported options, so `?speed=` values
 * outside the transport's set still select a valid, in-range playback speed
 * (the nearest supported speed at or below the request, at least the slowest).
 *
 * @param requested - The requested speed multiplier.
 * @returns A supported speed option.
 */
function normalizeSpeed(requested: number): number {
  if (SPEED_OPTIONS.includes(requested)) {
    return requested;
  }
  const slowest = SPEED_OPTIONS[0] ?? 1;
  let chosen = slowest;
  for (const option of SPEED_OPTIONS) {
    if (option <= requested && option > chosen) {
      chosen = option;
    }
  }
  return chosen;
}
