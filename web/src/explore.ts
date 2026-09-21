import type {
  Compute,
  Criteria,
  Grid,
  Scenario,
  Scene,
  State,
} from "./model-types";
import {
  activeParameters,
  criteria as initialCriteria,
  getParameter,
  label,
  parameters,
  scenes,
  setParameter,
} from "./scenes";
import {
  crosshair,
  defaultScale,
  factorFor,
  purge,
  renderMap,
  renderSlice,
  type Slice,
  titleFor,
  unitFor,
} from "./plots";

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const value = (id: string) => $<HTMLInputElement>(id).value;
const text = (id: string, content: string) => {
  $(id).textContent = content;
};
function option(select: HTMLSelectElement, id: string, label: string) {
  const o = document.createElement("option");
  o.value = id;
  o.textContent = label;
  select.append(o);
}
function number(
  id: string,
  labelText: string,
  n: number,
  onchange: (n: number) => void,
): HTMLLabelElement {
  const wrapper = document.createElement("label");
  wrapper.htmlFor = id;
  wrapper.textContent = labelText;
  const input = document.createElement("input");
  input.type = "number";
  input.step = "any";
  input.id = id;
  input.value = String(n);
  input.addEventListener("change", () => onchange(input.valueAsNumber));
  wrapper.append(input);
  return wrapper;
}
export class Explorer {
  private scene: Scene = structuredClone(scenes[0]);
  private criteria: Criteria = structuredClone(initialCriteria);
  private generation = 0;
  private selectionGeneration = 0;
  private suspended = false;
  private selected: { x: number; y: number } = { x: 10, y: 1 };
  private grid?: Grid;
  private state?: State;
  private scale: [number, number][] = this.scene.metrics.map((m) =>
    defaultScale(m, "per_kg"),
  );
  private pins: { a?: Scenario; b?: Scenario } = {};
  private published?: {
    generation: number;
    scene: Scene;
    criteria: Criteria;
    grid: Grid;
    state: unknown;
    contract: string;
  };
  constructor(private compute: Compute) {
    for (const scene of scenes)
      option(
        $<HTMLSelectElement>("scene"),
        scene.id,
        `${scene.id} · ${scene.title}`,
      );
    $("scene").addEventListener("change", () => this.load(value("scene")));
    $("reset-map").addEventListener("click", () => this.load(this.scene.id));
    $("high-resolution").addEventListener("click", () => {
      this.scene.x.n = this.scene.y.n = 401;
      void this.update();
    });
    $("normal-resolution").addEventListener("click", () => {
      this.scene.x.n = this.scene.y.n = 201;
      void this.update();
    });
    $("capacity-mode").addEventListener("change", () => {
      const mode = value("capacity-mode");
      this.scene.kind = undefined;
      this.scene.base.capacity =
        mode === "direct_capacity"
          ? { mode, capacity_ml_dl: this.state?.metrics.capacity_ml_dl ?? 13.4 }
          : { mode, hb_g_dl: 10, kappa_ml_o2_g_hb: 1.34 };
      this.reconcileAxes();
      this.controls();
      void this.update();
    });
    $("flow-mode").addEventListener("change", () => void this.changeFlowMode());
    $("convert-basis").addEventListener(
      "click",
      () => void this.convertBasis(),
    );
    $("contour").addEventListener("change", () => void this.update());
    for (const input of document.querySelectorAll<HTMLInputElement>(
      "#constraint-options input",
    ))
      input.addEventListener("change", () => void this.update());
    for (const side of ["left", "right"] as const) {
      $(side + "-metric").addEventListener("change", () => {
        const i = side === "left" ? 0 : 1;
        this.scene.metrics[i] = value(side + "-metric");
        this.scale[i] = defaultScale(
          this.scene.metrics[i],
          this.scene.base.indexing_basis,
        );
        void this.update();
      });
      $(side + "-refit").addEventListener("click", () => {
        const i = side === "left" ? 0 : 1,
          key = this.scene.metrics[i],
          factor = factorFor(key),
          values = this.grid?.metrics[key].flat().filter((v) => v !== null) as
            | number[]
            | undefined;
        if (!values?.length) return;
        let min = Infinity,
          max = -Infinity;
        for (const v of values) {
          min = Math.min(min, v * factor);
          max = Math.max(max, v * factor);
        }
        this.scale[i] = key.startsWith("delta_")
          ? [
              -Math.max(Math.abs(min), Math.abs(max), 1e-12),
              Math.max(Math.abs(min), Math.abs(max), 1e-12),
            ]
          : min === max
            ? [
                min - Math.max(1, Math.abs(min) * 0.05),
                max + Math.max(1, Math.abs(max) * 0.05),
              ]
            : [min, max];
        void this.update();
      });
    }
    for (const name of ["sa", "sv"] as const)
      $("criterion-" + name).addEventListener("change", () => {
        this.criteria = {
          ...this.criteria,
          id: "user-selected",
          origin: "user_selected",
          [name + "_lower_fraction"]: Number(value("criterion-" + name)) / 100,
        };
        delete this.criteria.source_id;
        void this.update();
      });
    $("restore-criteria").addEventListener("click", () => {
      this.criteria = structuredClone(initialCriteria);
      this.controls();
      void this.update();
    });
    $("select-state").addEventListener(
      "click",
      () =>
        void this.inspect(
          Number(value("select-x")),
          Number(value("select-y")),
          "Exactly reevaluated arbitrary point",
        ),
    );
    $("state-navigation").addEventListener("keydown", (event) => {
      if (
        !this.grid ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      event.preventDefault();
      const g = this.grid;
      const nearest = (coordinates: number[], v: number) =>
        coordinates.reduce(
          (best, n, i) =>
            Math.abs(n - v) < Math.abs(coordinates[best] - v) ? i : best,
          0,
        );
      const i = Math.max(
        0,
        Math.min(
          g.x.coordinates.length - 1,
          nearest(g.x.coordinates, this.selected.x) +
            (event.key === "ArrowRight"
              ? 1
              : event.key === "ArrowLeft"
                ? -1
                : 0),
        ),
      );
      const j = Math.max(
        0,
        Math.min(
          g.y.coordinates.length - 1,
          nearest(g.y.coordinates, this.selected.y) +
            (event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0),
        ),
      );
      void this.inspect(
        g.x.coordinates[i],
        g.y.coordinates[j],
        "Exactly reevaluated grid sample",
      );
    });
    for (const pin of ["a", "b"] as const)
      $("pin-" + pin).addEventListener("click", () => this.pin(pin));
    $("show-slice").addEventListener("click", () => void this.slice());
    this.controls();
    void this.update();
    let width = $("left-map").clientWidth;
    let resizeTimer: ReturnType<typeof setTimeout>;
    new ResizeObserver(() => {
      const next = $("left-map").clientWidth;
      if (next > 0 && Math.abs(next - width) > 1) {
        width = next;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => void this.update(), 150);
      }
    }).observe($("left-map"));
  }
  snapshot() {
    return structuredClone(this.published);
  }
  private load(id: string) {
    this.scene = structuredClone(scenes.find((s) => s.id === id)!);
    $<HTMLSelectElement>("contour").value =
      id === "E2"
        ? "sa_fraction"
        : id === "H1" || id === "H2"
          ? "criteria"
          : "none";
    for (const input of document.querySelectorAll<HTMLInputElement>(
      "#constraint-options input",
    ))
      input.checked =
        input.id === "overlay-ratio_1" && (id === "E2" || id === "H2");
    this.criteria = structuredClone(initialCriteria);
    this.scale = this.scene.metrics.map((m) =>
      defaultScale(m, this.scene.base.indexing_basis),
    );
    this.selected = {
      x: getParameter(this.scene.base, this.scene.x.parameter),
      y:
        this.scene.kind === "hb_gain"
          ? 1
          : getParameter(this.scene.base, this.scene.y.parameter),
    };
    this.controls();
    void this.update();
  }
  private reconcileAxes() {
    const active = activeParameters(this.scene.base);
    for (const key of ["x", "y"] as const)
      if (
        !active.includes(this.scene[key].parameter) ||
        (key === "y" && this.scene.y.parameter === this.scene.x.parameter)
      ) {
        const p = active.find(
          (p) => p !== this.scene[key === "x" ? "y" : "x"].parameter,
        )!;
        this.scene[key] = {
          parameter: p,
          min: parameters[p].range[0],
          max: parameters[p].range[1],
          n: 201,
          scale: "linear",
        };
      }
    this.selected = {
      x: getParameter(this.scene.base, this.scene.x.parameter),
      y: getParameter(this.scene.base, this.scene.y.parameter),
    };
  }
  private metricOptions() {
    if (this.scene.kind === "hb_boundary")
      return ["joint_hb_g_dl", "binding_code"];
    const suffix =
      this.scene.base.indexing_basis === "per_kg" ? "ml_kg_min" : "ml_min_m2";
    if (this.scene.kind === "hb_gain")
      return [
        "delta_sa_fraction",
        "delta_sv_fraction",
        "delta_do2_" + suffix,
        "delta_ca_ml_dl",
      ];
    return [
      "sa_fraction",
      "sv_fraction",
      "do2_" + suffix,
      "ca_ml_dl",
      "cv_ml_dl",
      "cpv_ml_dl",
      "oer_fraction",
      "omega",
      ...[
        "systemic_out_",
        "pulmonary_in_",
        "pulmonary_out_",
        "pulmonary_net_add_",
      ].map((p) => p + suffix),
    ];
  }
  private controls() {
    $<HTMLSelectElement>("scene").value = this.scene.id;
    $<HTMLSelectElement>("capacity-mode").value = String(
      this.scene.base.capacity.mode,
    );
    $<HTMLSelectElement>("flow-mode").value = String(this.scene.base.flow.mode);
    text("scene-question", this.scene.question);
    text("scene-lesson", this.scene.lesson);
    $("source-note").hidden = this.scene.base.indexing_basis !== "per_m2";
    text(
      "basis-note",
      this.scene.base.indexing_basis === "per_kg"
        ? "Native per-kg inputs"
        : "Native per-m² inputs",
    );
    const options = this.metricOptions();
    for (const [i, side] of ["left", "right"].entries()) {
      const select = $<HTMLSelectElement>(side + "-metric");
      select.replaceChildren();
      for (const metric of options) option(select, metric, titleFor(metric));
      if (!options.includes(this.scene.metrics[i]))
        this.scene.metrics[i] = options[i];
      select.value = this.scene.metrics[i];
    }
    for (const name of ["sa", "sv"] as const)
      $<HTMLInputElement>("criterion-" + name).value = String(
        this.criteria[
          (name + "_lower_fraction") as
            | "sa_lower_fraction"
            | "sv_lower_fraction"
        ] * 100,
      );
    $("axes").replaceChildren();
    for (const key of ["x", "y"] as const) {
      const field = document.createElement("fieldset"),
        legend = document.createElement("legend");
      legend.textContent = key.toUpperCase() + " axis";
      field.append(legend);
      const wrapper = document.createElement("label");
      wrapper.htmlFor = key + "-parameter";
      wrapper.textContent = "Variable";
      const select = document.createElement("select");
      select.id = key + "-parameter";
      for (const p of this.scene.kind
        ? [this.scene[key].parameter]
        : activeParameters(this.scene.base))
        option(select, p, label(p));
      select.value = this.scene[key].parameter;
      select.addEventListener("change", () => {
        const p = select.value;
        this.scene[key] = {
          ...this.scene[key],
          parameter: p,
          min: parameters[p].range[0],
          max: parameters[p].range[1],
        };
        this.selected[key] = getParameter(this.scene.base, p);
        this.controls();
        void this.update();
      });
      wrapper.append(select);
      field.append(wrapper);
      for (const end of ["min", "max"] as const)
        field.append(
          number(
            key + "-" + end,
            end === "min" ? "Minimum" : "Maximum",
            this.scene[key][end],
            (n) => {
              this.scene[key][end] = n;
              void this.update();
            },
          ),
        );
      const scaleLabel = document.createElement("label");
      scaleLabel.htmlFor = key + "-scale";
      scaleLabel.textContent = "Sampling scale";
      const scale = document.createElement("select");
      scale.id = key + "-scale";
      option(scale, "linear", "Linear");
      option(scale, "log", "Logarithmic (positive only)");
      scale.value = this.scene[key].scale;
      scale.addEventListener("change", () => {
        this.scene[key].scale = scale.value as "linear" | "log";
        void this.update();
      });
      scaleLabel.append(scale);
      field.append(scaleLabel);
      $("axes").append(field);
    }
    $("fixed-inputs").replaceChildren();
    for (const p of activeParameters(this.scene.base))
      if (
        p !== this.scene.x.parameter &&
        p !== this.scene.y.parameter &&
        !(this.scene.kind === "hb_boundary" && p === "capacity.hb_g_dl")
      )
        $("fixed-inputs").append(
          number(
            "fixed-" + p.replaceAll(".", "-"),
            label(p),
            getParameter(this.scene.base, p),
            (n) => {
              setParameter(this.scene.base, p, n);
              void this.update();
            },
          ),
        );
    $<HTMLInputElement>("select-x").value = String(this.selected.x);
    $<HTMLInputElement>("select-y").value = String(this.selected.y);
    text("select-x-label", label(this.scene.x.parameter));
    text("select-y-label", label(this.scene.y.parameter));
  }
  private contract() {
    const s = this.scene,
      fixed = activeParameters(s.base)
        .filter(
          (p) =>
            p !== s.x.parameter &&
            p !== s.y.parameter &&
            !(s.kind === "hb_boundary" && p === "capacity.hb_g_dl"),
        )
        .map((p) => `${label(p)} = ${getParameter(s.base, p)}`)
        .join("; ");
    return `Varying ${label(s.x.parameter)} and ${label(s.y.parameter)}. Held fixed across this map: ${fixed}. ${s.base.flow.mode === "total_ratio" ? "Both branch flows change when Qp/Qs changes at fixed total output." : "Pulmonary and systemic flows are independent prescribed inputs."} ${s.kind === "hb_boundary" ? "Equality surface; no baseline Hb constraint." : ""}`;
  }
  private selectedScenario(x = this.selected.x, y = this.selected.y) {
    const s = structuredClone(this.scene.base);
    setParameter(s, this.scene.x.parameter, x);
    if (this.scene.kind !== "hb_gain")
      setParameter(s, this.scene.y.parameter, y);
    return s;
  }
  private async selectedResult(x: number, y: number) {
    const scenario = this.selectedScenario(x, y);
    if (this.scene.kind === "hb_boundary")
      return await this.compute("criterion_boundary", {
        scenario,
        criteria: this.criteria,
        solve_for: "hb",
        display_range: [0, 25],
      });
    if (this.scene.kind === "hb_gain")
      return await this.compute("hb_sensitivity", {
        scenario,
        delta_hb_g_dl: y,
      });
    return await this.compute("inspect_state", {
      scenario,
      criteria: this.criteria,
    });
  }
  suspend() {
    this.suspended = true;
    ++this.generation;
    ++this.selectionGeneration;
    this.state = undefined;
    $("explore").dataset.pending = "true";
    $("explore").setAttribute("aria-busy", "true");
    $("slice-plots").hidden = true;
    $<HTMLButtonElement>("pin-a").disabled = true;
    $<HTMLButtonElement>("pin-b").disabled = true;
    text(
      "map-status",
      "Python runtime unavailable; retry initialization below.",
    );
  }
  refresh() {
    this.suspended = false;
    void this.update();
  }
  private async update() {
    if (this.suspended) return;
    const current = ++this.generation;
    const started = performance.now();
    ++this.selectionGeneration;
    $("explore").dataset.pending = "true";
    $("explore").setAttribute("aria-busy", "true");
    this.state = undefined;
    $("slice-plots").hidden = true;
    $<HTMLButtonElement>("pin-a").disabled = true;
    $<HTMLButtonElement>("pin-b").disabled = true;
    text("map-status", "Calculating a complete configuration…");
    const contract = this.contract();
    try {
      const args = this.scene.kind
        ? {
            kind: this.scene.kind,
            base: this.scene.base,
            x: this.scene.x,
            y: this.scene.y,
            criteria: this.criteria,
          }
        : {
            base: this.scene.base,
            x: this.scene.x,
            y: this.scene.y,
            metrics: [
              ...new Set([...this.scene.metrics, "sa_fraction", "sv_fraction"]),
            ],
            criteria: this.criteria,
          };
      const grid = (await this.compute(
        this.scene.kind ? "analysis_grid" : "grid",
        args,
      )) as Grid;
      if (current !== this.generation) return;
      const state = await this.selectedResult(this.selected.x, this.selected.y);
      if (current !== this.generation) return;
      const maps = [
        document.createElement("div"),
        document.createElement("div"),
      ];
      const results = await Promise.all(
        maps.map((map, i) =>
          renderMap(
            map,
            grid,
            this.scene.metrics[i],
            this.scale[i],
            $(i === 0 ? "left-map" : "right-map").clientWidth,
            value("contour"),
            [
              ...document.querySelectorAll<HTMLInputElement>(
                "#constraint-options input:checked",
              ),
            ].map((input) => input.id.replace("overlay-", "")),
            (x, y, pin) => {
              if (current !== this.generation) return;
              for (const side of ["left", "right"]) {
                const plot = $(side + "-map")
                  .firstElementChild as HTMLElement | null;
                if (plot) crosshair(plot, grid, x, y);
              }
              text(
                "linked-coordinate",
                `Linked physical coordinate: x ${x.toPrecision(6)}, y ${y.toPrecision(6)}. Click to pin A; numeric controls also select a state.`,
              );
              if (pin)
                void this.inspect(
                  x,
                  y,
                  "Exactly reevaluated grid sample",
                  true,
                );
            },
          ),
        ),
      );
      if (current !== this.generation) {
        maps.forEach(purge);
        return;
      }
      this.grid = grid;
      const available = new Set(
        (grid.constraint_overlays ?? []).map((line) => line.kind),
      );
      for (const input of document.querySelectorAll<HTMLInputElement>(
        "#constraint-options input",
      ))
        input.disabled = !available.has(input.id.replace("overlay-", ""));
      const overlayNames = (grid.constraint_overlays ?? [])
        .filter((line) => $<HTMLInputElement>("overlay-" + line.kind).checked)
        .map((line) => line.label);
      text(
        "constraint-caption",
        overlayNames.length
          ? overlayNames.join(". ") +
              ". Objectives hold the stated inputs fixed and do not optimize selected saturation criteria; omitted segments are undefined or outside the displayed domain."
          : "",
      );
      for (const [i, side] of ["left", "right"].entries()) {
        const host = $(side + "-map");
        for (const child of host.children) purge(child as HTMLElement);
        host.replaceChildren(maps[i]);
        host.dataset.generation = String(current);
        text(side + "-scale-note", results[i].notice);
        text(
          side + "-title",
          `${titleFor(this.scene.metrics[i])} · ${unitFor(this.scene.metrics[i], grid)}`,
        );
      }
      this.showInspector(state, "Exactly reevaluated arbitrary point", current);
      text("experiment-contract", contract);
      $("experiment-contract").dataset.generation = String(current);
      this.published = {
        generation: current,
        scene: structuredClone(this.scene),
        criteria: structuredClone(this.criteria),
        grid,
        state,
        contract,
      };
      text(
        "criteria-note",
        `Selected criteria: Sa > ${this.criteria.sa_lower_fraction * 100}% and Sv > ${this.criteria.sv_lower_fraction * 100}%; equality is not above. Origin: ${this.criteria.origin}.`,
      );
      text(
        "map-status",
        `${grid.actual_resolution.join(" × ")} samples · ${grid.masked_count} cells requiring a model/analysis status explanation · generation ${current}`,
      );
      $("explore").dataset.generation = String(current);
      $("explore").dataset.pending = "false";
      $("explore").setAttribute("aria-busy", "false");
      $("explore").dataset.updateMs = String(performance.now() - started);
    } catch (error) {
      if (current !== this.generation) return;
      text("map-status", "Configuration error: " + String(error));
      $("explore").dataset.pending = "error";
      $("explore").setAttribute("aria-busy", "false");
    }
  }
  private showInspector(
    result: unknown,
    description: string,
    generation: number,
  ) {
    const record = result as State;
    this.state = record.metrics ? record : undefined;
    $<HTMLButtonElement>("pin-a").disabled = !this.state;
    $<HTMLButtonElement>("pin-b").disabled = !this.state;
    $("state-inspector").dataset.generation = String(generation);
    text(
      "state-description",
      `${description}. x ${this.selected.x.toPrecision(8)}, y ${this.selected.y.toPrecision(8)}.`,
    );
    text("state-status", String(record.status ?? record.joint_status));
    text("state-json", JSON.stringify(result, null, 2));
    const table = $("state-values");
    table.replaceChildren();
    const entries = Object.entries(record.metrics ?? {});
    for (const [metric, value] of entries) {
      const row = document.createElement("tr");
      row.dataset.metric = metric;
      for (const content of [
        titleFor(metric),
        value === null
          ? "Undefined / masked"
          : Number(value.toPrecision(9)).toString(),
        record.units[metric] ?? "",
      ]) {
        const cell = document.createElement("td");
        cell.textContent = content;
        row.append(cell);
      }
      table.append(row);
    }
    const details = record as unknown as {
      joint_value?: number | null;
      unit?: string;
      binding_criterion?: string;
      arterial?: { value: number | null };
      venous?: { value: number | null };
      increments?: Record<string, number | null>;
      selected_analysis?: {
        boundaries: Record<
          string,
          {
            joint_value: number | null;
            unit: string;
            joint_status: string;
            binding_criterion: string;
          }
        >;
        ratio_interval: unknown;
        conditional_objectives: unknown;
      };
    };
    const addRow = (name: string, value: unknown, unit: string) => {
      const row = document.createElement("tr");
      for (const content of [
        name,
        value === null ? "Undefined" : String(value),
        unit,
      ]) {
        const cell = document.createElement("td");
        cell.textContent = content;
        row.append(cell);
      }
      table.append(row);
    };
    if ("joint_value" in details) {
      addRow(
        "Joint Hb equality boundary",
        details.joint_value,
        details.unit ?? "",
      );
      addRow("Arterial equality", details.arterial?.value, details.unit ?? "");
      addRow("Venous equality", details.venous?.value, details.unit ?? "");
      addRow("Binding criterion", details.binding_criterion, "");
    }
    if (details.increments)
      for (const [key, v] of Object.entries(details.increments))
        addRow(
          "Prescribed change: " + titleFor(key),
          v,
          record.units[key] ?? "",
        );
    const analysis = details.selected_analysis;
    text(
      "boundary-inspector",
      analysis
        ? Object.entries(analysis.boundaries)
            .map(
              ([name, b]) =>
                `${name} equality: ${b.joint_value ?? "undefined"} ${b.unit}; ${b.joint_status}; binding ${b.binding_criterion ?? "none"}.`,
            )
            .join(" ") +
            " These are alternative inverse questions, not simultaneous prescriptions; equality is not strict criterion satisfaction."
        : "Derived analysis; inspect equality or paired endpoints above.",
    );
    text(
      "objective-inspector",
      analysis
        ? "Strict qualifying ratio interval: " +
            JSON.stringify(analysis.ratio_interval) +
            "\nSeparately evaluated DO2 and Sv objectives at fixed total flow: " +
            JSON.stringify(analysis.conditional_objectives)
        : "",
    );
    const criterion = record.criterion_result;
    text(
      "state-criteria",
      criterion
        ? `Sa: ${criterion.arterial}; Sv: ${criterion.venous}. Signed margins: Sa ${criterion.arterial_margin_percentage_points?.toPrecision(7) ?? "undefined"} pp; Sv ${criterion.venous_margin_percentage_points?.toPrecision(7) ?? "undefined"} pp.`
        : "Derived result: equality or paired endpoint details are in the audit record.",
    );
    if (record.status === "infeasible_requested_consumption")
      text(
        "state-status",
        "No nonnegative-venous-content steady state at selected consumption. Requested M and mathematical limit are in the audit record; negative raw values are not physiological outputs.",
      );
  }
  private async inspect(
    x: number,
    y: number,
    description: string,
    pin = false,
  ) {
    const selection = ++this.selectionGeneration,
      current = this.generation;
    $("slice-plots").hidden = true;
    try {
      const result = await this.selectedResult(x, y);
      if (current !== this.generation || selection !== this.selectionGeneration)
        return;
      this.selected = { x, y };
      $<HTMLInputElement>("select-x").value = String(x);
      $<HTMLInputElement>("select-y").value = String(y);
      this.showInspector(result, description, current);
      if (this.published?.generation === current) this.published.state = result;
      if (pin) this.pin("a");
    } catch (error) {
      if (current === this.generation && selection === this.selectionGeneration)
        text("state-status", "Selection error: " + String(error));
    }
  }
  private pin(which: "a" | "b") {
    if (!this.state) {
      text(
        "pin-status",
        "Pinning uses a forward state; select a forward experiment first.",
      );
      return;
    }
    this.pins[which] = this.selectedScenario();
    text(
      "pin-status",
      `Pinned ${which.toUpperCase()} at x ${this.selected.x.toPrecision(5)}, y ${this.selected.y.toPrecision(5)}.`,
    );
    window.dispatchEvent(
      new CustomEvent("parallel-o2-pins", {
        detail: structuredClone(this.pins),
      }),
    );
  }
  private async changeFlowMode() {
    const current = ++this.generation;
    try {
      const scenario = (await this.compute("flow_mode", {
        scenario: this.selectedScenario(),
        mode: value("flow-mode"),
      })) as Scenario;
      if (current !== this.generation) return;
      this.scene.base = scenario;
      this.scene.kind = undefined;
      this.reconcileAxes();
      this.controls();
      await this.update();
    } catch (error) {
      text("map-status", String(error));
    }
  }
  private async convertBasis() {
    const current = ++this.generation;
    try {
      const scenario = (await this.compute("convert_indexing", {
        scenario: this.selectedScenario(),
        mass_kg: Number(value("mass-kg")),
        bsa_m2: Number(value("bsa-m2")),
      })) as Scenario;
      if (current !== this.generation) return;
      this.scene.base = scenario;
      this.scene.kind = undefined;
      this.reconcileAxes();
      this.controls();
      this.scale = this.scene.metrics.map((m) =>
        defaultScale(m, scenario.indexing_basis),
      );
      await this.update();
    } catch (error) {
      text("map-status", "Explicit conversion failed: " + String(error));
    }
  }
  private async slice() {
    if (this.scene.kind) {
      text(
        "slice-status",
        "Select a forward experiment for a one-parameter slice.",
      );
      return;
    }
    const current = this.generation,
      selected = this.selectionGeneration;
    const axis = this.scene[value("slice-axis") as "x" | "y"];
    const compareObjectives = $<HTMLInputElement>("slice-objectives").checked;
    if (compareObjectives && axis.parameter !== "flow.r") {
      text(
        "slice-status",
        "Objective comparison requires the Qp/Qs axis at fixed total output.",
      );
      return;
    }
    const metrics: [string, string] = compareObjectives
      ? [
          this.scene.base.indexing_basis === "per_kg"
            ? "do2_ml_kg_min"
            : "do2_ml_min_m2",
          "sv_fraction",
        ]
      : this.scene.metrics;
    try {
      const result = (await this.compute("slice", {
        base: this.selectedScenario(),
        axis,
        metrics,
        criteria: this.criteria,
      })) as Slice;
      if (current !== this.generation || selected !== this.selectionGeneration)
        return;
      const host = document.createElement("div");
      const analysis = this.state?.selected_analysis as
        | {
            conditional_objectives?: {
              do2_maximum: { r: number } | null;
              sv_maximum: { r: number } | null;
            };
          }
        | undefined;
      const objectives = analysis?.conditional_objectives;
      await renderSlice(
        host,
        result,
        metrics,
        $("state-inspector").clientWidth - 48,
        objectives,
      );
      if (
        current !== this.generation ||
        selected !== this.selectionGeneration
      ) {
        purge(host);
        return;
      }
      const target = $("slice-plots");
      for (const child of target.children) purge(child as HTMLElement);
      target.replaceChildren(host);
      target.hidden = false;
      target.dataset.generation = String(current);
      const selectedScenario = this.selectedScenario();
      const fixed = activeParameters(selectedScenario)
        .filter((p) => p !== axis.parameter)
        .map((p) => `${label(p)} = ${getParameter(selectedScenario, p)}`)
        .join("; ");
      text(
        "slice-status",
        `Varying ${label(axis.parameter)} only. Held fixed: ${fixed}. For ratio slices, magenta dash-dot marks the conditional DO₂ maximum and blue dots mark the separate Sv maximum. These objectives exclude selected saturation criteria; omitted markers have no admissible interior solution or lie outside this range.`,
      );
      text("slice-json", JSON.stringify(result, null, 2));
    } catch (error) {
      if (current === this.generation && selected === this.selectionGeneration)
        text("slice-status", String(error));
    }
  }
}
