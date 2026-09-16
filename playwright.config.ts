import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/browser-report.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4174/-/",
    viewport: { width: 1536, height: 691 },
    deviceScaleFactor: 1,
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: { command: "node scripts/serve-build.mjs", url: "http://127.0.0.1:4174/-/", reuseExistingServer: !process.env.CI },
});
