import { test, expect } from "@playwright/test";
import { arch, cpus, platform, release, totalmem } from "node:os";

for (const provider of ["prescribed", "resistance"] as const)
  test(
    provider +
      ": thirty settled 201x201 updates meet the recorded reference-machine budget",
    async ({ page, browser }, info) => {
      test.setTimeout(180000);
      await page.setViewportSize({ width: 1440, height: 1000 });
      const coldStart = performance.now();
      let transferred = 0;
      page.on("response", async (response) => {
        const length = response.headers()["content-length"];
        if (length && response.request().method() !== "HEAD")
          transferred += Number(length);
      });
      await page.goto("./");
      await expect(page.locator("#explore")).toHaveAttribute(
        "data-pending",
        "false",
      );
      const coldMs = performance.now() - coldStart;
      if (provider === "resistance") {
        await page.locator("#flow-provider").selectOption("resistance");
        await expect(page.locator("#resistance-panel")).toHaveAttribute(
          "data-pending",
          "false",
        );
      }
      const samples = await page.evaluate(async (provider) => {
        const result: {
          workerMs: number;
          roundTripMs: number;
          paintedMs: number;
        }[] = [];
        for (let i = 0; i < 33; i++) {
          const field = document.querySelector<HTMLInputElement>(
            provider === "prescribed"
              ? "#fixed-vo2_target_ml_kg_min"
              : "#r-fixed-response-alpha",
          )!;
          const start = performance.now();
          field.value = String(
            provider === "prescribed" ? 5 + i * 0.03 : 0.2 + i * 0.005,
          );
          field.dispatchEvent(new Event("change", { bubbles: true }));
          await new Promise<void>((resolve, reject) => {
            const poll = () => {
              const state = document.querySelector<HTMLElement>(
                provider === "prescribed" ? "#explore" : "#resistance-panel",
              )!.dataset.pending;
              if (state === "error")
                reject(
                  new Error(
                    document.querySelector("#map-status")!.textContent ??
                      "map failed",
                  ),
                );
              else if (state === "false") resolve();
              else requestAnimationFrame(poll);
            };
            requestAnimationFrame(poll);
          });
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          const elapsed = performance.now() - start;
          const timings = window.parallelO2
            .timings()
            .filter(
              (t) =>
                t.operation ===
                (provider === "prescribed" ? "grid" : "resistance_grid"),
            );
          const latest = timings.at(-1)!;
          if (i >= 3) result.push({ ...latest, paintedMs: elapsed });
        }
        return result;
      }, provider);
      const p95 = (xs: number[]) =>
        [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * 0.95) - 1];
      const result = {
        provider,
        machine: {
          os: platform(),
          release: release(),
          architecture: arch(),
          cpu: cpus()[0].model,
          logicalCores: cpus().length,
          memoryBytes: totalmem(),
        },
        browser: browser.version(),
        coldInitializationAndFirstPlotMs: coldMs,
        transferredContentLengthBytes: transferred,
        samples,
        resolution: [201, 201],
        workerP95Ms: p95(samples.map((s) => s.workerMs)),
        paintedP95Ms: p95(samples.map((s) => s.paintedMs)),
        method:
          "3 warmups then 30 settled demand or response-alpha changes; worker includes JSON parsing, model and serialization; painted time waits two animation frames after atomic publication. Content-Length transfer accounting excludes HEAD responses and responses without that header.",
      };
      await info.attach("performance.json", {
        body: JSON.stringify(result, null, 2),
        contentType: "application/json",
      });
      expect(result.workerP95Ms).toBeLessThanOrEqual(500);
      expect(result.paintedP95Ms).toBeLessThanOrEqual(1500);
    },
  );
