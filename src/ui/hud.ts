/**
 * HUD renderer: shows money and goods for all four players.
 *
 * Renders a row of per-player panels into the given container. Each panel
 * carries a `data-player` attribute and a color swatch matching the player's
 * `PLAYER_COLORS` slot, matching the ownership colors used on the map.
 */

import type { GameState } from "../engine/game_state";
import type { Resource } from "../engine/player";
import { RESOURCES } from "../engine/player";
import { PLAYER_COLORS } from "./sprites";

/**
 * Render `state`'s four players' money and goods into `container`,
 * replacing any prior content.
 *
 * @param container - Element to render into; its existing children are
 *   cleared first.
 * @param state - Game state supplying the players to render.
 */
export function renderHud(container: Element, state: GameState): void {
  let markup = '<div class="hud">';
  for (const player of state.players) {
    markup += renderPlayerPanel(player.id, player.money, player.goods, player.isHuman);
  }
  markup += "</div>";
  container.innerHTML = markup;
}

/**
 * Render one player's HUD panel: a color swatch, money, and one line per
 * resource.
 *
 * @param playerId - Player index (0-3), also written as `data-player`.
 * @param money - Current money on hand.
 * @param goods - Current inventory count for each resource.
 * @param isHuman - True for the human player, used to label the panel.
 * @returns Raw HTML markup for the panel.
 */
function renderPlayerPanel(
  playerId: number,
  money: number,
  goods: Readonly<Record<Resource, number>>,
  isHuman: boolean,
): string {
  const color = PLAYER_COLORS[playerId]!;
  const label = isHuman ? "You" : `Player ${playerId + 1}`;

  let markup = `<div class="hud-player" data-player="${playerId}">`;
  markup += `<span class="hud-swatch" style="background-color: ${color};"></span>`;
  markup += `<span class="hud-label">${label}</span>`;
  markup += `<span class="hud-money">$${money}</span>`;
  markup += '<span class="hud-goods">';
  for (const resource of RESOURCES) {
    markup += `<span class="hud-good" data-resource="${resource}">${goods[resource]}</span>`;
  }
  markup += "</span>";
  markup += "</div>";
  return markup;
}
