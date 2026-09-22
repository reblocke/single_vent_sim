import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

type Command = { operation: string; arguments: Record<string, unknown> };
type Case = { id: string; command: Command; expected: unknown };
const cases: Case[] = JSON.parse(
  readFileSync("../artifacts/browser-parity.json", "utf8"),
).cases;

function equivalent(
  actual: unknown,
  expected: unknown,
  path: string,
  exact = false,
): number {
  if (typeof expected === "number") {
    if (typeof actual !== "number" || !Number.isFinite(actual))
      throw new Error(`${path}: nonnumeric ${actual}`);
    const error = Math.abs(actual - expected);
    if (error > (exact ? 0 : 1e-10 + 1e-10 * Math.abs(expected)))
      throw new Error(`${path}: ${actual} != ${expected}`);
    return error;
  }
  if (expected === null || typeof expected !== "object") {
    if (actual !== expected)
      throw new Error(
        `${path}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`,
      );
    return 0;
  }
  if (
    !actual ||
    typeof actual !== "object" ||
    Array.isArray(actual) !== Array.isArray(expected)
  )
    throw new Error(`${path}: shape differs`);
  expect(Object.keys(actual).sort(), path).toEqual(
    Object.keys(expected).sort(),
  );
  let maximum = 0;
  for (const [key, value] of Object.entries(expected)) {
    maximum = Math.max(
      maximum,
      equivalent(
        (actual as Record<string, unknown>)[key],
        value,
        `${path}.${key}`,
        exact,
      ),
    );
  }
  return maximum;
}

test("CPython parity, lossless exchange and bounded repeated-request memory", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(240000);
  await page.goto("./?presentation=map");
  await expect(page.locator("#status")).toHaveAttribute("data-state", "ready");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  const network: string[] = [];
  await page.route("**/*", (route) => {
    network.push(route.request().url());
    return route.abort();
  });
  const evidence: { id: string; maximumAbsoluteError: number }[] = [];
  for (const sample of cases) {
    const actual = await page.evaluate(
      (c) => window.parallelO2.compute(c.operation, c.arguments),
      sample.command,
    );
    evidence.push({
      id: sample.id,
      maximumAbsoluteError: equivalent(actual, sample.expected, sample.id),
    });
  }
  const representative = cases.filter((c) =>
    [
      "kg-grid",
      "m2-grid",
      "m2-0-ratio_interval",
      "circuit_secant-local_response",
    ].some((id) => c.id.startsWith(id)),
  );
  // Include a source-labeled indexed state and an undefined zero-consumption state.
  representative.push(cases[15], cases[0]);
  for (const sample of representative) {
    for (const format of ["json", "csv"]) {
      const roundtrip = await page.evaluate(
        async ({ command, format }) => {
          const result = await window.parallelO2.compute(
            command.operation,
            command.arguments,
          );
          const provenance = {
            source_status: "unavailable",
            model: "shared Python",
            source_id: "parity-check",
          };
          const text = await window.parallelO2.compute("export_result", {
            result,
            provenance,
            format,
          });
          return {
            original: {
              schema_version: "parallel-o2-result-v1",
              result,
              provenance,
            },
            imported: await window.parallelO2.compute("import_result", {
              text,
              format,
            }),
          };
        },
        { command: sample.command, format },
      );
      equivalent(
        roundtrip.imported,
        roundtrip.original,
        `${sample.id}-${format}`,
        true,
      );
    }
  }
  const stress = await page.evaluate(
    async (command) => {
      for (let i = 0; i < 10; i++)
        await window.parallelO2.compute(command.operation, command.arguments);
      const before = (await window.parallelO2.compute("diagnostics", {})) as {
        tracked_python_objects: number;
      };
      for (let i = 0; i < 200; i++)
        await window.parallelO2.compute(command.operation, command.arguments);
      const after = (await window.parallelO2.compute("diagnostics", {})) as {
        tracked_python_objects: number;
      };
      return { before, after };
    },
    cases.find((c) => c.id === "m2-grid")!.command,
  );
  expect(
    stress.after.tracked_python_objects - stress.before.tracked_python_objects,
  ).toBeLessThanOrEqual(10);
  expect(network).toEqual([]);
  await info.attach("numerical-parity.json", {
    body: JSON.stringify({
      browser: browser.version(),
      cases: evidence,
      exchangeCases: representative.map((c) => c.id),
      stress,
      network,
    }),
    contentType: "application/json",
  });
});

