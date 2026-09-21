import Plotly from "plotly.js-dist-min";
import type { Data } from "plotly.js";
type PressureState = { metrics: Record<string, number | null> };
export async function pressureBudget(
  a: PressureState,
  b: PressureState,
  width: number,
) {
  const metrics = [
    ["systemic_pressure_drop_mmhg", "Systemic Rs Qs", "#176079"],
    ["native_pulmonary_pressure_drop_mmhg", "Native Rp Qp", "#9a592b"],
    ["linear_shunt_pressure_drop_mmhg", "Linear shunt K₁ Qp", "#78649b"],
    ["quadratic_shunt_pressure_drop_mmhg", "Quadratic shunt K₂ Qp²", "#4d855b"],
  ];
  const traces: Data[] = metrics.map(([key, name, color], i) => ({
    type: "bar",
    orientation: "h",
    name,
    marker: { color, pattern: { shape: (["", "/", ".", "x"] as const)[i] } },
    y: ["A systemic", "A pulmonary", "B systemic", "B pulmonary"],
    x:
      i === 0
        ? [a.metrics[key], 0, b.metrics[key], 0]
        : [0, a.metrics[key], 0, b.metrics[key]],
  }));
  const host = document.createElement("div");
  await Plotly.newPlot(
    host,
    traces,
    {
      width: Math.max(280, width),
      height: 380,
      barmode: "stack",
      margin: { l: 100, r: 20, t: 20, b: 145 },
      xaxis: {
        title: { text: "Mean pressure drop<br>(mmHg)" },
        rangemode: "tozero",
      },
      legend: {
        orientation: "h",
        xref: "container",
        yref: "container",
        x: 0.02,
        y: 0.02,
        yanchor: "bottom",
      },
      yaxis: { autorange: "reversed" },
    },
    { displayModeBar: false },
  );
  return host;
}
