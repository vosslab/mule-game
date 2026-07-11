// Assay Office panel: an in-stage modal transaction screen for arming the
// overworld's next-plot assay, replacing the earlier placeholder
// TownActionPanel's single "Arm assay / Cancel" pair. Walking into the Assay
// Office always opens this panel; `onArmAssay` fires ONLY on an explicit Arm
// confirm here, matching docs/HUMAN_GUIDANCE.md "Town interaction model"
// (attempt-then-confirm) and mirroring corral_purchase_panel.tsx's pattern
// exactly -- including its signal-before-callback lesson (the corral/outfit
// panels' "signal-before-dispatch"; here the callback is a UI-state setter,
// not an engine dispatch, but the same latch-before-call ordering applies).
//
// Outcome model (idle / armed / sample_ready): `idle` is the only entry
// state reachable today -- no assay is pending, so the panel offers Arm.
// `armed` is a local, session-only latch (mirrors CorralOutcome's "purchased"
// and OutfitOutcome's "outfitted") shown right after an explicit Arm confirm,
// carrying the reminder text the earlier placeholder used to show via the
// scene's shared notice; moving it into the panel's own message, instead of
// town_scene.tsx's `setNotice`, matches how the corral and outfit panels
// already surface their own post-confirm result. `sample_ready` models
// re-entering the office later in the same turn while an EARLIER-armed assay
// is still pending (not yet spent on a plot back in the overworld) -- this
// is NOT reachable today: `props.assayArmed` is an optional accessor this
// panel is built to read, but human_develop_layer.tsx's `assayArmed` signal
// is not threaded through TownSceneProps yet (town_scene.tsx passes no
// `assayArmed` prop today, so this panel only ever sees `idle` or its own
// local `armed` latch).
// TODO(assay-state-wiring): thread `assayArmed` from human_develop_layer.tsx
// through TownSceneProps into this panel's `assayArmed` prop, so a
// mid-turn re-entry with a still-pending assay reaches `sample_ready`
// instead of re-offering Arm for no reason.
//
// The Assay Office facade itself only composes when
// TownCapabilities.assayVisible is true (town_world.ts); no shipped engine
// mode (beginner, standard) turns that flag on today, so this panel is not
// reachable in the live game yet either -- built ahead of the mode that
// will expose it, exactly as the door and the arm-and-reveal flow already
// were (town_world.ts, town_scene.tsx's earlier armAssay).
//
// Solid discipline: run-once component, props read through the props object,
// roving focus and the Escape-dismiss binding are bound in onMount and
// released in onCleanup.

