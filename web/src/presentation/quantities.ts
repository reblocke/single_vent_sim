import { definitions, roleNames, displayFactor } from "./registry";
export type PresentedState = {
  metrics: Record<string, number | null>;
  units: Record<string, string>;
  requested: any;
  status?: string;
};
export type QuantityContext = {
  axes?: { parameter: string; min: number; max: number }[];
  boundary?: boolean;
  label?: string;
};
type Quantity = {
  id: string;
  value: number | null;
  unit: string;
  role: string;
  dependencies: string;
  label: string;
};
const fmt = (v: number | null) =>
  v === null || !Number.isFinite(v)
    ? "Unavailable"
    : Number(v.toPrecision(5)).toString();
export function quantities(
  state: PresentedState | undefined,
  context: QuantityContext = {},
): Quantity[] {
  if (!state)
    return Object.entries(definitions).map(([id, label]) => ({
      id,
      label,
      value: null,
      unit: "",
      role: "undefined",
      dependencies: "No finite selected state; inspect the displayed reason.",
    }));
  const m = state.metrics,
    r = state.requested,
    circuit = !!r.oxygen,
    normalized = r.oxygen?.mode === "normalized_source",
    oxygen = circuit ? r.oxygen : r;
  const find = (prefix: string) =>
    Object.keys(m).find((k) => k.startsWith(prefix));
  const data: [string, string | undefined, string[], string][] = [
    [
      "B",
      "capacity_ml_dl",
      circuit
        ? ["oxygen.hb_g_dl", "oxygen.kappa_ml_o2_g_hb"]
        : r.capacity.mode === "hb_linear"
          ? ["capacity.hb_g_dl", "capacity.kappa_ml_o2_g_hb"]
          : ["capacity.capacity_ml_dl"],
      normalized
        ? "Not specified in source-normalized mode"
        : context.boundary
          ? "Hb and B from calculated equality state"
          : circuit || r.capacity.mode === "hb_linear"
            ? "Calculated from Hb × declared κ; no automatic flow response"
            : "Direct capacity convention",
    ],
    [
      "Spv",
      undefined,
      [circuit ? "oxygen.spv_fraction" : "spv_fraction"],
      "Specified before mixing; no automatic vascular-tone response",
    ],
    [
      "M",
      undefined,
      [
        circuit
          ? normalized
            ? "oxygen.normalized_consumption_l_min"
            : "oxygen.vo2_ml_min"
          : r.indexing_basis === "per_m2"
            ? "vo2_target_ml_min_m2"
            : "vo2_target_ml_kg_min",
      ],
      normalized
        ? "Physical M is not supplied; k = M/(10B) for L/min is a definition, not a hidden capacity"
        : "Prescribed consumption; not inferred from delivery",
    ],
    [
      "Qp",
      find("qp_"),
      circuit
        ? ["reference", "perturbation", "response"]
        : r.flow.mode === "total_ratio"
          ? [
              "flow.r",
              "flow." + Object.keys(r.flow).find((k) => k.startsWith("qt_")),
            ]
          : ["flow." + Object.keys(r.flow).find((k) => k.startsWith("qp_"))],
      circuit
        ? "Calculated from resistance assumptions"
        : r.flow.mode === "total_ratio"
          ? "Calculated from total output and allocation"
          : "Specified branch flow",
    ],
    [
      "Qs",
      find("qs_"),
      circuit
        ? ["reference", "perturbation", "response"]
        : r.flow.mode === "total_ratio"
          ? [
              "flow.r",
              "flow." + Object.keys(r.flow).find((k) => k.startsWith("qt_")),
            ]
          : ["flow." + Object.keys(r.flow).find((k) => k.startsWith("qs_"))],
      circuit
        ? "Calculated from resistance assumptions"
        : r.flow.mode === "total_ratio"
          ? "Calculated from total output and allocation"
          : "Specified branch flow",
    ],
  ];
  return data.map(([id, key, paths, dependencies]) => {
    let value = key ? (m[key] ?? null) : null,
      unit = key ? (state.units[key] ?? "") : "",
      role = "specified";
    if (id === "Spv") {
      value = oxygen.spv_fraction * 100;
      unit = "%";
    }
    if (id === "M") {
      value = circuit
        ? normalized
          ? oxygen.normalized_consumption_l_min
          : oxygen.vo2_ml_min
        : (r.vo2_target_ml_kg_min ?? r.vo2_target_ml_min_m2);
      unit = circuit
        ? normalized
          ? "L/min × saturation"
          : "mL O₂/min"
        : r.indexing_basis === "per_m2"
          ? "mL O₂/min/m²"
          : "mL O₂/kg/min";
    }
    if (id === "B" && !normalized) {
      const capacity = circuit ? oxygen : r.capacity;
      dependencies +=
        capacity.mode === "direct_capacity"
          ? "; direct B " + capacity.capacity_ml_dl
          : "; Hb " +
            capacity.hb_g_dl +
            " g/dL; κ " +
            capacity.kappa_ml_o2_g_hb +
            " mL O₂/g Hb";
    }
    const axes = context.axes?.filter((a) => paths.includes(a.parameter)) ?? [];
    if (axes.length) role = "axis";
    if (
      (id === "B" && (circuit || r.capacity?.mode === "hb_linear")) ||
      (["Qp", "Qs"].includes(id) && (circuit || r.flow?.mode === "total_ratio"))
    )
      role = "derived";
    if (id === "B" && context.boundary) role = "solved_boundary";
    if (normalized && (id === "B" || id === "M")) {
      role = "not_specified";
      if (id === "B") value = null;
    }
    if (value === null && !normalized) role = "undefined";
    return {
      id,
      value,
      unit,
      role,
      label:
        id === "M" && normalized
          ? "Demand/capacity k (physical M not specified)"
          : definitions[id],
      dependencies:
        dependencies +
        ". " +
        paths.join(", ") +
        (axes.length
          ? "; varying " +
            axes
              .map(
                (a) =>
                  `${a.parameter} ${a.min * displayFactor(a.parameter)}–${a.max * displayFactor(a.parameter)}${displayFactor(a.parameter) === 100 ? "%" : ""}`,
              )
              .join("; ")
          : ""),
    };
  });
}
export function renderQuantities(
  host: HTMLElement,
  a: PresentedState | undefined,
  b?: PresentedState,
  context: QuantityContext = {},
) {
  host.replaceChildren();
  host.className = "five-quantities";
  const title = document.createElement("p");
  title.className = "quantity-context";
  title.textContent = context.label ?? (b ? "A → B" : "Selected point");
  host.append(title);
  const first = quantities(a, context),
    second = b ? quantities(b, context) : undefined;
  first.forEach((q, i) => {
    const tile = document.createElement("details");
    tile.dataset.quantity = q.id;
    tile.dataset.role = q.role;
    const heading = document.createElement("summary"),
      label = document.createElement("span"),
      value = document.createElement("strong"),
      role = document.createElement("small");
    const short: Record<string, string> = {
      B: "Oxygen-carrying capacity",
      Spv: "Blood leaving the lungs",
      M: "Oxygen consumption",
      Qp: "Lung blood flow",
      Qs: "Systemic blood flow",
    };
    label.textContent =
      q.id +
      " · " +
      (q.id === "M" && q.role === "not_specified" ? q.label : short[q.id]);
    value.textContent =
      fmt(q.value) +
      (second
        ? q.value === second[i].value
          ? " · unchanged"
          : " → " + fmt(second[i].value)
        : "") +
      " " +
      q.unit;
    role.textContent = roleNames[q.role];
    heading.append(label, value, role);
    const dep = document.createElement("p");
    dep.textContent =
      q.label +
      ". " +
      q.dependencies +
      (second && second[i].dependencies !== q.dependencies
        ? "; B: " + second[i].dependencies
        : "");
    tile.append(heading, dep);
    if (q.role === "derived" || q.role === "axis") {
      const action = document.createElement("button");
      action.type = "button";
      action.textContent = "Show input dependencies";
      action.addEventListener("click", () => {
        const container = host.id.startsWith("one")
          ? document.getElementById("one-start-fields")
          : host.id.startsWith("map")
            ? document.getElementById("prescribed-explorer")
            : host.id.startsWith("r-")
              ? document.getElementById("resistance-panel")
              : document.getElementById("compare-content");
        const selectors =
          q.id === "B"
            ? '[data-path="capacity.hb_g_dl"],#fixed-capacity-hb_g_dl,#x-parameter,#r-fixed-oxygen-hb_g_dl'
            : q.id === "Qp" || q.id === "Qs"
              ? '[data-path^="flow."],#flow-mode,#r-assumptions'
              : '[data-path="spv_fraction"],#fixed-spv_fraction';
        const target = container?.querySelector<HTMLElement>(selectors);
        if (!target) return;
        for (
          let node: HTMLElement | null = target;
          node;
          node = node.parentElement
        )
          if (node instanceof HTMLDetailsElement) node.open = true;
        target.scrollIntoView({ block: "nearest" });
        target.focus();
      });
      tile.append(action);
    }
    host.append(tile);
  });
}
