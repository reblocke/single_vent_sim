import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

async function ready(page: Page, resistance = false) {
  await expect(page.locator("#status")).toHaveAttribute("data-state", "ready");
  await expect(
    page.locator(resistance ? "#resistance-panel" : "#explore"),
  ).toHaveAttribute("data-pending", "false");
  await expect(page.locator("#export-bundle")).toBeEnabled();
}
async function saved(page: Page) {
  const wait = page.waitForEvent("download");
  await page.locator("#export-state").click();
  return JSON.parse(await readFile((await (await wait).path())!, "utf8"));
}
async function restore(page: Page, state: unknown, resistance = false) {
  await page.locator("#import-state").setInputFiles({
    name: "state.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(state)),
  });
  await expect(page.locator("#export-status")).toContainText(
    "Validated configuration restored",
  );
  await ready(page, resistance);
}
async function snapshot(page: Page): Promise<any> {
  return page.evaluate(() => window.parallelO2.snapshot());
}
async function bundle(page: Page, folder: string) {
  const wait = page.waitForEvent("download");
  await page.locator("#export-bundle").click();
  const path = (await (await wait).path())!;
  return JSON.parse(
    execFileSync(
      "uv",
      [
        "run",
        "--locked",
        "python",
        "-c",
        `
import zipfile,json,hashlib,sys,csv,io
from pathlib import Path
with zipfile.ZipFile(sys.argv[1]) as z:
 m=json.loads(z.read('manifest.json'));p=json.loads(z.read('plot.json'));s=json.loads(z.read('scenario.json'))
 for name,item in m['files'].items():
  b=z.read(name);assert hashlib.sha256(b).hexdigest()==item['sha256'] and len(b)==item['bytes']
 rows=list(csv.DictReader(io.StringIO(z.read('values.csv').decode())))
 g=p['snapshot'].get('grid')
 if g:
  for row in rows:
   i,j=int(row['x_index']),int(row['y_index'])
   assert float(row['x'])==g['x']['coordinates'][i] and float(row['y'])==g['y']['coordinates'][j]
   for key,values in g['metrics'].items():
    assert row[key]=='' if values[j][i] is None else float(row[key])==values[j][i]
   if g.get('criteria_result'):assert row['criterion_status']==g['criteria_result']['status'][j][i]
 for name in ['figure.svg','figure.png']:
  Path(sys.argv[2]).mkdir(parents=True,exist_ok=True);Path(sys.argv[2],name).write_bytes(z.read(name))
 assert z.read('figure.png').startswith(b'\\x89PNG')
 print(json.dumps({'manifest':m,'state':s,'plot':p,'svg':z.read('figure.svg').decode()}))
`,
        path,
        folder,
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    ).toString(),
  );
}

test("R4 exposes the real local factor, preserves A and calibration, and imports legacy settings explicitly", async ({
  page,
}, info) => {
  await page.goto("./?presentation=map");
  await ready(page);
  await page.locator("#flow-provider").selectOption("resistance");
  await ready(page, true);
  await page.locator("#r-scene").selectOption("R4");
  await ready(page, true);
  await expect(page.locator("#r-fixed-perturbation-rp_multiplier")).toHaveCount(
    0,
  );
  await expect(
    page.locator("#r-fixed-perturbation-rshunt_multiplier"),
  ).toHaveCount(0);
  const state = await saved(page);
  state.settings.x.n = state.settings.y.n = 9;
  await restore(page, state, true);
  const before = await snapshot(page);
  await page.locator("#r-local-multiplier").fill("0.2");
  await page.locator("#r-local-multiplier").press("Tab");
  await ready(page, true);
  const after = await snapshot(page);
  expect(after.point.comparison.a).toEqual(before.point.comparison.a);
  expect(after.point.comparison.b.metrics).not.toEqual(
    before.point.comparison.b.metrics,
  );
  expect(after.point.comparison.b.reference).toEqual(
    before.point.comparison.a.reference,
  );
  expect(after.point.comparison.b.reference_sha256).toBe(
    before.point.comparison.a.reference_sha256,
  );
  await expect(page.locator("#r-right-title")).toContainText(
    "Change from that A after native Rp ×0.2",
  );
  await expect(page.locator("#r-left-title")).toContainText(
    "Delivery in each starting state A",
  );
  const changed = await saved(page);
  const exported = await bundle(page, info.outputPath("r4-local-factor"));
  expect(exported.state.settings.local_rp_multiplier).toBe(0.2);
  expect(exported.svg).toContain("0.2");
  expect(
    exported.plot.snapshot.grid.input_roles["perturbation.rp_multiplier"].role,
  ).toBe("derived");
  expect(changed.settings.local_rp_multiplier).toBe(0.2);
  await restore(page, changed, true);
  expect(await saved(page)).toEqual(changed);
  await page.locator("#share-state").click();
  await expect(page.locator("#share-url")).toHaveValue(/#state=/);
  const url = await page.locator("#share-url").inputValue();
  await page.goto(url);
  await ready(page, true);
  expect((await saved(page)).settings.local_rp_multiplier).toBe(0.2);
  delete state.settings.local_rp_multiplier;
  state.settings.request.perturbation.rp_multiplier = 0.2;
  state.settings.request.perturbation.rshunt_multiplier = 0.3;
  await restore(page, state, true);
  await expect(page.locator("#export-status")).toContainText(
    "Legacy absolute-axis multipliers were inactive",
  );
  expect((await snapshot(page)).point.comparison).toEqual(
    before.point.comparison,
  );
  expect((await saved(page)).settings.local_rp_multiplier).toBe(0.55);
});

for (const scene of ["R1", "R3"])
  test(`${scene} log axes round-trip actual clicked samples and exports`, async ({
    page,
  }, info) => {
    test.setTimeout(150000);
    await page.goto("./?presentation=map");
    await ready(page);
    await page.locator("#flow-provider").selectOption("resistance");
    await ready(page, true);
    await page.locator("#r-scene").selectOption(scene);
    await ready(page, true);
    const state = await saved(page);
    for (const [xs, ys] of [
      ["log", "linear"],
      ["linear", "log"],
      ["log", "log"],
    ]) {
      Object.assign(state.settings.x, {
        min: 0.25,
        max: xs === "log" ? 1 : 0.75,
        n: 3,
        scale: xs,
      });
      Object.assign(state.settings.y, {
        min: 0.25,
        max: ys === "log" ? 1 : 0.75,
        n: 5,
        scale: ys,
      });
      state.settings.selected = { x: 0.25, y: 0.25 };
      await restore(page, state, true);
      const graph = page.locator("#r-left-map .js-plotly-plot");
      await graph.scrollIntoViewIfNeeded();
      const cell = await graph.evaluate((node: any) => {
        const s = window.parallelO2.snapshot() as any,
          g = s.grid,
          l = node._fullLayout,
          r = node.getBoundingClientRect();
        return {
          x: r.x + l.xaxis._offset + l.xaxis.l2p(g.x.plot_coordinates[1]),
          y: r.y + l.yaxis._offset + l.yaxis.l2p(g.y.plot_coordinates[2]),
          physical: [g.x.coordinates[1], g.y.coordinates[2]],
          plotted: [g.x.plot_coordinates[1], g.y.plot_coordinates[2]],
        };
      });
      expect(cell.physical).toEqual([0.5, 0.5]);
      expect(cell.plotted[0]).toBeCloseTo(
        xs === "log" ? Math.log10(0.5) : 0.5,
        12,
      );
      expect(cell.plotted[1]).toBeCloseTo(
        ys === "log" ? Math.log10(0.5) : 0.5,
        12,
      );
      await page.mouse.click(cell.x, cell.y);
      await expect(page.locator("#r-point-status")).toContainText(
        "Selected x 0.5, y 0.5",
      );
      await expect(page.locator("#r-inspector")).toHaveAttribute(
        "data-pending",
        "false",
      );
      const snap = await snapshot(page);
      const expected = (await page.evaluate(
        (s: any) =>
          window.parallelO2.compute("resistance_point", {
            request: s.scene.request,
            x: s.scene.x,
            y: s.scene.y,
            x_value: 0.5,
            y_value: 0.5,
            baseline_policy: s.scene.policy,
            local_rp_multiplier: s.scene.local_rp_multiplier,
          }),
        snap,
      )) as any;
      expect(snap.point).toEqual(expected);
      expect(
        JSON.parse((await page.locator("#r-json").textContent())!),
      ).toEqual(expected);
      const rows = await page.locator("#r-values tr").evaluateAll((nodes) =>
        nodes.map((n) => ({
          key: (n as HTMLElement).dataset.metric!,
          values: [...n.querySelectorAll("td")]
            .slice(1, 3)
            .map((c) => c.textContent),
        })),
      );
      for (const row of rows)
        for (const [index, side] of ["a", "b"].entries()) {
          const exact = expected.comparison[side].metrics[row.key];
          if (exact === null) expect(row.values[index]).toBe("Undefined");
          else
            expect(
              Math.abs(Number(row.values[index]) - exact),
            ).toBeLessThanOrEqual(1e-7 * Math.max(1, Math.abs(exact)));
        }
      for (const [metric, values] of Object.entries(snap.grid.metrics) as [
        string,
        any,
      ][]) {
        if (metric.startsWith("relative_")) continue;
        expect(values[2][1]).toBeCloseTo(
          expected.displayed_state.metrics[metric],
          10,
        );
      }
      const cross = await graph.evaluate((n: any) => n.layout.shapes);
      expect(cross[0].x0).toBeCloseTo(cell.plotted[0], 12);
      expect(cross[1].y0).toBeCloseTo(cell.plotted[1], 12);
      const receipt = await bundle(page, info.outputPath(`${xs}-${ys}`));
      expect(receipt.state.settings.selected).toEqual({ x: 0.5, y: 0.5 });
      expect(
        receipt.plot.plots[0].data[1].customdata[2][1].slice(0, 2),
      ).toEqual([0.5, 0.5]);
      await info.attach(`${xs}-${ys}-export`, {
        path: info.outputPath(`${xs}-${ys}/figure.png`),
        contentType: "image/png",
      });
    }
  });

test("initialized bundles and validation view work with all HTTP requests blocked", async ({
  page,
  context,
}, info) => {
  test.setTimeout(120000);
  await page.goto("./?presentation=map");
  await ready(page);
  const build = await page.request.get("build-info.json").then((r) => r.json());
  const state = await saved(page);
  state.settings.x.n = state.settings.y.n = 5;
  await restore(page, state);
  const attempts: string[] = [];
  await context.route(/^https?:/, (route) => {
    attempts.push(route.request().url());
    return route.abort();
  });
  const receipt = await bundle(page, info.outputPath("offline"));
  expect(receipt.manifest.build).toEqual(build);
  expect(receipt.manifest.runtime.python).toBe("3.14.2");
  await page.locator('[data-view="model"]').click();
  await expect(page.locator("#model")).toHaveAttribute("data-pending", "false");
  await expect(page.locator("#model-build")).toContainText(build.build_id);
  await bundle(page, info.outputPath("offline-model"));
  expect(attempts).toEqual([]);
});

test("joint criteria preserve engine classifications, boundaries, exports and responsive summaries", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.goto("./?presentation=map");
  await ready(page);
  await page.locator("#scene").selectOption("H1");
  await ready(page);
  const state = await saved(page);
  state.settings.x.n = state.settings.y.n = 9;
  state.settings.display_modes = ["joint_criteria", "joint_criteria"];
  await restore(page, state);
  await expect(page.locator("#left-metric")).toBeDisabled();
  await expect(page.locator("#left-refit")).toBeDisabled();
  await expect(page.locator("#left-title")).toContainText(
    "equality is not above",
  );
  const check = await page
    .locator("#left-map .js-plotly-plot")
    .evaluate((n: any) => {
      const s = window.parallelO2.snapshot() as any,
        g = s.grid,
        codes: any = {
          neither_above: 0,
          arterial_only_above: 1,
          venous_only_above: 2,
          both_above: 3,
          on_selected_boundary: 4,
        };
      return g.criteria_result.status.every((row: any[], j: number) =>
        row.every(
          (v, i) =>
            n.data[1].z[j][i] ===
            (codes[v] ?? (g.status[j][i] === "numerical_failure" ? 6 : 5)),
        ),
      );
    });
  expect(check).toBe(true);
  const receipt = await bundle(page, info.outputPath("criteria"));
  expect(receipt.state.settings.display_modes).toEqual([
    "joint_criteria",
    "joint_criteria",
  ]);
  expect(receipt.svg).toContain("equality is not above");
  await expect(page.locator("#state-summary")).toContainText("Systemic flow");
  await page
    .locator("#left-map")
    .screenshot({ path: info.outputPath("criteria-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page
        .locator("#left-map .js-plotly-plot")
        .evaluate((n: any) =>
          Math.abs(
            (n._fullLayout?.width ?? Number.POSITIVE_INFINITY) -
              document.getElementById("left-map")!.clientWidth,
          ),
        ),
    )
    .toBeLessThan(1);
  await ready(page);
  await page
    .locator("#left-map")
    .screenshot({ path: info.outputPath("criteria-mobile.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.locator("#scene").selectOption("H3");
  await ready(page);
  await expect(page.locator("#left-display")).toBeDisabled();
});

test("declared response scales, zero contours and local response remain explicit", async ({
  page,
}, info) => {
  await page.goto("./?presentation=map");
  await ready(page);
  await page.locator("#flow-provider").selectOption("resistance");
  await ready(page, true);
  for (const [id, scale] of [
    ["R3", 10],
    ["R4", 20],
    ["R6", 10],
  ] as const) {
    await page.locator("#r-scene").selectOption(id);
    await ready(page, true);
    const graph = page.locator("#r-right-map .js-plotly-plot");
    await expect(graph).toHaveAttribute(
      "data-scale",
      JSON.stringify([-scale, scale]),
    );
    expect(
      await graph.evaluate((n: any) =>
        n.data.some(
          (t: any) =>
            t.name === "No modeled change relative to this stated comparator",
        ),
      ),
    ).toBe(true);
  }
  await page.locator("#r-right-refit").click();
  await ready(page, true);
  expect(
    await page
      .locator("#r-left-map .js-plotly-plot")
      .getAttribute("data-scale"),
  ).toBe(
    await page
      .locator("#r-right-map .js-plotly-plot")
      .getAttribute("data-scale"),
  );
  await page.locator("#r-scene").selectOption("R4");
  await ready(page, true);
  await page.locator("#r-local-multiplier").fill("1");
  await page.locator("#r-local-multiplier").press("Tab");
  await ready(page, true);
  await expect(page.locator("#r-right-note")).toContainText(
    "Constant zero response",
  );
  await expect(page.locator("#r-right-map .js-plotly-plot")).toHaveAttribute(
    "data-scale",
    "[-20,20]",
  );
  await expect(page.locator("#r-summary")).toContainText(
    "normalized delivery index is unchanged",
  );
  await page.locator("#r-local-multiplier").fill("0.55");
  await page.locator("#r-local-multiplier").press("Tab");
  await ready(page, true);
  await page
    .locator(".r-maps")
    .screenshot({ path: info.outputPath("r4-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page
        .locator("#r-left-map .js-plotly-plot")
        .evaluate((n: any) =>
          Math.abs(
            (n._fullLayout?.width ?? Number.POSITIVE_INFINITY) -
              document.getElementById("r-left-map")!.clientWidth,
          ),
        ),
    )
    .toBeLessThan(1);
  await ready(page, true);
  await page
    .locator(".r-maps")
    .screenshot({ path: info.outputPath("r4-mobile.png") });
});

test("criterion equality, infeasibility and numerical failure have distinct actual displays", async ({
  page,
}) => {
  await page.goto("./?presentation=map");
  await ready(page);
  await page.locator("#scene").selectOption("H1");
  await ready(page);
  const state = await saved(page);
  state.settings.x.n = 3;
  state.settings.y.n = 6;
  state.settings.selected = { x: 13, y: 6 };
  state.settings.display_modes = ["joint_criteria", "continuous"];
  await restore(page, state);
  const read = () =>
    page.locator("#left-map .js-plotly-plot").evaluate((n: any) => n.data[1].z);
  const codes = await read();
  expect(codes[2][1]).toBe(2);
  expect(codes[0][0]).toBe(5);
  expect(codes[5][2]).toBe(3);
  const snap = await snapshot(page);
  state.settings.criteria = {
    schema_version: "criteria-v1",
    id: "user-selected",
    origin: "user_selected",
    comparison: "strict_greater_than",
    sa_lower_fraction: snap.state.metrics.sa_fraction,
    sv_lower_fraction: 0,
  };
  await restore(page, state);
  expect((await read())[2][1]).toBe(4);
  await expect(page.locator("#state-criteria")).toContainText("Sa: on");
  expect(
    (await snapshot(page)).state.criterion_result.meets_both_strict_criteria,
  ).toBe(false);
  state.settings.base.capacity.kappa_ml_o2_g_hb = 1e308;
  await restore(page, state);
  expect((await read()).flat().every((v: number) => v === 6)).toBe(true);
  await expect(page.locator("#left-scale-note")).toContainText(
    "Numerical failure: 18",
  );
});

test("initialization rejects mismatched validation inventory and retry replaces failed context", async ({
  page,
  context,
}) => {
  await context.route("**/validation.json", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: '{"gates":[]}',
    }),
  );
  await page.goto("./?presentation=map");
  await expect(page.locator("#status")).toHaveAttribute("data-state", "error");
  await expect(page.locator("#status")).toContainText(
    "Validation inventory build mismatch",
  );
  await expect(page.locator("#export-bundle")).toBeDisabled();
  await context.unroute("**/validation.json");
  await page.locator("#retry").click();
  await ready(page);
  await page.locator('[data-view="model"]').click();
  await expect(page.locator("#model")).toHaveAttribute("data-pending", "false");
  await expect(page.locator("#model-build")).toContainText("validation_sha256");
});

test("runtime retry during export cancels the old generation without a mixed bundle", async ({
  page,
}) => {
  await page.goto("./?presentation=map");
  await ready(page);
  const downloads: string[] = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  await page.evaluate(() => {
    document.getElementById("export-bundle")!.click();
    document.getElementById("retry")!.click();
  });
  await expect(page.locator("#export-status")).toContainText(
    "Export/import error",
  );
  await ready(page);
  expect(downloads).toEqual([]);
});
