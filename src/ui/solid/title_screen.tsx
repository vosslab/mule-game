// Title screen as a SolidJS component.
//
// Composes the title sprite set (src/ui/sprites/sprites_title.ts) into
// the actual title scene, closing the MUST-FIX gap the art gate assessment
// recorded (docs/active_plans/audits/art_gate_assessment.md: the live screen
// shipped plain text while title_gallery.png held a finished wordmark, ringed
// planet, starfield, and ship). Composition follows the style spec's stated
// hierarchy: the wordmark is the dominant foreground element, the ringed
// planet and starfield form a backdrop layer behind it, and the landing ship
// is a small accent on that backdrop -- not a competing focal point.
//
// The New Game button keeps its #new-game-button id: the Playwright game-flow
// spec and input wiring depend on it.
//
// The mode and species pickers sit below the wordmark:
// two ARIA radiogroups (`data-mode-option` / `data-species-option`, roving
// tabindex, Left/Right arrow navigation) that carry the New Game click's
// `NewGameSelection`. Both default to `props.initialSelection` -- parsed by
// main.tsx from `?mode=` / `?species=` (defaulting to beginner mode and the
// first species when absent) -- so a Playwright spec can pin either without
// having to drive the picker's own clicks first, and every existing spec
// that only clicks #new-game-button keeps today's beginner/first-species
// behavior unchanged.
//
// Starfield star positions are a fixed, hardcoded seed list (not Math.random,
// not a runtime formula) so a screenshot of this screen is pixel-stable across
// runs. Any twinkle/drift motion is pure CSS, gated behind
// `@media (prefers-reduced-motion: no-preference)` in src/style.css: the
// unconditional (static) rules are the reduced-motion fallback, and the motion
// rules layer on top only when the user has not asked for reduced motion.

import type { JSX } from "solid-js";
import { For, Show, createSignal } from "solid-js";
import type { GameMode } from "../../engine/game_state";
import type { Species } from "../../engine/player";
import type { NewGameSelection } from "../game_driver";
import { clearSave, isResumable, loadSavedGame } from "../save_log";
import { playerColor } from "../sprites";
import {
  SPECIES_NAMES,
  speciesSymbolId,
  buildSpeciesSpriteDefsMarkup,
} from "../sprites/sprites_species";
import {
  TITLE_LOGO_SYMBOL_ID,
  TITLE_PLANET_SYMBOL_ID,
  TITLE_STAR_SYMBOL_ID,
  TITLE_SHIP_SYMBOL_ID,
  buildTitleSpriteDefsMarkup,
} from "../sprites/sprites_title";

/** Props for the title screen. */
export interface TitleScreenProps {
  /** Invoked with the picker's mode/species selection when the player clicks New Game. */
  readonly onNewGame: (selection: NewGameSelection) => void;
  /** Invoked when the player clicks Resume (only offered for a matching-build save). */
  readonly onResume: () => void;
  /** Invoked when the player opens the replay viewer. */
  readonly onWatchReplay: () => void;
  /** Initial mode/species picker state (from `?mode=` / `?species=`, see main.tsx). */
  readonly initialSelection: NewGameSelection;
}

/** The two selectable modes, in picker display order. */
const MODE_OPTIONS: readonly {
  readonly mode: GameMode;
  readonly label: string;
  readonly rounds: number;
}[] = [
  { mode: "beginner", label: "Beginner", rounds: 6 },
  { mode: "standard", label: "Standard", rounds: 12 },
];

/**
 * ViewBox size of the backdrop scene (planet, starfield, ship). Portrait-
 * leaning so `preserveAspectRatio="xMidYMid slice"` crops gracefully on both
 * narrow mobile viewports and wide desktop ones, keeping the centered planet
 * on screen either way.
 */
const BACKDROP_VIEWBOX_WIDTH = 300;
const BACKDROP_VIEWBOX_HEIGHT = 420;

/** ViewBox size the wordmark symbol renders into, matching sprites_title.ts's computed glyph layout. */
const WORDMARK_VIEWBOX_WIDTH = 212;
const WORDMARK_VIEWBOX_HEIGHT = 38;

/**
 * Rendered size of the planet disc within the backdrop, and its placed
 * center. Vertically dead-center in the viewBox (art gate round 3 POLISH:
 * a y=110 "upper third" placement cropped the top third of the planet hard
 * at the frame edge on wide desktop viewports -- `xMidYMid slice`'s crop
 * window is always symmetric around the viewBox's true vertical center
 * (210), so that is the one placement guaranteed to survive the crop at any
 * aspect ratio, not just the specific viewports spot-checked so far).
 */
