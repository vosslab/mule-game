// Pre-auction status/accounting beat: what every player held before this
// round, what the round did to it, and what they hold now, plus the colony's
// SURPLUS/SHORTAGE read on the good about to trade. This is the NES
// STATUS-screen beat, recomposed for the landscape stage.
//
// Rendered INSIDE the declare overlay's reserved slot (see
// auction_screen.tsx's DeclareOverlay), in the SAME document flow as the
// role-choice buttons, ABOVE them in reading order -- never absolutely
// positioned over them. The auction clock holds at tick 0 until the human
// clicks a role button, so this layer must never cover, delay, or otherwise
// block those buttons.
//
// Every number here is READ from the recorded round ledger
// (`AuctionStatus.accounting`, see game_state.ts's `AuctionStatusEntry` doc
// comment), never recomputed: a food clamp or an event shows exactly what
// the player lived through, not a plausible-looking reconstruction.

import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import type { AuctionStatusEntry } from "../../engine/game_state";
import type { AuctionStatusProps } from "./auction_props";
import { USAGE_BAR_MAX_WIDTH, usageToBarWidth } from "./auction_geometry";
import { HUMAN_ID } from "../game_driver";
import { playerColor } from "../sprites";

/** One labeled step in a row's usage story: a bar segment plus its chip text. */
interface StatusStep {
  readonly key: string;
  readonly label: string;
  readonly amount: number;
  readonly percent: number;
  readonly colorClass: string;
}

//============================================
/**
 * The row's shared scale reference for bar widths: the largest single
 * magnitude among this player's own previous/held/usage/spoilage/production/
 * event figures, so a row with only small movement never reads as visually
 * equal to a row with a big one. Floors at 1 so an all-zero row (nothing
 * moved) computes to 0-width bars instead of dividing by zero.
 *
 * @param entry - One player's recorded ledger entry.
 * @returns The row's scale reference, always at least 1.
 */
function rowScale(entry: AuctionStatusEntry): number {
  const magnitudes = [
    entry.previous,
    entry.held,
    entry.usage,
    entry.spoilage,
    entry.production,
    Math.abs(entry.eventDelta),
  ];
  const scale = Math.max(...magnitudes, 1);
  return scale;
}

//============================================
/**
 * Convert a recorded amount into a 0-100 bar-fill percentage relative to a
 * row's scale, reusing the geometry module's clamp instead of duplicating it.
 *
 * @param amount - Recorded amount for one step (usage, spoilage, etc).
 * @param scale - The row's shared scale reference.
 * @returns Fill percentage, 0 through 100.
 */
function stepPercent(amount: number, scale: number): number {
  const width = usageToBarWidth(amount, scale);
  const percent = (width / USAGE_BAR_MAX_WIDTH) * 100;
  return percent;
}

//============================================
/**
 * Build one row's labeled steps: usage, spoilage, and production always
 * present (even at zero width, so the bar's segment order stays stable
 * across rows); the event step only when the round actually moved this
 * player's holding through an event.
 *
 * @param entry - One player's recorded ledger entry.
 * @returns The row's ordered steps.
 */
function buildSteps(entry: AuctionStatusEntry): readonly StatusStep[] {
  const scale = rowScale(entry);
  const steps: StatusStep[] = [
    {
      key: "usage",
      label: "Used",
      amount: entry.usage,
      percent: stepPercent(entry.usage, scale),
      colorClass: "auction-status-step-usage",
    },
    {
      key: "spoilage",
      label: "Spoiled",
      amount: entry.spoilage,
      percent: stepPercent(entry.spoilage, scale),
      colorClass: "auction-status-step-spoilage",
    },
    {
      key: "production",
      label: "Made",
      amount: entry.production,
      percent: stepPercent(entry.production, scale),
      colorClass: "auction-status-step-production",
    },
  ];
  if (entry.eventDelta !== 0) {
    steps.push({
      key: "event",
      label: entry.eventDelta > 0 ? "Event gain" : "Event loss",
      amount: entry.eventDelta,
      percent: stepPercent(Math.abs(entry.eventDelta), scale),
      colorClass:
        entry.eventDelta > 0 ? "auction-status-step-event-gain" : "auction-status-step-event-loss",
    });
  }
  return steps;
}

