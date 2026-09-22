import Plotly from "plotly.js-dist-min";
import type { Data, PlotlyHTMLElement } from "plotly.js";
import type { Axis, Compute, Criteria, Scenario } from "../model-types";
import {
  parameters,
  activeParameters,
  getParameter,
  setParameter,
  label,
  scenes,
  criteria as initialCriteria,
} from "../scenes";
import type { Payload, Comparison } from "../compare";
import { diagram } from "../compare";
import { compactBudget } from "../budget-plots";
import { stateSummary, pairedSummary } from "../physiology-summary";
import { renderQuantities } from "./quantities";
import { dependencyStrip, displayFactor, questions } from "./registry";
export type OneChangeSettings = {
  a: Scenario;
  parameter: string;
  target: number;
  axis: Axis;
  criteria: Criteria;
};
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
export class OneChange {
  private settings?: OneChangeSettings;
  private generation = 0;
  private active = false;
  private published?: Record<string, unknown>;
  constructor(private compute: Compute) {
    el("one-change").innerHTML =
      `<p id="one-contract" class="experiment-contract"></p><div id="one-quantities"></div><div class="one-layout"><aside><label>Change one independent input<select id="one-parameter"></select></label><label id="one-target-label">Target value B<input id="one-target" type="number" step="any"></label><p id="one-delta"></p><details id="one-start-editor"><summary>Edit starting state A</summary><div id="one-start-fields"></div><button id="one-apply" type="button">Apply starting state</button><button id="one-cancel" type="button">Cancel</button></details><button id="one-use-b" type="button">Use B as starting state</button><details><summary>Plot settings</summary><label>Range minimum<input id="one-min" type="number" step="any"></label><label>Range maximum<input id="one-max" type="number" step="any"></label><button id="one-range" type="button">Apply range</button></details><details><summary>Compare with chosen criteria</summary><label>Sa criterion (%)<input id="one-sa" type="number" step="any"></label><label>Sv criterion (%)<input id="one-sv" type="number" step="any"></label><button id="one-criteria" type="button">Apply criteria</button></details></aside><div class="one-plots"><section><h3>Saturation · A → B</h3><div id="one-saturation" class="one-plot"></div></section><section><h3>Systemic delivery and net lung uptake · A → B</h3><div id="one-flux" class="one-plot"></div></section></div></div><p id="one-status" role="status"></p><div id="one-result"><p id="one-summary"></p><p id="one-explanation"></p><div id="one-budget"></div><details><summary>Full mixing diagram and exact results</summary><div id="one-diagrams" class="comparison-cards"></div><pre id="one-audit"></pre></details></div>`;
    el("one-change").append(dependencyStrip(false));
    let lastWidth = 0;
    let resizeTimer: ReturnType<typeof setTimeout>;
    new ResizeObserver(() => {
      const width = el("one-saturation").clientWidth;
      if (width > 0 && Math.abs(width - lastWidth) > 1) {
        lastWidth = width;
        if (
          this.active &&
          this.settings &&
          el("one-change").dataset.pending === "false"
        ) {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => void this.update(), 100);
        }
      }
    }).observe(el("one-saturation"));
    el("one-parameter").addEventListener("change", () => {
      if (!this.settings) return;
      this.settings.parameter = el<HTMLSelectElement>("one-parameter").value;
      this.settings.target = getParameter(
        this.settings.a,
        this.settings.parameter,
      );
      this.settings.axis = this.axisFor(this.settings.parameter);
      this.controls();
      void this.update();
    });
    el("one-target").addEventListener("input", () => {
      ++this.generation;
      this.pending();
      el("one-status").textContent =
        "Target draft changed; leave the field to calculate.";
    });
    el("one-target").addEventListener("change", () => {
      if (!this.settings) return;
      this.settings.target =
        el<HTMLInputElement>("one-target").valueAsNumber /
        displayFactor(this.settings.parameter);
      this.controls(false);
      void this.update();
    });
    el("one-use-b").addEventListener("click", () => {
      if (!this.settings) return;
      setParameter(
        this.settings.a,
        this.settings.parameter,
        this.settings.target,
      );
      this.controls();
      void this.update("B copied to A; change is now zero.");
    });
    el("one-apply").addEventListener("click", () => {
      if (!this.settings) return;
      const draft = structuredClone(this.settings.a);
      for (const input of el(
        "one-start-fields",
      ).querySelectorAll<HTMLInputElement>("input"))
        setParameter(
          draft,
          input.dataset.path!,
          input.valueAsNumber / displayFactor(input.dataset.path!),
        );
      this.settings.a = draft;
      el<HTMLDetailsElement>("one-start-editor").open = false;
      this.controls();
      void this.update(
        "Both endpoints recomputed from the applied starting state and displayed target.",
      );
    });
    el("one-cancel").addEventListener("click", () => {
      this.controls();
      el<HTMLDetailsElement>("one-start-editor").open = false;
    });
    el("one-range").addEventListener("click", () => {
      if (!this.settings) return;
      const f = displayFactor(this.settings.parameter);
      this.settings.axis.min =
        el<HTMLInputElement>("one-min").valueAsNumber / f;
      this.settings.axis.max =
        el<HTMLInputElement>("one-max").valueAsNumber / f;
      void this.update();
    });
    el("one-criteria").addEventListener("click", () => {
      if (!this.settings) return;
      this.settings.criteria = {
        ...this.settings.criteria,
        id: "user-selected",
        origin: "user_selected",
        sa_lower_fraction: el<HTMLInputElement>("one-sa").valueAsNumber / 100,
        sv_lower_fraction: el<HTMLInputElement>("one-sv").valueAsNumber / 100,
      };
      delete this.settings.criteria.source_id;
      void this.update();
    });
  }
  private axisFor(path: string): Axis {
    const match = scenes
      .flatMap((s) => [s.x, s.y])
      .find((a) => a.parameter === path);
    return {
      ...(match ?? {
        min: parameters[path]?.range[0] ?? 0,
        max: parameters[path]?.range[1] ?? 1,
        n: 201,
        scale: "linear" as const,
      }),
      parameter: path,
    };
  }
  async load(question: string) {
    this.active = true;
    const gen = ++this.generation;
    this.pending();
    try {
      const q = questions.find((q) => q.id === question)!;
      const p = (await this.compute("comparison_preset", {
        preset: "C1",
      })) as Payload;
      if (gen !== this.generation) return;
      let a = p.comparison.a.requested as unknown as Scenario;
      if (q.id === "allocation")
        a = (await this.compute("flow_mode", {
          scenario: a,
          mode: "total_ratio",
        })) as Scenario;
      if (gen !== this.generation) return;
      this.settings = {
        a: structuredClone(a),
        parameter: q.parameter!,
        target: q.one_change_target!,
        axis: this.axisFor(q.parameter!),
        criteria: structuredClone(initialCriteria),
      };
      this.controls();
      await this.update();
    } catch (e) {
      if (gen === this.generation) this.error(e);
    }
  }
  configuration() {
    if (!this.settings) throw new Error("One-change configuration not ready");
    return structuredClone(this.settings);
  }
  restore(settings: OneChangeSettings) {
    this.settings = structuredClone(settings);
    this.active = true;
    this.controls();
    void this.update();
  }
  suspend() {
    this.active = false;
    ++this.generation;
    this.published = undefined;
    this.pending();
  }
  refresh() {
    this.active = true;
    if (this.settings) void this.update();
  }
  snapshot() {
    return this.published ? structuredClone(this.published) : undefined;
  }
  private pending() {
    if (this.active) el("explore").dataset.pending = "true";
    el("one-change").dataset.pending = "true";
    el("one-result").hidden = true;
    el("one-quantities").hidden = true;
    for (const id of ["one-saturation", "one-flux"])
      el(id).style.visibility = "hidden";
  }
  private error(e: unknown) {
    el("one-change").dataset.pending = "error";
    el("one-status").textContent = "Experiment error: " + String(e);
  }
  private controls(editors = true) {
    const s = this.settings!;
    const factor = displayFactor(s.parameter);
    const select = el<HTMLSelectElement>("one-parameter");
    select.replaceChildren(
      ...activeParameters(s.a).map((p) => new Option(label(p), p)),
    );
    select.value = s.parameter;
    el("one-target-label").firstChild!.textContent =
      "Target B: " + label(s.parameter);
    el<HTMLInputElement>("one-target").value = String(s.target * factor);
    el("one-delta").textContent =
      `A ${getParameter(s.a, s.parameter) * factor} → B ${s.target * factor}; change ${(s.target - getParameter(s.a, s.parameter)) * factor}.`;
    for (const k of ["min", "max"] as const)
      el<HTMLInputElement>("one-" + k).value = String(s.axis[k] * factor);
    el<HTMLInputElement>("one-sa").value = String(
      s.criteria.sa_lower_fraction * 100,
    );
    el<HTMLInputElement>("one-sv").value = String(
      s.criteria.sv_lower_fraction * 100,
    );
    if (editors) {
      const fields = el("one-start-fields");
      fields.replaceChildren();
      for (const path of activeParameters(s.a)) {
        const l = document.createElement("label");
        l.textContent = label(path);
        const i = document.createElement("input");
        i.type = "number";
        i.step = "any";
        i.dataset.path = path;
        i.value = String(getParameter(s.a, path) * displayFactor(path));
        l.append(i);
        fields.append(l);
      }
    }
  }
  private async update(message = "") {
    if (!this.active || !this.settings) return;
    const gen = ++this.generation;
    this.pending();
    el("one-status").textContent = "Calculating one coherent A/B experiment…";
    try {
      const s = structuredClone(this.settings),
        b = structuredClone(s.a);
      setParameter(b, s.parameter, s.target);
      const payload = {
        comparison: (await this.compute("comparison_custom", {
          a: s.a,
          b,
          criteria_a: s.criteria,
          criteria_b: s.criteria,
        })) as Comparison,
      };
      const area = s.a.indexing_basis === "per_m2",
        suffix = area ? "ml_min_m2" : "ml_kg_min",
        metrics = [
          "sa_fraction",
          "sv_fraction",
          "do2_" + suffix,
          "pulmonary_net_add_" + suffix,
        ];
      const slice = (await this.compute("slice", {
        base: s.a,
        axis: s.axis,
        metrics,
        criteria: s.criteria,
      })) as {
        axis: { coordinates: number[] };
        metrics: Record<string, (number | null)[]>;
        units: Record<string, string>;
      };
      if (gen !== this.generation || !this.active) return;
      const comparison = payload.comparison;
      const holders: HTMLElement[] = [];
      for (const [idx, keys] of [
        metrics.slice(0, 2),
        metrics.slice(2),
      ].entries()) {
        const factor = idx === 0 ? 100 : 1,
          x = slice.axis.coordinates.map((v) =>
            s.axis.scale === "log" ? Math.log10(v) : v,
          );
        const traces: Data[] = keys.map((k, i) => ({
          type: "scatter",
          mode: "lines",
          x,
          y: slice.metrics[k].map((v) => (v === null ? null : v * factor)),
          customdata: slice.axis.coordinates.map(
            (v) => v * displayFactor(s.parameter),
          ),
          hovertemplate:
            "%{customdata:.6g}<br>%{y:.6g}<extra>%{fullData.name}</extra>",
          connectgaps: false,
          name:
            idx === 0
              ? i === 0
                ? "Sa"
                : "Sv"
              : i === 0
                ? "Systemic delivery"
                : "Net lung uptake",
          line: {
            dash: i === 0 ? "solid" : "dash",
            color: i === 0 ? "#245e75" : "#a8502c",
          },
        }));
        for (const [name, state] of [
          ["A", comparison.a],
          ["B", comparison.b],
        ] as const)
          for (const k of keys)
            traces.push({
              type: "scatter",
              mode: "text+markers",
              x: [
                s.axis.scale === "log"
                  ? Math.log10(
                      getParameter(
                        state.requested as unknown as Scenario,
                        s.parameter,
                      ),
                    )
                  : getParameter(
                      state.requested as unknown as Scenario,
                      s.parameter,
                    ),
              ],
              y: [
                state.metrics[k] === null ? null : state.metrics[k]! * factor,
              ],
              customdata: [
                getParameter(
                  state.requested as unknown as Scenario,
                  s.parameter,
                ) * displayFactor(s.parameter),
              ],
              hovertemplate:
                "%{customdata:.6g}<br>%{y:.6g}<extra>" + name + "</extra>",
              text: [name],
              textposition: "top center",
              showlegend: false,
              marker: { symbol: name === "A" ? "circle" : "diamond", size: 9 },
            });
        const host = document.createElement("div");
        await Plotly.newPlot(
          host,
          traces,
          {
            height: 310,
            width: Math.max(
              220,
              el(idx === 0 ? "one-saturation" : "one-flux").clientWidth,
            ),
            margin: { l: 64, r: 12, t: 12, b: 80 },
            xaxis: {
              title: { text: label(s.parameter) },
              tickvals: [0, 0.25, 0.5, 0.75, 1].map(
                (f) => x[Math.round(f * (x.length - 1))],
              ),
              ticktext: [0, 0.25, 0.5, 0.75, 1].map((f) =>
                String(
                  Number(
                    (
                      slice.axis.coordinates[Math.round(f * (x.length - 1))] *
                      displayFactor(s.parameter)
                    ).toPrecision(4),
                  ),
                ),
              ),
            },
            yaxis: {
              title: {
                text: idx === 0 ? "Saturation (%)" : slice.units[keys[0]],
              },
            },
            legend: { orientation: "h", y: -0.26 },
            autosize: true,
          },
          { responsive: true, displaylogo: false },
        );
        holders.push(host);
      }
      if (gen !== this.generation || !this.active) {
        holders.forEach((h) => Plotly.purge(h));
        return;
      }
      ["one-saturation", "one-flux"].forEach((id, i) => {
        const h = el(id);
        for (const old of h.children) Plotly.purge(old as HTMLElement);
        h.replaceChildren(holders[i]);
        h.style.visibility = "visible";
      });
      for (const host of holders) {
        (host as PlotlyHTMLElement).on("plotly_hover", (event) => {
          if (gen !== this.generation) return;
          const x = event.points[0]?.x;
          if (x === undefined) return;
          for (const target of holders)
            void Plotly.relayout(target, {
              shapes: [
                {
                  type: "line",
                  xref: "x",
                  yref: "paper",
                  x0: x,
                  x1: x,
                  y0: 0,
                  y1: 1,
                  line: { color: "#647880", dash: "dot", width: 1 },
                },
              ],
            });
        });
        (host as PlotlyHTMLElement).on("plotly_unhover", () => {
          if (gen === this.generation)
            for (const target of holders)
              void Plotly.relayout(target, { shapes: [] });
        });
      }
      const fixed = activeParameters(s.a)
        .filter((p) => p !== s.parameter)
        .map((p) => `${label(p)} ${getParameter(s.a, p) * displayFactor(p)}`)
        .join("; ");
      const contract = `Change ${label(s.parameter)} from ${getParameter(s.a, s.parameter) * displayFactor(s.parameter)} to ${s.target * displayFactor(s.parameter)}. Fixed: ${fixed}. ${s.a.indexing_basis}; source ${s.a.source_context}. Parameter sweep, not a time trajectory.`;
      el("one-contract").textContent = contract;
      renderQuantities(el("one-quantities"), comparison.a, comparison.b, {
        label: "Starting state A → target state B",
      });
      el("one-quantities").hidden = false;
      el("one-summary").textContent =
        "A: " +
        stateSummary(comparison.a) +
        ". B: " +
        stateSummary(comparison.b);
      el("one-explanation").textContent = pairedSummary(
        comparison.a,
        comparison.b,
        comparison.changed_inputs,
      );
      el("one-budget").replaceChildren(compactBudget(comparison.budgets));
      el("one-diagrams").replaceChildren(
        ...(["a", "b"] as const)
          .filter((k) => comparison.budgets[k].eligible)
          .map((k) => diagram(comparison.budgets[k], k)),
      );
      el("one-audit").textContent = JSON.stringify(payload, null, 2);
      el("one-status").textContent =
        message || "A/B and both plots calculated from the same inputs.";
      el("one-result").hidden = false;
      this.published = { result: payload, slice, contract, generation: gen };
      el("one-change").dataset.pending = "false";
      el("explore").dataset.pending = "false";
    } catch (e) {
      if (gen === this.generation) this.error(e);
    }
  }
}