const PLANET_RENDER_SIZE = 150;
const PLANET_CENTER_X = 150;
const PLANET_CENTER_Y = 210;

/**
 * Rendered size and placement of the landing ship accent within the
 * backdrop, horizontally centered under the planet (both `xMidYMid slice`
 * crop windows -- wide desktop and narrow mobile -- keep the horizontal
 * center on screen, so centering here is what keeps the ship visible across
 * viewport shapes) and vertically close enough to the viewBox center to stay
 * inside the same worst-case wide-viewport crop window the planet now fits.
 */
const SHIP_RENDER_WIDTH = 90;
const SHIP_RENDER_HEIGHT = 56;
const SHIP_X = PLANET_CENTER_X - SHIP_RENDER_WIDTH / 2;
const SHIP_Y = 240;

/** One starfield star: a fixed x/y/size/opacity tuple, hand-picked for spread, not generated at runtime. */
interface StarSeed {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly opacity: number;
}

/**
 * Fixed starfield seed: 24 stars scattered across the backdrop viewBox.
 * Hardcoded rather than formula-generated so the composed scene is
 * identical on every render (stable screenshots); stars that land behind
 * the planet or ship are simply painted over by those shapes below.
 */
const STAR_FIELD_SEED: readonly StarSeed[] = [
  { x: 12, y: 20, size: 5, opacity: 0.9 },
  { x: 55, y: 35, size: 4, opacity: 0.6 },
  { x: 95, y: 15, size: 6, opacity: 0.8 },
  { x: 140, y: 30, size: 3, opacity: 0.5 },
  { x: 190, y: 12, size: 5, opacity: 0.7 },
  { x: 235, y: 40, size: 4, opacity: 0.6 },
  { x: 275, y: 18, size: 6, opacity: 0.9 },
  { x: 20, y: 90, size: 3, opacity: 0.5 },
  { x: 260, y: 95, size: 5, opacity: 0.7 },
  { x: 15, y: 160, size: 4, opacity: 0.6 },
  { x: 280, y: 165, size: 6, opacity: 0.85 },
  { x: 40, y: 220, size: 3, opacity: 0.5 },
  { x: 250, y: 225, size: 5, opacity: 0.8 },
  { x: 10, y: 260, size: 4, opacity: 0.6 },
  { x: 285, y: 255, size: 6, opacity: 0.9 },
  { x: 60, y: 290, size: 3, opacity: 0.5 },
  { x: 230, y: 295, size: 5, opacity: 0.7 },
  { x: 100, y: 260, size: 4, opacity: 0.6 },
  { x: 30, y: 380, size: 6, opacity: 0.85 },
  { x: 260, y: 390, size: 3, opacity: 0.5 },
  { x: 130, y: 350, size: 4, opacity: 0.6 },
  { x: 160, y: 400, size: 5, opacity: 0.7 },
  { x: 90, y: 400, size: 3, opacity: 0.5 },
  { x: 200, y: 380, size: 4, opacity: 0.6 },
];

//============================================
/**
 * Render the title screen: a backdrop scene (starfield, ringed planet,
 * landing ship), the dot-matrix wordmark, and the New Game button.
 *
 * @param props - Carries the `onNewGame` start-game callback.
 * @returns The title screen fragment.
 */
