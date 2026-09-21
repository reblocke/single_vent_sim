import { test, expect } from "@playwright/test";
const expectedScenes: Record<
  string,
  {
    axes: string[];
    ranges: number[][];
    metrics: string[];
    independent: boolean;
    area: boolean;
  }
> = {
  E1: {
    axes: ["capacity.hb_g_dl", "flow.r"],
    ranges: [
      [6, 20],
      [0.2, 4],
    ],
    metrics: ["sa_fraction", "do2_ml_kg_min"],
    independent: false,
    area: false,
  },
  E2: {
    axes: ["flow.r", "flow.qt_ml_kg_min"],
    ranges: [
      [0.2, 4],
      [150, 600],
    ],
    metrics: ["sa_fraction", "do2_ml_kg_min"],
    independent: false,
    area: false,
  },
  E3: {
    axes: ["flow.qp_ml_kg_min", "flow.qs_ml_kg_min"],
    ranges: [
      [50, 400],
      [50, 400],
    ],
    metrics: ["sa_fraction", "do2_ml_kg_min"],
    independent: true,
    area: false,
  },
  E4: {
    axes: ["capacity.hb_g_dl", "vo2_target_ml_kg_min"],
    ranges: [
      [6, 20],
      [2, 18],
    ],
    metrics: ["sa_fraction", "oer_fraction"],
    independent: true,
    area: false,
  },
  E5: {
    axes: ["capacity.hb_g_dl", "spv_fraction"],
    ranges: [
      [6, 20],
      [0.8, 1],
    ],
    metrics: ["ca_ml_dl", "do2_ml_kg_min"],
    independent: true,
    area: false,
  },
  H1: {
    axes: ["capacity.hb_g_dl", "flow.qt_l_min_m2"],
    ranges: [
      [6, 20],
      [2, 12],
    ],
    metrics: ["sa_fraction", "sv_fraction"],
    independent: false,
    area: true,
  },
  H2: {
    axes: ["capacity.hb_g_dl", "flow.r"],
    ranges: [
      [6, 20],
      [0.2, 4],
    ],
    metrics: ["sa_fraction", "sv_fraction"],
    independent: false,
    area: true,
  },
  H3: {
    axes: ["flow.r", "flow.qt_l_min_m2"],
    ranges: [
      [0.2, 4],
      [2, 12],
    ],
    metrics: ["joint_hb_g_dl", "binding_code"],
    independent: false,
    area: true,
  },
  H4: {
    axes: ["capacity.hb_g_dl", "delta_hb_g_dl"],
    ranges: [
      [6, 20],
      [0.1, 4],
    ],
    metrics: ["delta_sa_fraction", "delta_do2_ml_min_m2"],
    independent: false,
    area: true,
  },
};

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
    const complete = data.scene as unknown as {
      base: Record<string, unknown>;
      x: { parameter: string; min: number; max: number };
      y: { parameter: string; min: number; max: number };
      metrics: string[];
    };
    const declared = expectedScenes[scene];
    expect([complete.x.parameter, complete.y.parameter]).toEqual(declared.axes);
    expect([
      [complete.x.min, complete.x.max],
      [complete.y.min, complete.y.max],
    ]).toEqual(declared.ranges);
    expect(complete.metrics).toEqual(declared.metrics);
    expect(complete.base).toEqual({
      schema_version: "scenario-v2",
      model_version: "barnea-parallel-bound-o2-v1",
      indexing_basis: declared.area ? "per_m2" : "per_kg",
      flow: declared.area
        ? { mode: "total_ratio", qt_l_min_m2: 6, r: 1 }
        : declared.independent
          ? { mode: "independent_flows", qp_ml_kg_min: 200, qs_ml_kg_min: 200 }
          : { mode: "total_ratio", qt_ml_kg_min: 400, r: 1 },
      capacity: {
        mode: "hb_linear",
        hb_g_dl: declared.area ? 14 : 10,
        kappa_ml_o2_g_hb: 1.34,
      },
      spv_fraction: 0.98,
      ...(declared.area
        ? { vo2_target_ml_min_m2: 150 }
        : { vo2_target_ml_kg_min: 6 }),
      source_context: declared.area
        ? "ahmed-inspired-abstract-supported"
        : "synthetic",
    });
    await expect(page.locator("#experiment-contract")).toContainText(
      "Held fixed across this map",
    );
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
  await page
    .locator("#prescribed-explorer")
    .getByText("Axes and ranges", { exact: true })
    .click();
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
  await page
    .locator("#prescribed-explorer")
    .getByText("Axes and ranges", { exact: true })
    .click();
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

