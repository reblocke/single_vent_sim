import { test, expect } from "@playwright/test";
test("UX01 fresh question shows resolved Hb endpoints and gross versus net budgets", async ({
  page,
}, info) => {
  await page.goto("./");
  await expect(page.locator("#one-change")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await expect(page.locator("#one-parameter")).toHaveValue("capacity.hb_g_dl");
  await expect(page.locator("#one-target")).toHaveValue("14");
  const data = (await page.evaluate(() => window.parallelO2.snapshot())) as any;
  expect(data.result.comparison.a.metrics.do2_ml_kg_min).toBeCloseTo(
    20.264,
    10,
  );
  expect(data.result.comparison.b.metrics.do2_ml_kg_min).toBeCloseTo(
    30.7696,
    10,
  );
  await expect(page.locator("#one-explanation")).toContainText(
    "Net lung uptake is unchanged",
  );
  await expect(page.locator("#one-quantities details")).toHaveCount(5);
  await expect(page.locator("#one-saturation .js-plotly-plot")).toBeVisible();
  await expect(page.locator("#one-flux .js-plotly-plot")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("default.png"),
    fullPage: true,
  });
});

async function oneReady(page: any) {
  await expect(page.locator("#one-change")).toHaveAttribute(
    "data-pending",
    "false",
  );
}
async function snapshot(page: any): Promise<any> {
  return page.evaluate(() => window.parallelO2.snapshot());
}
async function change(page: any, id: string, value: string) {
  await page.locator(id).fill(value);
  await page.locator(id).press("Tab");
}

test("UX05-07,13,14 controlled changes retain inputs, teaching values and criterion independence", async ({
  page,
}) => {
  await page.goto("./");
  await oneReady(page);
  for (const [question, expected, words] of [
    ["systemic-flow", 10.132, "Arterial saturation is unchanged"],
    ["allocation", 11.132, "systemic delivery decreases"],
    ["consumption", 17.264, "Net lung uptake increases"],
  ] as const) {
    await page.locator("#question-select").selectOption(question);
    await oneReady(page);
    const c = (await snapshot(page)).result.comparison;
    expect(c.b.metrics.do2_ml_kg_min).toBeCloseTo(expected, 9);
    await expect(page.locator("#one-explanation")).toContainText(words);
  }
  await page.locator("#question-select").selectOption("hemoglobin");
  await oneReady(page);
  await page.locator("#one-start-editor summary").click();
  await page.locator('[data-path="flow.qs_ml_kg_min"]').fill("180");
  await page.locator("#one-apply").click();
  await oneReady(page);
  let c = (await snapshot(page)).result.comparison;
  expect(c.a.requested.flow.qs_ml_kg_min).toBe(180);
  expect(c.b.requested.flow.qs_ml_kg_min).toBe(180);
  expect(c.b.requested.capacity.hb_g_dl).toBe(14);
  await page.locator("#one-use-b").click();
  await oneReady(page);
  c = (await snapshot(page)).result.comparison;
  expect(c.a.requested).toEqual(c.b.requested);
  await page.locator("#one-parameter").selectOption("spv_fraction");
  await oneReady(page);
  await expect(page.locator("#one-target")).toHaveValue("98");
  await change(page, "#one-target", "97");
  await oneReady(page);
  c = (await snapshot(page)).result.comparison;
  expect(c.b.requested.spv_fraction).toBe(0.97);
  await page
    .locator("#one-change")
    .getByText("Compare with chosen criteria", { exact: true })
    .click();
  await page.locator("#one-sa").fill("80");
  await page.locator("#one-criteria").click();
  await oneReady(page);
  expect((await snapshot(page)).result.comparison.b.metrics).toEqual(
    c.b.metrics,
  );
  await page.locator("#show-map").click();
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await expect(page.locator("#presentation-notice")).toContainText(
    "do not share",
  );
  await expect(
    page.locator('#map-quantities [data-quantity="Qp"]'),
  ).toHaveAttribute("data-role", "derived");
  await page.locator("#show-one").click();
  await oneReady(page);
  expect((await snapshot(page)).result.comparison.a.requested).toEqual(
    (await snapshot(page)).result.comparison.b.requested,
  );
});

