// Pure wampus presentation timing.
//
// The engine's wampus visible window is exactly 1 develop-phase tick (see
// wampus.ts's module doc and docs/RULE_SOURCES.md, "Wampus: spawn, blink,
// and move timing"): faithful to planet_mule's tick mapping, but far too
// short for a human to actually see and react to at normal scene speed. This
// module is the UI-side presentation buffer the plan calls for: it diffs
// `WampusState.events` by tick (the same append-only-log diffing pattern the
// auction UI applies to `AuctionPayload.trades`) and holds the sprite visible
// for at least `WAMPUS_MIN_VISIBLE_MS` of real time after a spawn or blink
// event, even once the engine's own `visible` flag has already flipped back
// to false one tick later.
//
// This buffer is purely cosmetic reaction time -- it never changes whether a
// hunt is actually legal. The caller gates the hunt action on the engine's
// own `wampus.visible && !wampus.dead && !wampus.caught` (real catchability),
// not on this module's `visible`, matching the dispatch note: "the hunt
// affordance should reflect actual engine catchability."
//
// DOM-free and framework-free, like walker.ts and zones.ts: the node tests
// (tests/test_wampus_presentation.mjs) exercise it directly without a
// browser or a Solid component.

import type { WampusState } from "../../engine/game_state";

/**
 * Minimum real time (ms) the wampus sprite stays visible after a spawn or
 * blink event, regardless of the engine's own single-tick visible window.
 * Within the plan's stated 600-1000ms reaction-time range.
 */
export const WAMPUS_MIN_VISIBLE_MS = 800;

/** Presentation state for the wampus sprite, threaded frame to frame. */
export interface WampusPresentationState {
  /** Whether the sprite should currently render. */
  readonly visible: boolean;
  /** Site to render the sprite at, or null before its first appearance this round. */
  readonly row: number | null;
  readonly col: number | null;
  /** Tick of the last spawn/blink event this state has already reacted to. */
  readonly lastEventTick: number | null;
  /** Real ms elapsed since that event, for the minimum-visible-time countdown. */
  readonly elapsedSinceEventMs: number;
}

/**
 * The presentation state before the wampus has ever appeared.
 *
 * @returns A fresh, not-yet-visible presentation state.
 */
export function initialWampusPresentation(): WampusPresentationState {
  return { visible: false, row: null, col: null, lastEventTick: null, elapsedSinceEventMs: 0 };
}

/**
 * Advance the wampus presentation state by one frame: pick up a new
 * spawn/blink event (restarting the minimum-visible-time countdown at the
 * event's site) or, once the countdown has elapsed, fall through to the
 * engine's own live `visible` flag. A `catch` event's site is not picked up
 * here (the caller renders catch feedback separately from the roaming
 * sprite); once the wampus is dead this frame, the sprite hides regardless
 * of any pending countdown, since there is nothing left to react to.
 *
 * @param prev - The presentation state from the previous frame.
 * @param wampus - The current engine wampus state.
 * @param dtMs - Real elapsed time (ms) since the previous frame.
 * @returns The advanced presentation state.
 */
export function stepWampusPresentation(
  prev: WampusPresentationState,
  wampus: WampusState,
  dtMs: number,
): WampusPresentationState {
  const latestEvent = wampus.events[wampus.events.length - 1];
  const isNewAppearance =
    latestEvent !== undefined &&
    (latestEvent.kind === "spawn" || latestEvent.kind === "blink") &&
    latestEvent.tick !== prev.lastEventTick;
  if (isNewAppearance) {
    return {
      visible: true,
      row: latestEvent.row,
      col: latestEvent.col,
      lastEventTick: latestEvent.tick,
      elapsedSinceEventMs: 0,
    };
  }
  const elapsedSinceEventMs = prev.elapsedSinceEventMs + dtMs;
  if (wampus.dead) {
    return { ...prev, visible: false, elapsedSinceEventMs };
  }
  if (elapsedSinceEventMs < WAMPUS_MIN_VISIBLE_MS) {
    return { ...prev, elapsedSinceEventMs };
  }
  return { ...prev, visible: wampus.visible, elapsedSinceEventMs };
}
