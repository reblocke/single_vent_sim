import { OneChange } from "./presentation/one-change";
import { questions, questionFor } from "./presentation/registry";
import { scenes, getParameter, setParameter, parameters } from "./scenes";
import type { Scenario } from "./model-types";
import type { Presentation, Drafts } from "./settings";
import type { BuildContext } from "./protocol";
import "./style.css";
import { accessibleTables } from "./accessibility";
accessibleTables();
import { RuntimeClient } from "./worker-client";
import { Explorer } from "./explore";
import { ResistanceExplorer } from "./resistance";
import { CompareView } from "./compare";
import { Laboratory } from "./laboratory";
import { EnsembleView } from "./ensemble";
import { ExportPanel } from "./export";
import { showModel, modelRecord } from "./model-view";
import type { UIState } from "./settings";

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
let buildContext: BuildContext | undefined;
let generation = 0;
let validationGeneration = 0;
let explorer: Explorer | undefined;
let resistance: ResistanceExplorer | undefined;
let comparison: CompareView | undefined;
let laboratory: Laboratory | undefined;
let ensemble: EnsembleView | undefined;
let exports: ExportPanel | undefined;
let currentView = "explore";
let oneChange: OneChange | undefined;
let presentation: Presentation = {
  question: "hemoglobin",
  mode:
    new URLSearchParams(location.search).get("presentation") === "map"
      ? "map"
      : "one_change",
};
let drafts: Drafts = {};
let workspaceGeneration = 0;
// An asynchronous presentation conversion is invalid as soon as its source draft changes.
for (const event of ["input", "change"])
  document.addEventListener(
    event,
    () => {
      ++workspaceGeneration;
    },
    true,
  );
document.addEventListener(
  "click",
  (event) => {
    if ((event.target as HTMLElement).closest("#one-change button"))
      ++workspaceGeneration;
  },
  true,
);
const questionSelect = document.getElementById(
  "question-select",
) as HTMLSelectElement;
const variantSelect = document.getElementById(
  "question-variant",
) as HTMLSelectElement;
for (const group of [...new Set(questions.map((q) => q.group))]) {
  const opt = document.createElement("optgroup");
  opt.label = group;
  for (const q of questions.filter((q) => q.group === group))
    opt.append(new Option(q.label, q.id));
  questionSelect.append(opt);
}
function questionControls() {
  questionSelect.value = presentation.question;
  const q = questions.find((q) => q.id === presentation.question)!;
  variantSelect.replaceChildren(
    ...q.variants.map(
      (id) =>
        new Option(id.startsWith("C") ? "Compare · " + id : "Map · " + id, id),
    ),
  );
  (document.getElementById("show-one") as HTMLButtonElement).disabled =
    provider.value !== "prescribed";
}
function notice(text: string) {
  document.getElementById("presentation-notice")!.textContent = text;
}

const provider = document.querySelector<HTMLSelectElement>("#flow-provider")!;
function presentationEnabled(enabled: boolean) {
  questionSelect.disabled = !enabled;
  variantSelect.disabled = !enabled;
  for (const id of ["show-one", "show-map"])
    (document.getElementById(id) as HTMLButtonElement).disabled = !enabled;
}

