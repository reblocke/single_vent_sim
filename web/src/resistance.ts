import { pressureBudget } from "./budget-plots";
import profiles from "../../config/resistance_profiles.json";
import type { Compute, Grid, Axis } from "./model-types";
import { renderMap, purge, crosshair, titleFor, defaultScale } from "./plots";
import {
  resistanceScenes,
  resistanceLabels,
  type ResistanceScene,
  type ResistanceRequest,
} from "./resistance-scenes";
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const put = (id: string, value: string) => {
  el(id).textContent = value;
};
type ResultState = {
  metrics: Record<string, number | null>;
  units: Record<string, string>;
  reference: Record<string, number>;
  reference_sha256: string;
  hemodynamic_status: string;
  oxygen_status: string;
  requested: ResistanceRequest;
};
type Comparison = {
  a: ResultState;
  b: ResultState;
  deltas: Record<string, { relative: number | null; absolute: number | null }>;
  status: string;
};
type Point = {
  comparison: Comparison;
  displayed_state: ResultState;
  closure_comparisons: Record<string, Comparison>;
  reference_policy: string;
};
const metricOptions = [
  "sa_fraction",
  "sv_fraction",
  "delivery_index_l_min",
  "do2_ml_min",
  "relative_delivery_index_l_min_change",
  "relative_do2_ml_min_change",
  "relative_qp_l_min_change",
  "relative_qt_l_min_change",
  "relative_driving_pressure_mmhg_change",
  "driving_pressure_mmhg",
  "qt_l_min",
  "qp_l_min",
  "qs_l_min",
  "r",
  "normalized_pulmonary_net_l_min",
  "pulmonary_net_add_ml_min",
  "closure_nominal_relative_change",
  "closure_secant_relative_change",
  "closure_difference_percentage_points",
];
const number = (
  parent: HTMLElement,
  id: string,
  label: string,
  value: number,
  onchange: (v: number) => void,
) => {
  const wrap = document.createElement("label");
  wrap.textContent = label;
  const input = document.createElement("input");
  input.id = id;
  input.type = "number";
  input.step = "any";
  input.value = String(value);
  input.addEventListener("change", () => onchange(input.valueAsNumber));
  wrap.append(input);
  parent.append(wrap);
};
export class ResistanceExplorer {
  private scene: ResistanceScene = structuredClone(resistanceScenes[0]);
  private generation = 0;
  private selection = 0;
  private active = false;
  private point?: Point;
  private grid?: Grid;
  private published?: Record<string, unknown>;
  private selected = { x: 1, y: 1 };
  private scales: [number, number][] = [];
  constructor(private compute: Compute) {
    el("resistance-panel").innerHTML =
      `<div class="explorer-layout"><aside aria-label="Resistance experiment controls">
   <label>Resistance experiment<select id="r-scene"></select></label><button id="r-reset" type="button">Reset resistance experiment</button>
   <p id="r-lesson"></p><label>Output closure<select id="r-closure"><option value="nominal_parallel">Nominal parallel (source-compatible)</option><option value="circuit_secant">Circuit secant (derived extension)</option></select></label>
   <label>Oxygen mode<select id="r-oxygen"><option value="normalized_source">Normalized source index</option><option value="physical">Physical oxygen flux</option></select></label>
   <p>Scope: native pulmonary resistance. Whole-pathway semantics audit is available in Compare.</p>
   <details><summary>Reference anchor (explicit new calibration)</summary><div id="r-reference"></div></details>
   <details open><summary>Held inputs</summary><div id="r-fixed"></div></details>
   <details><summary>Axes and ranges</summary><div id="r-axes"></div></details>
   <label>Left metric<select id="r-left-metric"></select></label><label>Right metric<select id="r-right-metric"></select></label>
   <button id="r-high" type="button">401 × 401 resolution</button><button id="r-normal" type="button">201 × 201 resolution</button>
  </aside><div class="explorer-content"><p id="r-contract" class="experiment-contract"></p><p id="r-status" role="status"></p>
   <div class="r-maps linked-maps"><article class="plot-card"><h2 id="r-left-title"></h2><div id="r-left-map"></div><p id="r-left-note"></p><button id="r-left-refit" type="button">Refit left display scale</button></article><article class="plot-card"><h2 id="r-right-title"></h2><div id="r-right-map"></div><p id="r-right-note"></p><button id="r-right-refit" type="button">Refit right display scale</button></article></div>
   <p id="r-profiles"></p><div id="r-corners" class="table-scroll"></div><p id="r-linked"></p><section id="r-inspector"><h2>Resistance point and paired budgets</h2><p>Click either map or enter physical coordinates. A and B retain the stated reference policy.</p><div class="point-controls"><label id="r-x-label">X<input id="r-x" type="number" step="any"></label><label id="r-y-label">Y<input id="r-y" type="number" step="any"></label></div><button id="r-select" type="button">Inspect resistance point</button><p id="r-point-status" role="status"></p><button id="r-compare-pair" type="button">Compare this resistance pair</button><div id="r-reference-description"></div><div id="r-pressure"></div><p>Parallel-path pressure drops are equal alternatives, not additive across branches. These are mean steady pressure drops, not a systolic or diastolic waveform.</p><div class="table-scroll"><table><thead><tr><th>Quantity</th><th>A</th><th>B</th><th>Unit</th></tr></thead><tbody id="r-values"></tbody></table></div><details><summary>Full point, calibration and residuals</summary><pre id="r-json"></pre></details></section>
   <p class="source-note">Savorgnan-compatible reconstruction and explicit derived extensions. Published Table 1/native-scope discrepancies remain unresolved; Table 3 arithmetic agreement does not validate physiology. These are assumed resistance patterns, not dose-response or clinical efficacy predictions.</p>
  </div></div>`;
    for (const s of resistanceScenes) {
      const o = new Option(s.id + " · " + s.title, s.id);
      el<HTMLSelectElement>("r-scene").add(o);
    }
    el("r-scene").addEventListener("change", () =>
      this.load(el<HTMLSelectElement>("r-scene").value),
    );
    el("r-reset").addEventListener("click", () => this.load(this.scene.id));
    el("r-closure").addEventListener("change", () => {
      this.scene.request.response.closure =
        el<HTMLSelectElement>("r-closure").value;
      void this.update();
    });
    el("r-oxygen").addEventListener("change", () => {
      const mode = el<HTMLSelectElement>("r-oxygen").value;
      this.scene.request.oxygen =
        mode === "physical"
          ? {
              mode,
              spv_fraction: 0.99,
              hb_g_dl: 12,
              kappa_ml_o2_g_hb: 1.34,
              vo2_ml_min: 30.552,
            }
          : { mode, spv_fraction: 0.99, normalized_consumption_l_min: 0.19 };
      if (
        mode === "normalized_source" &&
        [this.scene.x.parameter, this.scene.y.parameter].includes(
          "oxygen.hb_g_dl",
        )
      ) {
        this.scene.x = {
          parameter: "perturbation.rp_multiplier",
          min: 0.1,
          max: 1.5,
          n: 201,
          scale: "linear",
        };
      }
      this.scene.metrics = [
        "sa_fraction",
        mode === "physical" ? "do2_ml_min" : "delivery_index_l_min",
      ];
      this.controls();
      void this.update();
    });
    for (const [i, side] of ["left", "right"].entries()) {
      el("r-" + side + "-metric").addEventListener("change", () => {
        this.scene.metrics[i] = el<HTMLSelectElement>(
          "r-" + side + "-metric",
        ).value;
        this.scales[i] = defaultScale(this.scene.metrics[i], "absolute");
        void this.update();
      });
      el("r-" + side + "-refit").addEventListener("click", () => {
        const values = this.grid?.metrics[this.scene.metrics[i]]
          .flat()
          .filter((v) => v !== null) as number[] | undefined;
        if (!values?.length) return;
        let lo = Infinity,
          hi = -Infinity;
        for (const v of values) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
        const key = this.scene.metrics[i],
          factor =
            key.includes("relative_") || /^(sa|sv)_fraction$/.test(key)
              ? 100
              : 1;
        lo *= factor;
        hi *= factor;
        this.scales[i] =
          key.includes("change") || key.includes("difference")
            ? [
                -Math.max(Math.abs(lo), Math.abs(hi), 1),
                Math.max(Math.abs(lo), Math.abs(hi), 1),
              ]
            : lo === hi
              ? [lo - 1, hi + 1]
              : [lo, hi];
        void this.update();
      });
    }
    el("r-select").addEventListener(
      "click",
      () =>
        void this.inspect(
          Number(el<HTMLInputElement>("r-x").value),
          Number(el<HTMLInputElement>("r-y").value),
        ),
    );
    for (const [id, n] of [
      ["r-high", 401],
      ["r-normal", 201],
    ] as const)
      el(id).addEventListener("click", () => {
        this.scene.x.n = this.scene.y.n = n;
        void this.update();
      });
    el("r-compare-pair").addEventListener("click", () => {
      if (!this.point || el("resistance-panel").dataset.pending !== "false")
        return;
      const { a, b } = this.point.comparison;
      document
        .querySelector<HTMLButtonElement>('[data-view="compare"]')!
        .click();
      window.dispatchEvent(
        new CustomEvent("parallel-o2-resistance-pair", {
          detail: { a: a.requested, b: b.requested, policy: this.scene.policy },
        }),
      );
    });
    let width = 0;
    let timer: ReturnType<typeof setTimeout>;
    new ResizeObserver(() => {
      const w = el("r-left-map").clientWidth;
      if (this.active && w > 0 && Math.abs(w - width) > 1) {
        width = w;
        clearTimeout(timer);
        timer = setTimeout(() => void this.update(), 150);
      }
    }).observe(el("r-left-map"));
    this.controls();
  }
  snapshot() {
    return structuredClone(this.published);
  }
  suspend() {
    this.active = false;
    ++this.generation;
    ++this.selection;
    el("resistance-panel").dataset.pending = "true";
  }
  refresh() {
    this.active = true;
    void this.update();
  }
  private load(id: string) {
    this.scene = structuredClone(resistanceScenes.find((s) => s.id === id)!);
    const initial = (axis: Axis) => {
      if (axis.parameter === "reference_native_fraction") return 0.3;
      if (axis.parameter === "current_rp_mmhg_min_l") return 12;
      if (axis.parameter === "current_rshunt_nominal_mmhg_min_l") return 28;
      const [group, key] = axis.parameter.split(".");
      return Number(
        (
          this.scene.request as unknown as Record<
            string,
            Record<string, unknown>
          >
        )[group][key],
      );
    };
    this.selected = { x: initial(this.scene.x), y: initial(this.scene.y) };
    this.controls();
    void this.update();
  }
  private controls() {
    el<HTMLSelectElement>("r-scene").value = this.scene.id;
    el<HTMLSelectElement>("r-closure").value =
      this.scene.request.response.closure;
    el<HTMLSelectElement>("r-oxygen").value = this.scene.request.oxygen.mode;
    put("r-lesson", "Reset-preset interpretation: " + this.scene.lesson);
    el("r-x-label").firstChild!.textContent =
      resistanceLabels[this.scene.x.parameter];
    el("r-y-label").firstChild!.textContent =
      resistanceLabels[this.scene.y.parameter];
    this.scales = this.scene.metrics.map((m) => defaultScale(m, "absolute"));
    const r = this.scene.request;
    const reference = el("r-reference");
    reference.replaceChildren();
    for (const [key, v] of Object.entries(r.reference))
      number(
        reference,
        "r-ref-" + key,
        (
          {
            rs_mmhg_min_l: "Reference Rs (mmHg min/L)",
            rp_mmhg_min_l: "Reference native Rp (mmHg min/L)",
            rshunt_nominal_mmhg_min_l: "Reference nominal Rsh (mmHg min/L)",
            qt_l_min: "Reference Qt (L blood/min)",
            common_downstream_pressure_mmhg: "Common downstream offset (mmHg)",
          } as Record<string, string>
        )[key],
        v,
        (n) => {
          r.reference[key] = n;
          void this.update();
        },
      );
    for (const input of reference.querySelectorAll<HTMLInputElement>("input"))
      input.disabled = this.scene.policy === "matched_reference_family";
    const held = el("r-fixed");
    held.replaceChildren();
    for (const [group, values] of Object.entries({
      response: r.response,
      perturbation: r.perturbation,
      oxygen: r.oxygen,
    }))
      for (const [key, v] of Object.entries(values)) {
        const path = group + "." + key;
        if (
          typeof v !== "number" ||
          [this.scene.x.parameter, this.scene.y.parameter].includes(path)
        )
          continue;
        const names: Record<string, string> = {
          "oxygen.spv_fraction": "Pulmonary venous saturation (fraction)",
          "oxygen.normalized_consumption_l_min":
            "Normalized consumption k (L/min × sat)",
          "oxygen.kappa_ml_o2_g_hb": "κ (mL O₂/g Hb)",
          "oxygen.vo2_ml_min": "Physical consumption M (mL O₂/min)",
        };
        number(
          held,
          "r-fixed-" + path.replaceAll(".", "-"),
          resistanceLabels[path] ?? names[path] ?? path,
          v,
          (n) => {
            (values as Record<string, number | string>)[key] = n;
            void this.update();
          },
        );
      }
    const axes = el("r-axes");
    axes.replaceChildren();
    for (const side of ["x", "y"] as const) {
      const axis = this.scene[side];
      const p = document.createElement("p");
      p.textContent =
        side.toUpperCase() + ": " + resistanceLabels[axis.parameter];
      axes.append(p);
      for (const bound of ["min", "max"] as const)
        number(
          axes,
          "r-" + side + "-" + bound,
          side.toUpperCase() + " " + bound,
          axis[bound],
          (v) => {
            axis[bound] = v;
            void this.update();
          },
        );
    }
    for (const [i, side] of ["left", "right"].entries()) {
      const select = el<HTMLSelectElement>("r-" + side + "-metric");
      select.replaceChildren();
      for (const m of metricOptions) {
        if (
          r.oxygen.mode === "normalized_source" &&
          (m.includes("do2_") || m === "pulmonary_net_add_ml_min")
        )
          continue;
        select.add(new Option(titleFor(m), m));
      }
      select.value = this.scene.metrics[i];
    }
  }
  private args() {
    return {
      request: this.scene.request,
      x: this.scene.x,
      y: this.scene.y,
      baseline_policy: this.scene.policy,
      local_rp_multiplier: 0.55,
    };
  }
  private contract() {
    const r = this.scene.request;
    const axes = [this.scene.x.parameter, this.scene.y.parameter];
    const held = Object.entries({
      response: r.response,
      perturbation: r.perturbation,
      oxygen: r.oxygen,
    })
      .flatMap(([group, values]) =>
        Object.entries(values)
          .filter(
            ([key, v]) =>
              typeof v === "number" && !axes.includes(group + "." + key),
          )
          .map(
            ([key, v]) =>
              `${resistanceLabels[group + "." + key] ?? key} = ${v}`,
          ),
      )
      .join("; ");
    const policy =
      this.scene.policy === "matched_reference_family"
        ? "Every rho has its own frozen Rp/Rsh partition; Rp + nominal Rsh stays 40 and baseline flows match."
        : this.scene.policy === "local_response"
          ? "Each cell is A; B changes only that cell's native Rp × 0.55, retaining the original global anchor and calibration."
          : "Each response uses the unperturbed frozen reference at the same structural alpha/f values.";
    return `Assumed resistance/output law; ${r.response.closure}; scope ${r.perturbation.scope}; oxygen ${r.oxygen.mode}. Reference policy: ${this.scene.policy}. Varying ${resistanceLabels[axes[0]]} and ${resistanceLabels[axes[1]]}. Held: ${held}. Original anchor Rs ${r.reference.rs_mmhg_min_l}, Rp ${r.reference.rp_mmhg_min_l}, nominal Rsh ${r.reference.rshunt_nominal_mmhg_min_l} mmHg min/L; reference Qt ${r.reference.qt_l_min} L/min. ${policy} Mathematical admissibility is not clinical safety.`;
  }
  private async update() {
    if (!this.active) return;
    const generation = ++this.generation;
    ++this.selection;
    const panel = el("resistance-panel");
    panel.dataset.pending = "true";
    panel.setAttribute("aria-busy", "true");
    put("r-status", "Calculating a complete resistance experiment…");
    try {
      const raw = (await this.compute("resistance_grid", {
        ...this.args(),
        metrics: [...new Set(this.scene.metrics)],
      })) as Grid;
      if (generation !== this.generation) return;
      const grid = {
        ...raw,
        indexing_basis: "absolute",
        status: raw.after_status,
        masked_count: 0,
        x: {
          ...raw.x,
          plot_coordinates: raw.x.coordinates,
          label: resistanceLabels[raw.x.parameter],
        },
        y: {
          ...raw.y,
          plot_coordinates: raw.y.coordinates,
          label: resistanceLabels[raw.y.parameter],
        },
      } as Grid;
      if (this.scene.id === "R1")
        grid.constraint_overlays = profiles.profiles.map((profile, i) => {
          const x = 1 + profile.delta_rs_fraction,
            y = 1 + profile.delta_native_rp_fraction;
          return {
            kind: "profile",
            label: String.fromCharCode(65 + i),
            x: [x],
            y: [y],
            plot_x: [x],
            plot_y: [y],
          };
        });
      this.selected = {
        x: Math.max(
          this.scene.x.min,
          Math.min(this.scene.x.max, this.selected.x),
        ),
        y: Math.max(
          this.scene.y.min,
          Math.min(this.scene.y.max, this.selected.y),
        ),
      };
      const point = (await this.compute("resistance_point", {
        ...this.args(),
        x_value: this.selected.x,
        y_value: this.selected.y,
      })) as Point;
      if (generation !== this.generation) return;
      const corners = ["R3", "R6"].includes(this.scene.id)
        ? ((await this.compute("ablation", {
            request: this.scene.request,
            alpha_values: [0, 1],
            nonlinear_values: [0, 1],
          })) as {
            cells: {
              alpha: number;
              nonlinear_fraction: number;
              relative_index_change: number | null;
            }[];
          })
        : undefined;
      if (generation !== this.generation) return;
      const hosts = [
        document.createElement("div"),
        document.createElement("div"),
      ];
      const reports = await Promise.all(
        hosts.map((host, i) =>
          renderMap(
            host,
            grid,
            this.scene.metrics[i],
            this.scales[i],
            el(i === 0 ? "r-left-map" : "r-right-map").clientWidth,
            "none",
            ["profile"],
            (x, y, pin) => {
              if (generation !== this.generation) return;
              for (const s of ["left", "right"]) {
                const node = el("r-" + s + "-map")
                  .firstElementChild as HTMLElement;
                crosshair(node, grid, x, y);
              }
              put(
                "r-linked",
                `Linked resistance coordinate: x ${x.toPrecision(7)}, y ${y.toPrecision(7)}.`,
              );
              if (pin) void this.inspect(x, y);
            },
          ),
        ),
      );
      if (generation !== this.generation) {
        hosts.forEach(purge);
        return;
      }
      this.grid = grid;
      this.point = point;
      const contract = this.contract();
      put(
        "r-profiles",
        this.scene.id === "R1"
          ? "Assumption markers (letters are identifiers, not rankings): " +
              profiles.profiles
                .map(
                  (profile, i) =>
                    String.fromCharCode(65 + i) +
                    " · " +
                    profile.id.replaceAll("_", " ") +
                    ` (Rs × ${1 + profile.delta_rs_fraction}, native Rp × ${1 + profile.delta_native_rp_fraction})`,
                )
                .join("; ")
          : "",
      );
      const cornerHost = el("r-corners");
      cornerHost.replaceChildren();
      if (corners) {
        const title = document.createElement("p");
        title.textContent =
          "Independently solved mechanism corners, same native-Rp scope and anchor. Change relative to each corner's unperturbed reference:";
        cornerHost.append(title);
        const table = document.createElement("table");
        for (const row of corners.cells) {
          const tr = document.createElement("tr");
          for (const v of [
            `α ${row.alpha}`,
            `f ${row.nonlinear_fraction}`,
            row.relative_index_change === null
              ? "Masked"
              : `${(row.relative_index_change * 100).toPrecision(7)}% index change`,
          ]) {
            const td = document.createElement("td");
            td.textContent = v;
            tr.append(td);
          }
          table.append(tr);
        }
        cornerHost.append(table);
      }

      put("r-contract", contract);
      for (const [i, side] of ["left", "right"].entries()) {
        const target = el("r-" + side + "-map");
        for (const child of target.children) purge(child as HTMLElement);
        target.replaceChildren(hosts[i]);
        target.dataset.generation = String(generation);
        put("r-" + side + "-title", titleFor(this.scene.metrics[i]));
        put("r-" + side + "-note", reports[i].notice);
      }
      await this.showPoint(point, generation);
      if (generation !== this.generation) return;
      panel.dataset.pending = "false";
      panel.dataset.generation = String(generation);
      panel.setAttribute("aria-busy", "false");
      put(
        "r-status",
        `Shared Python result: ${grid.actual_resolution.join(" × ")}. Masked oxygen cells retain separately inspectable circuit status. No automatic fixed-flow optimum applies to this resistance trajectory.`,
      );
      this.published = {
        generation,
        scene: structuredClone(this.scene),
        grid,
        point,
        corners,
        contract,
      };
    } catch (error) {
      if (generation === this.generation) {
        panel.dataset.pending = "error";
        panel.setAttribute("aria-busy", "false");
        put("r-status", "Resistance input/calculation error: " + String(error));
      }
    }
  }
  private async inspect(x: number, y: number) {
    const generation = this.generation,
      selection = ++this.selection;
    put("r-point-status", "Calculating selected physical coordinates…");
    try {
      const point = (await this.compute("resistance_point", {
        ...this.args(),
        x_value: x,
        y_value: y,
      })) as Point;
      if (generation !== this.generation || selection !== this.selection)
        return;
      this.selected = { x, y };
      await this.showPoint(point, generation);
      if (
        this.published &&
        generation === this.generation &&
        selection === this.selection
      )
        this.published.point = point;
    } catch (error) {
      if (generation === this.generation && selection === this.selection)
        put("r-point-status", "Selection error: " + String(error));
    }
  }
  private async showPoint(point: Point, generation: number) {
    const selection = this.selection;
    this.point = point;
    const { a, b } = point.comparison;
    const host = await pressureBudget(a, b, el("r-inspector").clientWidth - 48);
    if (generation !== this.generation || selection !== this.selection) {
      purge(host);
      return;
    }
    el<HTMLInputElement>("r-x").value = String(this.selected.x);
    el<HTMLInputElement>("r-y").value = String(this.selected.y);
    put(
      "r-point-status",
      `A: circuit ${a.hemodynamic_status}, oxygen ${a.oxygen_status}. B: circuit ${b.hemodynamic_status}, oxygen ${b.oxygen_status}. Selected x ${this.selected.x}, y ${this.selected.y}.`,
    );
    put(
      "r-reference-description",
      `A reference Rp ${a.reference.rp_mmhg_min_l}, nominal Rsh ${a.reference.rshunt_nominal_mmhg_min_l} mmHg min/L; calibration Qp ${a.reference.calibration_qp_l_min} L/min. Frozen reference ${a.reference_sha256}. ${point.reference_policy}.`,
    );
    const table = el("r-values");
    table.replaceChildren();
    const rows = [
      "sa_fraction",
      "sv_fraction",
      "qp_l_min",
      "qs_l_min",
      "qt_l_min",
      "r",
      "driving_pressure_mmhg",
      "systemic_pressure_drop_mmhg",
      "native_pulmonary_pressure_drop_mmhg",
      "linear_shunt_pressure_drop_mmhg",
      "quadratic_shunt_pressure_drop_mmhg",
      "shunt_secant_resistance_mmhg_min_l",
      "shunt_incremental_resistance_mmhg_min_l",
      "delivery_index_l_min",
      "do2_ml_min",
      "normalized_pulmonary_in_l_min",
      "normalized_pulmonary_out_l_min",
      "normalized_pulmonary_net_l_min",
      "pulmonary_in_ml_min",
      "pulmonary_out_ml_min",
      "pulmonary_net_add_ml_min",
    ];
    for (const key of rows) {
      if (a.metrics[key] === null && b.metrics[key] === null) continue;
      const row = document.createElement("tr");
      row.dataset.metric = key;
      for (const v of [
        titleFor(key),
        a.metrics[key] === null ? "Undefined" : a.metrics[key]?.toPrecision(8),
        b.metrics[key] === null ? "Undefined" : b.metrics[key]?.toPrecision(8),
        b.units[key],
      ]) {
        const td = document.createElement("td");
        td.textContent = String(v);
        row.append(td);
      }
      table.append(row);
    }
    const target = el("r-pressure");
    for (const old of target.children) purge(old as HTMLElement);
    target.replaceChildren(host);
    el("r-inspector").dataset.generation = String(generation);
    put("r-json", JSON.stringify(point, null, 2));
  }
}
