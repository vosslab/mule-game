// Minimal screen registry: toggles visibility of container divs by id.
// Each screen is a top-level element carrying the "screen" class; only the
// active screen additionally carries the "active" class (see style.css).

const registeredScreens = new Set<string>();

//============================================
export function registerScreen(screenId: string): void {
  const element = document.getElementById(screenId);
  if (element === null) {
    throw new Error(`registerScreen: no element found with id "${screenId}"`);
  }
  registeredScreens.add(screenId);
}

//============================================
export function showScreen(screenId: string): void {
  if (!registeredScreens.has(screenId)) {
    throw new Error(`showScreen: screen "${screenId}" was never registered`);
  }
  for (const otherId of registeredScreens) {
    const otherElement = document.getElementById(otherId);
    if (otherElement === null) {
      throw new Error(`showScreen: no element found with id "${otherId}"`);
    }
    otherElement.classList.toggle("active", otherId === screenId);
  }
}
