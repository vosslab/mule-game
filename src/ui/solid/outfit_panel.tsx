// Outfit confirm panel: an in-stage modal transaction screen for outfitting
// the carried M.U.L.E. at a mining/energy/farm facade, replacing the
// earlier placeholder TownActionPanel that dismissed with no dispatch. Walking
// into an outfitter always opens this panel; the `outfit_mule` dispatch fires
// ONLY on an explicit confirm here, matching docs/HUMAN_GUIDANCE.md
// "Town interaction model" (attempt-then-confirm) and mirroring
// `corral_purchase_panel.tsx`'s pattern -- including its signal-before-
// dispatch lesson -- exactly.
//
// The figures shown (carried M.U.L.E. state, funds, and each resource's
// outfit price) are read straight off the engine's live store state
// (`props.payload().carriedMule`, `store.state.players[HUMAN_ID].money`) and
// `computeOutfitCost` (src/engine/store.ts) -- the SAME helper the facade's
// ambient-economics slot (`OutfitAmbientPrice`, town_scene.tsx) and the
// engine's `applyOutfitMule` (turn.ts) use, so this panel, the facade text,
// and the dispatch path can never disagree on a price.
//
// A facade's `outfitResources` list (town_world.ts) drives which resource
// buttons render: today every mining/energy/farm facade offers exactly one
// resource, but a future tournament-mode mining facade with a second
// (crystite) option renders as a second button in the same roving-focus
// group, with no structural change to this component. Affordability is
// checked per resource (each button disables independently); the panel-wide
// `insufficient_funds` outcome only fires when every offered resource is
// unaffordable.
//
// Solid discipline: run-once component, props read through the props object,
// roving focus and the Escape-dismiss binding are bound in onMount and
// released in onCleanup.

import { createSignal, createMemo, onMount, onCleanup, For } from "solid-js";
import type { JSX } from "solid-js";
import type { CarriedMule, DevelopPayload } from "../../engine/game_state";
import type { Resource } from "../../engine/player";
import { computeOutfitCost } from "../../engine/store";
import type { GameStore } from "../game_store";
import { HUMAN_ID } from "../game_driver";
import { bindKeys, bindRovingFocus } from "../input";
import { muleOutfitSymbolId } from "../sprites/sprites_mule";
import type { ComposedFacade } from "../scenes/town_world";

/**
 * The five observable panel states (mirrors `CorralOutcome`'s shape):
 * `buyable` is the eligible-outfit state before confirmation, `outfitted` is
 * the completed-outfit result shown right after an explicit confirm, and the
 * remaining three are the failure states -- no M.U.L.E. carried, a M.U.L.E.
 * already outfitted, and insufficient funds for every offered resource --
 * each reached directly on walk-in.
 */
export type OutfitOutcome =
  "buyable" | "outfitted" | "no_mule" | "already_outfitted" | "insufficient_funds";

/** Props for the outfit confirm panel. */
export interface OutfitPanelProps {
  /** The live game store, for dispatch and current-state reads. */
  readonly store: GameStore;
  /** Reactive accessor for the human develop payload. */
  readonly payload: () => DevelopPayload;
  /** The composed outfitter facade this panel opened for. */
  readonly facade: ComposedFacade;
  /** Called on Leave/Continue/Dismiss to close the panel and return to town. */
  readonly onDismiss: () => void;
}

//============================================
/**
 * Render the outfit confirm panel: figures, an outcome-specific message, and
 * the action(s) available for the current outcome.
 *
 * @param props - Carries the store, payload accessor, facade, and dismiss callback.
 * @returns The outfit confirm panel element.
 */
