import "./style.css";
import { RuntimeClient } from "./worker-client";
import { Explorer } from "./explore";
import { ResistanceExplorer } from "./resistance";

const status = document.querySelector<HTMLParagraphElement>("#status")!;
const versions = document.querySelector<HTMLDListElement>("#versions")!;
const retry = document.querySelector<HTMLButtonElement>("#retry")!;
const file = document.querySelector<HTMLInputElement>("#configuration")!;
const validation = document.querySelector<HTMLParagraphElement>("#validation")!;
const calculate = document.querySelector<HTMLButtonElement>("#calculate")!;
const calculationStatus = document.querySelector<HTMLParagraphElement>(
  "#calculation-status",
)!;
const calculationResult = document.querySelector<HTMLPreElement>(
  "#calculation-result",
)!;
let configuration: Record<string, unknown> | undefined;
let calculationGeneration = 0;
let client: RuntimeClient | undefined;
let generation = 0;
let validationGeneration = 0;
let explorer: Explorer | undefined;
let resistance: ResistanceExplorer | undefined;
const provider = document.querySelector<HTMLSelectElement>("#flow-provider")!;
function refreshProvider() {
  const prescribed = provider.value === "prescribed";
  document.querySelector<HTMLElement>("#prescribed-explorer")!.hidden =
    !prescribed;
  document.querySelector<HTMLElement>("#resistance-panel")!.hidden = prescribed;
  document.querySelector<HTMLElement>(".mode-contract")!.textContent =
    `Steady-state sensitivity experiment; ${prescribed ? "prescribed flows" : "assumed resistance/output law"}, prescribed demand. Mathematical admissibility is not clinical safety.`;
  if (prescribed) {
    resistance?.suspend();
    explorer?.refresh();
  } else {
    explorer?.suspend();
    document.querySelector<HTMLElement>("#explore")!.dataset.pending = "false";
    resistance?.refresh();
  }
}
provider.addEventListener("change", refreshProvider);
const timings: { operation: string; workerMs: number; roundTripMs: number }[] =
  [];
export async function compute(
  operation: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (!client || status.dataset.state !== "ready")
    throw new Error("Python runtime is not ready");
  const started = performance.now();
  const reply = await client.request({
    type: "compute",
    text: JSON.stringify({
      schema_version: "engine-command-v1",
      operation,
      arguments: args,
    }),
  });
  if (reply.type !== "computed")
    throw new Error("Unexpected calculation reply");
  timings.push({
    operation,
    workerMs: reply.elapsedMs,
    roundTripMs: performance.now() - started,
  });
  if (timings.length > 100) timings.shift();
  return reply.result;
}
declare global {
  interface Window {
    parallelO2: {
      compute: typeof compute;
      snapshot: () => unknown;
      timings: () => typeof timings;
    };
  }
}
// The application and browser parity checks use this same bounded operation API.
window.parallelO2 = {
  compute,
  snapshot: () =>
    provider.value === "prescribed"
      ? explorer?.snapshot()
      : resistance?.snapshot(),
  timings: () => structuredClone(timings),
};
async function initialize() {
  const current = ++generation;
  explorer?.suspend();
  resistance?.suspend();
  client?.close();
  versions.replaceChildren();
  retry.hidden = true;
  provider.disabled = true;
  file.disabled = true;
  calculate.disabled = true;
  configuration = undefined;
  ++calculationGeneration;
  calculationStatus.textContent = "";
  calculationResult.textContent = "";
  validation.textContent = "";
  status.dataset.state = "loading";
  status.textContent = "Starting the Python worker…";
  const fresh = new RuntimeClient(
    (message) => {
      if (current === generation) status.textContent = message;
    },
    (error) => {
      if (current !== generation) return;
      status.textContent = "Python runtime unavailable: " + error.message;
      status.dataset.state = "error";
      retry.hidden = false;
      provider.disabled = true;
      file.disabled = calculate.disabled = true;
      explorer?.suspend();
      resistance?.suspend();
    },
  );
  client = fresh;
  try {
    const result = await fresh.request({ type: "init" });
    if (current !== generation || result.type !== "ready") return;
    for (const [name, value] of Object.entries(result.versions)) {
      const term = document.createElement("dt");
      term.textContent = name;
      const definition = document.createElement("dd");
      definition.textContent = value;
      versions.append(term, definition);
    }
    status.textContent = "Shared Python environment ready";
    status.dataset.state = "ready";
    file.disabled = false;
    provider.disabled = false;
    if (!resistance) resistance = new ResistanceExplorer(compute);
    if (explorer) refreshProvider();
    else explorer = new Explorer(compute);
  } catch (error) {
    if (current !== generation) return;
    status.textContent = "Initialization failed: " + String(error);
    status.dataset.state = "error";
    retry.hidden = false;
  }
}
file.addEventListener("change", async () => {
  const selected = file.files?.[0];
  if (!selected || !client) return;
  const current = generation;
  const currentValidation = ++validationGeneration;
  validation.textContent = "Validating input structure…";
  calculate.disabled = true;
  configuration = undefined;
  ++calculationGeneration;
  calculationStatus.textContent = "";
  calculationResult.textContent = "";
  try {
    if (selected.size > 1048576) throw new Error("Configuration exceeds 1 MiB");
    const text = await selected.text();
    if (current !== generation || currentValidation !== validationGeneration)
      return;
    const result = await client.request({ type: "validate", text });
    if (
      current === generation &&
      currentValidation === validationGeneration &&
      result.type === "validated"
    ) {
      validation.textContent = `Valid ${result.schema} input. No scientific calculation performed.`;
      configuration = JSON.parse(text) as Record<string, unknown>;
      calculate.disabled = result.schema === "criteria-v1";
    }
  } catch (error) {
    if (current === generation && currentValidation === validationGeneration)
      validation.textContent =
        "Invalid input: " +
        (error instanceof Error ? error.message : String(error));
  }
});
calculate.addEventListener("click", async () => {
  if (!configuration) return;
  const current = ++calculationGeneration;
  calculationStatus.textContent = "Calculating with the shared Python engine…";
  try {
    let operation: string;
    let args: Record<string, unknown>;
    if (String(configuration.schema_version).startsWith("scenario-")) {
      operation = "solve_state";
      args = { scenario: configuration };
    } else if (configuration.schema_version === "resistance-experiment-v1") {
      operation = "resistance_state";
      args = { request: configuration };
    } else {
      operation = "grid";
      const { schema_version: _schema, ...request } = configuration;
      args = request;
    }
    const result = await compute(operation, args);
    if (current !== calculationGeneration) return;
    calculationResult.textContent = JSON.stringify(result, null, 2);
    calculationStatus.textContent =
      "Calculation complete. Inspect the numerical result and audit record below.";
  } catch (error) {
    if (current === calculationGeneration)
      calculationStatus.textContent = "Calculation failed: " + String(error);
  }
});
retry.addEventListener("click", () => void initialize());
window.addEventListener("pagehide", () => client?.close());
void initialize();

for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-view]",
)) {
  button.addEventListener("click", () => {
    for (const view of document.querySelectorAll<HTMLElement>(".view"))
      view.hidden = view.id !== button.dataset.view;
    for (const other of document.querySelectorAll("[data-view]"))
      other.removeAttribute("aria-current");
    button.setAttribute("aria-current", "page");
  });
}
