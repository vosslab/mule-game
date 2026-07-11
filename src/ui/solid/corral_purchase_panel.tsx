// Corral purchase panel: an in-stage modal transaction screen for the
// human's M.U.L.E. purchase at the corral door, replacing the old
// one-line `buyAtCorral` notice. Walking into the corral always opens this
// panel; the `buy_mule` dispatch fires ONLY on an explicit confirm here, and
// every outcome -- success or any failure -- shows the same price, stock,
// and funds figures plus a plain-language reason (user requirement,
// 2026-07-10: "even if no mules or insufficient funds it should go to screen
// and tell me that").
//
// The figures echoed here (price, stock, funds) are read straight off the
// engine's live store state (`store.state.store.mulePrice/.muleStock`,
// `store.state.players[HUMAN_ID].money`); this panel performs no pricing
// math of its own. Those numbers are governed by the 1983 corral rules
// documented in `OTHER_REPOS/mule_document.html` ("Corral: mules building and
// pricing") and cited in `docs/RULE_SOURCES.md` -- a 14-mule stock cap, 2
// smithore consumed to rebuild each mule, and mule price = 2x the smithore
// price floored to a multiple of 10.
//
// Presentation is a generously-sized in-stage modal layered over the town
// scene (a full-stage phase replacement was rejected as oversized for a town
// transaction), styled after the ambient price/stock terminal precedent in
// `OTHER_REPOS/planet_mule`'s ShopPainter.java. Keyboard model matches the
// mouse/arrows/Enter guidance in `docs/HUMAN_GUIDANCE.md`: arrow keys move
// roving focus between the panel's action buttons (`bindRovingFocus`),
// Enter/Space activates the focused button (native button behavior), and
// mouse click activates directly; the focused action is visibly highlighted
// via the repo's shared `button:focus-visible` outline rule.
//
// Solid discipline: run-once component, props read through the props object,
// roving focus and the Escape-dismiss binding are bound in onMount and
// released in onCleanup.

