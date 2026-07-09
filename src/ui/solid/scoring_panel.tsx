// Scoring screen as a SolidJS component.
//
// Renders the full end-of-game ScoringPayload:
// a colony status banner (failure message, or the colony total plus its
// Federation rating tier message), a First Founder callout when one was
// awarded, and a per-player score-breakdown table (money, land, mules, goods,
// total), ranked highest total first with the winner marked. The engine
// computes every value here (buildScoringPayload, scoring.ts); this panel
// only renders it, never recomputes.
//
// Selector contract (data attributes, for the Playwright spec driving a full
// seeded game to scoring): `.scoring-panel[data-colony-failed]`,
// `[data-colony-total]`, `[data-colony-rating-tier]`, `[data-first-founder]`
// (present only when one was awarded), and per-row `.scoring-row[data-player]`
// carrying `data-money`/`data-land`/`data-mules`/`data-goods`/`data-total`.
//
// Solid discipline: run-once component, props read through the props object,
// <For> for the ranked breakdown rows.

import { For, Show } from "solid-js";
import type { JSX } from "solid-js";
import type { ScoreBreakdown, ScoringPayload } from "../../engine/game_state";
import { HUMAN_ID, playAgain } from "../game_driver";
import { playerColor } from "../sprites";

/** Props for the scoring panel. */
export interface ScoringPanelProps {
  /** Reactive accessor for the scoring payload (breakdowns, rating, founder). */
  readonly payload: () => ScoringPayload;
}

//============================================
/**
 * Render the scoring screen: colony status, First Founder callout, the
 * ranked score-breakdown table, and a Play Again button.
 *
 * @param props - Carries the scoring payload accessor.
 * @returns The scoring panel element.
 */
export function ScoringPanel(props: ScoringPanelProps): JSX.Element {
  // Rank breakdowns by total score, highest first; ties keep player order.
  const ranking = (): ScoreBreakdown[] =>
    [...props.payload().breakdowns].sort((a, b) => b.total - a.total);

  return (
    <div class="scoring-panel" data-colony-failed={props.payload().colonyFailed}>
      <h2>Final Scores</h2>
      <ColonyStatus payload={props.payload} />
      <Show when={props.payload().firstFounderId !== null}>
        <p class="scoring-first-founder" data-first-founder={props.payload().firstFounderId}>
          {`First Founder: ${founderLabel(props.payload().firstFounderId as number)}`}
        </p>
      </Show>
      <table class="scoring-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Money</th>
            <th>Land</th>
            <th>Mules</th>
            <th>Goods</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          <For each={ranking()}>
            {(entry) => <ScoreRow entry={entry} winnerIndex={props.payload().winnerIndex} />}
          </For>
        </tbody>
      </table>
      <button
        type="button"
        id="play-again-button"
        class="scoring-button"
        onClick={() => playAgain()}
      >
        Play Again
      </button>
    </div>
  );
}

//============================================
/**
 * Render the colony status banner: the failure message when the colony
 * failed, otherwise the colony total plus its Federation rating tier message.
 *
 * @param props - Carries the scoring payload accessor.
 * @returns The colony status paragraph.
 */
function ColonyStatus(props: { readonly payload: () => ScoringPayload }): JSX.Element {
  return (
    <Show
      when={!props.payload().colonyFailed}
      fallback={
        <p class="scoring-colony-status scoring-colony-failed">{props.payload().failureMessage}</p>
      }
    >
      <p
        class="scoring-colony-status"
        data-colony-total={props.payload().colonyTotal}
        data-colony-rating-tier={props.payload().colonyRatingTier}
      >
        {`Colony total: $${props.payload().colonyTotal} -- ${props.payload().colonyRatingMessage}`}
      </p>
    </Show>
  );
}

//============================================
/**
 * The First Founder callout's player label: "You" for the human, else
 * "Player N".
 *
 * @param playerId - The first founder's player id.
 * @returns The label text.
 */
function founderLabel(playerId: number): string {
  return playerId === HUMAN_ID ? "You" : `Player ${playerId + 1}`;
}

/** Props for one ranked breakdown row. */
interface ScoreRowProps {
  /** The ranked player's score breakdown. */
  readonly entry: ScoreBreakdown;
  /** The winning player's index, for the winner marker. */
  readonly winnerIndex: number;
}

//============================================
/**
 * Render one score-breakdown table row: the player's label, each breakdown
 * component, the total, and a winner marker.
 *
 * @param props - Carries the breakdown entry and the winning index.
 * @returns The score-breakdown table row.
 */
function ScoreRow(props: ScoreRowProps): JSX.Element {
  const isWinner = (): boolean => props.entry.playerId === props.winnerIndex;
  const who = (): string =>
    props.entry.playerId === HUMAN_ID ? "You" : `Player ${props.entry.playerId + 1}`;
  return (
    <tr
      class="scoring-row"
      classList={{ "scoring-winner": isWinner() }}
      data-player={props.entry.playerId}
      data-money={props.entry.money}
      data-land={props.entry.landValue}
      data-mules={props.entry.muleValue}
      data-goods={props.entry.goodsValue}
      data-total={props.entry.total}
    >
      <td style={{ color: playerColor(props.entry.playerId) }}>
        {`${who()}${isWinner() ? " (winner)" : ""}`}
      </td>
      <td>{`$${props.entry.money}`}</td>
      <td>{`$${props.entry.landValue}`}</td>
      <td>{`$${props.entry.muleValue}`}</td>
      <td>{`$${props.entry.goodsValue}`}</td>
      <td>{`$${props.entry.total}`}</td>
    </tr>
  );
}
