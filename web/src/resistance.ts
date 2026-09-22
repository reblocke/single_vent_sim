import { renderQuantities } from "./presentation/quantities";
import {
  dependencyStrip,
  ratioHelp,
  displayFactor,
} from "./presentation/registry";
import {
  stateSummary,
  pairedSummary,
  summaryBefore,
} from "./physiology-summary";
import type { ResistanceSettings } from "./settings";
import { pressureBudget } from "./budget-plots";
import profiles from "../../config/resistance_profiles.json";
import type { Compute, Grid, Axis } from "./model-types";
import { renderMap, purge, crosshair, titleFor, defaultScale } from "./plots";
import {
  resistanceScenes,
  derivedAliases,
  responseScale,
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
  private referenceEpoch = 0;
  private referenceDraft?: Record<string, number>;
  private modeDrafts: Partial<Record<string, ResistanceSettings>> = {};
  private active = false;
  private mapWidth = 0;
  private resizeTimer?: ReturnType<typeof setTimeout>;
  private point?: Point;
  private grid?: Grid;
  private published?: Record<string, unknown>;
  private selected = { x: 1, y: 1 };
  private scales: [number, number][] = [];
  constructor(private compute: Compute) {
    el("resistance-panel").innerHTML =
      `<div class="explorer-layout"><aside aria-label="Resistance experiment controls">
   <label>Resistance experiment<select id="r-scene"></select></label><button id="r-reset" type="button">Reset resistance experiment</button>
   <p id="r-lesson"></p><details id="r-assumptions"><summary>Assumed response</summary><p id="r-assumption-summary"></p><label>Output closure<select id="r-closure"><option value="nominal_parallel">Nominal parallel (source-compatible)</option><option value="circuit_secant">Circuit secant (derived extension)</option></select></label><div id="r-response"></div></details>
   <label>Oxygen mode<select id="r-oxygen"><option value="normalized_source">Normalized source index</option><option value="physical">Physical oxygen flux</option></select></label>
   <p>Scope: native pulmonary resistance. Whole-pathway semantics audit is available in Compare.</p>
   <p id="r-reference-active"></p><details id="r-reference-editor"><summary>Reference circuit</summary><button id="r-edit-reference" type="button">Edit reference calibration</button><div id="r-reference"></div><button id="r-apply-reference" type="button" disabled>Apply reference</button><button id="r-cancel-reference" type="button" disabled>Cancel</button><p id="r-reference-notice"></p></details>
   <details open><summary>Change applied</summary><div id="r-fixed"></div></details>
   <details open><summary>Oxygen inputs</summary><div id="r-oxygen-inputs"></div></details><details><summary>Plot settings · axes and ranges</summary><div id="r-axes"></div></details>
   <label>Left metric<select id="r-left-metric"></select></label><label>Right metric<select id="r-right-metric"></select></label>
   <button id="r-high" type="button">401 × 401 resolution</button><button id="r-normal" type="button">201 × 201 resolution</button>
  </aside><div class="explorer-content"><p id="r-contract" class="experiment-contract"></p><div id="r-quantities"></div><p id="r-status" role="status"></p>
   <div class="r-maps linked-maps"><article class="plot-card"><h2 id="r-left-title"></h2><div id="r-left-map"></div><p id="r-left-note"></p><button id="r-left-refit" type="button">Refit left display scale</button></article><article class="plot-card"><h2 id="r-right-title"></h2><div id="r-right-map"></div><p id="r-right-note"></p><button id="r-right-refit" type="button">Refit right display scale</button></article></div>
   <p id="r-profiles"></p><div id="r-corners" class="table-scroll"></div><p id="r-linked"></p><section id="r-inspector"><h2>Resistance point and paired budgets</h2><p>Click either map or enter physical coordinates. A and B retain the stated reference policy.</p><div class="point-controls"><label id="r-x-label">X<input id="r-x" type="number" step="any"></label><label id="r-y-label">Y<input id="r-y" type="number" step="any"></label></div><button id="r-select" type="button">Inspect resistance point</button><p id="r-point-status" role="status"></p><button id="r-compare-pair" type="button">Compare this resistance pair</button><div id="r-reference-description"></div><div id="r-pressure"></div><p>Parallel-path pressure drops are equal alternatives, not additive across branches. These are mean steady pressure drops, not a systolic or diastolic waveform.</p><div class="table-scroll"><table><thead><tr><th>Quantity</th><th>A</th><th>B</th><th>Unit</th></tr></thead><tbody id="r-values"></tbody></table></div><details><summary>Full point, calibration and residuals</summary><pre id="r-json"></pre></details></section>
   <p class="source-note">Savorgnan-compatible reconstruction and explicit derived extensions. Published Table 1/native-scope discrepancies remain unresolved; Table 3 arithmetic agreement does not validate physiology. These are assumed resistance patterns, not dose-response or clinical efficacy predictions.</p>
  </div></div>`;
    el("r-quantities").after(dependencyStrip(true));
    const terms = document.createElement("p");
    terms.textContent = ratioHelp;
    el("r-assumptions").append(terms);
    el("r-edit-reference").addEventListener("click", () => {
      this.referenceDraft = structuredClone(this.scene.request.reference);
      this.controls();
    });
    el("r-cancel-reference").addEventListener("click", () => {
      this.referenceDraft = undefined;
      this.controls();
      put(
        "r-reference-notice",
        "Reference edit cancelled; calibration unchanged.",
      );
    });
    el("r-apply-reference").addEventListener(
      "click",
      () => void this.applyReference(),
    );
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
      this.modeDrafts[this.scene.request.oxygen.mode] = this.configuration();
      if (this.modeDrafts[mode]) {
        this.restore(this.modeDrafts[mode]!);
        this.refresh();
        put(
          "r-lesson",
          "Restored saved " +
            mode +
            " draft; physical and normalized experiments are distinct.",
        );
        return;
      }
      put(
        "r-lesson",
        "Loading explicitly named " +
          mode +
          " example; values are not a unit conversion.",
      );
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
      this.scene.metrics =
        this.scene.policy === "local_response"
          ? [
              mode === "physical" ? "do2_ml_min" : "delivery_index_l_min",
              mode === "physical"
                ? "relative_do2_ml_min_change"
                : "relative_delivery_index_l_min_change",
            ]
          : [
              "sa_fraction",
              mode === "physical" ? "do2_ml_min" : "delivery_index_l_min",
            ];
      this.controls();
      put(
        "r-lesson",
        "Loaded named " +
          mode +
          " example (first visit); subsequent switching restores its draft.",
      );
      void this.update();
    });
    for (const [i, side] of ["left", "right"].entries()) {
      el("r-" + side + "-metric").addEventListener("change", () => {
        this.scene.metrics[i] = el<HTMLSelectElement>(
          "r-" + side + "-metric",
        ).value;
        this.scales[i] =
          responseScale(this.scene, this.scene.metrics[i]) ??
          defaultScale(this.scene.metrics[i], "absolute");
        void this.update();
      });
      el("r-" + side + "-refit").addEventListener("click", () => {
        const comparable =
          this.scene.metrics[0] === this.scene.metrics[1] ||
          this.scene.metrics.every((m) =>
            [
              "closure_nominal_relative_change",
              "closure_secant_relative_change",
            ].includes(m),
          );
        const values = this.grid
          ? comparable
            ? this.scene.metrics.flatMap((m) => this.grid!.metrics[m].flat())
            : this.grid.metrics[this.scene.metrics[i]].flat()
          : undefined;
        const defined = values?.filter((v) => v !== null) as
          | number[]
          | undefined;
        if (!defined?.length) return;
        let lo = Infinity,
          hi = -Infinity;
        for (const v of defined) {
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
        if (comparable) this.scales[1 - i] = [...this.scales[i]];
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
      if (
        !this.point ||
        el("resistance-panel").dataset.pending !== "false" ||
        el("r-inspector").dataset.pending !== "false"
      )
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
    new ResizeObserver(() => {
      const w = el("r-left-map").clientWidth;
      if (this.active && w > 0 && Math.abs(w - this.mapWidth) > 1) {
        this.mapWidth = w;
        clearTimeout(this.resizeTimer);
        el("resistance-panel").dataset.pending = "true";
        this.resizeTimer = setTimeout(() => void this.update(), 150);
      }
    }).observe(el("r-left-map"));
    this.controls();
  }
  configuration(): ResistanceSettings {
    return structuredClone({
      preset: this.scene.id,
      request: this.scene.request,
      x: this.scene.x,
      y: this.scene.y,
      metrics: this.scene.metrics,
      selected: this.selected,
      scales: this.scales,
      policy: this.scene.policy,
      local_rp_multiplier: this.scene.local_rp_multiplier,
      reference_epoch: this.referenceEpoch,
    });
  }
  restore(settings: ResistanceSettings) {
    const s = structuredClone(settings);
    this.suspend();
    this.scene = {
      ...structuredClone(
        resistanceScenes.find((scene) => scene.id === s.preset)!,
      ),
      request: s.request,
      x: s.x,
      y: s.y,
      metrics: s.metrics,
      policy: s.policy,
      local_rp_multiplier: s.local_rp_multiplier,
    };
    this.referenceEpoch = s.reference_epoch ?? 0;
    this.referenceDraft = undefined;
    this.selected = s.selected;
    this.controls();
    this.scales = s.scales;
    el<HTMLInputElement>("r-x").value = String(s.selected.x);
    el<HTMLInputElement>("r-y").value = String(s.selected.y);
  }
  oxygenDrafts() {
    return structuredClone({
      ...this.modeDrafts,
      [this.scene.request.oxygen.mode]: this.configuration(),
    });
  }
  restoreOxygenDrafts(drafts: Partial<Record<string, ResistanceSettings>>) {
    this.modeDrafts = structuredClone(drafts);
  }
  private async applyReference() {
    if (!this.referenceDraft) return;
    const draft = structuredClone(this.referenceDraft),
      token = this.generation;
    try {
      await this.compute("resistance_state", {
        request: { ...this.scene.request, reference: draft },
      });
      if (token !== this.generation) return;
      this.scene.request.reference = draft;
      this.referenceDraft = undefined;
      ++this.referenceEpoch;
      this.controls();
      put(
        "r-reference-notice",
        "Applied reference calibration · epoch " + this.referenceEpoch,
      );
      void this.update();
    } catch (e) {
      put("r-reference-notice", "Reference not applied: " + String(e));
    }
  }
  snapshot() {
    return structuredClone(this.published);
  }
  suspend() {
    clearTimeout(this.resizeTimer);
    this.active = false;
    ++this.generation;
    ++this.selection;
    el("resistance-panel").dataset.pending = "true";
    el("r-quantities").hidden = true;
  }
  refresh() {
    this.active = true;
    void this.update();
  }
  private load(id: string) {
    this.referenceDraft = undefined;
    ++this.referenceEpoch;
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
    put(
      "r-lesson",
      "Named-example interpretation (not a live conclusion): " +
        this.scene.lesson,
    );
    el("r-x-label").firstChild!.textContent =
      resistanceLabels[this.scene.x.parameter];
    el("r-y-label").firstChild!.textContent =
      resistanceLabels[this.scene.y.parameter];
    this.scales = this.scene.metrics.map(
      (m) => responseScale(this.scene, m) ?? defaultScale(m, "absolute"),
    );
    const r = this.scene.request;
    el<HTMLDetailsElement>("r-assumptions").open = ["R3", "R6"].includes(
      this.scene.id,
    );
    put(
      "r-assumption-summary",
      `α ${r.response.alpha}; curvature f ${r.response.nonlinear_fraction}; ${r.response.closure}. Alpha is output responsiveness, not EF or measured reserve. At α=1, ${r.response.closure === "circuit_secant" ? "driving pressure stays constant" : "driving pressure need not stay constant with nonlinear loss"}.`,
    );
    put(
      "r-reference-active",
      `Reference Rs ${r.reference.rs_mmhg_min_l}, native Rp ${r.reference.rp_mmhg_min_l}, nominal Rsh ${r.reference.rshunt_nominal_mmhg_min_l} mmHg min/L; Qt ${r.reference.qt_l_min} L/min · epoch ${this.referenceEpoch}.`,
    );
    put(
      "r-reference-notice",
      "Active reference: Rs " +
        r.reference.rs_mmhg_min_l +
        ", native Rp " +
        r.reference.rp_mmhg_min_l +
        ", nominal Rsh " +
        r.reference.rshunt_nominal_mmhg_min_l +
        " mmHg min/L; Qt " +
        r.reference.qt_l_min +
        " L/min; epoch " +
        this.referenceEpoch +
        (this.referenceDraft
          ? ". Pending edits shown below; Apply creates a new calibration."
          : "."),
    );
    const reference = el("r-reference");
    reference.replaceChildren();
    for (const [key, v] of Object.entries(this.referenceDraft ?? r.reference))
      number(
        reference,
        "r-ref-" + key,
        (
          {
            rs_mmhg_min_l: "Reference Rs (mmHg min/L)",
            rp_mmhg_min_l: "Reference native Rp (mmHg min/L)",
            rshunt_nominal_mmhg_min_l: "Reference nominal Rsh (mmHg min/L)",
            qt_l_min: "Reference Qt (L blood/min)",
            common_downstream_pressure_mmhg:
              "Pressure reporting offset (mmHg): adds to arterial pressure; does not model preload or change flows",
          } as Record<string, string>
        )[key],
        v,
        (n) => {
          if (this.referenceDraft) {
            this.referenceDraft[key] = n;
            put(
              "r-reference-notice",
              "Pending " +
                key +
                ": " +
                r.reference[key] +
                " → " +
                n +
                ". Apply creates a new reference epoch; Cancel preserves the current calibration.",
            );
          }
        },
      );
    for (const input of reference.querySelectorAll<HTMLInputElement>("input"))
      input.disabled =
        !this.referenceDraft ||
        this.scene.policy === "matched_reference_family";
    el<HTMLButtonElement>("r-edit-reference").disabled =
      this.scene.policy === "matched_reference_family";
    el<HTMLButtonElement>("r-apply-reference").disabled = !this.referenceDraft;
    el<HTMLButtonElement>("r-cancel-reference").disabled = !this.referenceDraft;
    const held = el("r-fixed");
    held.replaceChildren();
    el("r-response").replaceChildren();
    el("r-oxygen-inputs").replaceChildren();
    for (const [group, values] of Object.entries({
      response: r.response,
      perturbation: r.perturbation,
      oxygen: r.oxygen,
    }))
      for (const [key, v] of Object.entries(values)) {
        const path = group + "." + key;
        if (
          typeof v !== "number" ||
          [this.scene.x.parameter, this.scene.y.parameter].some(
            (p) => p === path || p === derivedAliases[path],
          )
        )
          continue;
        const names: Record<string, string> = {
          "oxygen.spv_fraction": "Saturation leaving the lungs (%)",
          "oxygen.normalized_consumption_l_min":
            "Normalized consumption k (L/min × sat)",
          "oxygen.kappa_ml_o2_g_hb": "κ (mL O₂/g Hb)",
          "oxygen.vo2_ml_min": "Physical consumption M (mL O₂/min)",
        };
        number(
          group === "response"
            ? el("r-response")
            : group === "oxygen"
              ? el("r-oxygen-inputs")
              : held,
          "r-fixed-" + path.replaceAll(".", "-"),
          resistanceLabels[path] ?? names[path] ?? path,
          v * displayFactor(path),
          (n) => {
            (values as Record<string, number | string>)[key] =
              n / displayFactor(path);
            void this.update();
          },
        );
      }
    for (const [key, v] of Object.entries(r.perturbation)) {
      const multiplier = el<HTMLInputElement>("r-fixed-perturbation-" + key);
      if (typeof v !== "number" || !key.endsWith("_multiplier") || !multiplier)
        continue;
      number(
        held,
        "r-percent-" + key,
        "Change from reference (%) · " + key.replace("_multiplier", ""),
        (v - 1) * 100,
        (n) => {
          (r.perturbation as unknown as Record<string, number>)[key] =
            1 + n / 100;
          multiplier.value = String(1 + n / 100);
          void this.update();
        },
      );
      multiplier.addEventListener("change", () => {
        el<HTMLInputElement>("r-percent-" + key).value = String(
          (multiplier.valueAsNumber - 1) * 100,
        );
      });
    }
    if (this.scene.policy === "local_response") {
      number(
        held,
        "r-local-multiplier",
        "Local native Rp multiplier A→B (preset 0.55)",
        this.scene.local_rp_multiplier,
        (n) => {
          this.scene.local_rp_multiplier = n;
          void this.update();
        },
      );
      number(
        held,
        "r-local-percent",
        "Native Rp change A→B (%)",
        (this.scene.local_rp_multiplier - 1) * 100,
        (n) => {
          this.scene.local_rp_multiplier = 1 + n / 100;
          el<HTMLInputElement>("r-local-multiplier").value = String(
            this.scene.local_rp_multiplier,
          );
          void this.update();
        },
      );
      el("r-local-multiplier").addEventListener("change", () => {
        el<HTMLInputElement>("r-local-percent").value = String(
          (this.scene.local_rp_multiplier - 1) * 100,
        );
      });
      const note = document.createElement("p");
      note.textContent =
        "Current absolute resistance axes determine the corresponding state-A multipliers relative to the global anchor; these are derived, not held inputs.";
      held.append(note);
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
      local_rp_multiplier: this.scene.local_rp_multiplier,
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
              typeof v === "number" &&
              !axes.some(
                (p) =>
                  p === group + "." + key ||
                  p === derivedAliases[group + "." + key],
              ),
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
          ? `State A at each coordinate; change A→B after native Rp × ${this.scene.local_rp_multiplier}, retaining the original global anchor and calibration. Axis-derived multipliers are current absolute resistance divided by its global reference.`
          : "Each response uses the unperturbed frozen reference at the same structural alpha/f values.";
    return `Assumed resistance/output law; ${r.response.closure}; scope ${r.perturbation.scope}; oxygen ${r.oxygen.mode}. Reference policy: ${this.scene.policy}. Varying ${resistanceLabels[axes[0]]} and ${resistanceLabels[axes[1]]}. Held: ${held}. Original anchor Rs ${r.reference.rs_mmhg_min_l}, Rp ${r.reference.rp_mmhg_min_l}, nominal Rsh ${r.reference.rshunt_nominal_mmhg_min_l} mmHg min/L; reference Qt ${r.reference.qt_l_min} L/min. ${policy} Mathematical admissibility is not clinical safety.`;
  }
  private async update() {
    clearTimeout(this.resizeTimer);
    this.mapWidth = el("r-left-map").clientWidth;
    if (!this.active) return;
    const generation = ++this.generation;
    ++this.selection;
    const response = this.scene.request.response;
    put(
      "r-assumption-summary",
      `α ${response.alpha}; curvature f ${response.nonlinear_fraction}; ${response.closure}. Output responsiveness is not EF or measured reserve. At α=1, ${response.closure === "circuit_secant" ? "driving pressure stays constant" : "driving pressure need not stay constant with nonlinear loss"}.`,
    );
    const panel = el("resistance-panel");
    panel.dataset.pending = "true";
    el("r-quantities").hidden = true;
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
          plot_coordinates: raw.x.plot_coordinates,
          label: resistanceLabels[raw.x.parameter],
        },
        y: {
          ...raw.y,
          plot_coordinates: raw.y.plot_coordinates,
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
            plot_x: [grid.x.scale === "log" ? Math.log10(x) : x],
            plot_y: [grid.y.scale === "log" ? Math.log10(y) : y],
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
        put(
          "r-" + side + "-title",
          (this.scene.policy === "local_response"
            ? /^(relative_|closure_)/.test(this.scene.metrics[i])
              ? `Change from that A after native Rp ×${this.scene.local_rp_multiplier}: `
              : "Delivery in each starting state A: "
            : "") + titleFor(this.scene.metrics[i]),
        );
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
    el("r-inspector").dataset.pending = "true";
    el("r-quantities").hidden = true;
    el<HTMLButtonElement>("r-compare-pair").disabled = true;
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
      if (generation === this.generation && selection === this.selection) {
        el("r-inspector").dataset.pending = "error";
        put("r-point-status", "Selection error: " + String(error));
      }
    }
  }
  private async showPoint(point: Point, generation: number) {
    const selection = this.selection;
    this.point = point;
    const { a, b } = point.comparison;
    const resolved = document.createElement("p");
    resolved.id = "r-resolved-change";
    resolved.textContent = [
      "rs_mmhg_min_l",
      "rp_mmhg_min_l",
      "rshunt_nominal_mmhg_min_l",
    ]
      .map((k) => `${k}: ${a.metrics[k]} → ${b.metrics[k]} mmHg min/L`)
      .join("; ");
    document.getElementById("r-resolved-change")?.remove();
    el("r-reference-description").before(resolved);
    summaryBefore(
      "r-summary",
      el("r-reference-description"),
      "A: " +
        stateSummary(a) +
        ". B: " +
        stateSummary(b) +
        ". " +
        pairedSummary(a, b),
    );
    const host = await pressureBudget(a, b, el("r-inspector").clientWidth - 48);
    if (generation !== this.generation || selection !== this.selection) {
      purge(host);
      return;
    }
    renderQuantities(el("r-quantities"), a, b, {
      axes: [this.scene.x, this.scene.y],
      label:
        "Selected resistance pair A → B · reference epoch " +
        this.referenceEpoch,
    });
    el("r-quantities").hidden = false;
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
    el("r-inspector").dataset.pending = "false";
    el<HTMLButtonElement>("r-compare-pair").disabled = false;
    put("r-json", JSON.stringify(point, null, 2));
  }
}
