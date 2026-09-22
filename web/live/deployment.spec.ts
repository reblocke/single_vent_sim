import "../tests/hardening.spec";
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const expectedCommit = process.env.EXPECTED_COMMIT;
const manifestPath = process.env.ACCEPTED_ASSET_MANIFEST;
if (!expectedCommit || !manifestPath)
  throw new Error(
    "Live verification requires EXPECTED_COMMIT and ACCEPTED_ASSET_MANIFEST from the tested deployment artifact",
  );
const accepted = JSON.parse(readFileSync(manifestPath, "utf8"));
test("accepted deployed build initializes and calculates with same-origin runtime", async ({
  page,
  request,
}, info) => {
  test.setTimeout(180000);
  const external: string[] = [];
  const errors: string[] = [];
  const origin = new URL(info.project.use.baseURL!).origin;
  page.on("request", (r) => {
    if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== origin)
      external.push(r.url());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  const response = await request.get("asset-manifest.json");
  expect(response.ok()).toBe(true);
  expect(await response.json()).toEqual(accepted);
  const build = await request.get("build-info.json").then((r) => r.json());
  expect(build.code_commit).toBe(expectedCommit);
  await page.goto("./?presentation=map");
  await expect(page.locator("#status")).toHaveAttribute("data-state", "ready");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await expect(page.locator("#versions")).toContainText("3.14.2");
  await expect(page.locator("#versions")).toContainText("2.4.6");
  await expect(page.locator("#versions")).toContainText("T07");
  const state = JSON.parse((await page.locator("#state-json").textContent())!);
  expect(state.metrics.do2_ml_kg_min).toBeCloseTo(20.264, 10);
  const stateDownload = page.waitForEvent("download");
  await page.locator("#export-state").click();
  const saved = JSON.parse(
    readFileSync((await (await stateDownload).path())!, "utf8"),
  );
  await page.locator("#scene").selectOption("H1");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator("#import-state").setInputFiles({
    name: "scenario.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(saved)),
  });
  await expect(page.locator("#export-status")).toContainText(
    "Validated configuration restored",
  );
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await expect(page.locator("#scene")).toHaveValue("E1");
  expect(
    JSON.parse((await page.locator("#state-json").textContent())!).metrics
      .do2_ml_kg_min,
  ).toBeCloseTo(20.264, 10);
  await page.locator('[data-view="compare"]').click();
  await expect(page.locator("#compare")).toHaveAttribute(
    "data-pending",
    "false",
  );
  const c = JSON.parse((await page.locator("#compare-json").textContent())!);
  expect(c.comparison.a.metrics.do2_ml_kg_min).toBeCloseTo(20.264, 10);
  expect(c.comparison.b.metrics.do2_ml_kg_min).toBeCloseTo(30.7696, 10);
  await page.locator('[data-view="laboratory"]').click();
  await expect(page.locator("#laboratory")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator("#lab-source").selectOption("ahmed");
  await expect(page.locator("#laboratory")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await expect(page.locator("#lab-contract")).toContainText(
    "full-text settings unverified",
  );
  await page.locator('[data-view="explore"]').click();
  await page.locator("#flow-provider").selectOption("resistance");
  await expect(page.locator("#resistance-panel")).toHaveAttribute(
    "data-pending",
    "false",
  );
  const point = JSON.parse(
    (await page.locator("#r-json").textContent())!,
  ).displayed_state;
  expect(point.hemodynamic_status).toBe("solved");
  expect(point.metrics.sa_fraction).toBeCloseTo(0.8, 10);
  const download = page.waitForEvent("download");
  await page.locator("#export-bundle").click();
  const file = await download;
  await file.saveAs(info.outputPath("live-resistance.zip"));
  expect(await file.failure()).toBeNull();
  await page.locator('[data-view="model"]').click();
  await expect(page.locator("#model")).toHaveAttribute("data-pending", "false");
  await expect(page.locator("#model-verification")).toContainText("108 / 108");
  await page.screenshot({
    path: info.outputPath("live-validation.png"),
    fullPage: true,
  });
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await info.attach("live-build.json", {
    body: JSON.stringify(build, null, 2),
    contentType: "application/json",
  });
});
