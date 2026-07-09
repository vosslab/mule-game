// Mule-escape vignette as a SolidJS component.
//
// Radiation is the one colony event that always destroys an installed
// M.U.L.E. when it fires (`resolveRadiation` in events.ts only returns an
// applicable result once it has actually found and cleared the leader's
// factory plot -- see that function's doc comment), so `colonyEvent.type ===
// "radiation"` is a fully deterministic "a mule just fled" signal, with no
// board-diffing needed. This renders `sprites_mule.ts`'s existing escape
// pose (MULE_ESCAPE_ID, already shipped by the art lane) galloping off,
// auto-dismissing itself after `holdMs` -- the same self-timed pattern
// event_banner.tsx uses, reused here rather than duplicated logic.
//
// prefers-reduced-motion: the mount/dismiss timing is identical either way
// (JS-driven); only the CSS flee animation (gated behind
// `@media (prefers-reduced-motion: no-preference)` in style.css) is skipped,
// so a reduced-motion render is a static pose for the same duration (a snap,
// no tween).

import { Show, createSignal, onMount, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import { MULE_ESCAPE_ID, buildMuleSpriteDefsMarkup } from "../sprites/sprites_mule";

/** Rendered size of the escape-pose sprite. */
const MULE_ESCAPE_SIZE = 40;

/** Props for the mule-escape vignette. */
export interface MuleEscapeVignetteProps {
  /** How long (ms) the vignette stays mounted before it self-dismisses. */
  readonly holdMs: number;
}

//============================================
/**
 * Whether the browser currently reports a reduced-motion preference. Matches
 * event_banner.tsx's identical helper.
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
 * Render the mule-escape vignette: the escape-pose sprite fleeing off the
 * panel, visible for `props.holdMs` before it removes itself. Mount this
 * component keyed on the firing colony event's identity (a fresh
 * `ColonyEventResult` object each time one fires), matching
 * `EventBanner`'s convention, so a new escape restarts the timer instead of
 * extending a stale one.
 *
 * @param props - Carries the display hold duration.
 * @returns The vignette element, or nothing once the hold has elapsed.
 */
export function MuleEscapeVignette(props: MuleEscapeVignetteProps): JSX.Element {
  const [visible, setVisible] = createSignal(true);
  const [reducedMotion, setReducedMotion] = createSignal(prefersReducedMotion());

  onMount(() => {
    const dismissTimer = window.setTimeout(() => setVisible(false), props.holdMs);
    onCleanup(() => window.clearTimeout(dismissTimer));

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

  return (
    <Show when={visible()}>
      <div
        class="mule-escape-vignette"
        data-mule-escape-vignette
        data-reduced-motion={reducedMotion() ? "true" : "false"}
      >
        <svg
          class="mule-escape-vignette-icon"
          viewBox={`0 0 ${MULE_ESCAPE_SIZE} ${MULE_ESCAPE_SIZE}`}
          width={MULE_ESCAPE_SIZE}
          height={MULE_ESCAPE_SIZE}
          role="img"
          aria-label="A M.U.L.E. fled"
        >
          <g innerHTML={buildMuleSpriteDefsMarkup()} />
          <use href={`#${MULE_ESCAPE_ID}`} width={MULE_ESCAPE_SIZE} height={MULE_ESCAPE_SIZE} />
        </svg>
        <p class="mule-escape-vignette-text">One of your M.U.L.E.s fled!</p>
      </div>
    </Show>
  );
}
