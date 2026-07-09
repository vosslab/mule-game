// PWA installability proxy.
//
// A full Lighthouse installability audit is out of reach for a Playwright
// spec (Lighthouse is a separate tool with its own report format); this is
// the pragmatic proxy the plan calls for instead: the manifest is served and
// carries the fields a browser's install prompt actually inspects (name,
// icons, start_url, display), every icon it lists resolves to a real file,
// the service worker (src/sw.js, copied to dist/sw.js by
// build_github_pages.sh) registers and takes control of the page, and a
// reload after going offline still renders from its cache -- proof the
// offline-cache contract in src/sw.js's own doc comment actually holds.
//
// Selector contract: depends on src/index.html's <link rel="manifest"> tag
// and src/manifest.json / src/sw.js being present in the built dist/ (this
// spec's webServer, per playwright.config.ts, serves dist/ directly).

import { test, expect } from "@playwright/test";

test("PWA manifest is served and carries the fields an install prompt needs", async ({ page }) => {
  await page.goto("/");

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBe("manifest.json");

  const manifestUrl = new URL(manifestHref, page.url()).toString();
  const manifestResponse = await page.request.get(manifestUrl);
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();

  expect(manifest.name).toBeTruthy();
  expect(manifest.start_url).toBeTruthy();
  expect(manifest.display).toBe("standalone");
  expect(Array.isArray(manifest.icons)).toBe(true);
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);

  for (const icon of manifest.icons) {
    expect(icon.src).toBeTruthy();
    expect(icon.sizes).toBeTruthy();
    expect(icon.type).toBe("image/png");
    const iconUrl = new URL(icon.src, manifestUrl).toString();
    const iconResponse = await page.request.get(iconUrl);
    expect(iconResponse.ok()).toBe(true);
  }
});

test("service worker registers, takes control, and a reload still renders while offline", async ({
  page,
  context,
}) => {
  await page.goto("/");

  // self.clients.claim() in src/sw.js's activate handler claims this
  // already-open page without needing a second navigation first.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
    timeout: 15_000,
  });

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#screen-title")).toHaveClass(/active/);

  await context.setOffline(false);
});
