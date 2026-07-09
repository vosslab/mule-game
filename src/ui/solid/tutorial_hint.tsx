// First-run tutorial hint banner.
//
// One reusable, dismissible notice per phase kind: the land-grant sweep, the
// land-auction bid, the human's develop errand, the goods-auction role
// choice, and the walkable town. Each mounting site (land_grant_panel.tsx,
// land_auction_panel.tsx, game_screen.tsx's DevelopPanel, auction_screen.tsx,
// human_develop_layer.tsx) supplies its own `kind` and message; this
// component owns only dismissal (localStorage-backed via src/ui/hint_store.ts,
// so a dismissal persists across reload and across future games) and
// rendering, never engine dispatch.
//
// Never blocks input: this renders as a small in-flow (or, in the `overlay`
// variant, a small corner-pinned) notice, not a full-screen scrim -- the
// phase's own controls stay reachable and clickable underneath and beside it.
//
// Keyboard accessible: the dismiss button is an ordinary Tab-reachable
// button (Enter/Space activates it, matching every other button in this
// app), and Escape also dismisses -- but only while focus is already inside
// this component (the container's onKeyDown catches the bubbled event from
// its own button), so it never intercepts a page-wide Escape another panel
// already binds to its own action (land_grant_panel's pass, land_auction_
// panel's blur-focus).

import { Show, createSignal } from "solid-js";
import type { JSX } from "solid-js";
import type { HintKind } from "../hint_store";
import { dismissHint, isHintDismissed } from "../hint_store";

/** Props for a tutorial hint. */
export interface TutorialHintProps {
  /** Which phase-scoped hint this is; also its localStorage dismissal key. */
  readonly kind: HintKind;
  /** The hint's message text. */
  readonly message: string;
  /**
   * "inline" (default) renders in normal document flow, for panels that are
   * already plain text columns (land grant, land auction, develop, auction).
   * "overlay" corner-pins the hint absolutely within the nearest positioned
   * ancestor without shifting layout, for the walkable town scene, where the
   * hint sits over a spatial canvas rather than inside a text panel.
   */
  readonly variant?: "inline" | "overlay";
}

//============================================
/**
 * Render one dismissible tutorial hint, or nothing once it has been
 * dismissed (this run or a prior one).
 *
 * @param props - Carries the hint kind, message, and layout variant.
 * @returns The hint element, or nothing when already dismissed.
 */
export function TutorialHint(props: TutorialHintProps): JSX.Element {
  const [dismissed, setDismissed] = createSignal(isHintDismissed(props.kind));

  //------------------------------------------
  // Persist the dismissal and hide the hint immediately.
  function dismiss(): void {
    dismissHint(props.kind);
    setDismissed(true);
  }

  //------------------------------------------
  // Escape dismisses too, but only once focus has bubbled up from inside this
  // component (see the module doc for why this stays scoped rather than a
  // document-wide listener). SolidJS delegates "keydown" through a single
  // document-level dispatcher rather than a real per-element listener (see
  // solid-js/web's DelegatedEvents set), and src/ui/input.ts's bindKeys (which
  // land_grant_panel.tsx and land_auction_panel.tsx use for their own Escape
  // binding) attaches its own, separate raw `document.addEventListener`
  // listener. Both listeners live on the same `document` node, so an ordinary
  // `stopPropagation()` -- which only stops travel to other DOM nodes -- would
  // not stop that sibling listener from also firing; `stopImmediatePropagation`
  // is the one that also suppresses other listeners already queued on the
  // same node for this dispatch.
  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.stopImmediatePropagation();
      dismiss();
    }
  }

  const variantClass = (): string =>
    props.variant === "overlay" ? "tutorial-hint tutorial-hint-overlay" : "tutorial-hint";

  return (
    <Show when={!dismissed()}>
      <div
        class={variantClass()}
        data-tutorial-hint={props.kind}
        role="note"
        aria-live="polite"
        onKeyDown={handleKeyDown}
      >
        <p class="tutorial-hint-text">{props.message}</p>
        <button type="button" class="tutorial-hint-dismiss" onClick={dismiss}>
          Got it
        </button>
      </div>
    </Show>
  );
}
