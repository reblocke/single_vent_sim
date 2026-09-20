import { defineConfig, devices } from "@playwright/test";
const base = process.env.APP_BASE ?? "/";
export default defineConfig({
  testDir: "./tests",
  outputDir: "test-results/" + (base === "/" ? "root" : "subpath"),
  timeout: 120000,
  expect: { timeout: 60000 },
  workers: 2,
  retries: 0,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile:
          "test-results/results-" +
          (base === "/" ? "root" : "subpath") +
          ".json",
      },
    ],
  ],
  use: { baseURL: "http://127.0.0.1:4173" + base, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: {
    command: "npm run preview -- --port 4173 --strictPort",
    url: "http://127.0.0.1:4173" + base,
    reuseExistingServer: false,
  },
});