export function TitleScreen(props: TitleScreenProps): JSX.Element {
  const [mode, setMode] = createSignal<GameMode>(props.initialSelection.mode);
  const [species, setSpecies] = createSignal<Species>(props.initialSelection.species);
  const [relaxedTimer, setRelaxedTimer] = createSignal<boolean>(
    props.initialSelection.relaxedTimer,
  );

  // Classify the persisted save once at mount. A matching-
  // build save offers Resume; a save from another build is not replayable
  // (same-build replay is the only compatibility guarantee), so it is discarded
  // now and a brief notice is shown instead. New Game overwrites either case.
  const savedGame = loadSavedGame();
  const canResume = savedGame !== null && isResumable(savedGame);
  const showVersionNotice = savedGame !== null && !isResumable(savedGame);
  if (showVersionNotice) {
    clearSave();
  }

  return (
    <div class="title-screen">
      {/* Shared <defs> host for every <use> reference below; zero-size and hidden from the accessibility tree. */}
      <svg
        width="0"
        height="0"
        aria-hidden="true"
        class="title-screen-defs-host"
        innerHTML={buildTitleSpriteDefsMarkup() + buildSpeciesSpriteDefsMarkup()}
      />
      <TitleBackdrop />
      <div class="title-screen-content">
        {/* Visually hidden but screen-reader-visible heading; the wordmark below is the sighted-user title. */}
        <h1 class="title-screen-sr-heading">M.U.L.E.</h1>
        <svg
          class="title-screen-wordmark"
          viewBox={`0 0 ${WORDMARK_VIEWBOX_WIDTH} ${WORDMARK_VIEWBOX_HEIGHT}`}
          role="img"
          aria-label="M.U.L.E."
        >
          <use
            href={`#${TITLE_LOGO_SYMBOL_ID}`}
            width={WORDMARK_VIEWBOX_WIDTH}
            height={WORDMARK_VIEWBOX_HEIGHT}
          />
        </svg>
        <ModePicker mode={mode} setMode={setMode} />
        <SpeciesPicker species={species} setSpecies={setSpecies} />
        <RelaxedTimerToggle relaxedTimer={relaxedTimer} setRelaxedTimer={setRelaxedTimer} />
        <Show when={showVersionNotice}>
          <p class="title-screen-saved-notice" data-saved-game-notice role="status">
            Saved game unavailable for this version.
          </p>
        </Show>
        <div class="title-screen-actions">
          <Show when={canResume}>
            <button
              id="resume-game-button"
              class="title-screen-resume-button"
              type="button"
              onClick={() => props.onResume()}
            >
              Resume
            </button>
          </Show>
          <button
            id="new-game-button"
            class="title-screen-new-game-button"
            type="button"
            onClick={() =>
              props.onNewGame({ mode: mode(), species: species(), relaxedTimer: relaxedTimer() })
            }
          >
            New Game
          </button>
        </div>
        <button
          id="watch-replay-button"
          class="title-screen-watch-replay-button"
          type="button"
          onClick={() => props.onWatchReplay()}
        >
          Watch demo replay
        </button>
      </div>
    </div>
  );
}

//============================================
/**
 * Render the mode picker: an ARIA radiogroup of two buttons (beginner 6
 * rounds / standard 12 rounds) with roving tabindex and Left/Right arrow
 * navigation, matching the standard single-select radiogroup keyboard
 * pattern.
 *
 * @param props - Carries the current mode accessor and its setter.
 * @returns The mode picker fragment.
 */
