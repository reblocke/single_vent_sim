import type { Axis, Criteria, Scenario, Scene } from "./model-types";
export const criteria: Criteria = {
  schema_version: "criteria-v1",
  id: "ahmed-abstract-70-40",
  sa_lower_fraction: 0.7,
  sv_lower_fraction: 0.4,
  comparison: "strict_greater_than",
  origin: "source_reported_abstract",
  source_id: "P2",
};
const axis = (parameter: string, min: number, max: number): Axis => ({
  parameter,
  min,
  max,
  n: 201,
  scale: "linear",
});
const base = (area = false, independent = false): Scenario => ({
  schema_version: "scenario-v2",
  model_version: "barnea-parallel-bound-o2-v1",
  indexing_basis: area ? "per_m2" : "per_kg",
  flow: area
    ? { mode: "total_ratio", qt_l_min_m2: 6, r: 1 }
    : independent
      ? { mode: "independent_flows", qp_ml_kg_min: 200, qs_ml_kg_min: 200 }
      : { mode: "total_ratio", qt_ml_kg_min: 400, r: 1 },
  capacity: {
    mode: "hb_linear",
    hb_g_dl: area ? 14 : 10,
    kappa_ml_o2_g_hb: 1.34,
  },
  spv_fraction: 0.98,
  ...(area ? { vo2_target_ml_min_m2: 150 } : { vo2_target_ml_kg_min: 6 }),
  source_context: area ? "ahmed-inspired-abstract-supported" : "synthetic",
});
export const scenes: Scene[] = [
  {
    id: "E1",
    title: "Hemoglobin and flow balance",
    question: "How do capacity and flow allocation change oxygen transport?",
    lesson:
      "Hb changes saturation as well as content; the effect of Qp/Qs is conditional on fixed total output.",
    base: base(),
    x: axis("capacity.hb_g_dl", 6, 20),
    y: axis("flow.r", 0.2, 4),
    metrics: ["sa_fraction", "do2_ml_kg_min"],
  },
  {
    id: "E2",
    title: "Total flow and allocation",
    question: "Can equal saturation accompany different delivery?",
    lesson:
      "The same saturation contour crosses states with different systemic delivery. Qt = Qp + Qs.",
    base: base(),
    x: axis("flow.r", 0.2, 4),
    y: axis("flow.qt_ml_kg_min", 150, 600),
    metrics: ["sa_fraction", "do2_ml_kg_min"],
  },
  {
    id: "E3",
    title: "Separate the two flows",
    question: "What changes when systemic flow changes alone?",
    lesson:
      "At fixed Qp and demand, changing Qs does not change Sa but does change systemic delivery.",
    base: base(false, true),
    x: axis("flow.qp_ml_kg_min", 50, 400),
    y: axis("flow.qs_ml_kg_min", 50, 400),
    metrics: ["sa_fraction", "do2_ml_kg_min"],
  },
  {
    id: "E4",
    title: "Carrying capacity and consumption",
    question: "Does more oxygen uptake mean more delivery?",
    lesson:
      "Increased oxygen demand can raise lung uptake while lowering delivery and worsening extraction.",
    base: base(false, true),
    x: axis("capacity.hb_g_dl", 6, 20),
    y: axis("vo2_target_ml_kg_min", 2, 18),
    metrics: ["sa_fraction", "oer_fraction"],
  },
  {
    id: "E5",
    title: "Pulmonary venous endpoint",
    question: "What determines endpoint oxygen content?",
    lesson:
      "Oxygen-carrying capacity and pulmonary venous saturation jointly set endpoint content.",
    base: base(false, true),
    x: axis("capacity.hb_g_dl", 6, 20),
    y: axis("spv_fraction", 0.8, 1),
    metrics: ["ca_ml_dl", "do2_ml_kg_min"],
  },
  {
    id: "H1",
    title: "Hb and total CI",
    question: "Does one Hb value meet the selected criteria at every flow?",
    lesson:
      "The same Hb meets or misses selected saturation criteria depending on flow and demand.",
    base: base(true),
    x: axis("capacity.hb_g_dl", 6, 20),
    y: axis("flow.qt_l_min_m2", 2, 12),
    metrics: ["sa_fraction", "sv_fraction"],
  },
  {
    id: "H2",
    title: "Hb and allocation",
    question: "Do arterial and venous saturation improve together?",
    lesson: "Raising Qp/Qs may improve Sa while worsening Sv beyond Qp/Qs = 1.",
    base: base(true),
    x: axis("capacity.hb_g_dl", 6, 20),
    y: axis("flow.r", 0.2, 4),
    metrics: ["sa_fraction", "sv_fraction"],
  },
  {
    id: "H3",
    title: "Conditional Hb boundary",
    question: "How does the Hb equality boundary depend on flow and criteria?",
    lesson:
      "This is an equality surface, with no fixed baseline-Hb constraint. Equality does not meet strict criteria.",
    base: base(true),
    x: axis("flow.r", 0.2, 4),
    y: axis("flow.qt_l_min_m2", 2, 12),
    metrics: ["joint_hb_g_dl", "binding_code"],
    kind: "hb_boundary",
  },
  {
    id: "H4",
    title: "Marginal Hb gain",
    question: "How does baseline Hb alter a prescribed Hb increment?",
    lesson:
      "Saturation gains diminish continuously; absolute delivery gain per unit Hb is constant at fixed flows and demand. No 12-g/dL breakpoint is imposed.",
    base: base(true),
    x: axis("capacity.hb_g_dl", 6, 20),
    y: axis("delta_hb_g_dl", 0.1, 4),
    metrics: ["delta_sa_fraction", "delta_do2_ml_min_m2"],
    kind: "hb_gain",
  },
];
export type Parameter = {
  label: string;
  unit: string;
  range: [number, number];
};
export const parameters: Record<string, Parameter> = {
  "capacity.hb_g_dl": { label: "Hb", unit: "g/dL", range: [6, 20] },
  "capacity.kappa_ml_o2_g_hb": {
    label: "κ",
    unit: "mL O₂/g Hb",
    range: [1.2, 1.5],
  },
  "capacity.capacity_ml_dl": {
    label: "Direct capacity B",
    unit: "mL O₂/dL",
    range: [8, 30],
  },
  "flow.r": { label: "Qp/Qs", unit: "ratio", range: [0.2, 4] },
  "flow.qt_ml_kg_min": {
    label: "Qt = Qp + Qs",
    unit: "mL blood/kg/min",
    range: [150, 600],
  },
  "flow.qp_ml_kg_min": {
    label: "Qp",
    unit: "mL blood/kg/min",
    range: [50, 400],
  },
  "flow.qs_ml_kg_min": {
    label: "Qs",
    unit: "mL blood/kg/min",
    range: [50, 400],
  },
  "flow.qt_l_min_m2": {
    label: "Total CI = Qp + Qs",
    unit: "L blood/min/m²",
    range: [2, 12],
  },
  "flow.qp_l_min_m2": {
    label: "Pulmonary CI",
    unit: "L blood/min/m²",
    range: [1, 8],
  },
  "flow.qs_l_min_m2": {
    label: "Systemic CI",
    unit: "L blood/min/m²",
    range: [1, 8],
  },
  spv_fraction: {
    label: "Pulmonary venous saturation",
    unit: "fraction (0–1)",
    range: [0.8, 1],
  },
  vo2_target_ml_kg_min: {
    label: "Prescribed consumption M",
    unit: "mL O₂/kg/min",
    range: [2, 18],
  },
  vo2_target_ml_min_m2: {
    label: "Prescribed consumption M",
    unit: "mL O₂/min/m²",
    range: [75, 250],
  },
  delta_hb_g_dl: { label: "Prescribed ΔHb", unit: "g/dL", range: [0.1, 4] },
};
export function activeParameters(s: Scenario): string[] {
  return [
    ...Object.keys(s.capacity)
      .filter((k) => k !== "mode")
      .map((k) => "capacity." + k),
    ...Object.keys(s.flow)
      .filter((k) => k !== "mode")
      .map((k) => "flow." + k),
    "spv_fraction",
    s.indexing_basis === "per_kg"
      ? "vo2_target_ml_kg_min"
      : "vo2_target_ml_min_m2",
  ];
}
export function getParameter(s: Scenario, path: string): number {
  const [group, key] = path.split(".");
  return Number(
    key ? s[group as "flow" | "capacity"][key] : s[group as "spv_fraction"],
  );
}
export function setParameter(s: Scenario, path: string, value: number) {
  const [group, key] = path.split(".");
  if (key) s[group as "flow" | "capacity"][key] = value;
  else Object.assign(s, { [group]: value });
}
export const label = (path: string) =>
  `${parameters[path]?.label ?? path} (${parameters[path]?.unit ?? ""})`;
