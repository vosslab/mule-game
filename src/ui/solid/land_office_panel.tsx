// Land Office panel: an in-stage modal informational screen for the town's
// Land Office door, replacing the earlier placeholder TownActionPanel's
// "Land sales open in a later update" one-liner. Walking into the Land Office
// always opens this panel; it dispatches NOTHING, either on entry or on its
// Dismiss action -- the office is purely informational, matching
// docs/HUMAN_GUIDANCE.md "Town interaction model" (a walk-in never carries a
// side effect) and mirroring corral_purchase_panel.tsx's accessibility
// pattern: role="dialog", roving focus, a focused Dismiss action, Escape
// dismisses.
//
// The engine models new land arriving through two colony-wide phases -- Land
// Grant and Land Auction, both run between develop turns for every player
// (docs/RULE_SOURCES.md "Colony land auction: pricing, bidding, tie-break")
// -- never a per-town storefront transaction. No GameState field tracks a
// per-town Land Office listing today, so this panel's single
// LandOfficeOutcome value is a truthful neutral description of how land
// actually changes hands, not an invented land-sale mechanic. The Land
// Office facade itself only composes in modes where
// TownCapabilities.landOfficeVisible is true (town_world.ts; standard and
// up), so no beginner-mode Land Office panel exists.
//
// Solid discipline: run-once component, props read through the props object,
// roving focus and the Escape-dismiss binding are bound in onMount and
// released in onCleanup.

import { onMount, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import type { ComposedFacade } from "../scenes/town_world";
import { bindKeys, bindRovingFocus } from "../input";

/**
 * The Land Office's single observable outcome today: a truthful neutral
 * description of how land actually changes hands. A one-member union keeps
 * the same outcome-driven shape as the other town panels
 * (CorralPurchasePanel, OutfitPanel) so a later engine change that adds real
 * per-town land state only needs a new member and a new messageFor branch,
 * not a rewritten component.
 */
export type LandOfficeOutcome = "informational";

/** Props for the Land Office panel. */
export interface LandOfficePanelProps {
  /** The composed Land Office facade, for its signage label. */
  readonly facade: ComposedFacade;
  /** Called on Dismiss to close the panel and return to town. */
  readonly onDismiss: () => void;
}

//============================================
/**
 * Render the Land Office panel: a title, the truthful informational message,
 * and a single focused Dismiss action. Entry and Dismiss both dispatch
 * nothing -- the office never changes engine state.
 *
 * @param props - Carries the facade and dismiss callback.
 * @returns The Land Office panel element.
 */
export function LandOfficePanel(props: LandOfficePanelProps): JSX.Element {
  let containerRef: HTMLDivElement | undefined;
  // Fixed today (see LandOfficeOutcome doc comment); kept as a local constant
  // rather than a literal in the JSX so the data-land-outcome hook and the
  // messageFor switch share one source of truth.
  const outcome: LandOfficeOutcome = "informational";

  onMount(() => {
    let unbindRoving = (): void => {};
    if (containerRef !== undefined) {
      unbindRoving = bindRovingFocus(containerRef, "[data-land-action]");
      // Focus the Dismiss action on open so Enter closes the panel
      // immediately, matching the corral panel's keyboard-first affordance.
      containerRef.querySelector<HTMLButtonElement>("[data-land-action]")?.focus();
    }
    const unbindEscape = bindKeys({ Escape: props.onDismiss });
    onCleanup(() => {
      unbindRoving();
      unbindEscape();
    });
  });

  return (
    <div
      class="corral-purchase-panel land-office-panel"
      data-land-panel
      data-land-outcome={outcome}
      role="dialog"
      aria-modal="true"
      aria-label={props.facade.label}
      ref={(el) => {
        containerRef = el;
      }}
    >
      <h2 class="corral-purchase-title">{props.facade.label}</h2>
      <p class="corral-purchase-message" data-land-message>
        {messageFor(outcome)}
      </p>
      <div class="corral-purchase-actions">
        <button
          type="button"
          class="corral-purchase-button"
          data-land-action="dismiss"
          onClick={props.onDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

//============================================
/**
 * The informational body copy for a Land Office outcome.
 *
 * @param outcome - The panel's current outcome (today, always "informational").
 * @returns The message text.
 */
function messageFor(outcome: LandOfficeOutcome): string {
  switch (outcome) {
    case "informational":
      return (
        "New land opens up for every player through the colony's Land Grant " +
        "and Land Auction between turns -- this office does not sell plots " +
        "directly."
      );
  }
}
