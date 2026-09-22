import registry from "../../../src/parallel_o2/data/presentation.json";
export const questions = registry.questions;
export const questionFor = (variant: string) =>
  questions.find((q) => q.variants.includes(variant))!;
export const displayFactor = (path: string) =>
  (registry.parameters as Record<string, { display_factor: number }>)[
    path.replace(/^oxygen\./, "")
  ]?.display_factor ?? 1;
export const roleNames: Record<string, string> = {
  specified: "Specified",
  axis: "Varies along an axis",
  derived: "Calculated",
  solved_boundary: "Solved at boundary",
  not_specified: "Not specified",
  undefined: "Undefined",
};
export const definitions: Record<string, string> = {
  B: "Oxygen-carrying capacity at 100% saturation (mL O₂/dL)",
  Spv: "Saturation leaving the lungs (%) — before mixing, not peripheral arterial saturation",
  M: "Oxygen consumed by the body — specified demand, in active native units",
  Qp: "Blood flow through the lungs",
  Qs: "Blood flow through the body — used for systemic delivery",
};
export const ratioHelp =
  "Qp/Qs: where blood flow goes. Native share ρ: where nominal pulmonary resistance resides. Curvature f: how shunt pressure loss grows with flow.";
export function dependencyStrip(resistance: boolean) {
  const p = document.createElement("p");
  p.className = "dependency-strip";
  p.textContent =
    (resistance
      ? "Assumed model: reference circuit + applied change + output rule → calculated Qp and Qs. "
      : "Specify flows → Qp and Qs. ") +
    "Conservation: B + Spv + M + Qp + Qs → oxygen conservation → saturation, content and delivery. No automatic Hb/Spv feedback to resistance.";
  return p;
}
