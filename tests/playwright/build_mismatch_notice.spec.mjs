// Selector contract: depends on src/ui/solid/title_screen.tsx's
// [data-saved-game-notice] and #resume-game-button, and the autosave localStorage
// key "mule-game-save-v1" (src/ui/save_log.ts SAVE_STORAGE_KEY).
//
// Proves the same-build replay policy: a saved game whose buildVersion does not
// match the running build is not resumable. The title screen shows a brief
// notice, offers no Resume, and discards the unusable save.

import { test, expect } from "@playwright/test";

const SAVE_STORAGE_KEY = "mule-game-save-v1";

test("a saved game from another build shows a notice and is discarded", async ({ page }) => {
  await page.goto("/");

  // Seed a save from a different build (empty action log is enough; the notice
  // path reads only buildVersion).
  await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), {
    key: SAVE_STORAGE_KEY,
    value: JSON.stringify({
      buildVersion: "some-other-build-abc123",
      seed: 1,
      mode: "beginner",
      species: "humanoid",
      relaxedTimer: false,
      speed: 1,
      actions: [],
    }),
  });

  await page.reload();

  // The version notice is shown and Resume is not offered.
  await expect(page.locator("[data-saved-game-notice]")).toBeVisible();
  await expect(page.locator("[data-saved-game-notice]")).toHaveText(
    "Saved game unavailable for this version.",
  );
  await expect(page.locator("#resume-game-button")).toHaveCount(0);

  // The unusable save was discarded from storage.
  const remaining = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    SAVE_STORAGE_KEY,
  );
  expect(remaining).toBeNull();
});
