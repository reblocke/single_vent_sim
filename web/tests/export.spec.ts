import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
async function ready(page: Page, id = "explore") {
  await expect(page.locator("#status")).toHaveAttribute("data-state", "ready");
  await expect(page.locator("#" + id)).toHaveAttribute("data-pending", "false");
  await expect(page.locator("#export-bundle")).toBeEnabled();
}
async function savedState(page: Page) {
  const wait = page.waitForEvent("download");
  await page.locator("#export-state").click();
  const download = await wait;
  return JSON.parse(await readFile((await download.path())!, "utf8"));
}
async function restore(page: Page, state: unknown) {
  await page.locator("#import-state").setInputFiles({
    name: "scenario.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(state)),
  });
  await expect(page.locator("#export-status")).toContainText(
    "Validated configuration restored",
  );
}
const inspectZip = `import zipfile,json,hashlib,csv,io,sys,os,jsonschema
from pathlib import Path
os.makedirs(sys.argv[2],exist_ok=True)
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 names=z.namelist()
 assert {'scenario.json','plot.json','values.csv','manifest.json','figure.svg','figure.png'}<=set(names)
 manifest=json.loads(z.read('manifest.json'))
 jsonschema.Draft202012Validator(json.loads(Path('../schemas/export-manifest-v1.schema.json').read_text()),format_checker=jsonschema.FormatChecker()).validate(manifest)
 for name,entry in manifest['files'].items():
  data=z.read(name)
  assert len(data)==entry['bytes'] and hashlib.sha256(data).hexdigest()==entry['sha256']
 state=json.loads(z.read('scenario.json'));plot=json.loads(z.read('plot.json'))
 assert state==manifest['configuration']==plot['metadata']['configuration']
 rows=list(csv.DictReader(io.StringIO(z.read('values.csv').decode())))
 if 'grid' in plot['snapshot']:
  g=plot['snapshot']['grid'];assert len(rows)==len(g['x']['coordinates'])*len(g['y']['coordinates'])
  for row in rows:
   y,x=int(row['y_index']),int(row['x_index'])
   assert float(row['x'])==g['x']['coordinates'][x] and float(row['y'])==g['y']['coordinates'][y]
   for metric,values in g['metrics'].items():
    value=values[y][x];assert row[metric]=='' if value is None else float(row[metric])==value
   assert row['status']==g.get('status',g.get('after_status'))[y][x]
 assert z.read('figure.png')[:8]==b'\\x89PNG\\r\\n\\x1a\\n'
 svg=z.read('figure.svg').decode();assert 'Parallel Circulation Oxygen Explorer' in svg and 'Source DOIs' in svg
 for name in ('figure.svg','figure.png'):open(os.path.join(sys.argv[2],name),'wb').write(z.read(name))
 print(json.dumps({'state':state,'rows':len(rows),'names':names,'manifest':manifest,'snapshot_generation':plot['snapshot'].get('generation')}))`;
async function bundle(page: Page, folder: string) {
  const wait = page.waitForEvent("download");
  await page.locator("#export-bundle").click();
  const dl = await wait;
  const path = await dl.path();
  return JSON.parse(
    execFileSync(
      "uv",
      ["run", "--locked", "python", "-c", inspectZip, path!, folder],
      {
        maxBuffer: 4 * 1024 * 1024,
      },
    ).toString(),
  );
}

test("prescribed state and export preserve exact values, masks, scales and explicit fragment roundtrip", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.goto("./?presentation=map");
  await ready(page);
  const state = await savedState(page);
  state.settings.x.n = state.settings.y.n = 11;
  state.settings.selected = { x: 12.3456789012345, y: 1.23 };
  state.settings.y.scale = "log";
  state.settings.scales = [
    [61, 94],
    [10, 45],
  ];
  state.settings.overlays = ["ratio_1"];
  state.settings.criteria = {
    schema_version: "criteria-v1",
    id: "user-selected",
    origin: "user_selected",
    comparison: "strict_greater_than",
    sa_lower_fraction: 0.81,
    sv_lower_fraction: 0.39,
  };
  state.settings.mass_kg = 7.5;
  state.settings.bsa_m2 = 0.38;
  await restore(page, state);
  await ready(page);
  expect(await savedState(page)).toEqual(state);
  await page.locator("#show-slice").click();
  await expect(page.locator("#slice-plots")).toBeVisible();
  state.settings.slice_visible = true;
  const receipt = await bundle(page, info.outputDir);
  expect(receipt.names).toContain("slice-values.csv");
  expect(receipt.rows).toBe(121);
  expect(receipt.state).toEqual(state);
  expect(receipt.manifest.sources.map((s: { doi: string }) => s.doi)).toContain(
    "10.3390/jcdd13080347",
  );
  await info.attach("export-figure", {
    path: info.outputPath("figure.png"),
    contentType: "image/png",
  });
  await page.locator("#share-state").click();
  await expect(page.locator("#share-url")).toHaveValue(/#state=/);
  const url = await page.locator("#share-url").inputValue();
  await page.goto("about:blank");
  await page.goto(url);
  await ready(page);
  await expect(page.locator("#export-status")).toContainText(
    "Validated configuration restored",
  );
  expect(await savedState(page)).toEqual(state);
});

