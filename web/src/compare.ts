import { renderQuantities } from "./presentation/quantities";
import { compactBudget } from "./budget-plots";
import {
  stateSummary,
  pairedSummary,
  summaryBefore,
} from "./physiology-summary";
import type { ComparisonSettings } from "./settings";
import Plotly from "plotly.js-dist-min";
import { pressureBudget } from "./budget-plots";
import type { Data } from "plotly.js";
import type { Compute, Criteria, Scenario } from "./model-types";
import { titleFor, purge } from "./plots";
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const write = (id: string, value: string) => {
  el(id).textContent = value;
};
const num = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "Undefined / masked"
    : Number(n.toPrecision(8)).toString();
export type Budget = {
  values: Record<string, number | null>;
  unit: string;
  blood_flow_unit: string;
  qp: number | null;
  qs: number | null;
  contents: Record<string, number | null>;
  saturations: Record<string, number | null>;
  normalized: boolean;
  status: string;
  eligible: boolean;
};
type State = {
  metrics: Record<string, number | null>;
  units: Record<string, string>;
  criterion_result: { arterial: string; venous: string; criteria: Criteria };
  requested: Record<string, unknown>;
};
export type Comparison = {
  a: State;
  b: State;
  budgets: { a: Budget; b: Budget };
  status: string;
  changed_inputs: Record<string, { a: unknown; b: unknown }>;
  unchanged_inputs: Record<string, unknown>;
  deltas: Record<
    string,
    {
      absolute: number | null;
      relative: number | null;
      percentage_points?: number | null;
    }
  >;
  decomposition: {
    multiplicative_factors: Record<string, number>;
    log_contributions: Record<string, number>;
    log_delivery_ratio: number;
    log_residual: number;
  } | null;
};
export type Payload = {
  preset: string;
  title: string;
  contract: string;
  comparison: Comparison;
  source_status: string;
  ablation: null | {
    cells: {
      alpha: number;
      nonlinear_fraction: number;
      relative_index_change: number | null;
    }[];
    interaction_relative_fraction: number | null;
  };
};
export function diagram(b: Budget, id: string) {
  const ns = "http://www.w3.org/2000/svg",
    svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 340 330");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    `State ${id}: one mixed arterial source supplies pulmonary and systemic beds; both return to mixing. Uniform arrows indicate routing, not magnitude.`,
  );
  svg.style.width = "100%";
  svg.style.maxWidth = "400px";
  const add = (
    tag: string,
    attrs: Record<string, string>,
    parent: Element = svg,
  ) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    parent.append(n);
    return n;
  };
  const text = (x: number, y: number, value: string, size = 13) => {
    const n = add("text", {
      x: String(x),
      y: String(y),
      "text-anchor": "middle",
      "font-size": String(size),
      fill: "#243b45",
    });
    n.textContent = value;
  };
  const defs = add("defs", {}),
    marker = add(
      "marker",
      {
        id: "arrow-" + id,
        viewBox: "0 0 10 10",
        refX: "9",
        refY: "5",
        markerWidth: "6",
        markerHeight: "6",
        orient: "auto-start-reverse",
      },
      defs,
    );
  add("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: "#486570" }, marker);
  for (const d of [
    "M 100 250 L 45 185 L 45 112",
    "M 115 112 L 140 185 L 140 250",
    "M 230 250 L 295 185 L 295 112",
    "M 220 112 L 200 185 L 200 250",
  ])
    add("path", {
      d,
      fill: "none",
      stroke: "#486570",
      "stroke-width": "2",
      "marker-end": `url(#arrow-${id})`,
    });
  for (const [x, y, w, h] of [
    [5, 15, 150, 96],
    [185, 15, 150, 96],
    [75, 250, 190, 60],
  ])
    add("rect", {
      x: String(x),
      y: String(y),
      width: String(w),
      height: String(h),
      rx: "5",
      fill: "#edf1f2",
      stroke: "#8ca6ab",
    });
  text(80, 36, "Pulmonary bed", 15);
  text(80, 58, "Qp " + num(b.qp));
  text(
    80,
    79,
    b.normalized
      ? "Cpv / B " + num(b.saturations.spv_fraction)
      : "Cpv " + num(b.contents.cpv_ml_dl),
  );
  text(80, 99, "Outlet " + num(b.values.pulmonary_out));
  text(260, 36, "Systemic bed", 15);
  text(260, 58, "Qs " + num(b.qs));
  text(
    260,
    79,
    b.normalized
      ? "Cv / B " + num(b.saturations.sv_fraction)
      : "Cv " + num(b.contents.cv_ml_dl),
  );
  text(260, 99, "Return " + num(b.values.systemic_return));
  text(170, 274, "Mixed arterial source", 15);
  text(
    170,
    296,
    b.normalized
      ? "Ca / B " + num(b.saturations.sa_fraction)
      : "Ca " + num(b.contents.ca_ml_dl),
  );
  text(42, 212, "Qp · Ca");
  text(134, 154, "Qp · Cpv");
  text(295, 212, "Qs · Ca");
  text(204, 176, "Qs · Cv");
  return svg;
}
export class CompareView {
  private mode: "preset" | "pinned" | "resistance" = "preset";
  private active = false;
  private generation = 0;
  private result?: Payload;
  private published?: Record<string, unknown>;
  private pins: {
    a?: Scenario;
    b?: Scenario;
    criteria_a?: Criteria;
    criteria_b?: Criteria;
  } = {};
  private resistancePair?: {
    policy: string;
    a: Record<string, unknown>;
    b: Record<string, unknown>;
  };
  constructor(private compute: Compute) {
    el("compare").innerHTML =
      `<h2>Compare oxygen budgets</h2><label>Declared comparison<select id="comparison-preset"></select></label><button id="compare-pins" type="button" disabled>Compare pinned A and B</button><p id="compare-pin-status">Pin two prescribed-flow states in Explore for an arbitrary comparison.</p><h3 id="compare-title"></h3><p id="compare-contract" class="experiment-contract"></p><p id="compare-status" role="status"></p><div id="compare-content"><div id="compare-quantities"></div><div id="compare-compact-budget"></div><details><summary>Full mixing diagrams and budget plots</summary><div class="comparison-cards"><article id="compare-a"></article><article id="compare-b"></article></div><div id="compare-budget-plot"></div><p>Systemic delivery is consumed oxygen plus unconsumed return. Gross pulmonary outlet is gross inlet plus net uptake. Net uptake equals consumption at steady state. Uniform diagram arrows indicate routing, not magnitude. Bars share one native flux scale across A and B.</p></details><div id="compare-pressure-group"><h3>Mean-pressure budgets</h3><div id="compare-pressure"></div><p>Systemic and pulmonary paths have equal pressure drops. Do not add pressure drops across the parallel paths. No systolic or diastolic waveform is modeled.</p></div><h3>What changed</h3><div class="table-scroll"><table><thead><tr><th>Input</th><th>A</th><th>B</th></tr></thead><tbody id="compare-changes"></tbody></table></div><details><summary>Unchanged inputs and constraints</summary><pre id="compare-fixed"></pre></details><h3>Metric changes</h3><div class="table-scroll"><table><thead><tr><th>Quantity</th><th>A</th><th>B</th><th>Absolute change</th><th>Relative change</th><th>Unit</th></tr></thead><tbody id="compare-metrics"></tbody></table></div><h3>Exact delivery decomposition</h3><p id="compare-decomposition"></p><div id="compare-ablation"></div><details><summary>Full comparison, criteria and audit</summary><pre id="compare-json"></pre></details></div><p id="compare-source" class="source-note"></p>`;
    for (let i = 1; i <= 12; i++)
      el<HTMLSelectElement>("comparison-preset").add(
        new Option("C" + i, "C" + i),
      );
    el("comparison-preset").addEventListener("change", () => {
      this.mode = "preset";
      void this.update();
    });
    el("compare-pins").addEventListener("click", () => void this.update(true));
    window.addEventListener("parallel-o2-pins", (event) => {
      this.pins = (event as CustomEvent).detail;
      el<HTMLButtonElement>("compare-pins").disabled = !(
        this.pins.a && this.pins.b
      );
      write(
        "compare-pin-status",
        `Pinned states: ${this.pins.a ? "A" : ""} ${this.pins.b ? "B" : ""}. Cross-basis comparisons require explicit conversion in Explore.`,
      );
    });
    window.addEventListener("parallel-o2-resistance-pair", (event) => {
      this.resistancePair = (event as CustomEvent).detail;
      void this.update(false, true);
    });
    let width = 0,
      timer: ReturnType<typeof setTimeout>;
    new ResizeObserver(() => {
      const w = el("compare-budget-plot").clientWidth;
      if (
        this.active &&
        this.result &&
        el("compare").dataset.pending === "false" &&
        w > 0 &&
        Math.abs(w - width) > 1
      ) {
        width = w;
        clearTimeout(timer);
        const scheduled = this.generation;
        el("compare").dataset.pending = "true";
        timer = setTimeout(() => {
          if (this.active && scheduled === this.generation)
            void this.render(this.result!, ++this.generation);
        }, 150);
      }
    }).observe(el("compare-budget-plot"));
  }
  configuration(): ComparisonSettings {
    if (this.mode === "preset")
      return {
        mode: "preset",
        preset: el<HTMLSelectElement>("comparison-preset").value,
      };
    if (this.mode === "resistance")
      return structuredClone({ mode: "resistance", ...this.resistancePair! });
    return structuredClone({
      mode: "pinned",
      a: this.pins.a!,
      b: this.pins.b!,
      criteria_a: this.pins.criteria_a!,
      criteria_b: this.pins.criteria_b!,
    });
  }
  restore(settings: ComparisonSettings) {
    const s = structuredClone(settings);
    this.suspend();
    this.mode = s.mode;
    if (s.mode === "preset")
      el<HTMLSelectElement>("comparison-preset").value = s.preset;
    else if (s.mode === "resistance")
      this.resistancePair = { a: s.a, b: s.b, policy: s.policy };
    else
      this.pins = {
        a: s.a,
        b: s.b,
        criteria_a: s.criteria_a,
        criteria_b: s.criteria_b,
      };
  }
  snapshot() {
    return structuredClone(this.published);
  }
  suspend() {
    el("compare").dataset.pending = "true";
    this.active = false;
    ++this.generation;
  }
  refresh() {
    this.active = true;
    void this.update(this.mode === "pinned", this.mode === "resistance");
  }
  private async update(pinned = false, resistance = false) {
    if (!this.active) return;
    this.mode = pinned ? "pinned" : resistance ? "resistance" : "preset";
    if (pinned || resistance) {
      const select = el<HTMLSelectElement>("comparison-preset");
      if (!select.querySelector("option[value=custom]")) {
        const option = new Option("Custom pinned comparison", "custom");
        option.disabled = true;
        select.add(option);
      }
      select.value = "custom";
    }
    const gen = ++this.generation;
    el("compare").dataset.pending = "true";
    write("compare-status", "Calculating paired shared-engine states…");
    try {
      const result = pinned
        ? {
            preset: "custom",
            title: "Pinned prescribed-flow states",
            contract:
              "Explicit A/B states; changed and fixed inputs listed below.",
            comparison: await this.compute("comparison_custom", {
              a: this.pins.a,
              b: this.pins.b,
              criteria_a: this.pins.criteria_a,
              criteria_b: this.pins.criteria_b,
            }),
            ablation: null,
            source_status:
              "User-selected prescribed states, not clinical predictions.",
          }
        : resistance
          ? {
              preset: "custom-resistance",
              title: "Pinned resistance pair",
              contract: `Reference policy: ${this.resistancePair?.policy}. Explicit A/B perturbations and their original calibration retained from Explore.`,
              comparison: await this.compute("comparison_custom", {
                a: this.resistancePair?.a,
                b: this.resistancePair?.b,
                resistance: true,
              }),
              ablation: null,
              source_status:
                "User-selected resistance pair; no clinical efficacy inference.",
            }
          : await this.compute("comparison_preset", {
              preset: el<HTMLSelectElement>("comparison-preset").value,
            });
      if (gen !== this.generation) return;
      this.result = result as Payload;
      await this.render(this.result, gen);
    } catch (error) {
      if (gen === this.generation) {
        write("compare-status", "Comparison error: " + String(error));
        el("compare").dataset.pending = "error";
      }
    }
  }
  private async render(result: Payload, gen: number) {
    el("compare").dataset.pending = "true";
    const c = result.comparison,
      { a, b } = c.budgets;
    const vals = [a.values, b.values];
    const parts = [
      ["consumption", "Consumed", "#9a592b", "/"],
      ["systemic_return", "Unconsumed return", "#176079", ""],
      ["pulmonary_in", "Gross pulmonary inlet", "#78649b", "."],
      ["net_uptake", "Net uptake", "#4d855b", "x"],
    ];
    const traces: Data[] = parts.map(([key, name, color, shape], i) => ({
      type: "bar",
      orientation: "h",
      name,
      marker: { color, pattern: { shape: shape as "" | "/" | "." | "x" } },
      y: [
        "A systemic delivery",
        "A pulmonary outlet",
        "B systemic delivery",
        "B pulmonary outlet",
      ],
      x:
        i < 2
          ? [vals[0][key], 0, vals[1][key], 0]
          : [0, vals[0][key], 0, vals[1][key]],
    }));
    const host = document.createElement("div");
    const width = Math.max(280, el("compare-budget-plot").clientWidth);
    await Plotly.newPlot(
      host,
      traces,
      {
        width,
        height: 420,
        barmode: "stack",
        margin: { l: 135, r: 20, t: 20, b: 165 },
        xaxis: {
          title: { text: "Oxygen flux<br>" + a.unit.replace(" × ", "<br>× ") },
          rangemode: "tozero",
        },
        yaxis: { autorange: "reversed" },
        legend: {
          orientation: "h",
          xref: "container",
          yref: "container",
          x: 0.02,
          y: 0.02,
          yanchor: "bottom",
        },
      },
      { displayModeBar: false },
    );
    const pressure =
      c.a.metrics.driving_pressure_mmhg !== undefined
        ? await pressureBudget(c.a, c.b, el("compare-budget-plot").clientWidth)
        : undefined;
    if (gen !== this.generation) {
      purge(host);
      if (pressure) purge(pressure);
      return;
    }
    if (width !== Math.max(280, el("compare-budget-plot").clientWidth)) {
      purge(host);
      if (pressure) purge(pressure);
      void this.render(result, gen);
      return;
    }
    el("compare-pressure-group").hidden = !pressure;
    const pressureTarget = el("compare-pressure");
    for (const old of pressureTarget.children) purge(old as HTMLElement);
    pressureTarget.replaceChildren(...(pressure ? [pressure] : []));
    for (const key of ["a", "b"] as const) {
      const budget = c.budgets[key],
        state = c[key],
        card = el("compare-" + key);
      card.replaceChildren();
      const h = document.createElement("h3");
      h.textContent = "State " + key.toUpperCase();
      const p = document.createElement("p");
      p.textContent = `${budget.status}. Sa ${num(state.metrics.sa_fraction === null ? null : 100 * state.metrics.sa_fraction)}%; Sv ${num(state.metrics.sv_fraction === null ? null : 100 * state.metrics.sv_fraction)}%. Selected strict criteria: Sa > ${100 * state.criterion_result.criteria.sa_lower_fraction}% (${state.criterion_result.arterial}); Sv > ${100 * state.criterion_result.criteria.sv_lower_fraction}% (${state.criterion_result.venous}). Origin: ${state.criterion_result.criteria.origin}.`;
      const units = document.createElement("p");
      units.textContent = `Flow: ${budget.blood_flow_unit}. ${budget.normalized ? "Contents are normalized to capacity; no physical Hb or oxygen flux is declared." : "Content: mL O₂/dL."} Flux: ${budget.unit}.`;
      const summary = document.createElement("p");
      summary.className = "physiology-summary";
      summary.textContent = stateSummary(state);
      card.append(h, summary, p, units);
      if (budget.eligible) card.append(diagram(budget, key));
      const identities = document.createElement("p");
      identities.className = "budget-identities";
      identities.textContent = `Systemic: ${num(budget.values.delivery)} = ${num(budget.values.consumption)} consumed + ${num(budget.values.systemic_return)} returning. Pulmonary: ${num(budget.values.pulmonary_out)} out = ${num(budget.values.pulmonary_in)} in + ${num(budget.values.net_uptake)} net. All fluxes ${budget.unit}.`;
      card.append(identities);
    }
    renderQuantities(el("compare-quantities"), c.a, c.b, {
      label: "Comparison A → B",
    });
    el("compare-compact-budget").replaceChildren(compactBudget(c.budgets));
    summaryBefore(
      "compare-summary",
      el("compare-budget-plot"),
      pairedSummary(c.a, c.b, c.changed_inputs),
    );
    const plot = el("compare-budget-plot");
    for (const old of plot.children) purge(old as HTMLElement);
    plot.replaceChildren(host);
    const rows = (target: HTMLElement, data: unknown[][]) => {
      target.replaceChildren();
      for (const cells of data) {
        const tr = document.createElement("tr");
        for (const value of cells) {
          const td = document.createElement("td");
          td.textContent =
            typeof value === "string" ? value : JSON.stringify(value);
          tr.append(td);
        }
        target.append(tr);
      }
    };
    rows(
      el("compare-changes"),
      Object.entries(c.changed_inputs).map(([key, v]) => [key, v.a, v.b]),
    );
    write("compare-fixed", JSON.stringify(c.unchanged_inputs, null, 2));
    rows(
      el("compare-metrics"),
      Object.entries(c.deltas)
        .filter(
          ([key]) =>
            !key.includes("resistance") &&
            !key.startsWith("k1_") &&
            !key.startsWith("k2_"),
        )
        .map(([key, d]) => [
          titleFor(key),
          num(c.a.metrics[key]),
          num(c.b.metrics[key]),
          num(d.absolute) +
            (d.percentage_points !== null && d.percentage_points !== undefined
              ? ` (${num(d.percentage_points)} pp)`
              : ""),
          d.relative === null ? "Undefined" : num(100 * d.relative) + "%",
          c.a.units[key],
        ]),
    );
    write(
      "compare-decomposition",
      c.decomposition
        ? Object.entries(c.decomposition.multiplicative_factors)
            .map(
              ([k, v]) =>
                `${k} × ${num(v)}; ln contribution ${num(c.decomposition!.log_contributions[k])}`,
            )
            .join("; ") +
            `. ln(delivery B/A) = ${num(c.decomposition.log_delivery_ratio)}; residual ${num(c.decomposition.log_residual)}. Ordinary percent changes are not additive.`
        : "Not defined for these endpoints or this representation. No ordinary percent-change sum is substituted.",
    );
    const ab = el("compare-ablation");
    ab.replaceChildren();
    if (result.ablation) {
      const h = document.createElement("h3");
      h.textContent = "Same-scope 2 × 2 mechanism ablation";
      ab.append(h);
      const table = document.createElement("table");
      rows(
        table,
        result.ablation.cells.map((cell) => [
          "α " + cell.alpha,
          "f " + cell.nonlinear_fraction,
          cell.relative_index_change === null
            ? "Masked"
            : num(100 * cell.relative_index_change) +
              "% versus own unperturbed reference",
        ]),
      );
      ab.append(table);
      const p = document.createElement("p");
      p.textContent =
        "Interaction: " +
        num(result.ablation.interaction_relative_fraction) +
        " relative fraction.";
      ab.append(p);
    }
    document.querySelector<HTMLElement>(".mode-contract")!.textContent =
      `Steady-state sensitivity experiment; ${c.a.metrics.driving_pressure_mmhg !== undefined ? "assumed resistance/output law" : "prescribed flows"}, prescribed demand. Mathematical admissibility is not clinical safety.`;
    write("compare-title", result.title);
    write("compare-contract", result.contract);
    write("compare-source", result.source_status);
    write(
      "compare-status",
      c.status === "finite"
        ? "Paired calculation complete."
        : "One or both endpoints are masked; ordinary improvement deltas are unavailable.",
    );
    write("compare-json", JSON.stringify(result, null, 2));
    el("compare").dataset.pending = "false";
    el("compare").dataset.generation = String(gen);
    this.published = { generation: gen, result };
  }
}