export function OutfitPanel(props: OutfitPanelProps): JSX.Element {
  let containerRef: HTMLDivElement | undefined;
  // Latches the confirmed resource the moment a confirm fires, so the panel
  // can show the distinct "outfitted" result state even though the engine's
  // post-confirm state (carriedMule === that resource) looks identical to the
  // "already_outfitted" failure state reached by re-entering with a M.U.L.E.
  // already outfitted. A real signal (not a plain variable) so the outcome
  // memo re-tracks it: set before dispatch below, so when the dispatch's own
  // store update synchronously re-runs the memo, it already reads non-null.
  const [justOutfitted, setJustOutfitted] = createSignal<Resource | null>(null);

  const outfitResources = (): readonly Resource[] => props.facade.outfitResources ?? [];
  const funds = (): number => props.store.state.players[HUMAN_ID]?.money ?? 0;
  const affordable = (resource: Resource): boolean => funds() >= computeOutfitCost(resource);

  const outcome = createMemo<OutfitOutcome>(() =>
    computeOutcome(props, outfitResources(), affordable, justOutfitted()),
  );

  onMount(() => {
    let unbindRoving = (): void => {};
    if (containerRef !== undefined) {
      unbindRoving = bindRovingFocus(containerRef, "[data-outfit-action]");
      // Focus the first action on open so Enter confirms immediately, matching
      // the corral panel's keyboard-first affordance -- no prior click required.
      containerRef.querySelector<HTMLButtonElement>("[data-outfit-action]")?.focus();
    }
    const unbindEscape = bindKeys({ Escape: props.onDismiss });
    onCleanup(() => {
      unbindRoving();
      unbindEscape();
    });
  });

  //------------------------------------------
  // Confirm the outfit: dispatch `outfit_mule` for `resource` and latch the
  // success state. Inert unless the panel is actually showing the buyable
  // outcome and this resource is affordable (each button only renders enabled
  // then, but this guards a stray activation too).
  function confirmOutfit(resource: Resource): void {
    if (outcome() !== "buyable" || !affordable(resource)) {
      return;
    }
    setJustOutfitted(resource);
    props.store.dispatch({ type: "outfit_mule", playerId: HUMAN_ID, resource });
  }

  return (
    <div
      class="corral-purchase-panel outfit-panel"
      data-outfit-panel
      data-outfit-outcome={outcome()}
      role="dialog"
      aria-modal="true"
      aria-label={props.facade.label}
      ref={(el) => {
        containerRef = el;
      }}
    >
      <h2 class="corral-purchase-title">{props.facade.label}</h2>
      <dl class="corral-purchase-figures">
        <div class="corral-purchase-figure">
          <dt>Carried M.U.L.E.</dt>
          <dd>{carriedMuleLabel(props.payload().carriedMule)}</dd>
        </div>
        <div class="corral-purchase-figure">
          <dt>Your funds</dt>
          <dd>${funds()}</dd>
        </div>
      </dl>
      <p class="corral-purchase-message" data-outfit-message>
        {messageFor(outcome(), outfitResources(), justOutfitted())}
      </p>
      <div class="corral-purchase-actions">
        {actionsFor(outcome(), outfitResources(), affordable, confirmOutfit, props.onDismiss)}
      </div>
    </div>
  );
}

//============================================
/**
 * Compute the panel's current outcome from live store/payload state. Checked
 * in order: a just-confirmed outfit, then no M.U.L.E. carried, then a
 * M.U.L.E. already outfitted, then whether any offered resource is
 * affordable -- matching `applyOutfitMule`'s own precedence (`src/engine/
 * turn.ts`) for the shared "no M.U.L.E." check, plus a UI-level
 * already-outfitted gate so this screen never offers to re-outfit a M.U.L.E.
 * that already carries a resource.
 *
 * @param props - Carries the store and payload accessor.
 * @param outfitResources - The facade's offered resources.
 * @param affordable - Whether a given resource's outfit cost fits current funds.
 * @param justOutfitted - The resource just confirmed this panel session, or null.
 * @returns The outcome to render.
 */
function computeOutcome(
  props: OutfitPanelProps,
  outfitResources: readonly Resource[],
  affordable: (resource: Resource) => boolean,
  justOutfitted: Resource | null,
): OutfitOutcome {
  if (justOutfitted !== null) {
    return "outfitted";
  }
  const carried = props.payload().carriedMule;
  if (carried === "none") {
    return "no_mule";
  }
  if (carried !== "unoutfitted") {
    return "already_outfitted";
  }
  if (!outfitResources.some(affordable)) {
    return "insufficient_funds";
  }
  return "buyable";
}

