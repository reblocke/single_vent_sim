import { test, expect, type Page } from "@playwright/test";
const ready = (page: Page, id = "explore") =>
  expect(page.locator("#" + id)).toHaveAttribute("data-pending", "false");
test("E3 invariance and Hb derived boundaries preserve distinct meanings", async ({
  page,
}) => {
  await page.goto("./?presentation=map");
  await ready(page);
  const pinDisabled = await page.evaluate(() => {
    (document.getElementById("select-x") as HTMLInputElement).value = "12";
    document.getElementById("select-state")!.click();
    return (document.getElementById("pin-a") as HTMLButtonElement).disabled;
  });
  expect(pinDisabled).toBe(true);
  await expect(page.locator("#pin-a")).toBeEnabled();
  await page.locator("#scene").selectOption("E3");
  await ready(page);
  const invariant = await page.evaluate(() => {
    const { grid } = window.parallelO2.snapshot() as {
      grid: { metrics: Record<string, (number | null)[][]> };
    };
    let checked = 0,
      maxError = 0;
    for (let x = 0; x < 201; x++) {
      const values = grid.metrics.sa_fraction
        .map((row) => row[x])
        .filter((v) => v !== null);
      for (const value of values) {
        maxError = Math.max(maxError, Math.abs(value - values[0]!));
        checked++;
      }
    }
    return { checked, maxError };
  });
  expect(invariant.checked).toBeGreaterThan(10000);
  expect(invariant.maxError).toBeLessThan(1e-14);
  await page.locator("#scene").selectOption("H3");
  await ready(page);
  let s = (await page.evaluate(() => window.parallelO2.snapshot())) as {
    grid: {
      status: string[][];
      baseline_hb_constraint: unknown;
      metrics: Record<string, (number | null)[][]>;
    };
  };
  expect(s.grid.baseline_hb_constraint).toBeNull();
  expect(s.grid.status.flat()).toContain("outside_display_range");
  expect(s.grid.status.flat()).toContain("finite");
  await page
    .locator("#prescribed-explorer")
    .getByText("Compare with chosen criteria", { exact: true })
    .click();
  await page.locator("#criterion-sa").fill("99");
  await page.locator("#criterion-sa").press("Tab");
  await ready(page);
  s = (await page.evaluate(() => window.parallelO2.snapshot())) as typeof s;
  expect(new Set(s.grid.status.flat())).toEqual(
    new Set(["no_finite_solution"]),
  );
  await page.locator("#scene").selectOption("H4");
  await ready(page);
  const gains = await page.evaluate(() => {
    const s = window.parallelO2.snapshot() as {
      grid: { metrics: Record<string, (number | null)[][]> };
    };
    return s.grid.metrics;
  });
  const sat = gains.delta_sa_fraction[50].filter((v) => v !== null),
    delivery = gains.delta_do2_ml_min_m2[50].filter((v) => v !== null);
  for (let i = 1; i < sat.length; i++) expect(sat[i]).toBeLessThan(sat[i - 1]!);
  expect(
    Math.max(...(delivery as number[])) - Math.min(...(delivery as number[])),
  ).toBeLessThan(1e-9);
});

test("masked resistance oxygen preserves circuit outputs and model residual audit", async ({
  page,
}) => {
  await page.goto("./?presentation=map");
  await ready(page);
  await page.locator("#flow-provider").selectOption("resistance");
  await ready(page, "resistance-panel");
  await page.locator("#r-fixed-oxygen-normalized_consumption_l_min").fill("2");
  const comparisonDisabled = await page.evaluate(() => {
    document.getElementById("r-select")!.click();
    return (document.getElementById("r-compare-pair") as HTMLButtonElement)
      .disabled;
  });
  expect(comparisonDisabled).toBe(true);
  await expect(page.locator("#r-compare-pair")).toBeEnabled();
  await page
    .locator("#r-fixed-oxygen-normalized_consumption_l_min")
    .press("Tab");
  await ready(page, "resistance-panel");
  const point = JSON.parse(
    (await page.locator("#r-json").textContent())!,
  ).displayed_state;
  expect(point.hemodynamic_status).toBe("solved");
  expect(point.oxygen_status).toBe("infeasible_requested_consumption");
  expect(point.metrics.sa_fraction).toBeNull();
  expect(point.metrics.qp_l_min).toBeGreaterThan(0);
  expect(point.metrics.driving_pressure_mmhg).toBeGreaterThan(0);
  await expect(page.locator("#r-pressure .js-plotly-plot")).toBeVisible();
  await page.locator('[data-view="model"]').click();
  await ready(page, "model");
  const audit = JSON.parse((await page.locator("#model-audit").textContent())!);
  expect(audit[0].oxygen_status).toBe("infeasible_requested_consumption");
  expect(audit[0].residuals).toEqual(point.residuals);
  await expect(page.locator("#model")).toContainText(
    "not establish clinical validity",
  );
  await expect(page.locator("#model-verification")).toContainText(
    "Recorded application gates",
  );
});