import { createSignal, createMemo, onMount, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import type { DevelopPayload } from "../../engine/game_state";
import { canBuyMule } from "../../engine/turn";
import type { GameStore } from "../game_store";
import { HUMAN_ID } from "../game_driver";
import { bindKeys, bindRovingFocus } from "../input";

/**
 * The five observable panel states: `buyable` is
 * the eligible-purchase state before confirmation, `purchased` is the
 * completed-purchase result shown right after an explicit confirm, and the
 * remaining three are the failure states -- a mule already in tow, an empty
 * corral, and insufficient funds -- each reached directly on walk-in.
 */
export type CorralOutcome =
  "buyable" | "purchased" | "carrying" | "out_of_stock" | "insufficient_funds";

/** Props for the corral purchase panel. */
export interface CorralPurchasePanelProps {
  /** The live game store, for dispatch and current-state reads. */
  readonly store: GameStore;
  /** Reactive accessor for the human develop payload. */
  readonly payload: () => DevelopPayload;
  /** Called on Leave/Continue/Dismiss to close the panel and return to town. */
  readonly onDismiss: () => void;
}

//============================================
/**
 * Render the corral purchase panel: figures, an outcome-specific message,
 * and the action(s) available for the current outcome.
 *
 * @param props - Carries the store, payload accessor, and dismiss callback.
 * @returns The corral purchase panel element.
 */
export function CorralPurchasePanel(props: CorralPurchasePanelProps): JSX.Element {
  let containerRef: HTMLDivElement | undefined;
  // Latches true the moment Buy is confirmed, so the panel can show the
  // distinct "purchased" result state even though the engine's post-buy
  // state (carriedMule !== "none") looks identical to the "carrying" failure
  // state reached by re-entering the corral with a mule already in tow. A
  // real signal (not a plain variable) so the outcome memo re-tracks it: set
  // before dispatch below, so when the dispatch's own store update
  // synchronously re-runs the memo, it already reads true.
  const [justPurchased, setJustPurchased] = createSignal(false);

  const outcome = createMemo<CorralOutcome>(() => computeOutcome(props, justPurchased()));

  onMount(() => {
    let unbindRoving = (): void => {};
    if (containerRef !== undefined) {
      unbindRoving = bindRovingFocus(containerRef, "[data-corral-action]");
      // Focus the first action on open so Enter confirms immediately, matching
      // the pub gamble confirm's keyboard-first affordance -- no prior click
      // required.
      containerRef.querySelector<HTMLButtonElement>("[data-corral-action]")?.focus();
    }
    const unbindEscape = bindKeys({ Escape: props.onDismiss });
    onCleanup(() => {
      unbindRoving();
      unbindEscape();
    });
  });

  //------------------------------------------
  // Confirm the purchase: dispatch `buy_mule` and latch the success state.
  // Inert unless the panel is actually showing the buyable outcome (the
  // Buy button only renders then, but this guards a stray activation too).
  function confirmBuy(): void {
    if (outcome() !== "buyable") {
      return;
    }
    setJustPurchased(true);
    props.store.dispatch({ type: "buy_mule", playerId: HUMAN_ID });
  }

  const mulePrice = (): number => props.store.state.store.mulePrice;
  const muleStock = (): number => props.store.state.store.muleStock;
  const funds = (): number => props.store.state.players[HUMAN_ID]?.money ?? 0;

  return (
    <div
      class="corral-purchase-panel"
      data-corral-panel
      data-corral-outcome={outcome()}
      role="dialog"
      aria-modal="true"
      aria-label="Corral"
      ref={(el) => {
        containerRef = el;
      }}
    >
      <h2 class="corral-purchase-title">Corral</h2>
      <dl class="corral-purchase-figures">
        <div class="corral-purchase-figure">
          <dt>M.U.L.E. price</dt>
          <dd>${mulePrice()}</dd>
        </div>
        <div class="corral-purchase-figure">
          <dt>In stock</dt>
          <dd>{muleStock()}</dd>
        </div>
        <div class="corral-purchase-figure">
          <dt>Your funds</dt>
          <dd>${funds()}</dd>
        </div>
      </dl>
      <p class="corral-purchase-message" data-corral-message>
        {messageFor(outcome(), mulePrice())}
      </p>
      <div class="corral-purchase-actions">
        {actionsFor(outcome(), confirmBuy, props.onDismiss)}
      </div>
    </div>
  );
}

//============================================
/**
 * Compute the panel's current outcome from live store/payload state. Checked
 * in order: a just-confirmed purchase, then a mule already in tow, then an
 * empty corral, then insufficient funds -- matching `canBuyMule`'s own
 * precedence (`src/engine/turn.ts`) so this display never disagrees with
 * whether the dispatch would actually succeed.
 *
 * @param props - Carries the store and payload accessor.
 * @param justPurchased - Whether Buy was just confirmed this panel session.
 * @returns The outcome to render.
 */
function computeOutcome(props: CorralPurchasePanelProps, justPurchased: boolean): CorralOutcome {
  if (justPurchased) {
    return "purchased";
  }
  const state = props.store.state;
  if (props.payload().carriedMule !== "none") {
    return "carrying";
  }
  if (state.store.muleStock <= 0) {
    return "out_of_stock";
  }
  if (!canBuyMule(state, HUMAN_ID)) {
    return "insufficient_funds";
  }
  return "buyable";
}

//============================================
/**
 * The reason line shown under the figures for each outcome.
 *
 * @param outcome - The panel's current outcome.
 * @param mulePrice - The current M.U.L.E. price, quoted in the funds message.
 * @returns The message text.
 */
function messageFor(outcome: CorralOutcome, mulePrice: number): string {
  switch (outcome) {
    case "buyable":
      return "Buy a M.U.L.E.?";
    case "purchased":
      return "Bought a M.U.L.E. -- outfit it at a counter.";
    case "carrying":
      return "You already have a M.U.L.E. in tow.";
    case "out_of_stock":
      return "The corral is out of M.U.L.E.s.";
    case "insufficient_funds":
      return `Not enough money for a M.U.L.E. ($${mulePrice}).`;
  }
}

//============================================
/**
 * The action button(s) for the current outcome: Buy and Leave for the
 * pre-confirm success state, a single Continue for the post-confirm result,
 * and a single Dismiss for every failure state.
 *
 * @param outcome - The panel's current outcome.
 * @param confirmBuy - Handler for the Buy button.
 * @param onDismiss - Handler for Leave/Continue/Dismiss.
 * @returns The action button elements for this outcome.
 */
function actionsFor(
  outcome: CorralOutcome,
  confirmBuy: () => void,
  onDismiss: () => void,
): JSX.Element {
  if (outcome === "buyable") {
    return (
      <>
        <button
          type="button"
          class="corral-purchase-button"
          data-corral-action="buy"
          onClick={confirmBuy}
        >
          Buy
        </button>
        <button
          type="button"
          class="corral-purchase-button"
          data-corral-action="leave"
          onClick={onDismiss}
        >
          Leave
        </button>
      </>
    );
  }
  if (outcome === "purchased") {
    return (
      <button
        type="button"
        class="corral-purchase-button"
        data-corral-action="leave"
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
      data-corral-action="dismiss"
      onClick={onDismiss}
    >
      Dismiss
    </button>
  );
}