function ModePicker(props: {
  readonly mode: () => GameMode;
  readonly setMode: (mode: GameMode) => void;
}): JSX.Element {
  const refs: (HTMLButtonElement | undefined)[] = [];

  function selectIndex(index: number): void {
    const option = MODE_OPTIONS[index];
    if (option === undefined) {
      return;
    }
    props.setMode(option.mode);
    refs[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    const currentIndex = MODE_OPTIONS.findIndex((option) => option.mode === props.mode());
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectIndex((currentIndex + 1) % MODE_OPTIONS.length);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectIndex((currentIndex - 1 + MODE_OPTIONS.length) % MODE_OPTIONS.length);
    }
  }

  return (
    <div class="title-screen-picker" data-mode-picker role="radiogroup" aria-label="Game mode">
      <p class="title-screen-picker-label">Mode</p>
      <div class="title-screen-picker-options" onKeyDown={handleKeyDown}>
        <For each={MODE_OPTIONS}>
          {(option, index) => (
            <button
              type="button"
              ref={(el) => {
                refs[index()] = el;
              }}
              class="title-screen-mode-option"
              data-mode-option={option.mode}
              role="radio"
              aria-checked={props.mode() === option.mode}
              tabIndex={props.mode() === option.mode ? 0 : -1}
              onClick={() => selectIndex(index())}
            >
              {`${option.label} (${option.rounds} rounds)`}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}

//============================================
/**
 * Render the species picker: an ARIA radiogroup of eight species-sprite
 * buttons with roving tabindex and Left/Right arrow navigation. Every
 * species costs the same flat starting money -- the cosmetic-only label
 * says so directly, so the choice reads as identity, not strategy.
 *
 * @param props - Carries the current species accessor and its setter.
 * @returns The species picker fragment.
 */
function SpeciesPicker(props: {
  readonly species: () => Species;
  readonly setSpecies: (species: Species) => void;
}): JSX.Element {
  const refs: (HTMLButtonElement | undefined)[] = [];
  const tint = playerColor(0);

  function selectIndex(index: number): void {
    const name = SPECIES_NAMES[index];
    if (name === undefined) {
      return;
    }
    props.setSpecies(name);
    refs[index]?.focus();
  }

  function handleKeyDown(event: KeyboardEvent): void {
    const currentIndex = SPECIES_NAMES.findIndex((name) => name === props.species());
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectIndex((currentIndex + 1) % SPECIES_NAMES.length);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectIndex((currentIndex - 1 + SPECIES_NAMES.length) % SPECIES_NAMES.length);
    }
  }

  return (
    <div class="title-screen-picker" data-species-picker role="radiogroup" aria-label="Species">
      <p class="title-screen-picker-label">Species (all species start with $1000)</p>
      <div
        class="title-screen-picker-options title-screen-species-options"
        onKeyDown={handleKeyDown}
      >
        <For each={SPECIES_NAMES}>
          {(name, index) => (
            <button
              type="button"
              ref={(el) => {
                refs[index()] = el;
              }}
              class="title-screen-species-option"
              data-species-option={name}
              role="radio"
              aria-checked={props.species() === name}
              aria-label={name}
              tabIndex={props.species() === name ? 0 : -1}
              onClick={() => selectIndex(index())}
            >
              <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
                <use
                  href={`#${speciesSymbolId(name, 1)}`}
                  width={32}
                  height={32}
                  style={{ color: tint }}
                />
              </svg>
            </button>
          )}
        </For>
      </div>
    </div>
  );
}

//============================================
/**
 * Render the relaxed-timer toggle: an ARIA switch that doubles the develop
 * and land-grant sweep real-time pacing (`scene_manager.ts`'s
 * `RELAXED_TIMER_MULTIPLIER`) for players who find the default reflex timing
 * tight, without changing any engine tick budget. `?timer=relaxed` sets the
 * same initial state (see main.tsx's `parseRelaxedTimer`).
 *
 * @param props - Carries the current toggle accessor and its setter.
 * @returns The relaxed-timer toggle fragment.
 */
function RelaxedTimerToggle(props: {
  readonly relaxedTimer: () => boolean;
  readonly setRelaxedTimer: (relaxedTimer: boolean) => void;
}): JSX.Element {
  return (
    <div class="title-screen-picker" data-relaxed-timer-picker>
      <button
        type="button"
        id="relaxed-timer-toggle"
        class="title-screen-relaxed-timer-toggle"
        role="switch"
        aria-checked={props.relaxedTimer()}
        onClick={() => props.setRelaxedTimer(!props.relaxedTimer())}
      >
        {`Relaxed timers: ${props.relaxedTimer() ? "on" : "off"}`}
      </button>
      <p class="title-screen-picker-hint">Slower develop turns and land-grant sweep, same rules.</p>
    </div>
  );
}

//============================================
/**
 * Render the backdrop scene: the tiled starfield behind the ringed planet,
 * with the landing ship as a small accent in the foreground corner. Purely
 * decorative, so the whole group is hidden from assistive tech.
 *
 * @returns The backdrop `<svg>` element.
 */
function TitleBackdrop(): JSX.Element {
  return (
    <svg
      class="title-screen-backdrop"
      viewBox={`0 0 ${BACKDROP_VIEWBOX_WIDTH} ${BACKDROP_VIEWBOX_HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <For each={STAR_FIELD_SEED}>
        {(star, index) => (
          <use
            href={`#${TITLE_STAR_SYMBOL_ID}`}
            class="title-screen-star"
            x={star.x}
            y={star.y}
            width={star.size}
            height={star.size}
            opacity={star.opacity}
            style={{ "animation-delay": `${index() * 0.35}s` }}
          />
        )}
      </For>
      <use
        href={`#${TITLE_PLANET_SYMBOL_ID}`}
        x={PLANET_CENTER_X - PLANET_RENDER_SIZE / 2}
        y={PLANET_CENTER_Y - PLANET_RENDER_SIZE / 2}
        width={PLANET_RENDER_SIZE}
        height={PLANET_RENDER_SIZE}
      />
      <use
        href={`#${TITLE_SHIP_SYMBOL_ID}`}
        class="title-screen-ship"
        x={SHIP_X}
        y={SHIP_Y}
        width={SHIP_RENDER_WIDTH}
        height={SHIP_RENDER_HEIGHT}
      />
    </svg>
  );
}
