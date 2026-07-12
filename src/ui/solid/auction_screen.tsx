// Goods-auction shell: the container, the beat sequencer, and the intent layer.
//
// The auction owns the WHOLE 16:10 stage. game_screen.tsx hides #game-hud and
// flex-fills #game-panel for the auction phase (the `game-hud-hidden` /
// `game-panel-filled` seam, mirroring the proven `game-map-filled` idiom), so
// `.auction-screen` below is handed the full stage box and hands it straight to
// the arena slot. The arena SVG's viewBox (960x600, src/ui/scenes/auction_geometry.ts)
// is 16:10 too, so it fills that box exactly with no letterbox band.
//
// This file is the SHELL, not the composition. It owns:
//   - beat sequencing (declare at tick 0 -> live -> finished),
//   - the reduced-motion signal, read once at mount and on every media change,
//   - keyboard price intent, and the on-screen intent buttons,
//   - the DOM overlays that float over the arena (declare, finished, hint,
//     aria-live announcer),
//   - the selector contract the walkthrough harness drives the game through.
//
// The composition itself -- the price runway, the store rails, the lane rows,
// the player dock, the status/accounting beat -- lives in sibling lanes
// (auction_arena.tsx, auction_dock.tsx, auction_status.tsx), which implement the
// prop contracts in src/ui/scenes/auction_props.ts. `AuctionArena` is the single
// full-stage SVG and composes the dock inside its own viewBox, so the shell
// hands it the payload, the reduced-motion flag, and the live players (the only
// source of the dock's money and units columns) and stays out of the geometry.
//
// SELECTOR CONTRACT (tests/e2e/walkthrough_auction.mjs is the only external UI
// contract this game has; breaking it still stops the walkthrough cold, but
// it now fails LOUD, not silent: clickRequired (tests/e2e/walkthrough_helpers.mjs)
// throws `required_control_missing` within about a second, naming the exact
// missing selector, instead of the old silent-swallow behavior that used to
// deadlock the walkthrough sweep to its 4000-tick cap):
//   - data-action="auction-role" + data-role="buyer|seller|out": all three
//     rendered, visible, and CLICKABLE from tick 0's FIRST FRAME. Nothing may
//     cover them -- the declare overlay carries them itself, and the tutorial
//     hint above is pointer-events: none.
//   - data-action="auction-intent-up" / "auction-intent-down": while the window
//     is live.
//   - data-action="auction-continue": while the window is finished (a skipped
//     window is created already finished, so it advances immediately).
//   - .auction-screen[data-reduced-motion] and the trade layer's monotonic
//     .auction-trade-layer[data-flash-count] back the behavior safety net in
//     tests/playwright/auction_scene.spec.mjs.
//
// Controls: ArrowRight raises the price and ArrowLeft lowers it -- the axis the
// avatars actually walk (cheap wall left, expensive wall right). ArrowUp and
// ArrowDown stay bound as aliases so the older gesture keeps working. Intent is
// a HELD state, so keydown sets a direction, keyup releases to "hold", and OS
// auto-repeat is ignored. The listener lives on the shell for the whole auction
// rather than only while the window is live: `set_auction_intent` merely records
// the participant's intent (src/engine/auction.ts), so a key held down through
// the opening role choice carries into the window instead of being dropped on
// the beat change.

