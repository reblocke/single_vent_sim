import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const configs = [
  "config/examples/baseline.json",
  "config/examples/ahmed_inspired_hb14_ci6.json",
  "config/resistance/normalized_reference.json",
  "config/examples/hb_ratio_grid.json",
];

test("shared wheel and input contracts load without external requests", async ({
  page,
}, testInfo) => {
  const external: string[] = [];
  await page.route("**/*", (route) => {
    if (
      !new URL(route.request().url()).hostname.match(
        /^(127\.0\.0\.1|localhost)$/,
      )
    ) {
      external.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto("./");
  await expect(page.locator("#status")).toHaveAttribute("data-state", "ready");
  await expect(page.locator("#versions")).toContainText("3.14.2");
  await expect(page.locator("#versions")).toContainText("2.4.6");
  await expect(page.locator("#versions")).toContainText("T02R");
  for (const path of configs) {
    await page.locator("#configuration").setInputFiles({
      name: "example.json",
      mimeType: "application/json",
      buffer: readFileSync("../" + path),
    });
    const schema = JSON.parse(
      readFileSync("../" + path, "utf8"),
    ).schema_version;
    await expect(page.locator("#validation")).toHaveText(
      `Valid ${schema} input. No scientific calculation performed.`,
    );
  }
  const afterInitialization: string[] = [];
  await page.unroute("**/*");
  await page.route("**/*", (route) => {
    afterInitialization.push(route.request().url());
    return route.abort();
  });
  // Block every subsequent network request. WebKit's emulated offline mode also
  // breaks local Blob/File reads, so it cannot isolate network independence.
  await page.locator("#configuration").evaluate((element) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(['{"schema_version":"bad"}'], "invalid.json", {
        type: "application/json",
      }),
    );
    (element as HTMLInputElement).files = transfer.files;
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.locator("#validation")).toHaveText(
    "Invalid input: Unknown schema version",
  );
  await page.locator("#configuration").evaluate(
    (element, text) => {
      const transfer = new DataTransfer();
      transfer.items.add(
        new File([text], "baseline.json", { type: "application/json" }),
      );
      (element as HTMLInputElement).files = transfer.files;
      element.dispatchEvent(new Event("change", { bubbles: true }));
    },
    readFileSync("../config/examples/baseline.json", "utf8"),
  );
  await expect(page.locator("#validation")).toHaveText(
    "Valid scenario-v1 input. No scientific calculation performed.",
  );
  expect(external).toEqual([]);
  expect(afterInitialization).toEqual([]);
  await page.screenshot({
    path: testInfo.outputPath("desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("h1")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("mobile.png"),
    fullPage: true,
  });
});

test("runtime download failure is visible and retry recovers", async ({
  page,
}) => {
  await page.route("**/pyodide.asm.wasm", (route) => route.abort());
  await page.goto("./");
  await expect(page.locator("#status")).toHaveAttribute("data-state", "error");
  await expect(page.locator("#configuration")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Retry initialization" }),
  ).toBeVisible();
  await page.unroute("**/pyodide.asm.wasm");
  await page.getByRole("button", { name: "Retry initialization" }).click();
  await expect(page.locator("#status")).toHaveAttribute("data-state", "ready");
  await expect(page.locator("#configuration")).toBeEnabled();
});
