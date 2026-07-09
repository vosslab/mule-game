// Keyboard binding helper shared by screens so keyboard interaction stays
// consistent with on-screen buttons (arrows, enter, escape parity).

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