//============================================
/**
 * The reason line shown under the figures for each outcome.
 *
 * @param outcome - The panel's current outcome.
 * @param outfitResources - The facade's offered resources, for the
 *   insufficient-funds message's cheapest-price figure.
 * @param justOutfitted - The resource just confirmed, when `outcome` is
 *   `outfitted`.
 * @returns The message text.
 */
function messageFor(
  outcome: OutfitOutcome,
  outfitResources: readonly Resource[],
  justOutfitted: Resource | null,
): string {
  switch (outcome) {
    case "buyable":
      return "Outfit your M.U.L.E.?";
    case "outfitted":
      return justOutfitted === null
        ? "Outfitted -- place it on your land."
        : `Outfitted for ${resourceLabel(justOutfitted)} -- place it on your land.`;
    case "no_mule":
      return "You don't have a M.U.L.E. to outfit.";
    case "already_outfitted":
      return "This M.U.L.E. is already outfitted.";
    case "insufficient_funds":
      return `Not enough money for an outfit here (from $${cheapestOutfitCost(outfitResources)}).`;
  }
}

//============================================
/**
 * The action button(s) for the current outcome: one button per offered
 * resource plus Leave for the pre-confirm success state, a single Continue
 * for the post-confirm result, and a single Dismiss for every failure state.
 *
 * @param outcome - The panel's current outcome.
 * @param outfitResources - The facade's offered resources.
 * @param affordable - Whether a given resource's outfit cost fits current funds.
 * @param confirmOutfit - Handler for a resource's confirm button.
 * @param onDismiss - Handler for Leave/Continue/Dismiss.
 * @returns The action button elements for this outcome.
 */
function actionsFor(
  outcome: OutfitOutcome,
  outfitResources: readonly Resource[],
  affordable: (resource: Resource) => boolean,
  confirmOutfit: (resource: Resource) => void,
  onDismiss: () => void,
): JSX.Element {
  if (outcome === "buyable") {
    return (
      <>
        <For each={outfitResources}>
          {(resource) => (
            <button
              type="button"
              class="corral-purchase-button outfit-resource-button"
              data-outfit-action="confirm"
              data-outfit-resource={resource}
              disabled={!affordable(resource)}
              onClick={() => confirmOutfit(resource)}
            >
              <svg
                class="outfit-resource-emblem"
                viewBox="0 0 16 16"
                width={20}
                height={20}
                aria-hidden="true"
              >
                <use href={`#${muleOutfitSymbolId(resource)}`} />
              </svg>
              {`${resourceLabel(resource)} -- $${computeOutfitCost(resource)}`}
            </button>
          )}
        </For>
        <button
          type="button"
          class="corral-purchase-button"
          data-outfit-action="leave"
          onClick={onDismiss}
        >
          Leave
        </button>
      </>
    );
  }
  if (outcome === "outfitted") {
    return (
      <button
        type="button"
        class="corral-purchase-button"
        data-outfit-action="leave"
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
      data-outfit-action="dismiss"
      onClick={onDismiss}
    >
      Dismiss
    </button>
  );
}

//============================================
/**
 * Human-readable label for a `CarriedMule` value, for the panel's carried-
 * M.U.L.E. figure.
 *
 * @param carried - The develop payload's `carriedMule` value.
 * @returns "None", "Unoutfitted", or the outfitted resource's label.
 */
function carriedMuleLabel(carried: CarriedMule): string {
  if (carried === "none") {
    return "None";
  }
  if (carried === "unoutfitted") {
    return "Unoutfitted";
  }
  return `${resourceLabel(carried)} (outfitted)`;
}

//============================================
/**
 * Capitalize a resource name for display (for example "smithore" -> "Smithore").
 *
 * @param resource - The resource to label.
 * @returns The capitalized resource name.
 */
function resourceLabel(resource: Resource): string {
  return resource.charAt(0).toUpperCase() + resource.slice(1);
}

//============================================
/**
 * The lowest outfit cost among a facade's offered resources, for the
 * insufficient-funds message.
 *
 * @param outfitResources - The facade's offered resources.
 * @returns The cheapest resource's outfit cost.
 */
function cheapestOutfitCost(outfitResources: readonly Resource[]): number {
  return Math.min(...outfitResources.map(computeOutfitCost));
}