test("UX04,09-12 reference transaction, local response and distinct oxygen drafts", async ({
  page,
}) => {
  await page.goto("./");
  await oneReady(page);
  await page.locator("#question-select").selectOption("starting-state");
  const ready = async () =>
    await expect(page.locator("#resistance-panel")).toHaveAttribute(
      "data-pending",
      "false",
    );
  await ready();
  await expect(
    page.locator('#r-quantities [data-quantity="B"]'),
  ).toHaveAttribute("data-role", "not_specified");
  await expect(page.locator("#r-fixed-perturbation-rp_multiplier")).toHaveCount(
    0,
  );
  const before = (await snapshot(page)).point;
  await change(page, "#r-local-percent", "-30");
  await ready();
  await expect(page.locator("#r-local-multiplier")).toHaveValue("0.7");
  await expect(page.locator("#r-right-title")).toContainText(
    "Change from that A after native Rp ×0.7",
  );
  const local = (await snapshot(page)).point;
  expect(local.comparison.a).toEqual(before.comparison.a);
  expect(local.comparison.b.reference_sha256).toEqual(
    before.comparison.b.reference_sha256,
  );
  await page.locator("#r-reference-editor summary").click();
  await page.locator("#r-edit-reference").click();
  await change(page, "#r-ref-qt_l_min", "2.5");
  expect((await snapshot(page)).point).toEqual(local);
  await page.locator("#r-cancel-reference").click();
  await expect(page.locator("#r-ref-qt_l_min")).toHaveValue("2");
  await page.locator("#r-edit-reference").click();
  await change(page, "#r-ref-qt_l_min", "2.5");
  await page.locator("#r-apply-reference").click();
  await expect(page.locator("#r-reference-active")).toContainText("Qt 2.5");
  await ready();
  expect(
    (await snapshot(page)).point.comparison.a.reference_sha256,
  ).not.toEqual(local.comparison.a.reference_sha256);
  await page.locator("#r-oxygen").selectOption("physical");
  await ready();
  await change(page, "#r-fixed-oxygen-hb_g_dl", "15");
  await ready();
  await page.locator("#r-oxygen").selectOption("normalized_source");
  await ready();
  await expect(page.locator('#r-quantities [data-quantity="M"]')).toContainText(
    "physical M not specified",
  );
  await page.locator("#r-oxygen").selectOption("physical");
  await ready();
  await expect(page.locator("#r-fixed-oxygen-hb_g_dl")).toHaveValue("15");
  await expect(page.locator("#r-lesson")).toContainText(
    "Restored saved physical draft",
  );
});

import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
async function saved(page: any) {
  const wait = page.waitForEvent("download", { timeout: 15000 });
  await page.locator("#export-state").click();
  return JSON.parse(await readFile((await (await wait).path())!, "utf8"));
}