test("objective overlays and exact slices retain their fixed-input meaning", async ({
  page,
}, info) => {
  await page.goto("./");
  const ready = () =>
    expect(page.locator("#explore")).toHaveAttribute("data-pending", "false");
  await ready();
  await page.locator("#scene").selectOption("E2");
  await ready();
  await page.locator("#overlay-do2_peak").check();
  await ready();
  await page.locator("#overlay-sv_peak").check();
  await ready();
  await expect(page.locator("#constraint-caption")).toContainText(
    "fixed total output",
  );
  for (const map of ["left-map", "right-map"]) {
    await expect(page.locator(`#${map} .scatterlayer`)).toContainText(
      "DO₂ peak",
    );
    await expect(page.locator(`#${map} .scatterlayer`)).toContainText("Sv max");
  }
  const snapshot = (await page.evaluate(() =>
    window.parallelO2.snapshot(),
  )) as { scene: { x: { parameter: string }; y: { parameter: string } } };
  await page
    .locator("#slice-axis")
    .selectOption(snapshot.scene.x.parameter === "flow.r" ? "x" : "y");
  await page.locator("#slice-objectives").check();
  await page.locator("#show-slice").click();
  await expect(page.locator("#slice-plots")).toBeVisible();
  await expect(
    page.locator("#slice-plots .scatterlayer path.js-line"),
  ).toHaveCount(2);
  await expect(page.locator("#slice-status")).toContainText("Held fixed:");
  const slice = JSON.parse((await page.locator("#slice-json").textContent())!);
  expect(slice.axis.parameter).toBe("flow.r");
  expect(Object.keys(slice.metrics)).toEqual(
    expect.arrayContaining(["do2_ml_kg_min", "sv_fraction"]),
  );
  const expected = await page.evaluate(
    async (request) => window.parallelO2.compute("slice", request),
    slice.requested,
  );
  expect(slice).toEqual(expected);
  await page
    .locator("#slice-plots")
    .screenshot({ path: info.outputPath("objective-slice.png") });
  await page.locator("#scene").selectOption("E3");
  await ready();
  await expect(page.locator("#slice-plots")).toBeHidden();
  await page.locator("#overlay-iso_ratio").check();
  await ready();
  await page.locator("#overlay-iso_total").check();
  await ready();
  await expect(page.locator("#constraint-caption")).toContainText(
    "Qt = Qp + Qs",
  );
  await expect(page.locator("#constraint-caption")).toContainText(
    "Qp/Qs = 0.5",
  );
  await page
    .locator("#left-map")
    .screenshot({ path: info.outputPath("flow-constraints.png") });
});

test("linked map hover and pins preserve asymmetric physical coordinates", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.evaluate(() => {
    window.addEventListener("parallel-o2-pins", (event) =>
      Object.assign(window, { lastPins: (event as CustomEvent).detail }),
    );
  });
  await page.locator("#left-map").scrollIntoViewIfNeeded();
  const point = await page.locator("#left-map > div").evaluate((node) => {
    const plot = node as HTMLElement & {
      _fullLayout: {
        xaxis: { l2p: (n: number) => number; _offset: number };
        yaxis: { l2p: (n: number) => number; _offset: number };
      };
    };
    const grid = (
      window.parallelO2.snapshot() as {
        grid: { x: { coordinates: number[] }; y: { coordinates: number[] } };
      }
    ).grid;
    const x = grid.x.coordinates[71],
      y = grid.y.coordinates[47];
    const rect = node.getBoundingClientRect(),
      l = plot._fullLayout;
    return {
      x,
      y,
      px: rect.x + l.xaxis._offset + l.xaxis.l2p(x),
      py: rect.y + l.yaxis._offset + l.yaxis.l2p(y),
    };
  });
  await page.mouse.move(point.px, point.py);
  await expect(page.locator("#linked-coordinate")).toContainText(
    "Linked physical coordinate:",
  );
  // A grid cell is only about one screen pixel wide. Browser pointer rounding
  // may select an adjacent cell; both plots and the pin must use that exact cell.
  const selected = (await page
    .locator("#linked-coordinate")
    .textContent())!.match(/x (\d+(?:\.\d+)?), y (\d+(?:\.\d+)?)/)!;
  expect(Math.abs(Number(selected[1]) - point.x)).toBeLessThan(0.141);
  expect(Math.abs(Number(selected[2]) - point.y)).toBeLessThan(0.039);
  point.x = Number(selected[1]);
  point.y = Number(selected[2]);
  for (const side of ["left", "right"]) {
    const shapes = await page.locator(`#${side}-map > div`).evaluate(
      (node) =>
        (
          node as HTMLElement & {
            layout: { shapes: { x0: number; y0: number }[] };
          }
        ).layout.shapes,
    );
    expect(shapes[0].x0).toBeCloseTo(point.x, 10);
    expect(shapes[1].y0).toBeCloseTo(point.y, 10);
  }
  await page.mouse.click(point.px, point.py);
  await expect(page.locator("#pin-status")).toContainText("Pinned A");
  await page.locator("#select-x").fill("17.25");
  await page.locator("#select-y").fill("0.83");
  await page.locator("#select-state").click();
  await expect(page.locator("#state-description")).toContainText("17.250000");
  await page.locator("#pin-b").click();
  const pins = await page.evaluate(
    () =>
      (
        window as unknown as {
          lastPins: {
            a: { capacity: { hb_g_dl: number }; flow: { r: number } };
            b: { capacity: { hb_g_dl: number }; flow: { r: number } };
          };
        }
      ).lastPins,
  );
  expect(pins.a.capacity.hb_g_dl).toBeCloseTo(point.x, 10);
  expect(pins.a.flow.r).toBeCloseTo(point.y, 10);
  expect(pins.b.capacity.hb_g_dl).toBe(17.25);
  expect(pins.b.flow.r).toBe(0.83);
});

test("criteria alter classification provenance while core transport stays fixed", async ({
  page,
}) => {
  await page.goto("./");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator("#scene").selectOption("H2");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  const before = (await page.evaluate(() => window.parallelO2.snapshot())) as {
    grid: { metrics: unknown };
  };
  await page.locator("#criterion-sa").evaluate((node) => {
    (node as HTMLInputElement).value = "80";
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  const after = (await page.evaluate(() => window.parallelO2.snapshot())) as {
    criteria: Record<string, unknown>;
    grid: { metrics: unknown };
  };
  expect(after.grid.metrics).toEqual(before.grid.metrics);
  expect(after.criteria.origin).toBe("user_selected");
  expect(after.criteria).not.toHaveProperty("source_id");
  expect(after.criteria.sa_lower_fraction).toBe(0.8);
  await expect(page.locator("#source-note")).toContainText(
    "full-text settings unverified",
  );
});
