import type { LaboratorySettings } from "./settings";
import Plotly from "plotly.js-dist-min";
import type { Data, Layout } from "plotly.js";
import type { Compute } from "./model-types";
import { purge } from "./plots";
type Row = Record<string, unknown>;
type State = { metrics: Record<string, number | null> };
type Curve = {
  x: (number | null)[];
  y: (number | null)[];
  r: number[];
  qt_ml_kg_min: number;
  vo2_ml_kg_min: number;
  exact_r1: State;
  boundary_states: State[];
  conditional_optimum: {
    admissible_interval: number[] | null;
    do2_maximum: { state: State } | null;
  };
  masked_count: number;
  metrics: Record<string, (number | null)[]>;
  raw_algebraic_metrics: Record<string, number[]> | null;
};
type Paper = {
  figure: string;
  caption: string;
  curves: Curve[];
  x_metric: string;
  x_unit: string;
  y_unit: string;
  raw_audit: boolean;
  parameter_order: string;
};
type Report = {
  source: string;
  source_status: string;
  rows?: Row[];
  claims?: Record<string, unknown>;
  examples?: {
    hb: number;
    ci: number;
    demand: number;
    state: State & { criterion_result: unknown };
  }[];
  tables?: Record<string, Row[]>;
  ablations?: {
    profile_id: string;
    closure: string;
    result: { cells: Row[]; interaction_relative_fraction: number | null };
  }[];
  discrepancies?: { id: string; title: string; text: string }[];
};
type InverseMap = {
  x: number[];
  y: number[];
  masked_count: number;
  offscale_count: number;
  metrics: Record<string, (number | null)[][]>;
};
type Inverse = {
  examples: Row[];
  curves: { sa_fraction: number; samples: Record<string, number>[] }[];
  note: string;
};
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const fmt = (v: unknown) =>
  typeof v === "number"
    ? Number(v.toPrecision(9)).toString()
    : v === null
      ? "Undefined"
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);
function paragraph(text: string) {
  const p = document.createElement("p");
  p.textContent = text;
  return p;
}
function table(rows: Row[], keys: string[]) {
  const outer = document.createElement("div");
  outer.className = "table-scroll";
  const t = document.createElement("table"),
    head = t.createTHead().insertRow();
  for (const k of keys) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = k.replaceAll("_", " ");
    head.append(th);
  }
  const body = t.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const k of keys) tr.insertCell().textContent = fmt(row[k]);
  }
  outer.append(t);
  return outer;
}
const labels: Record<string, string> = {
  sa_fraction: "Arterial saturation Sa (%)",
  sv_fraction: "Venous saturation Sv (%)",
  av_saturation_gap_fraction: "Sa − Sv (percentage points)",
  r: "Pulmonary/systemic flow ratio Qp/Qs",
  omega: "Oxygen excess Ω = delivery/consumption",
};
export class Laboratory {
  private generation = 0;
  private active = false;
  private result: unknown;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private compute: Compute) {
    el("laboratory").innerHTML = `<h2>Paper laboratory</h2>
      <label>Source workbench<select id="lab-source"><option value="barnea">Barnea equation reconstructions</option><option value="inverse">Barnea inverse-ratio errors (Figure 5B companion)</option><option value="ahmed">Ahmed-inspired examples</option><option value="savorgnan">Savorgnan source audit</option></select></label>
      <div id="lab-barnea-controls" class="numeric-selection">
        <label>Figure<select id="lab-figure">${["2", "3", "4", "5A", "6", "7"].map((v) => `<option>${v}</option>`).join("")}</select></label>
        <label>Capacity convention<select id="lab-capacity"><option value="P-stated-capacity">Source-stated B = 22 mL/dL</option><option value="P-formula-capacity">Hb15 × κ1.38: B = 20.7 mL/dL</option></select></label>
        <label><input id="lab-raw" type="checkbox"> Show formal algebraic continuation</label>
        <a href="#lab-discrepancies">Reported/computed discrepancy register</a>
      </div>
      <div id="lab-inverse-controls" hidden>
      <div class="numeric-selection">
      <label>Measured Sa (%)<input id="lab-sa" type="number" min="0" max="100" step=".1" value="77"></label>
      <label>Measured Sv (%)<input id="lab-sv" type="number" min="0" max="100" step=".1" value="45"></label>
      <label>True Spv (%)<input id="lab-true" type="number" min="0" max="100" step=".1" value="96"></label>
      <label>Assumed Spv (%)<input id="lab-assumed" type="number" min="0" max="100" step=".1" value="96"></label></div>
      <label><input id="lab-local" type="checkbox"> Overlay local-approximation contours (%)</label>
      <button id="lab-inverse-evaluate" type="button">Evaluate inverse inputs</button></div>
      <p id="lab-status" role="status" aria-live="polite"></p>
      <div id="lab-content"><p id="lab-contract" class="experiment-contract"></p><div id="lab-plots"></div>
      <div id="lab-tables"></div><section id="lab-discrepancies"><h3>Source discrepancies and access</h3><div id="lab-source-records"></div></section>
      <details><summary>Complete source/computed record</summary><pre id="lab-json"></pre></details></div><section id="ensemble" hidden></section>`;
    for (const id of ["lab-source", "lab-figure", "lab-capacity", "lab-raw"])
      el(id).addEventListener("change", () => {
        window.dispatchEvent(new Event("parallel-o2-ensemble-suspend"));
        void this.refresh();
      });
    el("lab-inverse-evaluate").addEventListener(
      "click",
      () => void this.refresh(),
    );
    el("lab-local").addEventListener("change", () => void this.refresh());
    let width = 0;
    new ResizeObserver(() => {
      const w = el("laboratory").clientWidth;
      if (w === width) return;
      width = w;
      if (
        !this.active ||
        !this.result ||
        el("laboratory").dataset.pending === "true"
      )
        return;
      clearTimeout(this.timer);
      const scheduled = this.generation;
      el("laboratory").dataset.pending = "true";
      el("lab-content").hidden = true;
      this.timer = setTimeout(() => {
        if (this.active && this.generation === scheduled) void this.refresh();
      }, 150);
    }).observe(el("laboratory"));
  }
  configuration(): LaboratorySettings {
    return {
      source: el<HTMLSelectElement>("lab-source").value,
      figure: el<HTMLSelectElement>("lab-figure").value,
      convention: el<HTMLSelectElement>("lab-capacity").value,
      raw_audit: el<HTMLInputElement>("lab-raw").checked,
      inverse: {
        sa: Number(el<HTMLInputElement>("lab-sa").value) / 100,
        sv: Number(el<HTMLInputElement>("lab-sv").value) / 100,
        spv_true: Number(el<HTMLInputElement>("lab-true").value) / 100,
        spv_assumed: Number(el<HTMLInputElement>("lab-assumed").value) / 100,
      },
      local_contours: el<HTMLInputElement>("lab-local").checked,
    };
  }
  restore(s: LaboratorySettings) {
    this.suspend();
    for (const [id, key] of [
      ["lab-source", "source"],
      ["lab-figure", "figure"],
      ["lab-capacity", "convention"],
    ] as const)
      el<HTMLSelectElement>(id).value = s[key];
    el<HTMLInputElement>("lab-raw").checked = s.raw_audit;
    el<HTMLInputElement>("lab-local").checked = s.local_contours;
    for (const [id, key] of [
      ["lab-sa", "sa"],
      ["lab-sv", "sv"],
      ["lab-true", "spv_true"],
      ["lab-assumed", "spv_assumed"],
    ] as const)
      el<HTMLInputElement>(id).value = String(s.inverse[key] * 100);
  }
  snapshot() {
    return { generation: this.generation, result: this.result };
  }
  suspend() {
    this.active = false;
    ++this.generation;
    clearTimeout(this.timer);
    el("lab-content").hidden = true;
  }
  async refresh(): Promise<void> {
    this.active = true;
    const generation = ++this.generation;
    el("laboratory").dataset.pending = "true";
    el("lab-content").hidden = true;
    el("lab-status").textContent =
      "Computing source comparison with the shared engine…";
    const source = el<HTMLSelectElement>("lab-source").value;
    el("ensemble").hidden = source !== "savorgnan";
    el("lab-barnea-controls").hidden = source !== "barnea";
    el("lab-inverse-controls").hidden = source !== "inverse";
    document.querySelector<HTMLElement>(".mode-contract")!.textContent =
      "Equation reconstructions and source audits. Numerical agreement is distinct from source replication and clinical validation.";
    const plots = document.createElement("div"),
      tables = document.createElement("div"),
      records = document.createElement("div");
    const width = this.plotWidth();
    let payload: unknown;
    let contract = "";
    try {
      if (source === "barnea") {
        const convention = el<HTMLSelectElement>("lab-capacity").value;
        const data = (await this.compute("paper", {
          figure: el<HTMLSelectElement>("lab-figure").value,
          convention,
          n: 4001,
          raw_audit: el<HTMLInputElement>("lab-raw").checked,
        })) as Paper;
        if (generation !== this.generation) return;
        const report = (await this.compute("source_report", {
          source,
          convention,
        })) as Report;
        payload = { data, report };
        for (const d of report.discrepancies ?? []) {
          const details = document.createElement("details"),
            summary = document.createElement("summary");
          summary.textContent = d.title;
          details.append(summary, paragraph(d.text));
          records.append(details);
        }
        contract =
          data.caption +
          " r = 0.2–10 in increasing parameter order. Circles: r=1; diamonds: conditional delivery maxima. " +
          (data.raw_audit
            ? "Formal infeasible continuations are dotted algebraic audits, not predictions."
            : "Infeasible segments masked; no continuation shown.");
        if (["6", "7"].includes(data.figure))
          contract +=
            " DO₂ = Ω × M is definitional: its slope changes with M; this is not independent validation of an index.";
        const traces: Data[] = [];
        data.curves.forEach((c, i) => {
          const color = i ? "#b05c30" : "#176079",
            scale = ["2", "3", "4"].includes(data.figure) ? 100 : 1;
          const name = `Qt ${c.qt_ml_kg_min} mL/kg/min; M ${c.vo2_ml_kg_min} mL O₂/kg/min`;
          traces.push({
            type: "scatter",
            mode: "lines",
            x: c.x,
            y: c.y,
            name,
            line: { color, dash: i ? "dash" : "solid", width: 2 },
            connectgaps: false,
            customdata: c.r,
            hovertemplate:
              "x=%{x:.5g}<br>DO₂=%{y:.5g}<br>r=%{customdata:.5g}<extra>%{fullData.name}</extra>",
          });
          for (const [state, symbol] of [
            [c.exact_r1, "circle"],
            [c.conditional_optimum.do2_maximum?.state, "diamond"],
          ] as const) {
            if (!state) continue;
            const x = state.metrics[data.x_metric],
              y = state.metrics.do2_ml_kg_min;
            if (x !== null && y !== null)
              traces.push({
                type: "scatter",
                mode: "markers",
                x: [x * scale],
                y: [y],
                showlegend: false,
                name: symbol === "circle" ? "r = 1" : "Conditional DO₂ maximum",
                marker: {
                  symbol,
                  size: 9,
                  color,
                  line: { color: "white", width: 1 },
                },
              });
          }
          if (data.raw_audit && c.raw_algebraic_metrics) {
            const raw = c.raw_algebraic_metrics;
            traces.push({
              type: "scatter",
              mode: "lines",
              name: `Formal continuation · Qt ${c.qt_ml_kg_min}`,
              x: c.r.map((r, j) =>
                data.figure === "5A" ? r : raw[data.x_metric][j] * scale,
              ),
              y: c.y.map((v, j) => (v === null ? raw.do2_ml_kg_min[j] : null)),
              connectgaps: false,
              line: { color, dash: "dot", width: 2 },
            });
          }
        });
        if (data.figure === "5A")
          for (const [i, c] of data.curves.entries()) {
            for (const b of c.boundary_states)
              traces.push({
                type: "scatter",
                mode: "markers",
                x: [b.metrics.r],
                y: [b.metrics.do2_ml_kg_min],
                name: `Cv = 0 · Qt ${c.qt_ml_kg_min}`,
                marker: {
                  symbol: "x",
                  size: 10,
                  color: i ? "#b05c30" : "#176079",
                },
                showlegend: false,
              });
          }
        await this.plot(
          plots,
          traces,
          width,
          labels[data.x_metric],
          "Delivery (mL O₂/kg/min)",
          data.figure === "5A"
            ? {
                shapes: data.curves.flatMap((c, i) =>
                  c.boundary_states.map((b) => ({
                    type: "line" as const,
                    x0: b.metrics.r!,
                    x1: b.metrics.r!,
                    y0: 0,
                    y1: 1,
                    yref: "paper" as const,
                    line: {
                      dash: "dot" as const,
                      width: 1,
                      color: i ? "#b05c30" : "#176079",
                    },
                  })),
                ),
              }
            : {},
        );
        if (data.figure === "5A")
          contract +=
            " Dotted vertical lines and × markers: Cv=0 boundaries; mathematical limits, not clinical-safe ranges.";
        tables.append(
          paragraph(
            data.curves
              .map(
                (c) => `Qt ${c.qt_ml_kg_min}: ${c.masked_count} masked samples`,
              )
              .join("; "),
          ),
        );
        records.append(
          table(report.rows!, [
            "source_location",
            "reported_quantity",
            "reported_value",
            "computed_value",
            "signed_difference",
            "comparison_status",
            "notes",
          ]),
        );
      } else if (source === "inverse") {
        const data = (await this.compute("inverse_demo", {})) as Inverse;
        const sv = el<HTMLInputElement>("lab-sv").valueAsNumber / 100,
          spvTrue = el<HTMLInputElement>("lab-true").valueAsNumber / 100;
        const point = (await this.compute("inverse", {
          sa: el<HTMLInputElement>("lab-sa").valueAsNumber / 100,
          sv,
          spv_true: spvTrue,
          spv_assumed: el<HTMLInputElement>("lab-assumed").valueAsNumber / 100,
        })) as Row;
        const map = (await this.compute("inverse_map", {
          sv,
          spv_true: spvTrue,
          n: 81,
        })) as InverseMap;
        payload = { data, point, map };
        const mapTraces: Data[] = [
          {
            type: "heatmap",
            x: map.x.map((v) => 100 * v),
            y: map.y.map((v) => 100 * v),
            z: map.metrics.relative_error_vs_true.map((row) =>
              row.map((v) => (v === null ? null : 100 * v)),
            ),
            zmin: -100,
            zmax: 100,
            colorscale: "RdBu",
            reversescale: true,
            hoverongaps: false,
            colorbar: {
              title: { text: "Exact error / true ratio (%)", side: "bottom" },
              orientation: "h",
              xref: "container",
              yref: "container",
              x: 0.5,
              y: 0.04,
              xanchor: "center",
              yanchor: "bottom",
              len: 0.8,
              thickness: 12,
              tickangle: 0,
              tickvals: [-100, 0, 100],
            },
            hovertemplate:
              "Assumed Spv %{x:.2f}%<br>Sa %{y:.2f}%<br>Exact error / true ratio %{z:.4g}%<extra></extra>",
          },
        ];
        if (el<HTMLInputElement>("lab-local").checked)
          mapTraces.push({
            type: "contour",
            x: map.x.map((v) => 100 * v),
            y: map.y.map((v) => 100 * v),
            z: map.metrics.local_relative_error.map((row) =>
              row.map((v) => (v === null ? null : 100 * v)),
            ),
            showscale: false,
            connectgaps: false,
            contours: {
              start: -100,
              end: 100,
              size: 20,
              coloring: "none",
              showlabels: true,
            },
            line: { color: "#202020", width: 1, dash: "dot" },
            name: "Local approximation (%)",
          });
        await this.plot(
          plots,
          mapTraces,
          width,
          "Assumed Spv (%)",
          "Measured Sa (%) · exact ratio error",
          { plot_bgcolor: "#e6e8e7", margin: { l: 60, r: 20, t: 45, b: 160 } },
        );
        plots.append(
          paragraph(
            `Finite-error map: Sv=${sv}, true Spv=${spvTrue}; Sa 50–95%, assumed Spv 80–100%. ${map.masked_count} invalid-order cells are neutral gaps. Fixed color range ±100%; ${map.offscale_count} values outside this range remain unchanged in the record. Dashed contour values, if enabled, are local approximations. Reference curves below separately hold Sv=.45 and true Spv=.96.`,
          ),
        );
        tables.append(
          table(
            [point],
            [
              "r_true",
              "r_est",
              "relative_error_vs_true",
              "true_excess_over_est",
              "psi",
              "local_relative_error",
              "spv_error_percentage_points",
            ],
          ),
        );
        contract =
          "Figure 5B companion: reference curves hold Sv=.45 and true Spv=.96 fixed; the map uses the explicitly selected values below. Horizontal changes are saturation percentage points. Relative error uses the true ratio denominator; true excess uses the estimated ratio denominator. Dashed local sensitivity is only a local approximation.";
        for (const c of data.curves) {
          plots.append(
            paragraph(`Arterial saturation Sa = ${100 * c.sa_fraction}%`),
          );
          const traces: Data[] = (
            [
              ["relative_error_vs_true", "Exact error / true ratio", "solid"],
              ["local_relative_error", "Local approximation", "dash"],
              ["true_excess_over_est", "True excess / estimate", "dot"],
            ] as const
          ).map(([key, name, dash], i) => ({
            type: "scatter",
            mode: "lines",
            x: c.samples.map((s) => s.spv_error_percentage_points),
            y: c.samples.map((s) => 100 * s[key]),
            name,
            line: { dash, color: ["#176079", "#b05c30", "#555"][i], width: 2 },
          }));
          await this.plot(
            plots,
            traces,
            width,
            "Assumed − true Spv (percentage points)",
            "Ratio error or excess (%)",
          );
        }
        records.append(
          paragraph(data.note),
          table(data.examples, Object.keys(data.examples[0])),
        );
      } else {
        const report = (await this.compute("source_report", {
          source,
        })) as Report;
        payload = report;
        if (source === "ahmed") {
          contract =
            "Ahmed-inspired: abstract-supported; full-text settings unverified. Exact-source reproduction unavailable. Spv=.98, κ=1.34 and exact r=1 are app assumptions. Sa>70% and Sv>40% are separate strict criteria; not clinical targets. Demand 200 is synthetic.";
          const disabled = document.createElement("button");
          disabled.disabled = true;
          disabled.textContent = "Exact Ahmed reproduction unavailable";
          tables.append(disabled);
          tables.append(
            table(
              report.examples!.map((e) => ({
                hb_g_dl: e.hb,
                total_ci_l_min_m2: e.ci,
                vo2_ml_min_m2: e.demand,
                sa_fraction: e.state.metrics.sa_fraction,
                sv_fraction: e.state.metrics.sv_fraction,
                do2_ml_min_m2: e.state.metrics.do2_ml_min_m2,
                criteria: e.state.criterion_result,
              })),
              [
                "hb_g_dl",
                "total_ci_l_min_m2",
                "vo2_ml_min_m2",
                "sa_fraction",
                "sv_fraction",
                "do2_ml_min_m2",
                "criteria",
              ],
            ),
          );
        } else {
          contract =
            "Savorgnan source-text reconstruction; current source access unresolved. Native Rp perturbation and whole-pathway audit are distinct. Table 3 nominal reconstruction is inferred; circuit-secant is a derived sensitivity model. No author-code, rendered-figure or original Monte Carlo replication claimed. Profiles are resistance assumptions, not drug rankings.";
          for (const [name, rows] of Object.entries(report.tables!)) {
            const h = document.createElement("h3");
            h.textContent =
              name === "table1"
                ? "Table 1 · perturbation-scope audit"
                : "Table 3 · closure sensitivity";
            tables.append(
              h,
              table(rows, [
                "profile_id",
                "scope",
                "closure",
                "quantity",
                "reported_value",
                "computed_value",
                "difference",
                "comparison_status",
              ]),
            );
          }
          const h = document.createElement("h3");
          h.textContent = "Same-scope 2×2 mechanism ablation";
          tables.append(
            h,
            paragraph(
              "All cells perturb native Rp only and use their own matched unperturbed baseline. Interaction = combined − output-only − nonlinear-only + neither; relative fractions.",
            ),
          );
          tables.append(
            table(
              report.ablations!.flatMap((a) =>
                a.result.cells.map((c) => ({
                  profile: a.profile_id,
                  closure: a.closure,
                  alpha: c.alpha,
                  nonlinear_fraction: c.nonlinear_fraction,
                  relative_index_change: c.relative_index_change,
                  interaction: a.result.interaction_relative_fraction,
                })),
              ),
              [
                "profile",
                "closure",
                "alpha",
                "nonlinear_fraction",
                "relative_index_change",
                "interaction",
              ],
            ),
          );
          for (const d of report.discrepancies!) {
            const details = document.createElement("details"),
              summary = document.createElement("summary");
            summary.textContent = d.title;
            details.append(summary, paragraph(d.text));
            records.append(details);
          }
        }
        const pre = document.createElement("pre");
        pre.textContent = JSON.stringify(report.claims, null, 2);
        const details = document.createElement("details"),
          summary = document.createElement("summary");
        summary.textContent = "Preserved source claims and access scope";
        details.append(summary, pre);
        records.append(details);
        records.prepend(paragraph("Evidence status: " + report.source_status));
      }
      if (generation !== this.generation) {
        for (const p of plots.querySelectorAll<HTMLElement>(".js-plotly-plot"))
          purge(p);
        return;
      }
      if (width !== this.plotWidth()) {
        for (const p of plots.querySelectorAll<HTMLElement>(".js-plotly-plot"))
          purge(p);
        return this.refresh();
      }
      for (const p of el("lab-plots").querySelectorAll<HTMLElement>(
        ".js-plotly-plot",
      ))
        purge(p);
      el("lab-plots").replaceChildren(...plots.childNodes);
      el("lab-tables").replaceChildren(...tables.childNodes);
      el("lab-source-records").replaceChildren(...records.childNodes);
      this.result = payload;
      el("lab-json").textContent = JSON.stringify(payload, null, 2);
      el("lab-contract").textContent = contract;
      el("lab-content").hidden = false;
      el("laboratory").dataset.pending = "false";
      el("lab-status").textContent =
        "Source comparison ready. Reported fields remain separate from computed values.";
    } catch (error) {
      if (generation !== this.generation) return;
      el("lab-status").textContent =
        "Source calculation failed: " + String(error);
      el("laboratory").dataset.pending = "error";
    }
  }
  private plotWidth() {
    const node = el("laboratory"),
      style = getComputedStyle(node);
    return Math.max(
      280,
      node.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight),
    );
  }
  private async plot(
    parent: HTMLElement,
    data: Data[],
    width: number,
    x: string,
    y: string,
    extra: Partial<Layout> = {},
  ) {
    const host = document.createElement("div");
    parent.append(host);
    await Plotly.newPlot(
      host,
      data,
      {
        width,
        height: 480,
        margin: { l: 65, r: 20, t: 45, b: 150 },
        font: { size: 13 },
        xaxis: {
          title: {
            text: x.replace(" (percentage points)", "<br>(percentage points)"),
          },
        },
        yaxis: { title: { text: "" } },
        title: {
          text: y,
          x: 0.04,
          y: 0.98,
          xanchor: "left",
          font: { size: 13 },
        },
        legend: {
          orientation: "h",
          xref: "container",
          yref: "container",
          x: 0.02,
          y: 0.01,
          yanchor: "bottom",
          font: { size: 11 },
        },
        ...extra,
      },
      { displayModeBar: false },
    );
  }
}