test("touch and keyboard alternatives reach both providers and wide tables", async ({
  browser,
}, info) => {
  const context = await browser.newContext({
    baseURL: info.project.use.baseURL,
    hasTouch: true,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.goto("./?presentation=map");
  await ready(page);
  await page.locator("#left-map .nsewdrag").tap();
  await expect(page.locator("#pin-status")).toContainText("Pinned A");
  await page.locator("#state-navigation").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#state-description")).toContainText(
    "Exactly reevaluated grid sample",
  );
  await page.locator("#flow-provider").selectOption("resistance");
  await ready(page, "resistance-panel");
  await page.locator("#r-left-map .nsewdrag").tap();
  await expect(page.locator("#r-point-status")).toContainText("Selected x");
  await page.locator("#r-x").fill(".8");
  await page.locator("#r-y").fill(".55");
  await page.locator("#r-select").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#r-point-status")).toContainText(
    "Selected x 0.8, y 0.55",
  );
  const table = page.locator("#r-inspector .table-scroll");
  await expect(table).toHaveAttribute("tabindex", "0");
  await table.focus();
  await expect(table).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("touch-resistance.png"),
    fullPage: true,
  });
  await page.locator('[data-view="model"]').click();
  await ready(page, "model");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("model-phone.png"),
    fullPage: true,
  });
  await context.close();
});

test("200 actual UI updates retain one coherent generation and bounded worker objects", async ({
  page,
}, info) => {
  test.setTimeout(600000);
  await page.goto("./?presentation=map");
  await ready(page);
  const before = (await page.evaluate(() =>
    window.parallelO2.compute("diagnostics", {}),
  )) as { tracked_python_objects: number };
  const reports = [];
  for (const provider of ["prescribed", "resistance"]) {
    await page.locator("#flow-provider").selectOption(provider);
    await ready(
      page,
      provider === "prescribed" ? "explore" : "resistance-panel",
    );
    reports.push(
      await page.evaluate(async (provider) => {
        const panel = document.getElementById(
          provider === "prescribed" ? "explore" : "resistance-panel",
        )!;
        const input = document.getElementById(
          provider === "prescribed"
            ? "fixed-vo2_target_ml_kg_min"
            : "r-fixed-response-alpha",
        ) as HTMLInputElement;
        const start = performance.now();
        const first = Number(panel.dataset.generation);
        for (let i = 0; i < 100; i++) {
          input.value = String(
            provider === "prescribed" ? 5 + i * 0.01 : 0.2 + i * 0.002,
          );
          input.dispatchEvent(new Event("change", { bubbles: true }));
          await new Promise<void>((resolve, reject) => {
            const check = () => {
              if (panel.dataset.pending === "false") resolve();
              else if (panel.dataset.pending === "error")
                reject(new Error("UI update failed"));
              else requestAnimationFrame(check);
            };
            requestAnimationFrame(check);
          });
        }
        return {
          provider,
          updates: 100,
          elapsedMs: performance.now() - start,
          first,
          last: Number(panel.dataset.generation),
          plotNodes: panel.querySelectorAll(".js-plotly-plot").length,
        };
      }, provider),
    );
  }
  const after = (await page.evaluate(() =>
    window.parallelO2.compute("diagnostics", {}),
  )) as typeof before;
  for (const report of reports) {
    // Initial responsive layout can legitimately schedule an extra redraw.
    expect(report.last - report.first).toBeGreaterThanOrEqual(100);
    expect(report.last - report.first).toBeLessThanOrEqual(102);
    expect(report.plotNodes).toBeLessThanOrEqual(5);
  }
  expect(
    after.tracked_python_objects - before.tracked_python_objects,
  ).toBeLessThan(1000);
  await info.attach("ui-stress.json", {
    body: JSON.stringify({ before, after, reports }, null, 2),
    contentType: "application/json",
  });
});

test("rendered masks and separate criterion contours match unrounded engine matrices", async ({
  page,
}) => {
  await page.goto("./?presentation=map");
  await ready(page);
  await page.locator("#scene").selectOption("H2");
  await ready(page);
  const evidence = await page.evaluate(() => {
    type Trace = {
      type: string;
      name?: string;
      z?: (number | null)[][];
      connectgaps?: boolean;
      contours?: { start: number };
    };
    const grid = (
      window.parallelO2.snapshot() as {
        grid: { metrics: Record<string, (number | null)[][]> };
      }
    ).grid;
    const traces = (
      document.querySelector("#left-map .js-plotly-plot") as unknown as {
        data: Trace[];
      }
    ).data;
    const heat = traces[1].z!,
      mask = traces[0].z!;
    let checked = 0,
      mismatches = 0,
      masked = 0;
    for (let y = 0; y < heat.length; y++)
      for (let x = 0; x < heat[y].length; x++) {
        const v = grid.metrics.sa_fraction[y][x];
        checked++;
        if (v === null) {
          masked++;
          if (heat[y][x] !== null || mask[y][x] !== 1) mismatches++;
        } else if (
          heat[y][x] === null ||
          Math.abs(heat[y][x]! - 100 * v) > 1e-12
        )
          mismatches++;
      }
    const contours = traces.filter(
      (t) => t.type === "contour" && t.name !== "Cv = 0 admissibility boundary",
    );
    let invalidContour = 0;
    for (const t of contours) {
      const key = t.name?.includes("Venous") ? "sv_fraction" : "sa_fraction";
      for (let y = 0; y < t.z!.length; y++)
        for (let x = 0; x < t.z![y].length; x++)
          if (t.z![y][x] !== null) {
            for (let dy = -1; dy <= 1; dy++)
              for (let dx = -1; dx <= 1; dx++)
                if (grid.metrics[key][y + dy]?.[x + dx] === null)
                  invalidContour++;
          }
    }
    return {
      checked,
      mismatches,
      masked,
      invalidContour,
      levels: contours.map((t) => t.contours?.start),
      gaps: contours.map((t) => t.connectgaps),
    };
  });
  expect(evidence.checked).toBe(40401);
  expect(evidence.masked).toBeGreaterThan(0);
  expect(evidence.mismatches).toBe(0);
  expect(evidence.invalidContour).toBe(0);
  expect(evidence.levels).toEqual([70, 40]);
  expect(evidence.gaps).toEqual([false, false]);
});
