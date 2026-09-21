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
    // Literal expectations from the modular resistance contract, not imported presets.
    const expected: Record<
      string,
      [string, number, number, string, number, number, string[], string]
    > = {
      R1: [
        "perturbation.rs_multiplier",
        0.5,
        1.25,
        "perturbation.rp_multiplier",
        0.1,
        1.5,
        ["sa_fraction", "relative_delivery_index_l_min_change"],
        "frozen_reference",
      ],
      R2: [
        "reference_native_fraction",
        0,
        1,
        "perturbation.rp_multiplier",
        0.1,
        1.5,
        ["relative_qp_l_min_change", "relative_delivery_index_l_min_change"],
        "matched_reference_family",
      ],
      R3: [
        "response.alpha",
        0,
        1,
        "response.nonlinear_fraction",
        0,
        1,
        [
          "relative_delivery_index_l_min_change",
          "relative_driving_pressure_mmhg_change",
        ],
        "frozen_reference",
      ],
      R4: [
        "current_rp_mmhg_min_l",
        1,
        40,
        "current_rshunt_nominal_mmhg_min_l",
        1,
        60,
        ["delivery_index_l_min", "relative_delivery_index_l_min_change"],
        "local_response",
      ],
      R5: [
        "oxygen.hb_g_dl",
        6,
        20,
        "perturbation.rs_multiplier",
        0.5,
        1.25,
        ["sa_fraction", "do2_ml_min"],
        "frozen_reference",
      ],
      R6: [
        "response.alpha",
        0,
        1,
        "response.nonlinear_fraction",
        0,
        1,
        ["closure_nominal_relative_change", "closure_secant_relative_change"],
        "frozen_reference",
      ],
    };
    const [xp, xmin, xmax, yp, ymin, ymax, metrics, policy] = expected[id];
    expect(s.scene).toMatchObject({
      x: { parameter: xp, min: xmin, max: xmax, n: 201, scale: "linear" },
      y: { parameter: yp, min: ymin, max: ymax, n: 201, scale: "linear" },
      metrics,
      policy,
    });
    expect(s.scene.request).toEqual({
      schema_version: "resistance-experiment-v1",
      flow_model_version: "resistance-parallel-steady-v1",
      reference: {
        rs_mmhg_min_l: 40,
        rp_mmhg_min_l: 12,
        rshunt_nominal_mmhg_min_l: 28,
        qt_l_min: 2,
        common_downstream_pressure_mmhg: 0,
      },
      response: {
        closure: "nominal_parallel",
        alpha: 0.35,
        nonlinear_fraction: 0.5,
      },
      perturbation: {
        scope: "native_rp",
        rs_multiplier: 1,
        rp_multiplier: ["R3", "R6"].includes(id) ? 0.55 : 1,
        rshunt_multiplier: 1,
      },
      oxygen:
        id === "R5"
          ? {
              mode: "physical",
              spv_fraction: 0.99,
              hb_g_dl: 12,
              kappa_ml_o2_g_hb: 1.34,
              vo2_ml_min: 30.552,
            }
          : {
              mode: "normalized_source",
              spv_fraction: 0.99,
              normalized_consumption_l_min: 0.19,
            },
    });
    await expect(
      page.getByLabel("Reference Qt (L blood/min)", { exact: true }),
    ).toHaveValue("2");
    const inputLabels = await page
      .locator("#resistance-panel label:has(input)")
      .allTextContents();
    expect(
      inputLabels.some((text) => /achieved|Qp\/Qs|total output/i.test(text)),
    ).toBe(false);
    await expect(page.locator("#r-values")).toContainText(
      "Operating shunt secant resistance",
    );
    await expect(page.locator("#r-values")).toContainText(
      "Operating shunt incremental resistance",
    );
    const components = await page
      .locator("#r-pressure .js-plotly-plot")
      .evaluate((node) =>
        (node as unknown as { data: { name: string }[] }).data.map(
          (t) => t.name,
        ),
      );
    expect(components).toEqual([
      "Systemic Rs Qs",
      "Native Rp Qp",
      "Linear shunt K₁ Qp",
      "Quadratic shunt K₂ Qp²",
    ]);
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
