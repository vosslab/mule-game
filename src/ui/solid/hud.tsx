// HUD as a SolidJS component.
//
// Renders the same markup the imperative renderHud (src/ui/hud.ts) produced,
// attribute for attribute, so the Playwright selector contract (.hud,
// .hud-player[data-player], .hud-good[data-resource]) holds across the port.
// The legacy renderHud stays in place for the game driver during M1; this
// component drives the Solid-rendered screens (the ?demo=map fixture screen in
// M1, every screen in M2).
//
// `.hud`'s `data-mode` attribute surfaces
// `GameState.mode` so a Playwright spec can confirm the title screen's mode
// picker actually reached the started game, without needing a round-count
// display of its own.
//
// Solid discipline: run-once components, props read through the props object
// (never destructured, so reactivity is preserved), and <For> for the player
// and resource lists.

import { For } from "solid-js";
import type { JSX } from "solid-js";
import type { GameState } from "../../engine/game_state";
import type { Player } from "../../engine/player";
import { RESOURCES } from "../../engine/player";
import { playerColor } from "../sprites";

/** Props for the HUD. */
export interface HudProps {
  /** Game state supplying the four players to render. */
  readonly state: GameState;
}

//============================================
/**
 * Render every player's money and goods as a row of per-player panels.
 *
 * @param props - Carries the reactive game state.
 * @returns The HUD row element.
 */
export function Hud(props: HudProps): JSX.Element {
  return (
    <div class="hud" data-mode={props.state.mode}>
      <For each={props.state.players}>{(player) => <PlayerPanel player={player} />}</For>
    </div>
  );
}

/** Props for one player's HUD panel. */
interface PlayerPanelProps {
  /** The player whose money and goods this panel shows. */
  readonly player: Player;
}

//============================================
/**
 * Render one player's HUD panel: a color swatch, label, money, and one count
 * per resource. The swatch color matches the player's map ownership color.
 *
 * @param props - Carries the player to render.
 * @returns The panel element.
 */
function PlayerPanel(props: PlayerPanelProps): JSX.Element {
  // aria-live is scoped to the human's own panel only (a11y
  // audit): announcing every AI player's money/goods on every tick would be
  // a constant, unusable firehose for a screen-reader player, when only the
  // human's own resources are actionable information. "polite" queues the
  // announcement after any current speech rather than interrupting it.
  const liveMode = (): "polite" | "off" => (props.player.isHuman ? "polite" : "off");
  return (
    <div class="hud-player" data-player={props.player.id}>
      <span class="hud-swatch" style={{ "background-color": playerColor(props.player.id) }} />
      <span class="hud-label">
        {props.player.isHuman ? "You" : `Player ${props.player.id + 1}`}
      </span>
      <span class="hud-money" aria-live={liveMode()}>{`$${props.player.money}`}</span>
      <span class="hud-goods" aria-live={liveMode()}>
        <For each={RESOURCES}>
          {(resource) => (
            <span class="hud-good" data-resource={resource}>
              {props.player.goods[resource]}
            </span>
          )}
        </For>
      </span>
    </div>
  );
}