//============================================
/**
 * This player's row label: "You" for the human, "P{n}" (1-based) for the
 * three AI players, matching the dock's per-lane labeling.
 *
 * @param playerId - The player's stable id (0-3).
 * @returns The row's short label.
 */
function rowLabel(playerId: number): string {
  if (playerId === HUMAN_ID) {
    return "You";
  }
  return `P${playerId + 1}`;
}

//============================================
/**
 * One player's accounting row: swatch + label, the "had -> now" headline,
 * the labeled step bar, and a chip readout for every step that actually
 * moved (a zero-amount step still holds its place in the bar for a stable
 * segment order, but earns no chip -- an unchanged step is not part of the
 * story).
 *
 * @param props - Carries this row's recorded ledger entry.
 * @returns The row element.
 */
function AuctionStatusRow(props: { readonly entry: AuctionStatusEntry }): JSX.Element {
  const steps = (): readonly StatusStep[] => buildSteps(props.entry);
  const movedSteps = (): readonly StatusStep[] => steps().filter((step) => step.amount !== 0);
  return (
    <div class="auction-status-row">
      <div class="auction-status-row-head">
        <span
          class="auction-status-row-swatch"
          style={{ "background-color": playerColor(props.entry.playerId) }}
          aria-hidden="true"
        />
        <span class="auction-status-row-label">{rowLabel(props.entry.playerId)}</span>
        <span class="auction-status-row-headline">
          {`Had ${props.entry.previous} -> Now ${props.entry.held}`}
        </span>
      </div>
      <div class="auction-status-bar-track">
        <For each={steps()}>
          {(step) => (
            <span
              class={`auction-status-step ${step.colorClass}`}
              style={{ "--step-width": `${step.percent}%` }}
              title={`${step.label} ${Math.abs(step.amount)}`}
            />
          )}
        </For>
      </div>
      <Show when={movedSteps().length > 0}>
        <div class="auction-status-chips">
          <For each={movedSteps()}>
            {(step) => (
              <span class={`auction-status-chip ${step.colorClass}`}>
                {`${step.label} ${Math.abs(step.amount)}`}
              </span>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

//============================================
/**
 * The colony's verdict as its stamp text: "Surplus" or "Shortage". The
 * caller only mounts this under a `Show when={verdict !== null}`, so the
 * `null` case here is unreachable in practice; it still resolves to a safe
 * label rather than `undefined` if ever called out of that guard.
 *
 * @param verdict - The colony verdict, or null when the good carries none.
 * @returns The stamp's display text.
 */
function verdictLabel(verdict: "surplus" | "shortage" | null): string {
  if (verdict === "surplus") {
    return "Surplus";
  }
  if (verdict === "shortage") {
    return "Shortage";
  }
  return "";
}

//============================================
/**
 * The pre-auction status/accounting layer: the "Usage this round" caption,
 * one accounting row per player, and the colony's SURPLUS/SHORTAGE stamp
 * when this good carries a verdict (always absent for smithore and
 * crystite, see `ColonyVerdict`'s doc comment). Renders entirely in-flow,
 * so it can never overlap the role buttons that follow it in the same
 * overlay card -- the auction clock holds at tick 0 until the human clicks
 * one of them.
 *
 * @param props - Carries the status accessor and the reduced-motion flag.
 * @returns The status layer element.
 */
export function AuctionStatusLayer(props: AuctionStatusProps): JSX.Element {
  return (
    <div
      class="auction-status-layer"
      data-reduced-motion={props.reducedMotion() ? "true" : "false"}
    >
      <p class="auction-status-caption">Usage this round</p>
      <div class="auction-status-rows">
        <For each={props.status().accounting}>{(entry) => <AuctionStatusRow entry={entry} />}</For>
      </div>
      <Show when={props.status().verdict !== null}>
        <p class={`auction-status-verdict auction-status-verdict-${props.status().verdict}`}>
          {verdictLabel(props.status().verdict)}
        </p>
      </Show>
    </div>
  );
}
