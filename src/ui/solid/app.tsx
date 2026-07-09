// Root SolidJS app: the phase-router.
//
// A <Switch> keyed on the reactive active-screen signal (src/ui/screen_router.ts)
// routes the top-level screens. Every screen is now a real Solid component: the
// title and map-demo screens, and -- since the M2 port -- the live game screen.
// When a game is running, the game screen mounts <GameScreen> bound to the live
// store (src/ui/game_driver.ts's currentGameStore signal); GameScreen renders
// the HUD, board, and active phase panel reactively, and the scene manager
// drives ticks and AI. The old always-mounted inert #game-* shell and the
// imperative driver it fed are gone.

import { Switch, Match, Show } from "solid-js";
import type { JSX } from "solid-js";
import { currentScreen } from "../screen_router";
import { currentGameStore } from "../game_driver";
import type { NewGameSelection } from "../game_driver";
import { TitleScreen } from "./title_screen";
import { MapDemoScreen } from "./map_demo";
import { TownDemoScreen } from "./town_demo";
import { AiActorDemoScreen } from "./ai_actor_demo";
import { MuleEscapeDemoScreen } from "./mule_escape_demo";
import { WampusHuntDemoScreen } from "./wampus_hunt_demo";
import { GameScreen } from "./game_screen";
import { ReplayScreen } from "../scenes/replay_scene";

const TITLE_SCREEN_ID = "screen-title";
const GAME_SCREEN_ID = "screen-game";
const MAP_SCREEN_ID = "screen-map";
const TOWN_SCREEN_ID = "screen-town";
const AI_ACTOR_DEMO_SCREEN_ID = "screen-ai-actor-demo";
const MULE_ESCAPE_DEMO_SCREEN_ID = "screen-mule-escape-demo";
const WAMPUS_HUNT_DEMO_SCREEN_ID = "screen-wampus-hunt-demo";
const REPLAY_SCREEN_ID = "screen-replay";

/** Props for the root app. */
export interface AppProps {
  /** Invoked when the player starts a new game from the title screen. */
  readonly onNewGame: (selection: NewGameSelection) => void;
  /** Invoked when the player resumes a saved game from the title screen. */
  readonly onResume: () => void;
  /** Invoked when the player opens the replay viewer from the title screen. */
  readonly onWatchReplay: () => void;
  /** Initial mode/species picker state, parsed from `?mode=` / `?species=`. */
  readonly initialSelection: NewGameSelection;
  /** Initial replay playback speed, parsed from `?speed=` for `?replay=`. */
  readonly replaySpeed: number;
}

//============================================
/**
 * Render the root app: the phase-router over the top-level screens.
 *
 * @param props - Carries the `onNewGame` start-game callback.
 * @returns The app's screen tree.
 */
export function App(props: AppProps): JSX.Element {
  return (
    <Switch>
      <Match when={currentScreen() === TITLE_SCREEN_ID}>
        <div id="screen-title" class="screen active">
          <TitleScreen
            initialSelection={props.initialSelection}
            onNewGame={(selection) => props.onNewGame(selection)}
            onResume={() => props.onResume()}
            onWatchReplay={() => props.onWatchReplay()}
          />
        </div>
      </Match>
      <Match when={currentScreen() === MAP_SCREEN_ID}>
        <div id="screen-map" class="screen active">
          <MapDemoScreen />
        </div>
      </Match>
      <Match when={currentScreen() === TOWN_SCREEN_ID}>
        <div id="screen-town" class="screen active">
          <TownDemoScreen />
        </div>
      </Match>
      <Match when={currentScreen() === AI_ACTOR_DEMO_SCREEN_ID}>
        <div id="screen-ai-actor-demo" class="screen active">
          <AiActorDemoScreen />
        </div>
      </Match>
      <Match when={currentScreen() === MULE_ESCAPE_DEMO_SCREEN_ID}>
        <div id="screen-mule-escape-demo" class="screen active">
          <MuleEscapeDemoScreen />
        </div>
      </Match>
      <Match when={currentScreen() === WAMPUS_HUNT_DEMO_SCREEN_ID}>
        <div id="screen-wampus-hunt-demo" class="screen active">
          <WampusHuntDemoScreen />
        </div>
      </Match>
      <Match when={currentScreen() === GAME_SCREEN_ID}>
        <div id="screen-game" class="screen active">
          <Show when={currentGameStore()} keyed>
            {(store) => <GameScreen store={store} />}
          </Show>
        </div>
      </Match>
      <Match when={currentScreen() === REPLAY_SCREEN_ID}>
        <div id="screen-replay" class="screen active">
          <ReplayScreen initialSpeed={props.replaySpeed} />
        </div>
      </Match>
    </Switch>
  );
}