test("late replies cannot repaint and intermediate requests are coalesced", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    (
      window as unknown as { delayedWorkerMessages: number[] }
    ).delayedWorkerMessages = [];
    window.Worker = class extends NativeWorker {
      private handler: ((event: MessageEvent) => void) | null = null;
      private delayed = false;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        super.addEventListener("message", (event) => {
          if (
            event.data.type === "computed" &&
            !this.delayed &&
            (window as unknown as { delayCalculations?: boolean })
              .delayCalculations
          ) {
            this.delayed = true;
            setTimeout(() => this.handler?.(event), 200);
          } else this.handler?.(event);
        });
      }
      override set onmessage(value: ((event: MessageEvent) => void) | null) {
        this.handler = value;
      }
      override get onmessage() {
        return this.handler;
      }
      override postMessage(message: { type: string; id: number }) {
        if (message.type === "compute")
          (
            window as unknown as { delayedWorkerMessages: number[] }
          ).delayedWorkerMessages.push(message.id);
        super.postMessage(message);
      }
    };
  });
  await page.goto("./?presentation=map");
  await expect(page.locator("#status")).toHaveAttribute("data-state", "ready");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  const outcome = await page.evaluate(async (command) => {
    (window as unknown as { delayCalculations: boolean }).delayCalculations =
      true;
    (
      window as unknown as { delayedWorkerMessages: number[] }
    ).delayedWorkerMessages = [];
    const painted: number[] = [];
    const work = Array.from({ length: 20 }, (_, i) =>
      window.parallelO2.compute(command.operation, command.arguments).then(
        () => {
          painted.push(i);
          return "resolved";
        },
        (error) => String(error),
      ),
    );
    const results = await Promise.all(work);
    return {
      painted,
      results,
      sent: (window as unknown as { delayedWorkerMessages: number[] })
        .delayedWorkerMessages,
    };
  }, cases[0].command);
  expect(outcome.painted).toEqual([19]);
  expect(
    outcome.results.slice(0, 19).every((text) => text.includes("Superseded")),
  ).toBe(true);
  expect(outcome.sent).toHaveLength(2);
});

test("calculation errors do not poison subsequent valid requests", async ({
  page,
}) => {
  await page.goto("./?presentation=map");
  await expect(page.locator("#status")).toHaveAttribute("data-state", "ready");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  for (const command of [
    { operation: "grid", arguments: { base: null } },
    { operation: "eval", arguments: { expression: "1 + 1" } },
    { operation: "batch", arguments: { commands: new Array(201).fill({}) } },
    {
      operation: "inverse",
      arguments: { sa: 0.99, sv: 0.5, spv_true: 0.99, spv_assumed: 1 },
    },
  ]) {
    const error = await page.evaluate(async (c) => {
      try {
        await window.parallelO2.compute(c.operation, c.arguments);
        return "unexpected success";
      } catch (error) {
        return String(error);
      }
    }, command);
    expect(error).not.toBe("unexpected success");
    expect(error).not.toContain("Traceback");
  }
  const result = await page.evaluate(
    (c) => window.parallelO2.compute(c.operation, c.arguments),
    cases[0].command,
  );
  equivalent(result, cases[0].expected, "after errors");
});

test("selected configuration inspector computes the actual shared-engine record", async ({
  page,
}, info) => {
  await page.goto("./?presentation=map");
  await expect(page.locator("#status")).toHaveAttribute("data-state", "ready");
  await expect(page.locator("#explore")).toHaveAttribute(
    "data-pending",
    "false",
  );
  await page.locator("#configuration").setInputFiles({
    name: "baseline.json",
    mimeType: "application/json",
    buffer: readFileSync("../config/examples/baseline.json"),
  });
  await expect(page.locator("#calculate")).toBeEnabled();
  await page.locator("#calculate").click();
  await expect(page.locator("#calculation-status")).toContainText(
    "Calculation complete",
  );
  await page
    .getByText("Numerical result and audit record", { exact: true })
    .click();
  const displayed = JSON.parse(
    (await page.locator("#calculation-result").textContent()) ?? "null",
  );
  const direct = await page.evaluate(
    (scenario) => window.parallelO2.compute("solve_state", { scenario }),
    JSON.parse(readFileSync("../config/examples/baseline.json", "utf8")),
  );
  equivalent(displayed, direct, "visible inspector", true);
  await page.screenshot({
    path: info.outputPath("inspector.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
