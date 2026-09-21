import { test, expect } from "@playwright/test";
const ready = async (page: import("@playwright/test").Page) =>
  expect(page.locator("#resistance-panel")).toHaveAttribute(
    "data-pending",
    "false",
  );
test("six resistance scenes preserve policy, units and exact grid-point calculations", async ({
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
  await page.locator("#flow-provider").selectOption("resistance");
  await ready(page);
  for (const id of ["R1", "R2", "R3", "R4", "R5", "R6"]) {
    await page.locator("#r-scene").selectOption(id);
    await ready(page);
    const s = (await page.evaluate(() => window.parallelO2.snapshot())) as {
      generation: number;
      scene: { id: string; policy: string; request: Record<string, unknown> };
      grid: { shape: number[]; actual_resolution: number[] };
      point: {
        comparison: {
          a: { metrics: Record<string, number>; reference_sha256: string };
          b: { metrics: Record<string, number>; reference_sha256: string };
        };
      };
    };
    expect(s.scene.id).toBe(id);
    expect(s.grid.actual_resolution).toEqual([201, 201]);
    for (const target of ["r-left-map", "r-right-map", "r-inspector"])
      await expect(page.locator("#" + target)).toHaveAttribute(
        "data-generation",
        String(s.generation),
      );
    await expect(page.locator("#r-contract")).toContainText(s.scene.policy);
    for (const state of [s.point.comparison.a, s.point.comparison.b]) {
      const m = state.metrics;
      expect(m.systemic_pressure_drop_mmhg).toBeCloseTo(
        m.native_pulmonary_pressure_drop_mmhg +
          m.linear_shunt_pressure_drop_mmhg +
          m.quadratic_shunt_pressure_drop_mmhg,
        9,
      );
    }
    expect(s.point.comparison.a.reference_sha256).toBe(
      s.point.comparison.b.reference_sha256,
    );
    await expect(page.locator("#r-values")).not.toContainText("undefined");
    await page
      .locator("#resistance-panel")
      .screenshot({ path: info.outputPath(id + ".png") });
  }
  await page.locator("#flow-provider").selectOption("prescribed");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await expect(page.locator("#scene")).toHaveValue("E1");
  expect(errors).toEqual([]);
});

test("Hb sweep keeps circuit fixed, changes physical delivery and preserves prescribed uptake", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator("#flow-provider").selectOption("resistance");
  await ready(page);
  await page.locator("#r-scene").selectOption("R5");
  await ready(page);
  const records: Record<string, number>[] = [];
  for (const hb of [12, 14]) {
    await page.locator("#r-x").fill(String(hb));
    await page.locator("#r-y").fill("1");
    await page.locator("#r-select").click();
    await expect(page.locator("#r-point-status")).toContainText(
      `Selected x ${hb}, y 1.`,
    );
    const p = JSON.parse((await page.locator("#r-json").textContent())!);
    records.push(p.displayed_state.metrics);
  }
  for (const key of [
    "qp_l_min",
    "qs_l_min",
    "qt_l_min",
    "driving_pressure_mmhg",
  ])
    expect(records[0][key]).toBe(records[1][key]);
  expect(records[1].do2_ml_min).toBeGreaterThan(records[0].do2_ml_min);
  for (const m of records)
    expect(m.pulmonary_net_add_ml_min).toBeCloseTo(30.552, 10);
  await page.locator("#r-oxygen").selectOption("normalized_source");
  await ready(page);
  await expect(page.locator("#r-fixed-oxygen-hb_g_dl")).toHaveCount(0);
  await expect(
    page.locator('#r-left-metric option[value="do2_ml_min"]'),
  ).toHaveCount(0);
  await expect(page.locator("#r-contract")).toContainText("normalized_source");
});

test("nonlinear closure pressure limits remain distinct and mobile controls fit", async ({
  page,
}, info) => {
  await page.goto("./");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator("#flow-provider").selectOption("resistance");
  await ready(page);
  await page.locator("#r-scene").selectOption("R3");
  await ready(page);
  await expect(page.locator("#r-corners tr")).toHaveCount(4);
  await page.locator("#r-x").fill("1");
  await page.locator("#r-y").fill("0.5");
  await page.locator("#r-select").click();
  await expect(page.locator("#r-point-status")).toContainText(
    "Selected x 1, y 0.5.",
  );
  const p = JSON.parse((await page.locator("#r-json").textContent())!);
  expect(
    Math.abs(
      p.comparison.a.metrics.driving_pressure_mmhg -
        p.comparison.b.metrics.driving_pressure_mmhg,
    ),
  ).toBeGreaterThan(0.1);
  const secant = p.closure_comparisons.circuit_secant;
  expect(secant.b.metrics.driving_pressure_mmhg).toBeCloseTo(
    secant.a.metrics.driving_pressure_mmhg,
    10,
  );
  expect(secant.b.metrics.qt_l_min).toBeGreaterThan(secant.a.metrics.qt_l_min);
  await page.locator("#r-left-metric").selectOption("qt_l_min");
  await ready(page);
  await page.locator("#r-right-metric").selectOption("driving_pressure_mmhg");
  await ready(page);
  await expect(page.locator("#r-left-map > div")).toHaveAttribute(
    "data-scale",
    "[0,4]",
  );
  await expect(page.locator("#r-right-map > div")).toHaveAttribute(
    "data-scale",
    "[0,80]",
  );
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await ready(page);
    await expect
      .poll(() =>
        page
          .locator("#r-left-map > div")
          .evaluate(
            (node) =>
              node.getBoundingClientRect().width <=
              node.parentElement!.clientWidth + 1,
          ),
      )
      .toBe(true);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await ready(page);
    await page
      .locator("#r-left-map")
      .screenshot({ path: info.outputPath("map-" + width + ".png") });
    await page
      .locator("#r-pressure")
      .screenshot({ path: info.outputPath("pressure-" + width + ".png") });
  }
});
