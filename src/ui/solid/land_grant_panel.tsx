// Land-grant panel as a SolidJS component.
//
// Renders the same markup the imperative renderLandGrantPanel produced: a hint
// line and, on the human's turn, a Pass button (#land-grant-pass-button). It
// also owns the human's land-grant keyboard input: the sweep cursor itself is
// engine-driven (see src/engine/land_grant.ts's advanceSweepCursor,
// docs/RULE_SOURCES.md "Land grant: engine-driven sweep cursor") -- this panel
// only reads the current sweep position for the hint text and binds Enter/
// Space to claim wherever the cursor currently sits, plus Escape/P to pass.
// MapLayer renders the cursor highlight from the same payload (game_screen.tsx
// reads payload().sweepRow/sweepCol into MapLayer's cursor prop), so the panel
// and the board stay in sync without any UI-only cursor state.
//
// Solid discipline: run-once component, props read through the props object,
// keyboard listeners bound in onMount and released in onCleanup.

import { Show, onMount, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import type { LandGrantPayload } from "../../engine/game_state";
import { currentPicker } from "../../engine/land_grant";
import type { GameStore } from "../game_store";
import { HUMAN_ID } from "../game_driver";
import { bindKeys } from "../input";
import { TutorialHint } from "./tutorial_hint";

/** Props for the land-grant panel. */
export interface LandGrantPanelProps {
  /** The live game store, for dispatch and current-state reads. */
  readonly store: GameStore;
  /** Reactive accessor for the land-grant payload. */
  readonly payload: () => LandGrantPayload;
}

//============================================
/**
 * Render the land-grant panel and bind the human's land-grant keyboard input.
 *
 * @param props - Carries the store and payload accessor.
 * @returns The land-grant panel element.
 */
export function LandGrantPanel(props: LandGrantPanelProps): JSX.Element {
  const picker = (): number | null => currentPicker(props.payload());
  const isHumanTurn = (): boolean => picker() === HUMAN_ID;

  onMount(() => {
    const unbind = bindKeys({
      Enter: claimCurrentPlot,
      " ": claimCurrentPlot,
      Escape: passTurn,
      p: passTurn,
      P: passTurn,
    });
    onCleanup(unbind);
  });

  //------------------------------------------
  // Claim whichever plot the sweep cursor currently sits on. Inert unless it
  // is the human's pick; the engine itself re-validates the target plot's
  // legality (see applyClaimCurrentPlot), so no client-side legality check is
  // needed here.
  function claimCurrentPlot(): void {
    if (!isHumanTurn()) {
      return;
    }
    props.store.dispatch({ type: "claim_current_plot", playerId: HUMAN_ID });
  }

  //------------------------------------------
  // Pass the human's land-grant turn.
  function passTurn(): void {
    if (!isHumanTurn()) {
      return;
    }
    props.store.dispatch({ type: "pass", playerId: HUMAN_ID });
  }

  return (
    <div class="land-grant-panel">
      <Show when={isHumanTurn()}>
        <TutorialHint
          kind="land_grant"
          message="Watch the sweeping cursor -- press Enter (or click the highlighted plot) when it lands on the plot you want, or Pass."
        />
      </Show>
      <div class="land-grant-status-row">
        <p class="land-grant-hint">{hintText(picker())}</p>
        <Show when={isHumanTurn()}>
          <button
            type="button"
            id="land-grant-pass-button"
            class="land-grant-button"
            data-action="land-grant-pass"
            onClick={passTurn}
          >
            Pass
          </button>
        </Show>
      </div>
    </div>
  );
}

//============================================
/**
 * The hint text for the current picker: a prompt for the human explaining the
 * sweep cursor, a wait message for an AI picker, or a completion message when
 * the order is exhausted.
 *
 * @param picker - The current picker's player id, or null when complete.
 * @returns The hint line text.
 */
function hintText(picker: number | null): string {
  if (picker === HUMAN_ID) {
    return "Your land grant: press Enter when the sweeping cursor lands on your plot, or pass.";
  }
  if (picker === null) {
    return "Land grant complete.";
  }
  return `Player ${picker + 1} is choosing land...`;
}
