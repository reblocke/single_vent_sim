import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  webServer: undefined,
  testDir: "./live",
  workers: 1,
  use: {
    ...base.use,
    baseURL:
      process.env.LIVE_URL ?? "https://reblocke.github.io/single_vent_sim/",
  },
  outputDir: "test-results/live",
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/results-live.json" }],
  ],
});
