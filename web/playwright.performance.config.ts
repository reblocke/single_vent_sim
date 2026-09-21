import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testDir: "./benchmarks",
  workers: 1,
  projects: base.projects?.filter((p) => p.name === "chromium"),
  outputDir: "test-results/performance",
  reporter: [
    ["list"],
    ["json", { outputFile: "test-results/results-performance.json" }],
  ],
});
