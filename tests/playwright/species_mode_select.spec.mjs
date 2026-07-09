// Selector contract: this spec depends on src/ui/solid/title_screen.tsx's
// mode/species radiogroups (`[data-mode-option]`, `[data-species-option]`,
// `aria-checked`, roving `tabindex`), src/ui/main.tsx's `?mode=` / `?species=`
// URL-param picker seeding, and src/ui/solid/hud.tsx's `data-mode` attribute
// (the mode's end-to-end proof: it threads title-screen selection through
// game_driver.ts -> createInitialGameState -> GameState.mode -> the HUD).

import { test, expect } from "@playwright/test";

const SPECIES_NAMES = [
  "humanoid",
  "gollumer",
  "mechtron",
  "packer",
  "leggite",
  "bonzoid",
  "spheroid",
  "flapper",
];

test("species/mode picker: defaults to beginner and the first species", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-mode-option="beginner"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.locator('[data-mode-option="standard"]')).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await expect(page.locator('[data-species-option="humanoid"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
  // All 8 species render, and every option has exactly one <use> sprite instance.
  await expect(page.locator("[data-species-option]")).toHaveCount(SPECIES_NAMES.length);
  for (const name of SPECIES_NAMES) {
    await expect(page.locator(`[data-species-option="${name}"] use`)).toHaveCount(1);
  }
});

test("species/mode picker: clicking an option selects it and clears the others", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-mode-option="standard"]').click();
  await expect(page.locator('[data-mode-option="standard"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.locator('[data-mode-option="beginner"]')).toHaveAttribute(
    "aria-checked",
    "false",
  );

  await page.locator('[data-species-option="flapper"]').click();
  await expect(page.locator('[data-species-option="flapper"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.locator('[data-species-option="humanoid"]')).toHaveAttribute(
    "aria-checked",
    "false",
  );
});

test("species/mode picker: ArrowRight/ArrowLeft roves the radiogroup selection and focus", async ({
  page,
}) => {
  await page.goto("/");

  // Focus the checked (tabindex=0) mode option, then arrow through both.
  await page.locator('[data-mode-option="beginner"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-mode-option="standard"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.locator('[data-mode-option="standard"]')).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator('[data-mode-option="beginner"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.locator('[data-mode-option="beginner"]')).toBeFocused();

  // Species roves the same way, wrapping from the last option back to the first.
  await page.locator('[data-species-option="humanoid"]').focus();
  for (let i = 0; i < SPECIES_NAMES.length; i++) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(page.locator('[data-species-option="humanoid"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("species/mode picker: ?mode= and ?species= pre-select the picker without a click", async ({
  page,
}) => {
  await page.goto("/?mode=standard&species=spheroid");
  await expect(page.locator('[data-mode-option="standard"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.locator('[data-species-option="spheroid"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("species/mode picker: an unrecognized ?mode= falls back to the default without blocking mount", async ({
  page,
}) => {
  await page.goto("/?mode=tournament&species=not-a-species");
  await expect(page.locator('[data-mode-option="beginner"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.locator('[data-species-option="humanoid"]')).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("species/mode picker: New Game threads the chosen mode into the started game's HUD", async ({
  page,
}) => {
  await page.goto("/?speed=8");
  await page.locator('[data-mode-option="standard"]').click();
  await page.locator("#new-game-button").click();
  await expect(page.locator("#game-hud .hud")).toHaveAttribute("data-mode", "standard");
});

test("species/mode picker: New Game with only the beginner default reaches the game screen", async ({
  page,
}) => {
  await page.goto("/?speed=8");
  await page.locator("#new-game-button").click();
  await expect(page.locator("#screen-game")).toHaveClass(/active/);
  await expect(page.locator("#game-hud .hud")).toHaveAttribute("data-mode", "beginner");
});
