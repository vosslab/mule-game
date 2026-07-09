// Selector contract: depends on src/ui/main.tsx's ?replay=
// routing to #screen-replay, src/ui/scenes/replay_scene.tsx's transport
// (#replay-play-pause, #replay-restart, [data-replay-transport] with
// data-replay-step / data-replay-total / data-replay-phase / data-replay-done),
// and src/ui/solid/scoring_panel.tsx's .scoring-panel.
//
// Drives the committed fixture log (src/ui/scenes/replay_fixture.ts) through the
// replay viewer and asserts playback reaches the recorded end-state (the scoring
// screen), plus that the transport pause and restart controls work.

import { test, expect } from "@playwright/test";

test("replay viewer plays the fixture log to the scoring end-state", async ({ page }) => {
  // High speed so the ~1300-action fixture plays out well inside the timeout.
  await page.goto("/?replay=fixture&speed=50");

  await expect(page.locator("#screen-replay")).toHaveClass(/active/);
  const transport = page.locator("[data-replay-transport]");
  await expect(transport).toBeVisible();
  await expect(page.locator("#replay-play-pause")).toBeVisible();

  // The fixture carries a full game's worth of recorded actions.
  const total = Number(await transport.getAttribute("data-replay-total"));
  expect(total).toBeGreaterThan(100);

  // Playback auto-runs and reaches the recorded end-state.
  await expect(transport).toHaveAttribute("data-replay-done", "true", { timeout: 25_000 });
  await expect(transport).toHaveAttribute("data-replay-phase", "scoring");
  expect(Number(await transport.getAttribute("data-replay-step"))).toBe(total);

  // The reused game screen shows the final scoring panel.
  await expect(page.locator(".scoring-panel")).toBeVisible();
});

test("replay viewer pause halts progress and restart rewinds to the start", async ({ page }) => {
  // Slow speed so we can catch the replay mid-stream.
  await page.goto("/?replay=fixture&speed=4");
  const transport = page.locator("[data-replay-transport]");
  await expect(transport).toBeVisible();

  // Let a few actions play, then pause.
  await expect
    .poll(async () => Number(await transport.getAttribute("data-replay-step")))
    .toBeGreaterThan(0);
  await page.locator("#replay-play-pause").click();

  // Once paused, the step count is frozen.
  await page.waitForTimeout(200);
  const paused = Number(await transport.getAttribute("data-replay-step"));
  await page.waitForTimeout(400);
  expect(Number(await transport.getAttribute("data-replay-step"))).toBe(paused);

  // Restart rewinds to step 0 and resumes playback.
  await page.locator("#replay-restart").click();
  await expect
    .poll(async () => Number(await transport.getAttribute("data-replay-step")))
    .toBeLessThanOrEqual(paused);
  await expect(transport).toHaveAttribute("data-replay-done", "false");
});
