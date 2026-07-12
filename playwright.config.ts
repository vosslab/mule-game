/// <reference types="node" />
import { defineConfig } from "@playwright/test";

// Port is chosen once outside this config (run_playwright_tests.sh) and
// passed in via PW_PORT, since each Playwright worker process reloads this
// config independently -- picking a random port in here would desync
// `use.baseURL` from the `webServer` it actually started. A fallback default
// keeps `npx playwright test` runnable directly, without the wrapper script.
const PORT = process.env.PW_PORT ?? "4173";

export default defineConfig({
  testDir: "tests/playwright",
  // testDir is globbed by path, so a scratch spec or private lane-build
  // directory sitting inside it gets collected as a durable test regardless
  // of name. Exclude both shapes explicitly (docs/PLAYWRIGHT_TEST_STYLE.md).
  testIgnore: ["**/_temp*", "**/dist_*/**"],
  // Playwright CLEARS outputDir at the start of every run. Left at the
  // default ("test-results/"), that clear silently deletes any other tool's
  // artifacts parked under the same root (docs/E2E_TESTS.md's e2e drivers,
  // walkthrough failure screenshots) -- it already destroyed 13 of 14 files
  // from a concurrent capture run. Give Playwright its own subdirectory so
  // it only ever clears what it owns.
  outputDir: "test-results/playwright",
  timeout: 30_000,
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
  },
  webServer: {
    command: `python3 -m http.server ${PORT} --directory dist`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