import { For, Show, onMount, onCleanup, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import type { Action, AuctionPayload, AuctionRole } from "../../engine/game_state";
import type { GameStore } from "../game_store";
import { HUMAN_ID } from "../game_driver";
import { notifyAuctionCommit } from "../scenes/scene_manager";
import { AuctionArena } from "../scenes/auction_arena";
import { AuctionStatusLayer } from "../scenes/auction_status";
import { TutorialHint } from "./tutorial_hint";

/** The three roles, in the order the buttons render (Buy, Sell, Sit Out). */
const ROLE_CHOICES: readonly { readonly role: AuctionRole; readonly label: string }[] = [
  { role: "buyer", label: "Buy" },
  { role: "seller", label: "Sell" },
  { role: "out", label: "Sit Out" },
];

/** Which beat of one good's auction window is on screen. */
type AuctionBeat = "declare" | "live" | "finished";

/** Props for the auction shell. */
export interface AuctionScreenProps {
  /** The live game store, for dispatch and current-state reads. */
  readonly store: GameStore;
  /** Reactive accessor for the auction payload. */
  readonly payload: () => AuctionPayload;
}

//============================================
/**
 * The price direction a key gesture asks for, or undefined for a key this
 * screen does not bind. Right/Up raise, Left/Down lower: right is the primary,
 * taught gesture because a rising price walks the avatar rightward along the
 * runway; up/down are compatibility aliases for the pre-landscape control.
 *
 * @param key - The KeyboardEvent `key` value.
 * @returns "up" to raise, "down" to lower, or undefined when unbound.
 */
function intentForKey(key: string): "up" | "down" | undefined {
  if (key === "ArrowRight" || key === "ArrowUp") {
    return "up";
  }
  if (key === "ArrowLeft" || key === "ArrowDown") {
    return "down";
  }
  return undefined;
}

//============================================
/**
 * Whether the browser currently reports a reduced-motion preference. Read once
 * to seed the signal and again on every media-query change.
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
 * Render the goods-auction screen: the full-stage arena slot with the beat's
 * overlay floating over it. The root carries `data-reduced-motion` so a browser
 * test can confirm the emulated preference reached the scene, and `data-beat`
 * so a capture driver can tell the beats apart without reading engine state.
 *
 * @param props - Carries the store and the auction payload accessor.
 * @returns The auction screen element.
 */
export function AuctionScreen(props: AuctionScreenProps): JSX.Element {
  const dispatch = (action: Action): void => props.store.dispatch(action);
  const [reducedMotion, setReducedMotion] = createSignal(prefersReducedMotion());

  onMount(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (): void => {
      setReducedMotion(mediaQuery.matches);
    };
    mediaQuery.addEventListener("change", onChange);
    onCleanup(() => mediaQuery.removeEventListener("change", onChange));
  });

  const setIntent = (intent: "up" | "down" | "hold"): void => {
    dispatch({ type: "set_auction_intent", playerId: HUMAN_ID, intent });
  };

  onMount(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Intent is a held state, so OS auto-repeat is redundant: the first
      // keydown already set the direction.
      if (event.repeat) {
        return;
      }
      const direction = intentForKey(event.key);
      if (direction === undefined) {
        return;
      }
      event.preventDefault();
      setIntent(direction);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (intentForKey(event.key) !== undefined) {
        setIntent("hold");
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    onCleanup(() => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
    });
  });

  // The beat this good's window is on. A skipped window is created already
  // finished, so it lands on "finished" and offers Continue immediately, with
  // no declare step -- the engine ran no trading phase for it at all.
  const beat = (): AuctionBeat => {
    const payload = props.payload();
    if (payload.finished) {
      return "finished";
    }
    if (payload.tick === 0) {
      return "declare";
    }
    return "live";
  };

  return (
    <div
      class="auction-screen"
      data-reduced-motion={reducedMotion() ? "true" : "false"}
      data-beat={beat()}
    >
      <div class="auction-arena-slot">
        {/* Keyed on the good so each window opens with avatars snapped to their
            new band rather than tweening across from the last good's prices. */}
        <Show when={props.payload().good} keyed>
          {(_good) => (
            <AuctionArena
              payload={props.payload}
              reducedMotion={reducedMotion}
              players={() => props.store.state.players}
            />
          )}
        </Show>
        <Show when={beat() === "declare"}>
          <DeclareOverlay
            payload={props.payload}
            dispatch={dispatch}
            reducedMotion={reducedMotion}
          />
        </Show>
        <Show when={beat() === "live"}>
          <IntentControls setIntent={setIntent} />
        </Show>
        <Show when={beat() === "finished"}>
          <FinishedOverlay payload={props.payload} dispatch={dispatch} />
        </Show>
      </div>
      <p class="auction-screen-announcer" aria-live="polite">
        {announceBeat(props.payload())}
      </p>
    </div>
  );
}

//============================================
/**
 * The screen-reader line for the current beat. Deliberately keyed to the good
 * and the beat rather than the live price, so a polite live region announces
 * the four moments that matter instead of chattering on every tick.
 *
 * @param payload - The current good's auction payload.
 * @returns The sentence to announce.
 */
function announceBeat(payload: AuctionPayload): string {
  if (payload.skipped) {
    return `${payload.good}: no trade possible this round.`;
  }
  if (payload.finished) {
    return `${payload.good} auction complete.`;
  }
  if (payload.tick === 0) {
    return `${payload.good} auction: choose Buy, Sell, or Sit Out.`;
  }
  return `${payload.good} auction under way. Right arrow raises your price, left arrow lowers it.`;
}

//============================================
/**
 * Declare overlay: the Buy / Sell / Sit Out choice, floating over the live
 * arena at the opening tick. Choosing declares the human's role for this good
 * and notifies the scene manager that the auction clock may start (even when
 * the choice is to sit out).
 *
 * The three role buttons are the walkthrough harness's tick-0 contract: they
 * render on the first frame of the window (this overlay is plain markup gated
 * on a payload field, not on any timer, effect, or fetch), and nothing floats
 * above them, so a harness click always lands. The status/accounting beat
 * (`AuctionStatusLayer`) renders here in the SAME document flow, ABOVE
 * these buttons in reading order, never absolutely positioned on top of them
 * in the stacking order.
 *
 * @param props - Carries the payload accessor, the dispatch function, and the
 *   reduced-motion flag the status layer needs to snap its bars.
 * @returns The declare overlay element.
 */
