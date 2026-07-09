// Selector contract: this spec depends on the standalone `?demo=mule_escape`
// fixture route (src/ui/solid/mule_escape_demo.tsx, wired through
// src/ui/main.tsx and src/ui/solid/app.tsx) and
// src/ui/solid/mule_escape_vignette.tsx's `[data-mule-escape-vignette]` /
// `data-reduced-motion` attributes.

import { test, expect } from "@playwright/test";

test("mule escape vignette: renders when a radiation colony event fires", async ({ page }) => {
  await page.goto("/?demo=mule_escape");
  const vignette = page.locator("[data-mule-escape-vignette]");
  await expect(vignette).toBeVisible();
  await expect(vignette).toHaveAttribute("data-reduced-motion", "false");
  await expect(page.locator(".mule-escape-vignette-icon use")).toHaveCount(1);
  // The colony event banner (radiation's own message) renders alongside it.
  await expect(page.locator('.event-banner[data-event-id="radiation"]')).toBeVisible();
});

test("mule escape vignette: reduced motion renders no animated styles", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?demo=mule_escape");
  const vignette = page.locator("[data-mule-escape-vignette]");
  await expect(vignette).toHaveAttribute("data-reduced-motion", "true");
  const animationName = await page
    .locator(".mule-escape-vignette-icon")
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(animationName).toBe("none");
});

test("mule escape vignette: self-dismisses after its hold duration", async ({ page }) => {
  await page.goto("/?demo=mule_escape");
  await expect(page.locator("[data-mule-escape-vignette]")).toBeVisible();
  // PASSIVE_EVENT_BANNER_HOLD_MS is 1800ms; give a comfortable margin.
  await expect(page.locator("[data-mule-escape-vignette]")).toHaveCount(0, { timeout: 5_000 });
});