test("UX08,16-18 saved v2 and legacy maps retain scientific values and offline export", async ({
  page,
}) => {
  await page.goto("./");
  await oneReady(page);
  await change(page, "#one-target", "13.23456789");
  await oneReady(page);
  await page
    .locator("#one-change")
    .getByText("Compare with chosen criteria", { exact: true })
    .click();
  await page.locator("#one-sa").fill("80");
  await page.locator("#one-criteria").click();
  await oneReady(page);
  const savedOne = await saved(page);
  expect(savedOne.schema_version).toBe("parallel-o2-ui-state-v2");
  expect(savedOne.presentation.one_change.target).toBe(13.23456789);
  await page.locator("#show-map").click();
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  expect(
    await page
      .locator("#left-map .js-plotly-plot")
      .evaluate((n: any) =>
        n.data
          .filter((t: any) => t.name?.startsWith("Endpoint "))
          .map((t: any) => t.name),
      ),
  ).toEqual(["Endpoint A", "Endpoint B"]);
  const map = await saved(page);
  const legacy = {
    schema_version: "parallel-o2-ui-state-v1",
    view: map.view,
    provider: map.provider,
    settings: map.settings,
  };
  await page.locator("#import-state").setInputFiles({
    name: "v1.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await expect(page.locator("#export-status")).toContainText(
    "Validated configuration restored",
  );
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  const migrated = await saved(page);
  expect(migrated.presentation.mode).toBe("map");
  expect(migrated.settings).toEqual(map.settings);
  await page.locator("#import-state").setInputFiles({
    name: "v2.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(savedOne)),
  });
  await oneReady(page);
  await expect(page.locator("#one-target")).toHaveValue("13.23456789");
  const requests: string[] = [];
  await page.route(/^https?:/, (route) => {
    requests.push(route.request().url());
    return route.abort();
  });
  const download = page.waitForEvent("download");
  await page.locator("#export-bundle").click();
  const file = await download;
  expect(await file.failure()).toBeNull();
  const svg = execFileSync(
    "uv",
    [
      "run",
      "--locked",
      "python",
      "-c",
      "import zipfile,sys;print(zipfile.ZipFile(sys.argv[1]).read('figure.svg').decode())",
      (await file.path())!,
    ],
    { maxBuffer: 8 * 1024 * 1024 },
  ).toString();
  expect(svg).toMatch(/Sa (?:>|&gt;) 80%/);
  expect(requests).toEqual([]);
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
])
  test(`UX19 responsive controls ${viewport.width}`, async ({ page }, info) => {
    await page.setViewportSize(viewport);
    await page.goto("./");
    await oneReady(page);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await expect(page.locator("#one-target")).toBeVisible();
    await page.locator("#one-target").focus();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Tab");
    await oneReady(page);
    await page.screenshot({
      path: info.outputPath("responsive.png"),
      fullPage: true,
    });
    if (viewport.width === 1440) {
      const box = await page.locator("#one-flux").boundingBox();
      expect(box!.y).toBeLessThan(1000);
    }
  });

test("UX04,08 selected percent coordinates and inverse equality drive the five quantities", async ({
  page,
}) => {
  await page.goto("./?presentation=map");
  const ready = async () =>
    await expect(page.locator("#explore")).toHaveAttribute(
      "data-pending",
      "false",
    );
  await ready();
  await page.locator("#scene").selectOption("E5");
  await ready();
  await page.locator("#select-y").fill("95");
  await page.locator("#select-state").click();
  await expect(page.locator("#state-inspector")).toHaveAttribute(
    "data-pending",
    "false",
  );
  expect((await snapshot(page)).state.requested.spv_fraction).toBe(0.95);
  await expect(page.locator("#state-description")).toContainText("y 95.000000");
  await expect(
    page.locator('#map-quantities [data-quantity="Spv"] strong'),
  ).toContainText("95");
  await page
    .locator("#prescribed-explorer")
    .getByText("Plot settings · axes and ranges", { exact: true })
    .click();
  await expect(page.locator("#y-min")).toHaveValue("80");
  await page.locator("#y-scale").selectOption("log");
  await ready();
  const values = await page
    .locator("#right-map .js-plotly-plot")
    .evaluate((n: any) => ({
      ticktext: n.layout.yaxis.ticktext,
      y: n.data[1].y,
      custom: n.data[1].customdata,
    }));
  expect(values.ticktext[0]).toBe("80");
  expect(values.y[0]).toBeCloseTo(Math.log10(0.8), 12);
  expect(values.custom[0][0][1]).toBe(0.8);
  expect(values.custom[0][0][4]).toBe(80);
  await page.locator("#scene").selectOption("H3");
  await ready();
  const equality = (await snapshot(page)).state.equality_state;
  await expect(
    page.locator('#map-quantities [data-quantity="B"]'),
  ).toHaveAttribute("data-role", "solved_boundary");
  await expect(
    page.locator('#map-quantities [data-quantity="B"] strong'),
  ).toContainText(
    String(Number(equality.metrics.capacity_ml_dl.toPrecision(5))),
  );
  await page.locator("#scene").selectOption("H4");
  await ready();
  await expect(
    page.locator('#map-quantities [data-quantity="B"] strong'),
  ).toContainText("→");
});

test("UX17 rapid targets, linked hover and navigation cannot mix generations", async ({
  page,
}) => {
  await page.goto("./");
  await oneReady(page);
  await change(page, "#one-target", "12");
  await change(page, "#one-target", "16");
  await change(page, "#one-target", "18");
  await oneReady(page);
  const before = (await snapshot(page)).result.comparison;
  expect(before.a.requested.capacity.hb_g_dl).toBe(10);
  expect(before.b.requested.capacity.hb_g_dl).toBe(18);
  await expect(page.locator("#one-contract")).toContainText("to 18");
  await page
    .locator("#one-saturation .nsewdrag")
    .hover({ position: { x: 80, y: 60 } });
  expect((await snapshot(page)).result.comparison).toEqual(before);
  await page.locator('[data-view="compare"]').click();
  await expect(page.locator("#compare")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator('[data-view="explore"]').click();
  await oneReady(page);
  expect((await snapshot(page)).result.comparison).toEqual(before);
  const state = await saved(page);
  expect(state.presentation.one_change.target).toBe(18);
});

test("UX19 200 percent layout magnification retains readable controls and plots", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("./");
  await oneReady(page);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await expect(page.getByLabel("Change one independent input")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("magnification-200.png"),
    fullPage: true,
  });
});