function DeclareOverlay(props: {
  readonly payload: () => AuctionPayload;
  readonly dispatch: (action: Action) => void;
  readonly reducedMotion: () => boolean;
}): JSX.Element {
  const choose = (role: AuctionRole): void => {
    props.dispatch({ type: "set_auction_role", playerId: HUMAN_ID, role });
    notifyAuctionCommit();
  };
  return (
    <div class="auction-overlay auction-declare-overlay">
      <p class="auction-overlay-title">{`${props.payload().good} auction`}</p>
      <AuctionStatusLayer
        status={() => props.payload().status}
        reducedMotion={props.reducedMotion}
      />
      <p class="auction-overlay-hint">Choose your side for this good.</p>
      {/* The hint rides INSIDE the declare card rather than floating over the
          arena. As a corner-pinned overlay it sat in the top band, where it
          covered the good's own title and emblem, crowded the going price it was
          floating next to, and clipped the dock's column header -- badly enough
          at 1280x800 to cut the header's glyphs in half. There is no free corner
          on this screen to move it to; every region is carrying something. The
          card, though, is the one surface with room, and it is showing at exactly
          the beat the hint is for. It leaves with the card on the first commit,
          so the live market is never taught over. */}
      <TutorialHint
        kind="auction"
        message="Hold the Right Arrow to raise your price, the Left Arrow to lower it."
      />
      <div class="auction-role-choices">
        <For each={ROLE_CHOICES}>
          {(entry) => (
            <button
              type="button"
              class="auction-screen-button auction-screen-role-button"
              data-action="auction-role"
              data-role={entry.role}
              onClick={() => choose(entry.role)}
            >
              {entry.label}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}

//============================================
/**
 * Finished overlay: the window's closing summary and a Continue button that
 * ends the good (the scene manager also auto-advances after a pause). A skipped
 * window says so plainly rather than showing an empty trade summary -- the
 * engine ran no trading phase for it.
 *
 * @param props - Carries the payload accessor and the dispatch function.
 * @returns The finished overlay element.
 */
function FinishedOverlay(props: {
  readonly payload: () => AuctionPayload;
  readonly dispatch: (action: Action) => void;
}): JSX.Element {
  const summary = (): string => {
    const payload = props.payload();
    if (payload.skipped) {
      return `No ${payload.good} to trade this round.`;
    }
    const units = payload.trades.length;
    if (units === 0) {
      return "Round of trading complete. No units changed hands.";
    }
    return `Round of trading complete. ${units} unit${units === 1 ? "" : "s"} traded.`;
  };
  return (
    <div class="auction-overlay auction-finished-overlay">
      <p class="auction-overlay-title">{summary()}</p>
      <button
        type="button"
        class="auction-screen-button auction-screen-continue-button"
        data-action="auction-continue"
        onClick={() => props.dispatch({ type: "end_auction" })}
      >
        Continue
      </button>
    </div>
  );
}

//============================================
/**
 * The live window's price-intent controls: press-and-hold Raise / Lower buttons
 * for pointer and touch input, mirroring the ArrowRight / ArrowLeft keys the
 * shell binds. Each fires on pointerdown and releases on pointerup, leave, or
 * cancel, so a dragged-off touch still releases the hold.
 *
 * @param props - Carries the intent setter.
 * @returns The intent control bar.
 */
function IntentControls(props: {
  readonly setIntent: (intent: "up" | "down" | "hold") => void;
}): JSX.Element {
  return (
    <div class="auction-intent-controls">
      <IntentButton
        label="Lower"
        className="auction-screen-intent-down"
        dataAction="auction-intent-down"
        onPress={() => props.setIntent("down")}
        onRelease={() => props.setIntent("hold")}
      />
      <p class="auction-intent-legend">Left arrow lowers, right arrow raises</p>
      <IntentButton
        label="Raise"
        className="auction-screen-intent-up"
        dataAction="auction-intent-up"
        onPress={() => props.setIntent("up")}
        onRelease={() => props.setIntent("hold")}
      />
    </div>
  );
}

//============================================
/**
 * A press-and-hold intent button: fires onPress on pointerdown and onRelease on
 * pointerup / leave / cancel, so a dragged-off touch still releases the hold.
 *
 * @param props - Carries the label, extra class, and press/release handlers.
 * @returns The intent button element.
 */
function IntentButton(props: {
  readonly label: string;
  readonly className: string;
  readonly dataAction: string;
  readonly onPress: () => void;
  readonly onRelease: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      class={`auction-screen-button auction-screen-intent-button ${props.className}`}
      data-action={props.dataAction}
      onPointerDown={() => props.onPress()}
      onPointerUp={() => props.onRelease()}
      onPointerLeave={() => props.onRelease()}
      onPointerCancel={() => props.onRelease()}
    >
      {props.label}
    </button>
  );
}
