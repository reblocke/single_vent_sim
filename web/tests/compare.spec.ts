import { test, expect } from "@playwright/test";
const ready = (page: import("@playwright/test").Page) =>
  expect(page.locator("#compare")).toHaveAttribute("data-pending", "false");
test("C1-C12 show declared changes, reconciled budgets and distinct source status", async ({
  page,
}, info) => {
  test.setTimeout(240000);
  await page.goto("./?presentation=map");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator('[data-view="compare"]').click();
  await ready(page);
  for (let i = 1; i <= 12; i++) {
    const id = "C" + i;
    await page.locator("#comparison-preset").selectOption(id);
    await ready(page);
    const p = JSON.parse((await page.locator("#compare-json").textContent())!);
    expect(p.preset).toBe(id);
    for (const key of ["a", "b"]) {
      const v = p.comparison.budgets[key].values;
      expect(v.delivery).toBeCloseTo(v.consumption + v.systemic_return, 9);
      expect(v.pulmonary_out).toBeCloseTo(v.pulmonary_in + v.net_uptake, 9);
      expect(v.net_uptake).toBeCloseTo(v.consumption, 9);
    }
    await expect(page.locator("#compare-changes tr")).not.toHaveCount(0);
    await page
      .getByText("Full mixing diagrams and budget plots", { exact: true })
      .click();
    await expect(page.locator("#compare-budget-plot .barlayer")).toBeVisible();
    await page
      .getByText("Full mixing diagrams and budget plots", { exact: true })
      .click();
    await expect(page.locator("#compare-source")).toContainText("unverified");
    if (i >= 8)
      await expect(page.locator("#compare-pressure-group")).toBeVisible();
    else await expect(page.locator("#compare-pressure-group")).toBeHidden();
    if (i === 1) {
      await expect(page.locator("#compare-a .budget-identities")).toContainText(
        "20.264",
      );
      await expect(page.locator("#compare-b .budget-identities")).toContainText(
        "30.7696",
      );
    }
    if (i === 3)
      await expect(page.locator("#compare-contract")).toContainText(
        "34.1 and 14.6",
      );
    if (i === 9)
      await expect(page.locator("#compare-ablation tr")).toHaveCount(4);
    await page
      .locator("#compare")
      .screenshot({ path: info.outputPath(id + ".png") });
  }
});

test("pinned prescribed states and local resistance pairs retain their original constraints", async ({
  page,
}) => {
  await page.goto("./?presentation=map");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator("#pin-a").click();
  await page.locator("#select-x").fill("14");
  await page.locator("#select-state").click();
  await expect(page.locator("#state-description")).toContainText("14.000000");
  await page.locator("#pin-b").click();
  await page.locator('[data-view="compare"]').click();
  await ready(page);
  await page.locator("#compare-pins").click();
  await ready(page);
  let p = JSON.parse((await page.locator("#compare-json").textContent())!);
  expect(p.preset).toBe("custom");
  expect(p.comparison.changed_inputs["capacity.hb_g_dl"]).toEqual({
    a: 10,
    b: 14,
  });
  await page.locator('[data-view="explore"]').click();
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator("#flow-provider").selectOption("resistance");
  await expect(page.locator("#resistance-panel")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator("#r-scene").selectOption("R4");
  await expect(page.locator("#resistance-panel")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator("#r-x").fill("20");
  await page.locator("#r-y").fill("40");
  await page.locator("#r-select").click();
  await expect(page.locator("#r-point-status")).toContainText(
    "Selected x 20, y 40.",
  );
  await page.locator("#r-compare-pair").click();
  await ready(page);
  p = JSON.parse((await page.locator("#compare-json").textContent())!);
  expect(p.preset).toBe("custom-resistance");
  expect(p.comparison.a.metrics.rp_mmhg_min_l).toBeCloseTo(20, 10);
  expect(p.comparison.b.metrics.rp_mmhg_min_l).toBeCloseTo(11, 10);
  expect(p.comparison.a.reference.rp_mmhg_min_l).toBe(12);
  expect(p.comparison.a.reference_sha256).toBe(p.comparison.b.reference_sha256);
  await expect(page.locator("#compare-contract")).toContainText(
    "local_response",
  );
});

test("comparison diagrams, legends and budgets remain readable at tablet and phone widths", async ({
  page,
}, info) => {
  await page.goto("./?presentation=map");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator('[data-view="compare"]').click();
  await ready(page);
  await page
    .getByText("Full mixing diagrams and budget plots", { exact: true })
    .click();
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() =>
        page
          .locator("#compare-budget-plot > div")
          .evaluate(
            (node) =>
              Math.abs(
                node.getBoundingClientRect().width -
                  (node.parentElement?.clientWidth ?? Number.POSITIVE_INFINITY),
              ) < 1,
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
      .locator("#compare-a")
      .screenshot({ path: info.outputPath("diagram-" + width + ".png") });
    await page
      .locator("#compare-budget-plot")
      .screenshot({ path: info.outputPath("budget-" + width + ".png") });
  }
});

test("resize cannot restore a stale comparison after changing presets", async ({
  page,
}) => {
  await page.goto("./?presentation=map");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator('[data-view="compare"]').click();
  await ready(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#comparison-preset").selectOption("C11");
  await ready(page);
  await expect(page.locator("#compare-contract")).toContainText("30.552");
  await expect
    .poll(() =>
      page
        .locator("#compare-budget-plot > div")
        .evaluate(
          (node) =>
            Math.abs(
              node.getBoundingClientRect().width -
                (node.parentElement?.clientWidth ?? Number.POSITIVE_INFINITY),
            ) < 1,
        ),
    )
    .toBe(true);
  await page.waitForTimeout(250);
  const p = JSON.parse((await page.locator("#compare-json").textContent())!);
  expect(p.preset).toBe("C11");
  await expect(page.locator(".mode-contract")).toContainText(
    "assumed resistance/output law",
  );
});

test("pinned comparisons retain thresholds and provenance from each pin", async ({
  page,
}) => {
  await page.goto("./?presentation=map");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator("#pin-a").click();
  await page
    .locator("#prescribed-explorer")
    .getByText("Compare with chosen criteria", { exact: true })
    .click();
  await page.locator("#criterion-sa").fill("90");
  await page.locator("#criterion-sa").press("Tab");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator("#pin-b").click();
  await page.locator('[data-view="compare"]').click();
  await ready(page);
  await page.locator("#compare-pins").click();
  await ready(page);
  const c = JSON.parse(
    (await page.locator("#compare-json").textContent())!,
  ).comparison;
  expect(c.criteria_by_state.a.sa_lower_fraction).toBe(0.7);
  expect(c.criteria_by_state.a.origin).toBe("source_reported_abstract");
  expect(c.criteria_by_state.b.sa_lower_fraction).toBe(0.9);
  expect(c.criteria_by_state.b.origin).toBe("user_selected");
  await expect(page.locator("#compare-b")).toContainText("Sa > 90%");
});
