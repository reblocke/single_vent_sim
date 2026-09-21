import { test, expect } from "@playwright/test";

test("forward and derived scenes publish paired plots with coherent numerical state", async ({
  page,
}, info) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  for (const scene of ["E1", "E2", "E3", "E4", "E5", "H1", "H2", "H3", "H4"]) {
    await page.locator("#scene").selectOption(scene);
    await expect(page.locator("#explore")).toHaveAttribute(
      "data-pending",
      "false",
    );
    const generation = await page
      .locator("#explore")
      .getAttribute("data-generation");
    for (const id of [
      "left-map",
      "right-map",
      "experiment-contract",
      "state-inspector",
    ])
      await expect(page.locator("#" + id)).toHaveAttribute(
        "data-generation",
        generation!,
      );
    const data = (await page.evaluate(() => window.parallelO2.snapshot())) as {
      scene: { id: string };
      grid: {
        actual_resolution: number[];
        shape: number[];
        masked_count: number;
      };
    };
    expect(data.scene.id).toBe(scene);
    expect(data.grid.actual_resolution).toEqual([201, 201]);
    expect(data.grid.shape).toEqual([201, 201]);
    await expect(page.locator("#left-map .heatmaplayer image")).toHaveCount(
      data.grid.masked_count ? 2 : 1,
    );
    await expect(page.locator("#right-map .heatmaplayer image")).toHaveCount(
      data.grid.masked_count ? 2 : 1,
    );
    await page.screenshot({
      path: info.outputPath(scene + ".png"),
      fullPage: true,
    });
  }
  expect(errors).toEqual([]);
});

test("constant uptake, strict Hb13 criterion and log-coordinate selection", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page
    .locator("#right-metric")
    .selectOption("pulmonary_net_add_ml_kg_min");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await expect(page.locator("#right-scale-note")).toContainText(
    "Constant under these constraints: 6",
  );
  await expect(page.locator("#right-map > div")).toHaveAttribute(
    "data-constant",
    "true",
  );
  await page.locator("#scene").selectOption("H2");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator("#select-x").fill("13");
  await page.locator("#select-y").fill("1");
  await page.locator("#select-state").click();
  await expect(page.locator("#state-criteria")).toContainText(
    "Sa: below; Sv: above",
  );
  await expect(page.locator("#boundary-inspector")).toContainText("13.326226");
  await page.getByText("Axes and ranges", { exact: true }).click();
  await page.locator("#y-scale").selectOption("log");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  const grid = await page.evaluate(
    () =>
      (
        window.parallelO2.snapshot() as {
          grid: { y: { coordinates: number[]; plot_coordinates: number[] } };
        }
      ).grid,
  );
  expect(grid.y.plot_coordinates[70]).toBeCloseTo(
    Math.log10(grid.y.coordinates[70]),
    12,
  );
  await page.locator("#state-navigation").focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#state-description")).toContainText("grid sample");
});

test("mode switches preserve selected flows and explicit basis conversion", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator("#select-x").fill("14");
  await page.locator("#select-y").fill("2");
  await page.locator("#select-state").click();
  await expect(page.locator("#state-description")).toContainText("14.000000");
  const before = JSON.parse(
    (await page.locator("#state-json").textContent()) ?? "{}",
  );
  await page.getByText("Parameterization and units", { exact: true }).click();
  await page.locator("#flow-mode").selectOption("independent_flows");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  const after = JSON.parse(
    (await page.locator("#state-json").textContent()) ?? "{}",
  );
  expect(after.metrics.qp_ml_kg_min).toBeCloseTo(
    before.metrics.qp_ml_kg_min,
    10,
  );
  expect(after.metrics.qs_ml_kg_min).toBeCloseTo(
    before.metrics.qs_ml_kg_min,
    10,
  );
  await page.locator("#mass-kg").fill("4");
  await page.locator("#bsa-m2").fill("0.25");
  await page.locator("#convert-basis").click();
  await expect(page.locator("#basis-note")).toHaveText("Native per-m² inputs");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  const indexed = JSON.parse(
    (await page.locator("#state-json").textContent()) ?? "{}",
  );
  expect(indexed.metrics.sa_fraction).toBeCloseTo(
    before.metrics.sa_fraction,
    10,
  );
  expect(indexed.metrics.do2_ml_min_m2).toBeCloseTo(
    before.metrics.do2_ml_kg_min * 16,
    8,
  );
  await page.locator("#capacity-mode").selectOption("direct_capacity");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  expect(await page.locator("#x-parameter").inputValue()).not.toBe(
    "capacity.hb_g_dl",
  );
  expect(await page.locator("#y-parameter").inputValue()).not.toBe(
    "capacity.hb_g_dl",
  );
});

test("desktop tablet and phone maps keep readable layouts and all numeric controls", async ({
  page,
}, info) => {
  await page.goto("./");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  for (const [width, height] of [
    [1440, 1000],
    [1024, 768],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    await expect(page.locator("#explore")).toHaveAttribute(
      "data-pending",
      "false",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const side of ["left", "right"]) {
      const outer = await page.locator(`#${side}-map`).boundingBox();
      const inner = await page
        .locator(`#${side}-map .svg-container`)
        .boundingBox();
      expect(inner!.width).toBeLessThanOrEqual(outer!.width + 1);
    }
    await page.screenshot({
      path: info.outputPath(`viewport-${width}.png`),
      fullPage: true,
    });
  }
});

test("zero-demand undefined index and all-infeasible maps have explicit displays", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator("#fixed-vo2_target_ml_kg_min").fill("0");
  await page.locator("#fixed-vo2_target_ml_kg_min").dispatchEvent("change");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator("#right-metric").selectOption("omega");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await expect(page.locator("#right-scale-note")).toContainText(
    "No defined values",
  );
  let state = JSON.parse(
    (await page.locator("#state-json").textContent()) ?? "{}",
  );
  expect(state.metrics.omega).toBeNull();
  expect(state.metrics.oer_fraction).toBe(0);
  await page.locator("#fixed-vo2_target_ml_kg_min").fill("1000000");
  await page.locator("#fixed-vo2_target_ml_kg_min").dispatchEvent("change");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await expect(page.locator("#state-status")).toContainText(
    "No nonnegative-venous-content steady state",
  );
  state = JSON.parse((await page.locator("#state-json").textContent()) ?? "{}");
  expect(state.metrics.sa_fraction).toBeNull();
  expect(state.metrics.sv_fraction).toBeNull();
});

test("rapid edits and invalid axes never show old plots under changed controls", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.evaluate(() => {
    const field = document.querySelector<HTMLInputElement>(
      "#fixed-vo2_target_ml_kg_min",
    )!;
    for (let i = 0; i < 20; i++) {
      field.value = String(6 + i * 0.1);
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  const state = JSON.parse(
    (await page.locator("#state-json").textContent()) ?? "{}",
  );
  expect(state.requested.vo2_target_ml_kg_min).toBeCloseTo(7.9, 12);
  await page.getByText("Axes and ranges", { exact: true }).click();
  await page.locator("#y-parameter").selectOption("capacity.hb_g_dl");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "error",
  );
  await expect(page.locator("#left-map")).toBeHidden();
  await expect(page.locator("#right-map")).toBeHidden();
  await expect(page.locator("#pin-a")).toBeDisabled();
  await page.locator("#reset-map").click();
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await expect(page.locator("#left-map")).toBeVisible();
});