test("resistance and comparison exports retain policies, separate units and exact requested states", async ({
  page,
}, info) => {
  test.setTimeout(100000);
  await page.goto("./?presentation=map");
  await ready(page);
  await page.locator("#flow-provider").selectOption("resistance");
  await ready(page, "resistance-panel");
  await page.locator("#r-scene").selectOption("R4");
  await ready(page, "resistance-panel");
  const state = await savedState(page);
  state.settings.x.n = state.settings.y.n = 9;
  state.settings.selected = { x: 12, y: 28 };
  await restore(page, state);
  await ready(page, "resistance-panel");
  const r = await bundle(page, info.outputDir);
  expect(r.rows).toBe(81);
  expect(r.state.settings.policy).toBe("local_response");
  expect(r.state).toEqual(state);
  await page.locator("#r-compare-pair").click();
  await ready(page, "compare");
  const comparison = await savedState(page);
  expect(comparison.settings.mode).toBe("resistance");
  expect(comparison.settings.policy).toBe("local_response");
  const c = await bundle(page, info.outputDir);
  expect(c.state).toEqual(comparison);
  expect(c.manifest.image_count).toBe(2);
  await restore(page, comparison);
  await ready(page, "compare");
  expect(await savedState(page)).toEqual(comparison);
});

test("source audit and nonmonotone paper bundles retain source fields and curve order", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.goto("./?presentation=map");
  await ready(page);
  await page.locator('[data-view="laboratory"]').click();
  await ready(page, "laboratory");
  await page.locator("#lab-figure").selectOption("5A");
  await ready(page, "laboratory");
  const paper = await bundle(page, info.outputDir);
  expect(paper.rows).toBeGreaterThan(4000);
  expect(paper.state.settings.figure).toBe("5A");
  await info.attach("paper-export", {
    path: info.outputPath("figure.png"),
    contentType: "image/png",
  });
  await page.locator("#lab-source").selectOption("savorgnan");
  await ready(page, "laboratory");
  const source = await bundle(page, info.outputDir);
  expect(source.state.settings.source).toBe("savorgnan");
  expect(source.manifest.sources[2].status).toContain("unresolved");
  await page.locator("#lab-source").selectOption("inverse");
  await ready(page, "laboratory");
  const inverse = await bundle(page, info.outputDir);
  expect(inverse.state.settings.source).toBe("inverse");
  expect(inverse.manifest.image_count).toBe(4);
  await page.locator('[data-view="model"]').click();
  await ready(page, "model");
  const model = await bundle(page, info.outputDir);
  expect(model.state.view).toBe("model");
  await restore(page, source.state);
  await ready(page, "laboratory");
  expect(await savedState(page)).toEqual(source.state);
});

test("bad imported state leaves display intact and changes during export cancel the download", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("./?presentation=map");
  await ready(page);
  const state = await savedState(page);
  const bad = structuredClone(state);
  bad.settings.x.n = 402;
  await page.locator("#import-state").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(bad)),
  });
  await expect(page.locator("#export-status")).toContainText(
    "Export/import error",
  );
  expect(await savedState(page)).toEqual(state);
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.evaluate(() => {
    (window as unknown as { exportDecodeCount: number }).exportDecodeCount = 0;
    const original = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      ++(window as unknown as { exportDecodeCount: number }).exportDecodeCount;
      return new Promise<void>((resolve) => setTimeout(resolve, 800)).then(() =>
        original.call(this),
      );
    };
  });
  await page.locator("#export-bundle").click();
  await page.waitForFunction(
    () =>
      (window as unknown as { exportDecodeCount: number }).exportDecodeCount >
      0,
  );
  await page.locator("#scene").selectOption("E3");
  await expect(page.locator("#export-status")).toContainText("Display changed");
  expect(downloads).toBe(0);
  await ready(page);
});

test("zoom during image rendering aborts a bundle before plot ranges can diverge", async ({
  page,
}) => {
  await page.goto("./?presentation=map");
  await ready(page);
  await page.evaluate(() => {
    (window as unknown as { exportDecodeCount: number }).exportDecodeCount = 0;
    const original = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      ++(window as unknown as { exportDecodeCount: number }).exportDecodeCount;
      return new Promise<void>((resolve) => setTimeout(resolve, 800)).then(() =>
        original.call(this),
      );
    };
  });
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.locator("#export-bundle").click();
  await page.waitForFunction(
    () =>
      (window as unknown as { exportDecodeCount: number }).exportDecodeCount >
      0,
  );
  await page.locator("#right-map").scrollIntoViewIfNeeded();
  const box = (await page.locator("#right-map .nsewdrag").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.7, {
    steps: 5,
  });
  await page.mouse.up();
  await expect(page.locator("#export-status")).toContainText("Display changed");
  expect(downloads).toBe(0);
  await expect(page.locator("#export-bundle")).toBeEnabled();
});
