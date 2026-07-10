// Fallback UI for the SolidJS <ErrorBoundary>s wrapping the live game screen.
//
// Before this, an uncaught error anywhere in the game screen's reactive graph
// (a stale accessor read, a thrown effect, etc.) silently killed the owner
// subtree: the screen froze with zero visible signal (see docs/CHANGELOG.md's
// stale-Show fix for the bug class this guards against). This panel is the
// last line of defense: the player always sees "something broke" instead of a
// dead screen. The caught error is also logged with console.error so devtools
// and the E2E walker's console-error collector still capture it -- a crash
// failing a walkthrough run is the walker working correctly, not a bug in it.

import { onMount } from "solid-js";
import type { JSX } from "solid-js";

/** Props for the game error fallback panel. */
export interface GameErrorFallbackProps {
  /** The error the boundary caught. Solid's fallback types this as `unknown`. */
  readonly error: unknown;
  /** Solid's boundary reset callback: clears the error and remounts children. */
  readonly reset: () => void;
}

//============================================
/**
 * Render a visible "something went wrong" panel in place of a crashed
 * subtree, showing the error message and a reload escape hatch.
 *
 * A full reload (rather than calling `props.reset`) is the offered recovery:
 * the game's reactive graph is store-driven engine state, and a caught error
 * usually means that state and the UI tree are out of sync, so re-mounting
 * the same subtree over the same store is likely to throw again immediately.
 * A reload restarts from the persisted autosave (src/ui/save_log.ts) instead.
 *
 * @param props - Carries the caught error and the boundary's reset callback.
 * @returns The fallback panel element.
 */
export function GameErrorFallback(props: GameErrorFallbackProps): JSX.Element {
  const message = (): string =>
    props.error instanceof Error ? props.error.message : String(props.error);

  onMount(() => {
    // Deliberate: this is the one place a caught reactive-graph error is
    // surfaced to devtools and the E2E walker's console-error collector (see
    // this module's header comment for why that collector treating it as
    // fatal is correct).
    // eslint-disable-next-line no-console
    console.error("GameErrorFallback caught a reactive-graph error:", props.error);
  });

  return (
    <div class="error-boundary-panel" data-error-boundary role="alert">
      <p class="error-boundary-title">Something went wrong.</p>
      <p class="error-boundary-detail">{message()}</p>
      <button
        type="button"
        class="error-boundary-reload-button"
        data-action="error-reload"
        onClick={() => window.location.reload()}
      >
        Reload game
      </button>
    </div>
  );
}
