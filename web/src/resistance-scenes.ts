import type { Axis } from "./model-types";
export type ResistanceRequest = {
  schema_version: "resistance-experiment-v1";
  flow_model_version: string;
  reference: Record<string, number>;
  response: { closure: string; alpha: number; nonlinear_fraction: number };
  perturbation: {
    scope: string;
    rs_multiplier: number;
    rp_multiplier: number;
    rshunt_multiplier: number;
  };
  oxygen: {
    mode: string;
    spv_fraction: number;
    [key: string]: number | string;
  };
};
export type ResistanceScene = {
  id: string;
  title: string;
  lesson: string;
  request: ResistanceRequest;
  x: Axis;
  y: Axis;
  metrics: [string, string];
  policy: "frozen_reference" | "matched_reference_family" | "local_response";
};
export const resistanceBase = (): ResistanceRequest => ({
  schema_version: "resistance-experiment-v1",
  flow_model_version: "resistance-parallel-steady-v1",
  reference: {
    rs_mmhg_min_l: 40,
    rp_mmhg_min_l: 12,
    rshunt_nominal_mmhg_min_l: 28,
    qt_l_min: 2,
    common_downstream_pressure_mmhg: 0,
  },
  response: {
    closure: "nominal_parallel",
    alpha: 0.35,
    nonlinear_fraction: 0.5,
  },
  perturbation: {
    scope: "native_rp",
    rs_multiplier: 1,
    rp_multiplier: 1,
    rshunt_multiplier: 1,
  },
  oxygen: {
    mode: "normalized_source",
    spv_fraction: 0.99,
    normalized_consumption_l_min: 0.19,
  },
});
const axis = (parameter: string, min: number, max: number): Axis => ({
  parameter,
  min,
  max,
  n: 201,
  scale: "linear",
});
const scene = (
  id: string,
  title: string,
  lesson: string,
  x: Axis,
  y: Axis,
  metrics: [string, string],
  policy: ResistanceScene["policy"] = "frozen_reference",
): ResistanceScene => ({
  id,
  title,
  lesson,
  x,
  y,
  metrics,
  policy,
  request: resistanceBase(),
});
export const resistanceScenes: ResistanceScene[] = [
  scene(
    "R1",
    "Resistance perturbation map",
    "Saturation and delivery can move in opposite directions. Profile markers describe assumptions, not clinical choices.",
    axis("perturbation.rs_multiplier", 0.5, 1.25),
    axis("perturbation.rp_multiplier", 0.1, 1.5),
    ["sa_fraction", "relative_delivery_index_l_min_change"],
  ),
  scene(
    "R2",
    "Where pulmonary resistance resides",
    "Each native fraction has its own frozen reference: Rp + nominal Rsh = 40, Rs = 40, Qt = 2. Identical baseline flows can yield different responses.",
    axis("reference_native_fraction", 0, 1),
    axis("perturbation.rp_multiplier", 0.1, 1.5),
    ["relative_qp_l_min_change", "relative_delivery_index_l_min_change"],
    "matched_reference_family",
  ),
  scene(
    "R3",
    "Separate the added mechanisms",
    "Native Rp × 0.55 with Rs unchanged. Compare alpha/f mechanisms on the same perturbation scope. Nominal alpha = 1 with nonlinear shunt need not hold pressure fixed.",
    axis("response.alpha", 0, 1),
    axis("response.nonlinear_fraction", 0, 1),
    [
      "relative_delivery_index_l_min_change",
      "relative_driving_pressure_mmhg_change",
    ],
  ),
  scene(
    "R4",
    "State versus local response",
    "Left: each cell's state A. Right: change after that cell's native Rp × 0.55. Both retain the ORIGINAL global output-law anchor and shunt calibration. High state delivery is not itself intervention benefit.",
    axis("current_rp_mmhg_min_l", 1, 40),
    axis("current_rshunt_nominal_mmhg_min_l", 1, 60),
    ["delivery_index_l_min", "relative_delivery_index_l_min_change"],
    "local_response",
  ),
  scene(
    "R5",
    "Hb and independently prescribed resistance",
    "Physical M = 30.552 mL O₂/min, Spv = 0.99 and κ = 1.34 held fixed. Hb has no hidden feedback to flows or resistance. Not a transfusion-hemodynamics prediction.",
    axis("oxygen.hb_g_dl", 6, 20),
    axis("perturbation.rs_multiplier", 0.5, 1.25),
    ["sa_fraction", "do2_ml_min"],
  ),
  scene(
    "R6",
    "Structural closure sensitivity",
    "Identical native Rp × 0.55 and original reference under two distinct output laws. The circuit-secant closure is a derived extension; its alpha = 1 limit holds driving pressure.",
    axis("response.alpha", 0, 1),
    axis("response.nonlinear_fraction", 0, 1),
    ["closure_nominal_relative_change", "closure_secant_relative_change"],
  ),
];
for (const s of resistanceScenes) {
  if (["R3", "R6"].includes(s.id)) s.request.perturbation.rp_multiplier = 0.55;
  if (s.id === "R5")
    s.request.oxygen = {
      mode: "physical",
      spv_fraction: 0.99,
      hb_g_dl: 12,
      kappa_ml_o2_g_hb: 1.34,
      vo2_ml_min: 30.552,
    };
}
export const resistanceLabels: Record<string, string> = {
  "perturbation.rs_multiplier": "Systemic resistance multiplier",
  "perturbation.rp_multiplier": "Native pulmonary resistance multiplier",
  "perturbation.rshunt_multiplier": "Nominal shunt multiplier",
  "response.alpha": "Output response α (0–1)",
  "response.nonlinear_fraction": "Nonlinear shunt fraction f (0–1)",
  reference_native_fraction: "Reference native fraction ρ (0–1)",
  current_rp_mmhg_min_l: "Current native Rp (mmHg min/L)",
  current_rshunt_nominal_mmhg_min_l: "Current nominal Rsh (mmHg min/L)",
  "oxygen.hb_g_dl": "Hemoglobin (g/dL)",
};
