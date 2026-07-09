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
