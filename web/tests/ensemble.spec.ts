import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const begin = async (page: import("@playwright/test").Page) => {
  await page.goto("./?presentation=map");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator('[data-view="laboratory"]').click();
  await expect(page.locator("#laboratory")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator("#lab-source").selectOption("savorgnan");
  await expect(page.locator("#laboratory")).toHaveAttribute(
    "data-pending",
    "false",
  );
};
const complete = (page: import("@playwright/test").Page) =>
  expect(page.locator("#ensemble")).toHaveAttribute("data-state", "complete", {
    timeout: 120000,
  });

test("paired ensemble exports every draw and pair, reconciles counts and replays exactly", async ({
  page,
}, info) => {
  await begin(page);
  await expect(page.locator("#ensemble-n")).toHaveValue("20000");
  await page.locator("#ensemble-n").fill("257");
  await page.locator("#ensemble-run").click();
  await complete(page);
  const first = JSON.parse(
    (await page.locator("#ensemble-json").textContent())!,
  );
  expect(first.paired_evaluations).toBe(5140);
  expect(first.summaries).toHaveLength(20);
  expect(first.baseline_saturation_range.sa[0]).toBeLessThan(0.8);
  expect(first.baseline_saturation_range.sa[1]).toBeGreaterThan(0.8);
  for (const s of first.summaries) {
    expect(
      s.n_eligible +
        s.n_oxygen_infeasible +
        s.n_invalid_input +
        s.n_numerical_failure,
    ).toBe(257);
    expect(s.quantiles_delta_percent.p025).toBeLessThanOrEqual(
      s.quantiles_delta_percent.p50,
    );
    expect(s.quantiles_delta_percent.p50).toBeLessThanOrEqual(
      s.quantiles_delta_percent.p975,
    );
  }
  const contents: Record<string, Buffer> = {};
  for (const kind of ["draws", "pairs", "manifest"]) {
    const download = page.waitForEvent("download");
    await page.locator("#ensemble-" + kind).click();
    const file = await download;
    const path = info.outputPath(file.suggestedFilename());
    await file.saveAs(path);
    contents[kind] = await readFile(path);
  }
  const manifest = JSON.parse(contents.manifest.toString());
  expect(createHash("sha256").update(contents.draws).digest("hex")).toBe(
    manifest.files["ensemble-draws.csv"].sha256,
  );
  expect(createHash("sha256").update(contents.pairs).digest("hex")).toBe(
    manifest.files["ensemble-paired-results.csv"].sha256,
  );
  expect(contents.pairs.toString().trim().split("\n")).toHaveLength(5141);
  await page.locator("#ensemble-replay").setInputFiles({
    name: "draws.csv",
    mimeType: "text/csv",
    buffer: contents.draws,
  });
  await complete(page);
  const replay = JSON.parse(
    (await page.locator("#ensemble-json").textContent())!,
  );
  expect(replay.replay).toBe(true);
  expect(replay.seed).toBeNull();
  expect(replay.draw_sha256).toBe(first.draw_sha256);
  expect(replay.summaries).toEqual(first.summaries);
  expect(replay.files["ensemble-paired-results.csv"].sha256).toBe(
    first.files["ensemble-paired-results.csv"].sha256,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator("#ensemble")
    .screenshot({ path: info.outputPath("ensemble-phone.png") });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
});

test("cancellation and view changes stop old generations; malformed replay is visible", async ({
  page,
}) => {
  await begin(page);
  await page.locator("#ensemble-n").fill("100000");
  await page.locator("#ensemble-run").click();
  await expect(page.locator("#ensemble-cancel")).toBeEnabled();
  await page.locator("#ensemble-cancel").click();
  await expect(page.locator("#ensemble")).toHaveAttribute(
    "data-state",
    "cancelled",
  );
  await expect(page.locator("#ensemble-result")).toBeHidden();
  await expect(page.locator("#ensemble-draws")).toBeDisabled();
  await page.locator("#ensemble-n").fill("17");
  await page.locator("#ensemble-run").click();
  await complete(page);
  expect(
    JSON.parse((await page.locator("#ensemble-json").textContent())!)
      .n_requested,
  ).toBe(17);
  await page.locator("#ensemble-replay").setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("draw_id,nope\n0,1\n"),
  });
  await expect(page.locator("#ensemble")).toHaveAttribute(
    "data-state",
    "error",
  );
  await expect(page.locator("#ensemble-status")).toContainText("column header");
  await expect(page.locator("#ensemble-result")).toBeHidden();
  await page.locator("#ensemble-n").fill("100000");
  await page.locator("#ensemble-run").click();
  await page.locator('[data-view="compare"]').click();
  await expect(page.locator("#compare")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator('[data-view="laboratory"]').click();
  await expect(page.locator("#laboratory")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await expect(page.locator("#ensemble-status")).toContainText("Cancelled");
  await expect(page.locator("#ensemble-result")).toBeHidden();
});

test("default 20000-draw browser ensemble completes all 400000 pairs and prepares matching exports", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  await begin(page);
  const started = performance.now();
  await page.locator("#ensemble-run").click();
  await complete(page);
  const result = JSON.parse(
    (await page.locator("#ensemble-json").textContent())!,
  );
  expect(result.n_requested).toBe(20000);
  expect(result.paired_evaluations).toBe(400000);
  expect(
    result.summaries.every(
      (s: { n_requested: number }) => s.n_requested === 20000,
    ),
  ).toBe(true);
  expect(result.files["ensemble-paired-results.csv"].bytes).toBeGreaterThan(
    10000000,
  );
  expect(result.files["ensemble-draws.csv"].sha256).toBe(result.draw_sha256);
  await info.attach("ensemble-performance.json", {
    body: JSON.stringify({
      browser: browser.version(),
      draws: 20000,
      pairs: 400000,
      runAndPrepareExportsMs: performance.now() - started,
      files: result.files,
      engine_sha256: result.engine_sha256,
    }),
    contentType: "application/json",
  });
});

test("maximum supported draw count stays bounded and rejects duplicate step cursors", async ({
  page,
}) => {
  test.setTimeout(180000);
  await begin(page);
  const result = await page.evaluate(async () => {
    const start = (await window.parallelO2.compute("ensemble", {
      action: "start",
      n: 100000,
      seed: 5,
    })) as { token: number };
    for (let offset = 0; offset < 100000; offset += 1000)
      await window.parallelO2.compute("ensemble", {
        action: "step",
        token: start.token,
        start: offset,
      });
    const report = (await window.parallelO2.compute("ensemble", {
      action: "report",
      token: start.token,
    })) as { n_requested: number; paired_evaluations: number };
    let rejected = false;
    try {
      await window.parallelO2.compute("ensemble", {
        action: "step",
        token: start.token,
        start: 0,
      });
    } catch {
      rejected = true;
    }
    await window.parallelO2.compute("ensemble", {
      action: "cancel",
      token: start.token,
    });
    return { report, rejected };
  });
  expect(result.report.paired_evaluations).toBe(2000000);
  expect(result.rejected).toBe(true);
});
