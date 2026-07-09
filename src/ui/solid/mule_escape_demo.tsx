// Mule-escape fixture demo screen (the ?demo=mule_escape hook).
//
// Renders ProductionPanel directly against a hand-written ProductionPayload
// carrying a fired "radiation" colony event, for direct visual and
// Playwright review of MuleEscapeVignette independent of a full New-Game
// playthrough (reaching a radiation round from a live game is not seed-
// controllable on demand). ProductionPanel needs no store -- it is a plain
// payload-in, markup-out component -- so this fixture is just the payload.

import type { JSX } from "solid-js";
import type { ColonyEventResult } from "../../engine/events";
import type { ProductionPayload } from "../../engine/game_state";
import { ProductionPanel } from "./production_panel";

/** A fixed "radiation" colony event result, matching resolveRadiation's shape in events.ts. */
const RADIATION_EVENT: ColonyEventResult = {
  kind: "colony",
  type: "radiation",
  categoryA: true,
  round: 4,
  name: "Radiation",
  description: "Radiation drives a M.U.L.E. mad and it flees.",
  message: "radiation sent one of the leader's M.U.L.E.s crazy and it fled.",
  cells: [{ row: 2, col: 3 }],
};

/** A fixed fixture production payload with the radiation event attached. */
const FIXTURE_PAYLOAD: ProductionPayload = {
  yields: [
    { food: 4, energy: 2, smithore: 0, crystite: 0 },
    { food: 3, energy: 1, smithore: 2, crystite: 0 },
    { food: 2, energy: 2, smithore: 0, crystite: 0 },
    { food: 5, energy: 0, smithore: 1, crystite: 0 },
  ],
  colonyEvent: RADIATION_EVENT,
};

//============================================
/**
 * Render the mule-escape demo: the production interstitial with a radiation
 * event fixed on it. Mounted by the app's phase-router when the active
 * screen is the mule-escape-demo screen.
 *
 * @returns The demo screen fragment.
 */
export function MuleEscapeDemoScreen(): JSX.Element {
  return (
    <div id="mule-escape-demo" class="mule-escape-demo">
      <ProductionPanel payload={() => FIXTURE_PAYLOAD} />
    </div>
  );
}
