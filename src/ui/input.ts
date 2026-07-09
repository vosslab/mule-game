// Keyboard binding helpers shared by screens so keyboard interaction stays
// consistent with on-screen buttons (arrows, enter, escape parity).
//
// Two input models coexist:
//   - Edge-triggered menu input (`bindKeys`, `bindRovingFocus`): one handler
//     call per key press, for buttons and discrete claims.
//   - A held-key `KeyState` poller: a live set of currently-pressed keys the
//     rAF scene loop samples each frame (`update`), for continuous motion. This
//     is the spatial-scene input path; menu screens keep using `bindKeys`.

/**
 * Bind a map of key names to handlers on the document, returning an unbind
 * function. Key names match `KeyboardEvent.key` (for example "ArrowUp",
 * "Enter", "Escape").
 *
 * @param map - Record of key name to handler function.
 * @returns A function that removes the listener when called.
 */
export function bindKeys(map: Record<string, () => void>): () => void {
  const listener = (event: KeyboardEvent): void => {
    const handler = map[event.key];
    if (handler === undefined) {
      return;
    }
    event.preventDefault();
    handler();
  };
  document.addEventListener("keydown", listener);
  return () => {
    document.removeEventListener("keydown", listener);
  };
}

//============================================
/**
 * Bind roving keyboard focus over the enabled buttons matching `selector`
 * inside `container`: Up/Left moves to the previous button, Down/Right moves
 * to the next, wrapping at both ends. Activation (Enter/Space) is left to the
 * browser's native focused-button behavior; this only moves focus.
 *
 * @param container - Element whose descendant buttons form the roving group.
 * @param selector - CSS selector matching the candidate buttons.
 * @returns A function that removes the listener when called.
 */
export function bindRovingFocus(container: Element, selector: string): () => void {
  const enabledButtons = (): HTMLButtonElement[] =>
    Array.from(container.querySelectorAll<HTMLButtonElement>(selector)).filter(
      (button) => !button.disabled,
    );

  const moveFocus = (step: number): void => {
    const buttons = enabledButtons();
    if (buttons.length === 0) {
      return;
    }
    const activeIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex =
      activeIndex === -1 ? 0 : (activeIndex + step + buttons.length) % buttons.length;
    buttons[nextIndex]?.focus();
  };

  return bindKeys({
    ArrowUp: () => moveFocus(-1),
    ArrowLeft: () => moveFocus(-1),
    ArrowDown: () => moveFocus(1),
    ArrowRight: () => moveFocus(1),
  });
}

//============================================
/**
 * A live held-key poller. Tracks which keys are currently pressed via
 * document keydown/keyup, so a scene's per-frame `update` can sample held
 * state (`isDown`) rather than reacting to discrete key events. Key names
 * match `KeyboardEvent.key` (for example "ArrowUp", "w"). Keydown auto-repeat
 * is idempotent (the key is already in the set), so held motion stays smooth.
 */
export interface KeyState {
  /** Whether `key` is currently held down. */
  readonly isDown: (key: string) => boolean;
  /** Whether any of `keys` is currently held down. */
  readonly anyDown: (keys: readonly string[]) => boolean;
  /** Remove the listeners and clear all held state. */
  readonly stop: () => void;
}

//============================================
/**
 * Create a held-key poller bound to the document. The returned `KeyState` is
 * sampled by scenes each frame; call `stop` on scene exit to unbind.
 *
 * @returns A `KeyState` exposing `isDown`, `anyDown`, and `stop`.
 */
export function createKeyState(): KeyState {
  const held = new Set<string>();

  const onKeyDown = (event: KeyboardEvent): void => {
    held.add(event.key);
  };
  const onKeyUp = (event: KeyboardEvent): void => {
    held.delete(event.key);
  };
  // A blurred window never delivers keyup, so drop all held keys on blur to
  // avoid a stuck direction when focus leaves the page mid-press.
  const onBlur = (): void => {
    held.clear();
  };

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);

  const isDown = (key: string): boolean => held.has(key);
  const anyDown = (keys: readonly string[]): boolean => keys.some((key) => held.has(key));
  const stop = (): void => {
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur);
    held.clear();
  };

  return { isDown, anyDown, stop };
}
