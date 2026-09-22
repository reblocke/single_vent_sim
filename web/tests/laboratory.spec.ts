import { test, expect } from "@playwright/test";
const ready = (page: import("@playwright/test").Page) =>
  expect(page.locator("#laboratory")).toHaveAttribute("data-pending", "false");
test("source workbenches retain parameter order, conventions and unresolved evidence", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await page.goto("./?presentation=map");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator('[data-view="laboratory"]').click();
  await ready(page);
  for (const convention of ["P-stated-capacity", "P-formula-capacity"]) {
    await page.locator("#lab-capacity").selectOption(convention);
    await ready(page);
    for (const figure of ["2", "3", "4", "5A", "6", "7"]) {
      await page.locator("#lab-figure").selectOption(figure);
      await ready(page);
      const result = JSON.parse(
        (await page.locator("#lab-json").textContent())!,
      );
      expect(result.data.figure).toBe(figure);
      expect(result.data.capacity_convention).toBe(convention);
      expect(result.data.parameter_order).toBe(
        "increasing_r_never_sorted_by_result_coordinate",
      );
      expect(result.data.curves[0].r[0]).toBe(0.2);
      expect(result.data.curves[0].r.at(-1)).toBe(10);
      await expect(page.locator("#lab-plots .js-plotly-plot")).toHaveCount(1);
      await expect(page.locator("#lab-contract")).toContainText(
        "increasing parameter order",
      );
      if (["6", "7"].includes(figure))
        await expect(page.locator("#lab-contract")).toContainText(
          "definitional",
        );
    }
  }
  await page.locator("#lab-raw").check();
  await ready(page);
  await expect(page.locator("#lab-contract")).toContainText(
    "dotted algebraic audits",
  );
  await page.locator("#lab-source").selectOption("inverse");
  await ready(page);
  await expect(page.locator("#lab-plots .js-plotly-plot")).toHaveCount(4);
  await expect(page.locator("#lab-contract")).toContainText(
    "estimated ratio denominator",
  );
  await page.locator("#lab-source").selectOption("ahmed");
  await ready(page);
  await expect(
    page.getByRole("button", { name: "Exact Ahmed reproduction unavailable" }),
  ).toBeDisabled();
  await expect(page.locator("#lab-contract")).toContainText("Spv=.98, κ=1.34");
  const ahmed = JSON.parse((await page.locator("#lab-json").textContent())!);
  expect(ahmed.examples[1].state.metrics.sa_fraction).toBeLessThan(0.7);
  expect(ahmed.examples[1].state.metrics.sv_fraction).toBeGreaterThan(0.4);
  await page.locator("#lab-source").selectOption("savorgnan");
  await ready(page);
  const sav = JSON.parse((await page.locator("#lab-json").textContent())!);
  const nominal = sav.tables.table3.filter(
    (r: { closure: string }) => r.closure === "nominal_parallel",
  );
  expect(nominal).toHaveLength(25);
  expect(
    nominal.every(
      (r: { comparison_status: string }) =>
        r.comparison_status === "within_reported_rounding",
    ),
  ).toBe(true);
  for (let i = 1; i <= 9; i++)
    await expect(
      page
        .locator("#lab-source-records summary")
        .filter({ hasText: "SD0" + i }),
    ).toBeVisible();
  expect(sav.ablations).toHaveLength(10);
  await page.locator("#lab-source").selectOption("barnea");
  await ready(page);
  await page.locator("#lab-figure").selectOption("3");
  await ready(page);
  await page.locator("#lab-raw").uncheck();
  await ready(page);
  await page
    .locator("#lab-plots")
    .screenshot({ path: info.outputPath("barnea-folded.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page
        .locator("#lab-plots .js-plotly-plot")
        .evaluate((e) => e.getBoundingClientRect().width || 10000),
    )
    .toBeLessThan(391);
  await ready(page);
  await page
    .locator("#lab-plots")
    .screenshot({ path: info.outputPath("barnea-phone.png") });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
});

test("rapid source changes and return navigation cannot publish stale records", async ({
  page,
}) => {
  await page.goto("./?presentation=map");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator('[data-view="laboratory"]').click();
  await ready(page);
  await page.locator("#lab-source").selectOption("savorgnan");
  await page.locator("#lab-source").selectOption("ahmed");
  await ready(page);
  await expect(page.locator("#lab-contract")).toContainText("Ahmed-inspired");
  await page.locator('[data-view="compare"]').click();
  await expect(page.locator("#compare")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator('[data-view="laboratory"]').click();
  await ready(page);
  expect(
    JSON.parse((await page.locator("#lab-json").textContent())!).source,
  ).toBe("ahmed");
});

test("inverse workbench exposes exact denominators, masks invalid ordering and retries", async ({
  page,
}, info) => {
  await page.goto("./?presentation=map");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator('[data-view="laboratory"]').click();
  await ready(page);
  await page.locator("#lab-source").selectOption("inverse");
  await ready(page);
  await page.locator("#lab-true").fill("87.3");
  await page.locator("#lab-inverse-evaluate").click();
  await ready(page);
  let result = JSON.parse((await page.locator("#lab-json").textContent())!);
  expect(result.point.relative_error_vs_true).toBeCloseTo(-0.457894736842, 10);
  expect(result.point.true_excess_over_est).toBeCloseTo(0.844660194175, 10);
  expect(result.map.masked_count).toBeGreaterThan(0);
  await page.locator("#lab-local").check();
  await ready(page);
  await expect(page.locator("#lab-plots .contourlayer").first()).toBeVisible();
  await page.locator("#lab-sa").fill("98");
  await page.locator("#lab-inverse-evaluate").click();
  await expect(page.locator("#laboratory")).toHaveAttribute(
    "data-pending",
    "error",
  );
  await expect(page.locator("#lab-content")).toBeHidden();
  await expect(page.locator("#lab-status")).toContainText("Sv < Sa");
  await page.locator("#lab-sa").fill("77");
  await page.locator("#lab-inverse-evaluate").click();
  await ready(page);
  result = JSON.parse((await page.locator("#lab-json").textContent())!);
  expect(result.point.inputs.sa).toBe(0.77);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page
        .locator("#lab-plots .js-plotly-plot")
        .first()
        .evaluate((e) => e.getBoundingClientRect().width || 10000),
    )
    .toBeLessThan(391);
  await ready(page);
  await page
    .locator("#lab-plots .js-plotly-plot")
    .first()
    .screenshot({ path: info.outputPath("inverse-phone.png") });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(391);
});
