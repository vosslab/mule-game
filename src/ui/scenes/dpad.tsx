// Touch d-pad for avatar movement.
//
// Synthesizes the same document-level keydown/keyup KeyboardEvents the
// scene's own createKeyState() poller already listens for (ArrowUp/Down/
// Left/Right -- see input.ts and overworld_scene.tsx/town_scene.tsx's
// UP_KEYS/DOWN_KEYS/LEFT_KEYS/RIGHT_KEYS), so both OverworldScene and
// TownScene pick up d-pad presses through their existing keyboard input path
// with no scene-side changes: this component never touches game state
// directly, and keyboard input is completely unaffected since it only ever
// dispatches synthetic key events, never intercepts real ones.
//
// Hidden on non-touch pointers via CSS (`@media (pointer: coarse)` gates
// `.dpad`'s display in style.css), so a mouse/keyboard player never sees it.
//
// Solid discipline: run-once component, no props, pointer handlers release on
// pointerup/pointerleave/pointercancel so a dragged-off or interrupted touch
// never leaves a direction stuck held.

import type { JSX } from "solid-js";

/** The four movement directions the d-pad exposes. */
type DpadDirection = "up" | "down" | "left" | "right";

/** Synthetic key name dispatched for each direction, matching the scenes' UP_KEYS/etc. */
const DIRECTION_KEYS: Record<DpadDirection, string> = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
};

/** Accessible label for each direction button. */
const DIRECTION_LABELS: Record<DpadDirection, string> = {
  up: "Move up",
  down: "Move down",
  left: "Move left",
  right: "Move right",
};

//============================================
/**
 * Dispatch a synthetic keydown or keyup on `document` for `direction`,
 * matching the exact key name the scenes' held-key poller listens for.
 *
 * @param type - "keydown" to start moving, "keyup" to stop.
 * @param direction - Which d-pad direction was pressed or released.
 */
function dispatchSyntheticKey(type: "keydown" | "keyup", direction: DpadDirection): void {
  document.dispatchEvent(new KeyboardEvent(type, { key: DIRECTION_KEYS[direction] }));
}

//============================================
/**
 * Render the touch d-pad: four directional buttons in a cross layout.
 *
 * @returns The d-pad element.
 */
export function Dpad(): JSX.Element {
  function press(direction: DpadDirection): void {
    dispatchSyntheticKey("keydown", direction);
  }
  function release(direction: DpadDirection): void {
    dispatchSyntheticKey("keyup", direction);
  }

  return (
    <div class="dpad" data-dpad>
      <DpadButton direction="up" onPress={press} onRelease={release} />
      <DpadButton direction="left" onPress={press} onRelease={release} />
      <DpadButton direction="right" onPress={press} onRelease={release} />
      <DpadButton direction="down" onPress={press} onRelease={release} />
    </div>
  );
}

/** Props for one d-pad direction button. */
interface DpadButtonProps {
  /** Which direction this button moves. */
  readonly direction: DpadDirection;
  /** Called on pointer down with this button's direction. */
  readonly onPress: (direction: DpadDirection) => void;
  /** Called on pointer up/leave/cancel with this button's direction. */
  readonly onRelease: (direction: DpadDirection) => void;
}

//============================================
/**
 * Render one d-pad direction button. Releases on pointerup, pointerleave,
 * and pointercancel alike, so a finger dragged off the button or a browser-
 * interrupted touch never leaves the direction stuck held.
 *
 * @param props - Carries the direction and its press/release callbacks.
 * @returns The direction button element.
 */
function DpadButton(props: DpadButtonProps): JSX.Element {
  return (
    <button
      type="button"
      class={`dpad-button dpad-button-${props.direction}`}
      data-dpad-direction={props.direction}
      aria-label={DIRECTION_LABELS[props.direction]}
      onPointerDown={() => props.onPress(props.direction)}
      onPointerUp={() => props.onRelease(props.direction)}
      onPointerLeave={() => props.onRelease(props.direction)}
      onPointerCancel={() => props.onRelease(props.direction)}
    />
  );
}