import { createSignal, createMemo, onMount, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import type { ComposedFacade } from "../scenes/town_world";
import { bindKeys, bindRovingFocus } from "../input";

/**
 * The three observable panel states: `idle` is the eligible-arm state before
 * confirmation (the only state reachable today), `armed` is the completed-arm
 * result shown right after an explicit confirm, and `sample_ready` is the
 * not-yet-reachable state for a still-pending assay from an earlier visit
 * (see the module doc comment's TODO(assay-state-wiring)).
 */
export type AssayOutcome = "idle" | "armed" | "sample_ready";

/** Props for the Assay Office panel. */
export interface AssayOfficePanelProps {
  /** The composed Assay Office facade, for its signage label. */
  readonly facade: ComposedFacade;
  /** Called on the Arm confirm, to arm the overworld's next-plot assay. */
  readonly onArmAssay: () => void;
  /**
   * Optional reactive accessor for whether an assay armed on an earlier visit
   * this turn is still pending. Not supplied by town_scene.tsx today (see the
   * module doc comment's TODO(assay-state-wiring)); when absent, this panel
   * only ever reaches `idle` or its own local post-confirm `armed` latch.
   */
  readonly assayArmed?: () => boolean;
  /** Called on Leave/Continue/Dismiss to close the panel and return to town. */
  readonly onDismiss: () => void;
}

//============================================
/**
 * Render the Assay Office panel: a title, an outcome-specific message, and
 * the action(s) available for the current outcome.
 *
 * @param props - Carries the facade, arm-assay and dismiss callbacks, and the
 *   optional pending-assay accessor.
 * @returns The Assay Office panel element.
 */
export function AssayOfficePanel(props: AssayOfficePanelProps): JSX.Element {
  let containerRef: HTMLDivElement | undefined;
  // Latches true the moment Arm is confirmed, so the panel can show the
  // distinct "armed" result state for this session. A real signal (not a
  // plain variable) so the outcome memo re-tracks it: set before the
  // onArmAssay callback below, matching the corral/outfit panels' own
  // signal-before-dispatch ordering.
  const [justArmed, setJustArmed] = createSignal(false);

  const outcome = createMemo<AssayOutcome>(() => computeOutcome(props, justArmed()));

  onMount(() => {
    let unbindRoving = (): void => {};
    if (containerRef !== undefined) {
      unbindRoving = bindRovingFocus(containerRef, "[data-assay-action]");
      // Focus the first action on open so Enter confirms immediately, matching
      // the corral panel's keyboard-first affordance -- no prior click required.
      containerRef.querySelector<HTMLButtonElement>("[data-assay-action]")?.focus();
    }
    const unbindEscape = bindKeys({ Escape: props.onDismiss });
    onCleanup(() => {
      unbindRoving();
      unbindEscape();
    });
  });

  //------------------------------------------
  // Confirm the arm: latch the armed state, then call onArmAssay. Inert
  // unless the panel is actually showing the idle outcome (the Arm button
  // only renders then, but this guards a stray activation too).
  function confirmArm(): void {
    if (outcome() !== "idle") {
      return;
    }
    setJustArmed(true);
    props.onArmAssay();
  }

  return (
    <div
      class="corral-purchase-panel assay-office-panel"
      data-assay-panel
      data-assay-outcome={outcome()}
      role="dialog"
      aria-modal="true"
      aria-label={props.facade.label}
      ref={(el) => {
        containerRef = el;
      }}
    >
      <h2 class="corral-purchase-title">{props.facade.label}</h2>
      <p class="corral-purchase-message" data-assay-message>
        {messageFor(outcome())}
      </p>
      <div class="corral-purchase-actions">
        {actionsFor(outcome(), confirmArm, props.onDismiss)}
      </div>
    </div>
  );
}

//============================================
/**
 * Compute the panel's current outcome. Checked in order: a just-confirmed
 * arm (this session), then a still-pending assay from an earlier visit (see
 * the module doc comment -- unreachable until `assayArmed` is wired through),
 * else the default idle state that offers Arm.
 *
 * @param props - Carries the optional pending-assay accessor.
 * @param justArmed - Whether Arm was just confirmed this panel session.
 * @returns The outcome to render.
 */
function computeOutcome(props: AssayOfficePanelProps, justArmed: boolean): AssayOutcome {
  if (justArmed) {
    return "armed";
  }
  if (props.assayArmed?.() === true) {
    return "sample_ready";
  }
  return "idle";
}

//============================================
/**
 * The reason line shown under the title for each outcome.
 *
 * @param outcome - The panel's current outcome.
 * @returns The message text.
 */
function messageFor(outcome: AssayOutcome): string {
  switch (outcome) {
    case "idle":
      return "Arm an assay? The next plot you stand on back in the colony is assayed.";
    case "armed":
      return "Assay armed -- leave town and press action on a plot.";
    case "sample_ready":
      return "You already have an assay ready -- leave town and press action on a plot.";
  }
}

//============================================
/**
 * The action button(s) for the current outcome: Arm and Leave for the
 * pre-confirm idle state, a single Continue for the post-confirm result, and
 * a single Dismiss for the not-yet-reachable sample_ready state.
 *
 * @param outcome - The panel's current outcome.
 * @param confirmArm - Handler for the Arm button.
 * @param onDismiss - Handler for Leave/Continue/Dismiss.
 * @returns The action button elements for this outcome.
 */
function actionsFor(
  outcome: AssayOutcome,
  confirmArm: () => void,
  onDismiss: () => void,
): JSX.Element {
  if (outcome === "idle") {
    return (
      <>
        <button
          type="button"
          class="corral-purchase-button"
          data-assay-action="arm"
          onClick={confirmArm}
        >
          Arm assay
        </button>
        <button
          type="button"
          class="corral-purchase-button"
          data-assay-action="leave"
          onClick={onDismiss}
        >
          Leave
        </button>
      </>
    );
  }
  if (outcome === "armed") {
    return (
      <button
        type="button"
        class="corral-purchase-button"
        data-assay-action="leave"
        onClick={onDismiss}
      >
        Continue
      </button>
    );
  }
  return (
    <button
      type="button"
      class="corral-purchase-button"
      data-assay-action="dismiss"
      onClick={onDismiss}
    >
      Dismiss
    </button>
  );
}