function refreshProvider() {
  if (currentView !== "explore") return;
  questionControls();
  const prescribed = provider.value === "prescribed";
  const one = prescribed && presentation.mode === "one_change";
  document.getElementById("one-change")!.hidden = !one;
  document.getElementById("provider-label")!.hidden = one;
  document.getElementById("prescribed-explorer")!.hidden = !prescribed || one;
  document.getElementById("resistance-panel")!.hidden = prescribed;
  if (one) {
    explorer?.suspend();
    resistance?.suspend();
    oneChange?.refresh();
    return;
  }
  oneChange?.suspend();
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
provider.addEventListener("change", () => {
  ++workspaceGeneration;
  presentation.mode = "map";
  notice(
    "Restored the last-used " +
      (provider.value === "prescribed"
        ? "specified-flow"
        : "resistance-assumption") +
      " draft; this is a separate experiment.",
  );
  presentation.question = questionFor(
    provider.value === "prescribed"
      ? explorer!.configuration().preset
      : resistance!.configuration().preset,
  ).id;
  questionControls();
  refreshProvider();
});
questionSelect.addEventListener("change", () => {
  ++workspaceGeneration;
  const q = questions.find((q) => q.id === questionSelect.value)!;
  presentation.question = q.id;
  questionControls();
  if (q.comparison) {
    provider.value = "prescribed";
    presentation.mode = "one_change";
    explorer?.suspend();
    resistance?.suspend();
    document.getElementById("one-change")!.hidden = false;
    document.getElementById("prescribed-explorer")!.hidden = true;
    document.getElementById("resistance-panel")!.hidden = true;
    document.getElementById("provider-label")!.hidden = true;
    questionControls();
    void oneChange?.load(q.id);
    notice("Loaded named example: " + q.label);
  } else openVariant(q.map);
});
function openVariant(id: string) {
  ++workspaceGeneration;
  presentation.mode = "map";
  if (id.startsWith("C")) {
    (document.getElementById("comparison-preset") as HTMLSelectElement).value =
      id;
    document
      .getElementById("comparison-preset")!
      .dispatchEvent(new Event("change"));
    document.querySelector<HTMLButtonElement>('[data-view="compare"]')!.click();
    return;
  }
  provider.value = id.startsWith("R") ? "resistance" : "prescribed";
  const select = document.getElementById(
    id.startsWith("R") ? "r-scene" : "scene",
  ) as HTMLSelectElement;
  select.value = id;
  select.dispatchEvent(new Event("change"));
  refreshProvider();
  notice(
    "Loaded named map variant " +
      id +
      ". Plot settings expose the two varied parameters.",
  );
}
variantSelect.addEventListener("change", () =>
  openVariant(variantSelect.value),
);
for (const id of ["scene", "r-scene"]) {
  document.addEventListener("change", (event) => {
    if ((event.target as HTMLElement).id !== id) return;
    const value = (event.target as HTMLSelectElement).value;
    presentation.question = questionFor(value).id;
    presentation.mode = "map";
    questionControls();
    variantSelect.value = value;
  });
}
document
  .getElementById("show-map")!
  .addEventListener("click", () => void expandMap());
async function expandMap() {
  if (presentation.mode === "map") {
    notice("Already inspecting a two-input map.");
    return;
  }
  const token = ++workspaceGeneration;
  try {
    const one = oneChange!.configuration(),
      q = questions.find((q) => q.id === presentation.question)!,
      scene = scenes.find((s) => s.id === q.map)!;
    const a = (await compute("flow_mode", {
      scenario: one.a,
      mode: scene.base.flow.mode,
    })) as Scenario;
    const b = structuredClone(one.a);
    setParameter(b, one.parameter, one.target);
    const convertedB = (await compute("flow_mode", {
      scenario: b,
      mode: scene.base.flow.mode,
    })) as Scenario;
    if (token !== workspaceGeneration) return;
    const setting = explorer!.configuration();
    setting.preset = scene.id;
    setting.kind = null;
    setting.base = a;
    setting.x = structuredClone(scene.x);
    setting.y = structuredClone(scene.y);
    const suffix = a.indexing_basis === "per_m2" ? "ml_min_m2" : "ml_kg_min";
    setting.metrics = ["sa_fraction", "do2_" + suffix];
    setting.display_modes = ["continuous", "continuous"];
    setting.criteria = one.criteria;
    setting.slice_visible = false;
    setting.pins = {};
    // Adapt the preset's physical indexing paths to the active explicit basis.
    for (const axis of [setting.x, setting.y]) {
      if (a.indexing_basis === "per_m2")
        axis.parameter = axis.parameter
          .replace("qt_ml_kg_min", "qt_l_min_m2")
          .replace("qp_ml_kg_min", "qp_l_min_m2")
          .replace("qs_ml_kg_min", "qs_l_min_m2")
          .replace("vo2_target_ml_kg_min", "vo2_target_ml_min_m2");
      if (a.indexing_basis === "per_m2") {
        [axis.min, axis.max] = parameters[axis.parameter].range;
      }
      const v = getParameter(a, axis.parameter);
      if (Number.isFinite(v)) {
        axis.min = Math.min(axis.min, v);
        axis.max = Math.max(axis.max, v);
      }
    }
    setting.selected = {
      x: getParameter(a, setting.x.parameter),
      y: getParameter(a, setting.y.parameter),
    };
    const projected = structuredClone(a);
    for (const axis of [setting.x, setting.y])
      setParameter(
        projected,
        axis.parameter,
        getParameter(convertedB, axis.parameter),
      );
    const represented =
      JSON.stringify(projected) === JSON.stringify(convertedB);
    if (represented)
      for (const axis of [setting.x, setting.y]) {
        const v = getParameter(convertedB, axis.parameter);
        axis.min = Math.min(axis.min, v);
        axis.max = Math.max(axis.max, v);
      }
    if (represented)
      setting.pins = {
        a,
        b: convertedB,
        criteria_a: one.criteria,
        criteria_b: one.criteria,
      };
    presentation.mode = "map";
    provider.value = "prescribed";
    explorer!.restore(setting);
    refreshProvider();
    notice(
      "Expanded the same question: varying " +
        setting.x.parameter +
        " and " +
        setting.y.parameter +
        ". " +
        (represented
          ? "A/B retain the same fixed constraints."
          : "A/B do not share this surface's fixed constraints; no endpoint markers were added."),
    );
  } catch (e) {
    notice("Cannot expand this experiment: " + String(e));
  }
}
document.getElementById("show-one")!.addEventListener("click", () => {
  if (provider.value !== "prescribed") return;
  if (presentation.mode === "one_change") return;
  const settings = explorer!.configuration();
  if (settings.kind) {
    notice(
      "This derived map is not a single-change experiment. Select an explicit forward-state question to load its example.",
    );
    return;
  }
  const state = (explorer!.snapshot() as any)?.state;
  if (!state?.requested) {
    notice("Select a finite forward state first.");
    return;
  }
  const parameter = settings.x.parameter;
  const value = getParameter(state.requested, parameter);
  presentation.mode = "one_change";
  oneChange!.restore({
    a: state.requested,
    parameter,
    target: value,
    axis: settings.x,
    criteria: settings.criteria,
  });
  refreshProvider();
  notice(
    "Selected point is the starting state. Choose the independent parameter and target explicitly; B initially equals A.",
  );
});

function refreshView() {
  oneChange?.suspend();
  explorer?.suspend();
  resistance?.suspend();
  comparison?.suspend();
  laboratory?.suspend();
  ensemble?.suspend();
  if (status.dataset.state !== "ready") return;
  if (currentView === "explore") refreshProvider();
  if (currentView === "compare") comparison?.refresh();
  if (currentView === "laboratory") laboratory?.refresh();
}
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
    currentView === "explore" &&
    provider.value === "prescribed" &&
    presentation.mode === "one_change"
      ? oneChange?.snapshot()
      : currentView === "laboratory"
        ? laboratory?.snapshot()
        : currentView === "compare"
          ? comparison?.snapshot()
          : provider.value === "prescribed"
            ? explorer?.snapshot()
            : resistance?.snapshot(),
  timings: () => structuredClone(timings),
};
function legacyState(): UIState {
  const schema_version = "parallel-o2-ui-state-v1" as const;
  if (currentView === "model")
    return { schema_version, view: "model", settings: {} };
  if (currentView === "compare")
    return {
      schema_version,
      view: "compare",
      settings: comparison!.configuration(),
    };
  if (currentView === "laboratory")
    return {
      schema_version,
      view: "laboratory",
      settings: laboratory!.configuration(),
    };
  return provider.value === "prescribed"
    ? {
        schema_version,
        view: "explore",
        provider: "prescribed",
        settings: explorer!.configuration(),
      }
    : {
        schema_version,
        view: "explore",
        provider: "resistance",
        settings: resistance!.configuration(),
      };
}
function uiState(): UIState {
  const state = legacyState();
  const meta: Presentation = {
    ...presentation,
    mode:
      state.view === "explore" && state.provider === "prescribed"
        ? presentation.mode
        : "map",
  };
  if (meta.mode === "one_change") meta.one_change = oneChange!.configuration();
  else delete meta.one_change;
  if (explorer) drafts.prescribed = explorer.configuration();
  if (resistance) {
    drafts.resistance = resistance.configuration();
    Object.assign(drafts, resistance.oxygenDrafts());
  }
  // Active settings have one owner; drafts store only inactive experiments.
  const savedDrafts = structuredClone(drafts);
  if (state.view === "explore") delete savedDrafts[state.provider];
  if (resistance)
    delete savedDrafts[
      resistance.configuration().request.oxygen.mode as
        | "physical"
        | "normalized_source"
    ];
  return {
    ...state,
    schema_version: "parallel-o2-ui-state-v2",
    presentation: meta,
    drafts: savedDrafts,
  };
}
function capture(includeSnapshot = true) {
  const state = uiState();
  if (
    currentView === "explore" &&
    provider.value === "prescribed" &&
    presentation.mode === "one_change"
  )
    return {
      state,
      host: document.getElementById("one-change")!,
      snapshot: (includeSnapshot ? oneChange?.snapshot() : {}) as Record<
        string,
        unknown
      >,
      caption: document.getElementById("one-contract")!.textContent ?? "",
      ready:
        status.dataset.state === "ready" &&
        document.getElementById("one-change")!.dataset.pending === "false",
    };
  const id =
    state.view === "explore"
      ? state.provider === "resistance"
        ? "resistance-panel"
        : "prescribed-explorer"
      : state.view;
  const host = document.getElementById(id)!;
  const pending = (
    state.view === "explore" && state.provider === "prescribed"
      ? document.getElementById("explore")!
      : host
  ).dataset.pending;
  const captionId =
    state.view === "explore"
      ? state.provider === "prescribed"
        ? "experiment-contract"
        : "r-contract"
      : state.view === "compare"
        ? "compare-contract"
        : state.view === "laboratory"
          ? "lab-contract"
          : "model-caption";
  const selectedPending =
    state.view === "explore"
      ? document.getElementById(
          state.provider === "prescribed" ? "state-inspector" : "r-inspector",
        )!.dataset.pending
      : undefined;
  let extraCaption = "";
  if (state.view === "laboratory" && state.settings.source === "inverse")
    extraCaption = ` Selected inverse inputs: Sa=${state.settings.inverse.sa}, Sv=${state.settings.inverse.sv}, true Spv=${state.settings.inverse.spv_true}, assumed Spv=${state.settings.inverse.spv_assumed} (fractions).`;
  if (state.view === "compare") {
    const result = (
      comparison?.snapshot()?.result as
        | {
            comparison?: {
              a: { requested: unknown };
              b: { requested: unknown };
            };
          }
        | undefined
    )?.comparison;
    const describe = (value: unknown, path = ""): string =>
      value !== null && typeof value === "object"
        ? Object.entries(value)
            .map(([key, item]) => describe(item, path ? path + "." + key : key))
            .join("; ")
        : path + " = " + String(value);
    if (result)
      extraCaption =
        " A inputs: " +
        describe(result.a.requested) +
        ". B inputs: " +
        describe(result.b.requested) +
        ".";
  }
  return {
    state,
    host,
    snapshot: (!includeSnapshot
      ? {}
      : state.view === "model"
        ? modelRecord()
        : window.parallelO2.snapshot()) as Record<string, unknown>,
    caption:
      (document.getElementById(captionId)?.textContent ??
        "Complete mixing, steady state and prescribed demand. Numerical verification is not clinical validation.") +
      extraCaption,
    ready:
      status.dataset.state === "ready" &&
      pending === "false" &&
      selectedPending !== "true" &&
      selectedPending !== "error" &&
      (state.view !== "explore" ||
        state.provider !== "prescribed" ||
        document.getElementById("slice-plots")!.dataset.pending !== "true"),
  };
}
function restoreState(state: UIState) {
  ++workspaceGeneration;
  presentation = structuredClone(
    state.presentation ?? { question: "hemoglobin", mode: "map" },
  );
  drafts = structuredClone(state.drafts ?? {});
  resistance!.restoreOxygenDrafts({
    normalized_source: drafts.normalized_source,
    physical: drafts.physical,
  });
  if (drafts.prescribed) explorer!.restore(drafts.prescribed);
  if (drafts.resistance) resistance!.restore(drafts.resistance);

  oneChange?.suspend();
  explorer?.suspend();
  resistance?.suspend();
  comparison?.suspend();
  laboratory?.suspend();
  ensemble?.suspend();
  if (state.view === "explore") {
    provider.value = state.provider;
    if (state.provider === "prescribed") explorer!.restore(state.settings);
    else resistance!.restore(state.settings);
  } else if (state.view === "compare") comparison!.restore(state.settings);
  else if (state.view === "laboratory") laboratory!.restore(state.settings);
  if (presentation.mode === "one_change" && presentation.one_change)
    oneChange!.restore(presentation.one_change);
  questionControls();
  document
    .querySelector<HTMLButtonElement>(`[data-view="${state.view}"]`)!
    .click();
}
async function initialize() {
  const current = ++generation;
  buildContext = undefined;
  oneChange?.suspend();
  explorer?.suspend();
  resistance?.suspend();
  comparison?.suspend();
  laboratory?.suspend();
  ensemble?.suspend();
  ensemble?.invalidate();
  client?.close();
  versions.replaceChildren();
  retry.hidden = true;
  provider.disabled = true;
  presentationEnabled(false);
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
      ensemble?.invalidate();
      status.textContent = "Python runtime unavailable: " + error.message;
      status.dataset.state = "error";
      retry.hidden = false;
      provider.disabled = true;
      presentationEnabled(false);
      file.disabled = calculate.disabled = true;
      oneChange?.suspend();
      explorer?.suspend();
      resistance?.suspend();
      comparison?.suspend();
      laboratory?.suspend();
      ensemble?.suspend();
    },
  );
  client = fresh;
  try {
    const result = await fresh.request({ type: "init" });
    if (current !== generation || result.type !== "ready") return;
    buildContext = structuredClone({
      build: result.build,
      versions: result.versions,
      validation: result.validation,
    });
    for (const [name, value] of Object.entries(result.versions)) {
      const term = document.createElement("dt");
      term.textContent = name;
      const definition = document.createElement("dd");
      definition.textContent = value;
      versions.append(term, definition);
    }
    status.textContent = "Shared Python environment ready";
    status.dataset.state = "ready";
    if (currentView === "model") await showModel(undefined, buildContext);
    file.disabled = false;
    provider.disabled = false;
    presentationEnabled(true);
    if (!oneChange) oneChange = new OneChange(compute);
    if (!resistance) resistance = new ResistanceExplorer(compute);
    if (!comparison) comparison = new CompareView(compute);
    if (!laboratory) laboratory = new Laboratory(compute);
    if (!ensemble) ensemble = new EnsembleView(compute);
    if (explorer) refreshView();
    else {
      explorer = new Explorer(compute);
      questionControls();
      if (presentation.mode === "one_change") {
        explorer.suspend();
        document.getElementById("prescribed-explorer")!.hidden = true;
        document.getElementById("resistance-panel")!.hidden = true;
        document.getElementById("provider-label")!.hidden = true;
        await oneChange.load("hemoglobin");
      } else document.getElementById("one-change")!.hidden = true;
      if (currentView !== "explore") refreshView();
    }
    if (!exports) {
      exports = new ExportPanel(
        capture,
        restoreState,
        compute,
        () => buildContext,
      );
      await exports.restoreFragment();
    }
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
    ++workspaceGeneration;
    const previous = window.parallelO2.snapshot();
    currentView = button.dataset.view!;
    if (currentView === "model")
      void showModel(previous, buildContext!).catch((error) => {
        document.getElementById("model")!.dataset.pending = "error";
        document.getElementById("model-verification")!.textContent =
          "Verification metadata unavailable: " + String(error);
      });
    for (const view of document.querySelectorAll<HTMLElement>(".view"))
      view.hidden = view.id !== button.dataset.view;
    for (const other of document.querySelectorAll("[data-view]"))
      other.removeAttribute("aria-current");
    button.setAttribute("aria-current", "page");
    refreshView();
  });
}
