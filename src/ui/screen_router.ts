// Reactive screen registry: a single signal names the active top-level screen.
//
// `showScreen` sets the signal; the SolidJS <App> phase-router (src/ui/solid/
// app.tsx) reads it through `currentScreen` to route via <Switch>. This
// replaces the earlier class-toggling registry: Solid now owns the screen
// elements, and some are mounted only when active, so a DOM lookup at register
// time is no longer meaningful. `registerScreen` keeps the "unknown screen id
// throws" contract by tracking known ids in a set, callers unchanged.

import { createSignal } from "solid-js";

const registeredScreens = new Set<string>();
const [activeScreen, setActiveScreen] = createSignal<string>("");

//============================================
export function registerScreen(screenId: string): void {
  registeredScreens.add(screenId);
}

//============================================
export function showScreen(screenId: string): void {
  if (!registeredScreens.has(screenId)) {
    throw new Error(`showScreen: screen "${screenId}" was never registered`);
  }
  setActiveScreen(screenId);
}

//============================================
/** Reactive accessor: the id of the currently active screen. */
export function currentScreen(): string {
  return activeScreen();
}
