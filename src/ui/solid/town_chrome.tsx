// Town chrome: a dedicated screen-space HUD strip visible for the entire town
// visit. Previously the development timer only rendered inside
// DevelopPanel, which game_screen.tsx hides while the human is in town
// (`<Show when={!humanInTown()}>`), so the town removed the most important
// readout during the phase where travel time matters most. This strip mounts
// as the mirror image of that Show (`<Show when={humanInTown()}>`) and stays
// overworld-agnostic: DevelopPanel itself is unchanged and stays
// overworld-only.
//
// Reads the exact transaction-state sources DevelopPanel and the town panels
// already read (town_world.ts's "Transaction-state selector list"):
// `DevelopPayload.ticksRemaining`/`.carriedMule` and
// `store.state.players[HUMAN_ID].money` -- so the town, the panels, and this
// strip never disagree about a player's money or tow state.
//
// The draining bar's denominator is `DEVELOP_TICKS_FULL`, the same full-turn
// tick constant turn.ts's `applyGamble` already uses for this identical
// ticks-remaining-over-full-budget fraction, rather than capturing
// `ticksRemaining` at mount the way overworld_scene.tsx's timer does: this
// strip can mount and unmount several times within one develop turn as the
// human walks in and out of town, so a fixed engine constant is the right
// denominator, not a per-mount snapshot that would reset the bar's look on
// re-entry.
//
// The nearest-storefront label is a stub for now (TODO):
// town_collision.ts's nearest-facade lookup (`nearestFacadeIndex`) is private
// and town_scene.tsx does not yet surface it upward; this chrome strip stays
// screen-space only and does not touch town_scene.tsx or town_collision.ts.
// A future change wires the real label once one of those modules exports the
// signal.
//
// This strip is screen-space (not part of the scrolling world): sized off
// #game-stage's container-query box (cqw/cqh), matching `.develop-panel`'s
// column-width convention, not the town scene's own world-scale SVG.
//
// End turn control: relocated here from town_scene.tsx's own footer
// button, as a small secondary control clearly distinct from the Pub -- the
// Pub door is the primary turn-end destination via walk-in plus its gamble
// confirm (docs/HUMAN_GUIDANCE.md "Town interaction model"), so this button
// stays visually minor rather than competing with that door as "the" way to
// end a turn. The `[data-action="develop-end-turn"]` hook and the
// `.town-end-turn-button` class are both preserved unchanged so the existing
// Playwright/E2E specs that locate the old town-scene button keep finding it
// here; `.town-chrome-end-turn-button` layers the smaller chrome-scale sizing
// on top (see style.css).
//
// Solid discipline: run-once component, props read through the props object
// (never destructured), derived values as plain accessor functions -- a memo
// buys nothing extra here, each is a one-line read off the already-reactive
// payload/store the parent passes down.

import type { JSX } from "solid-js";
import type { DevelopPayload } from "../../engine/game_state";
import { DEVELOP_TICKS_FULL } from "../../engine/constants";
import type { GameStore } from "../game_store";
import { HUMAN_ID } from "../game_driver";

/** Props for the town chrome strip. */
export interface TownChromeProps {
  /** The live game store, for the money read. */
  readonly store: GameStore;
  /** Reactive accessor for the human develop payload (ticks, tow state). */
  readonly payload: () => DevelopPayload;
}

//============================================
/**
 * Render the town HUD chrome strip: a draining time bar plus an accessible
 * numeric `Ticks left`, money, tow state, and a nearest-storefront label.
 * Visible for the entire town visit, mirroring DevelopPanel's overworld-only
 * `<Show>` in game_screen.tsx.
 *
 * @param props - Carries the store and the human develop payload accessor.
 * @returns The town chrome strip element.
 */
export function TownChrome(props: TownChromeProps): JSX.Element {
  const ticksLeft = (): number => props.payload().ticksRemaining;
  const timerRatio = (): number => Math.max(0, Math.min(1, ticksLeft() / DEVELOP_TICKS_FULL));
  const money = (): number => props.store.state.players[HUMAN_ID]?.money ?? 0;
  const tow = (): TowLabel => towLabel(props.payload().carriedMule);

  return (
    <div class="town-chrome" data-town-chrome>
      <div class="town-chrome-timer" aria-hidden="true">
        <div
          class="town-chrome-timer-fill"
          data-town-ticks-bar
          style={{ width: `${timerRatio() * 100}%` }}
        />
      </div>
      <div class="town-chrome-status">
        <span class="town-chrome-ticks" data-town-ticks>{`Ticks left: ${ticksLeft()}`}</span>
        <span class="town-chrome-money" data-town-money>{`Money: $${money()}`}</span>
        <span class="town-chrome-tow" data-town-tow={tow().state}>
          {tow().text}
        </span>
        {/* TODO: wire the real nearest-storefront label once
            town_collision.ts or town_scene.tsx exposes the nearest-facade
            signal upward; stubbed neutral for now rather than blocking the
            timer/money/tow requirements above. */}
        <span class="town-chrome-nearest" data-town-nearest="" />
      </div>
      <button
        type="button"
        class="town-end-turn-button town-chrome-end-turn-button"
        data-action="develop-end-turn"
        onClick={() => props.store.dispatch({ type: "end_turn", playerId: HUMAN_ID })}
      >
        End turn
      </button>
    </div>
  );
}

/** One tow-state display: the raw state token (for `data-town-tow`) and its label text. */
interface TowLabel {
  readonly state: "none" | "unoutfitted" | "resource";
  readonly text: string;
}

//============================================
/**
 * The tow-state label for the carried M.U.L.E., matching the corral and
 * outfit panels' three-state model: no mule carried, an unoutfitted mule, or
 * a mule outfitted with a resource.
 *
 * @param carried - The develop payload's `carriedMule` value.
 * @returns The tow-state token and display text.
 */
function towLabel(carried: DevelopPayload["carriedMule"]): TowLabel {
  if (carried === "none") {
    return { state: "none", text: "Tow: none" };
  }
  if (carried === "unoutfitted") {
    return { state: "unoutfitted", text: "Tow: unoutfitted M.U.L.E." };
  }
  return { state: "resource", text: `Tow: ${carried} M.U.L.E.` };
}
