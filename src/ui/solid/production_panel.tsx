// Production interstitial as a SolidJS component.
//
// Renders the same markup the imperative renderProductionPanel produced: each
// player's per-resource yields for the round, colored by player. The scene
// manager auto-advances to the auction on a timer; this panel is display-only.
//
// A yield-pop entrance animation: each resource value
// scales/fades in with a per-resource stagger as the panel mounts, echoing
// the plan's "yield numbers pop" -- the engine's ProductionPayload carries
// only player-level totals (RULE_SOURCES scope keeps this workstream's
// engine edits limited to the land-grant sweep cursor), so the pop animates
// the numbers already shown here rather than a new per-plot map overlay,
// which would need a new engine field this workstream does not own.
// prefers-reduced-motion: the values render immediately either way; only the
// CSS pop keyframe (gated behind `@media (prefers-reduced-motion:
// no-preference)` in style.css) is skipped, matching event_banner.tsx's
// established pattern.
//
// Solid discipline: run-once component, props read through the props object,
// <For> for the yield rows and the per-resource parts.

import { For, Show, createSignal, onMount, onCleanup } from "solid-js";
import type { JSX } from "solid-js";
import type { ProductionPayload } from "../../engine/game_state";
import type { ResourceRecord } from "../../engine/economy";
import { RESOURCES } from "../../engine/player";
import { playerColor } from "../sprites";
import { EventBanner, PASSIVE_EVENT_BANNER_HOLD_MS } from "./event_banner";
import { MuleEscapeVignette } from "./mule_escape_vignette";

/** Stagger (ms) applied between each resource's pop-in animation delay. */
const YIELD_POP_STAGGER_MS = 60;

/** Props for the production panel. */
export interface ProductionPanelProps {
  /** Reactive accessor for the production payload (per-player yields). */
  readonly payload: () => ProductionPayload;
}

//============================================
/**
 * Render the production interstitial: one row per player listing their
 * per-resource yields for the round.
 *
 * @param props - Carries the production payload accessor.
 * @returns The production panel element.
 */
export function ProductionPanel(props: ProductionPanelProps): JSX.Element {
  const [reducedMotion, setReducedMotion] = createSignal(prefersReducedMotion());

  onMount(() => {
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
    <div class="production-panel">
      <h2>Production</h2>
      {/* The colony event, if any fired this round, is resolved before this
          payload exists (turn.ts's enterProduction) -- it has already shaped
          the yields below (a category-A event's temporary bonus) or is about
          to (a category-B event adjusts yields, store stock, or terrain in
          the same tick this panel is showing). It never gates the scene
          manager's pacing, so it is a purely informational, non-blocking
          overlay on top of the yield list. Keyed so a new round's event
          restarts the auto-dismiss timer. */}
      <Show when={props.payload().colonyEvent} keyed>
        {(event) => (
          <>
            <EventBanner source={{ kind: "colony", event }} holdMs={PASSIVE_EVENT_BANNER_HOLD_MS} />
            {/* Radiation is the one colony event that always destroys an
                installed M.U.L.E. when it fires (see resolveRadiation's doc
                comment in events.ts): a fully deterministic signal, so no
                board diffing is needed to know a mule fled. */}
            <Show when={event.type === "radiation"}>
              <MuleEscapeVignette holdMs={PASSIVE_EVENT_BANNER_HOLD_MS} />
            </Show>
          </>
        )}
      </Show>
      <ul class="production-list">
        <For each={props.payload().yields}>
          {(record, index) => (
            <ProductionRow record={record} index={index()} reducedMotion={reducedMotion} />
          )}
        </For>
      </ul>
    </div>
  );
}

/** Props for one player's production row. */
interface ProductionRowProps {
  /** This player's per-resource yields. */
  readonly record: ResourceRecord;
  /** Player index (0-based), for the label, color, and pop stagger. */
  readonly index: number;
  /** Reactive accessor for the reduced-motion preference. */
  readonly reducedMotion: () => boolean;
}

//============================================
/**
 * Render one player's production row: their label and every resource yield,
 * each value popping in with a per-resource stagger (see YIELD_POP_STAGGER_MS)
 * unless the reduced-motion preference is on.
 *
 * @param props - Carries the yield record, player index, and reduced-motion accessor.
 * @returns The production row list item.
 */
function ProductionRow(props: ProductionRowProps): JSX.Element {
  return (
    <li class="production-item" style={{ color: playerColor(props.index) }}>
      {`Player ${props.index + 1}: `}
      <For each={RESOURCES}>
        {(resource, resourceIndex) => (
          <>
            <span
              class="production-yield-value"
              data-resource={resource}
              data-reduced-motion={props.reducedMotion() ? "true" : "false"}
              style={{
                "animation-delay": `${
                  (props.index * RESOURCES.length + resourceIndex()) * YIELD_POP_STAGGER_MS
                }ms`,
              }}
            >
              {`${resource} ${props.record[resource]}`}
            </span>
            {resourceIndex() < RESOURCES.length - 1 ? ", " : ""}
          </>
        )}
      </For>
    </li>
  );
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
