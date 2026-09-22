import { displayFactor } from "./presentation/registry";
import Plotly from "plotly.js-dist-min";
import type { Data, Layout, PlotlyHTMLElement } from "plotly.js";
import type { Grid } from "./model-types";
import { label } from "./scenes";

export const metricNames: Record<string, string> = {
  delivery_index_l_min: "Source oxygen-delivery index",
  do2_ml_min: "Physical systemic oxygen delivery",
  relative_delivery_index_l_min_change:
    "Delivery-index change vs stated baseline",
  relative_do2_ml_min_change: "Physical delivery change vs stated baseline",
  relative_qp_l_min_change: "Pulmonary flow change vs stated baseline",
  relative_qt_l_min_change: "Total flow change vs stated baseline",
  relative_driving_pressure_mmhg_change: "Mean driving-pressure change",
  driving_pressure_mmhg: "Mean driving pressure",
  qt_l_min: "Achieved total flow Qt",
  qp_l_min: "Achieved pulmonary flow Qp",
  qs_l_min: "Achieved systemic flow Qs",
  r: "Achieved Qp/Qs",
  closure_nominal_relative_change: "Nominal-law delivery-index change",
  closure_secant_relative_change: "Circuit-secant delivery-index change",
  closure_difference_percentage_points: "Secant minus nominal change",
  normalized_pulmonary_net_l_min: "Normalized net pulmonary uptake",
  normalized_pulmonary_in_l_min: "Normalized gross pulmonary inlet",
  normalized_pulmonary_out_l_min: "Normalized gross pulmonary outlet",
  pulmonary_net_add_ml_min: "Physical net pulmonary uptake",
  pulmonary_in_ml_min: "Physical gross pulmonary inlet",
  pulmonary_out_ml_min: "Physical gross pulmonary outlet",
  systemic_pressure_drop_mmhg: "Systemic path: Rs Qs",
  native_pulmonary_pressure_drop_mmhg: "Native pulmonary drop: Rp Qp",
  linear_shunt_pressure_drop_mmhg: "Linear shunt drop: K₁ Qp",
  quadratic_shunt_pressure_drop_mmhg: "Quadratic shunt drop: K₂ Qp²",
  shunt_secant_resistance_mmhg_min_l: "Operating shunt secant resistance",
  shunt_incremental_resistance_mmhg_min_l:
    "Operating shunt incremental resistance",
  sa_fraction: "Arterial saturation Sa",
  sv_fraction: "Venous saturation Sv",
  ca_ml_dl: "Arterial content Ca",
  cv_ml_dl: "Venous content Cv",
  cpv_ml_dl: "Pulmonary venous content Cpv",
  oer_fraction: "Oxygen extraction ratio",
  omega: "Delivery / consumption Ω",
  do2_ml_kg_min: "Systemic oxygen delivery",
  do2_ml_min_m2: "Systemic oxygen delivery",
  systemic_out_ml_kg_min: "Unconsumed systemic return",
  systemic_out_ml_min_m2: "Unconsumed systemic return",
  pulmonary_in_ml_kg_min: "Gross pulmonary inlet",
  pulmonary_in_ml_min_m2: "Gross pulmonary inlet",
  pulmonary_out_ml_kg_min: "Gross pulmonary outlet",
  pulmonary_out_ml_min_m2: "Gross pulmonary outlet",
  pulmonary_net_add_ml_kg_min: "Net pulmonary uptake",
  pulmonary_net_add_ml_min_m2: "Net pulmonary uptake",
  joint_hb_g_dl: "Joint Hb equality boundary",
  binding_code: "Binding selected criterion",
  delta_sa_fraction: "Change in Sa",
  delta_sv_fraction: "Change in Sv",
  delta_ca_ml_dl: "Change in arterial content",
  delta_do2_ml_kg_min: "Change in systemic delivery",
  delta_do2_ml_min_m2: "Change in systemic delivery",
};
export const titleFor = (key: string) => metricNames[key] ?? key;
export const factorFor = (key: string) =>
  /^(delta_)?(sa|sv)_fraction$/.test(key) ||
  key.startsWith("relative_") ||
  key.endsWith("relative_change")
    ? 100
    : 1;
export const unitFor = (key: string, grid: Grid) =>
  key === "binding_code"
    ? "criterion"
    : factorFor(key) === 100
      ? key.startsWith("delta_")
        ? "percentage points"
        : "%"
      : grid.units[key];
export function defaultScale(key: string, basis: string): [number, number] {
  if (key.startsWith("relative_") || key.startsWith("closure_"))
    return [-100, 100];
  if (basis === "absolute") {
    if (key.endsWith("mmhg")) return [0, 80];
    if (key.startsWith("delivery_index") || key.startsWith("normalized_"))
      return [0, 2];
    if (key.endsWith("ml_min")) return [0, 800];
    if (key.endsWith("l_min")) return [0, 4];
    if (key === "r") return [0, 4];
  }
  if (key === "binding_code") return [0, 2];
  if (key === "joint_hb_g_dl") return [0, 25];
  if (key.startsWith("delta_")) {
    const end =
      factorFor(key) === 100
        ? 30
        : key.includes("do2")
          ? basis === "per_kg"
            ? 40
            : 600
          : 10;
    return [-end, end];
  }
  if (factorFor(key) === 100) return [0, 100];
  if (key === "oer_fraction") return [0, 1];
  if (key === "omega") return [1, 10];
  if (key.endsWith("ml_dl")) return [0, 30];
  return [0, basis === "per_m2" ? 1200 : key.startsWith("do2") ? 80 : 100];
}
function ticks(grid: Grid, axis: "x" | "y") {
  const values = grid[axis].coordinates,
    positions = grid[axis].plot_coordinates;
  const indexes = [0, 0.25, 0.5, 0.75, 1].map((f) =>
    Math.round(f * (values.length - 1)),
  );
  return {
    tickvals: indexes.map((i) => positions[i]),
    ticktext: indexes.map((i) =>
      Number(
        (values[i] * displayFactor(grid[axis].parameter)).toPrecision(3),
      ).toString(),
    ),
  };
}
export const criterionLabels = [
  "Neither criterion",
  "Arterial only",
  "Venous only",
  "Both criteria",
  "Selected-boundary equality",
  "Infeasible oxygen demand",
  "Numerical failure",
];
const criterionColors = [
  "#c9c4b6",
  "#287b8e",
  "#bd792c",
  "#64538d",
  "#f1d166",
  "#dce0e2",
  "#3d4044",
];
const criterionCode: Record<string, number> = {
  neither_above: 0,
  arterial_only_above: 1,
  venous_only_above: 2,
  both_above: 3,
  on_selected_boundary: 4,
};

export async function renderMap(
  host: HTMLDivElement,
  grid: Grid,
  metric: string,
  scale: [number, number],
  width: number,
  contour: string,
  overlays: string[],
  onPoint: (x: number, y: number, pin: boolean) => void,
  displayMode: "continuous" | "joint_criteria" = "continuous",
) {
  const categorical = displayMode === "joint_criteria";
  const values = categorical
      ? grid.criteria_result!.status.map((row, j) =>
          row.map(
            (v, i) =>
              criterionCode[v] ??
              (grid.status[j][i] === "numerical_failure" ? 6 : 5),
          ),
        )
      : grid.metrics[metric],
    factor = categorical ? 1 : factorFor(metric);
  if (categorical) scale = [-0.5, 6.5];
  let min = Infinity,
    max = -Infinity,
    below = 0,
    above = 0,
    count = 0;
  for (const row of values)
    for (const v of row)
      if (v !== null) {
        const n = v * factor;
        min = Math.min(min, n);
        max = Math.max(max, n);
        count++;
        if (n < scale[0]) below++;
        if (n > scale[1]) above++;
      }
  const constant =
    count > 0 && max - min <= 1e-10 * Math.max(1, Math.abs(min), Math.abs(max));
  const z = values.map((row) =>
    row.map((v) => (v === null ? null : constant ? min : v * factor)),
  );
  const base = { x: grid.x.plot_coordinates, y: grid.y.plot_coordinates };
  const traces: Data[] = [
    {
      ...base,
      type: "heatmap",
      z: values.map((row) => row.map((v) => (v === null ? 1 : null))),
      colorscale: [
        [0, "#e0e3e4"],
        [1, "#e0e3e4"],
      ],
      showscale: false,
      hoverinfo: "skip",
      zsmooth: false,
    },
    {
      ...base,
      type: "heatmap",
      z,
      zmin: scale[0],
      zmax: scale[1],
      zsmooth: false,
      connectgaps: false,
      showscale: !categorical,
      colorscale: categorical
        ? criterionColors.flatMap(
            (color, i) =>
              [
                [i / 7, color],
                [(i + 1) / 7, color],
              ] as [number, string][],
          )
        : metric === "binding_code"
          ? [
              [0, "#34617b"],
              [0.49, "#34617b"],
              [0.5, "#b87828"],
              [0.99, "#b87828"],
              [1, "#746393"],
            ]
          : /^(delta_|relative_|closure_)/.test(metric)
            ? [
                [0, "#3f6391"],
                [0.5, "#f4f4f0"],
                [1, "#b75f32"],
              ]
            : "Cividis",
      colorbar: {
        title: { text: unitFor(metric, grid), side: "right" },
        thickness: 14,
        len: 0.82,
        ...(metric === "binding_code"
          ? { tickvals: [0, 1, 2], ticktext: ["Arterial", "Venous", "Both"] }
          : {}),
      },
      customdata: values.map((row, j) =>
        row.map((v, i) => [
          grid.x.coordinates[i],
          grid.y.coordinates[j],
          categorical ? criterionLabels[v!] : "",
          grid.x.coordinates[i] * displayFactor(grid.x.parameter),
          grid.y.coordinates[j] * displayFactor(grid.y.parameter),
        ]),
      ) as unknown as number[][],
      hovertemplate: categorical
        ? "x %{customdata[3]:.6g}<br>y %{customdata[4]:.6g}<br>%{customdata[2]}<extra></extra>"
        : `x %{customdata[3]:.6g}<br>y %{customdata[4]:.6g}<br>${titleFor(metric)}: %{z:.6g} ${unitFor(metric, grid)}<extra></extra>`,
    },
  ];
  if (categorical)
    criterionLabels.forEach((name, i) =>
      traces.push({
        type: "scatter",
        x: [null],
        y: [null],
        mode: "markers",
        marker: {
          color: criterionColors[i],
          symbol: i >= 5 ? "x" : "square",
          size: 10,
        },
        name,
        showlegend: true,
        hoverinfo: "skip",
      }),
    );
  const response = !categorical && /^(delta_|relative_|closure_)/.test(metric);
  if (response && !constant && min <= 0 && max >= 0) {
    const zero = z.map((row, j) =>
      row.map((v, i) => {
        if (v === null) return null;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (z[j + dy]?.[i + dx] === null) return null;
        return v;
      }),
    );
    traces.push({
      ...base,
      type: "contour",
      z: zero as number[][],
      contours: {
        start: 0,
        end: 0,
        size: 1,
        coloring: "none",
        showlabels: true,
      },
      line: { color: "#172e38", width: 2.5 },
      name: "No modeled change relative to this stated comparator",
      showscale: false,
      connectgaps: false,
      hoverinfo: "skip",
    });
  }
  const marksX: number[] = [],
    marksY: number[] = [];
  for (
    let j = 0;
    j < values.length;
    j += Math.max(1, Math.floor(values.length / 20))
  )
    for (
      let i = 0;
      i < values[j].length;
      i += Math.max(1, Math.floor(values[j].length / 20))
    )
      if (values[j][i] === null || (categorical && values[j][i]! >= 5)) {
        marksX.push(grid.x.plot_coordinates[i]);
        marksY.push(grid.y.plot_coordinates[j]);
      }
  traces.push({
    type: "scatter",
    mode: "markers",
    x: marksX,
    y: marksY,
    marker: { symbol: "x", size: 5, color: "#69757a" },
    showlegend: false,
    hoverinfo: "skip",
  });
  if (grid.admissibility_margin_ml_dl)
    traces.push({
      ...base,
      type: "contour",
      z: grid.admissibility_margin_ml_dl as number[][],
      contours: {
        start: 0,
        end: 0,
        size: 1,
        coloring: "none",
        showlabels: true,
      },
      line: { color: "#303d42", width: 2, dash: "dash" },
      showscale: false,
      connectgaps: false,
      hoverinfo: "skip",
      name: "Cv = 0 admissibility boundary",
    });
  if (contour !== "none") {
    const contourKeys =
      contour === "criteria" ? ["sa_fraction", "sv_fraction"] : [contour];
    for (const key of contourKeys)
      if (grid.metrics[key]) {
        const matrix = grid.metrics[key].map((row, j) =>
          row.map((v, i) => {
            // Only draw regular metric contours where every neighbor is unmasked.
            if (v === null) return null;
            for (let dy = -1; dy <= 1; dy++)
              for (let dx = -1; dx <= 1; dx++)
                if (grid.metrics[key][j + dy]?.[i + dx] === null) return null;
            return v * factorFor(key);
          }),
        );
        const criterion = (
          grid.requested as {
            criteria?: { sa_lower_fraction: number; sv_lower_fraction: number };
          }
        )?.criteria;
        const level =
          contour === "criteria" && criterion
            ? (key === "sa_fraction"
                ? criterion.sa_lower_fraction
                : criterion.sv_lower_fraction) * 100
            : undefined;
        traces.push({
          ...base,
          type: "contour",
          z: matrix as unknown as number[][],
          contours:
            level === undefined
              ? { coloring: "none", showlabels: true }
              : {
                  start: level,
                  end: level,
                  size: 1,
                  coloring: "none",
                  showlabels: true,
                },
          ncontours: 5,
          line: {
            color: key === "sv_fraction" ? "#a85519" : "#fafafa",
            width: 1.7,
            dash: key === "sv_fraction" ? "dash" : "solid",
          },
          showscale: false,
          connectgaps: false,
          hoverinfo: "skip",
          name: titleFor(key),
        });
      }
  }
  for (const curve of grid.constraint_overlays ?? []) {
    if (
      !overlays.includes(curve.kind) ||
      (curve.kind === "ratio_1" && overlays.includes("sv_peak"))
    )
      continue;
    const points = curve.x
      .map((v, i) => (v === null ? -1 : i))
      .filter((i) => i >= 0);
    const middle = points[Math.floor(points.length / 2)];
    const short =
      curve.kind === "do2_peak"
        ? "DO₂ peak"
        : curve.kind === "sv_peak"
          ? "Sv max (r=1)"
          : curve.kind === "iso_total"
            ? "Qt " +
              curve.label.split(" = ").at(-1)!.split(";")[0].split(" ")[0]
            : curve.label
                .split(";")[0]
                .replace(" (equal prescribed branch flows)", "");
    traces.push({
      type: "scatter",
      mode: curve.kind === "profile" ? "text+markers" : "text+lines",
      marker: { symbol: "diamond", color: "#152b35", size: 8 },
      x: curve.plot_x as number[],
      y: curve.plot_y as number[],
      text: curve.x.map((_, i) => (i === middle ? short : "")),
      textposition: "top right",
      textfont: { size: 11, color: "#60334d" },
      line: {
        color: curve.kind === "sv_peak" ? "#176079" : "#7e3b62",
        width: 2,
        dash:
          curve.kind === "do2_peak"
            ? "dashdot"
            : curve.kind === "iso_total"
              ? "dash"
              : "dot",
      },
      name: curve.label,
      showlegend: false,
      connectgaps: false,
      hoverinfo: "skip",
    });
  }
  const layout: Partial<Layout> = {
    width: Math.max(280, width),
    height: categorical ? 520 : 420,
    margin: {
      l: 68,
      r: categorical ? 25 : 96,
      t: 18,
      b: categorical ? 160 : 70,
    },
    paper_bgcolor: "#fff",
    plot_bgcolor: "#f6f7f7",
    font: { family: "Arial, sans-serif", size: 12, color: "#243b45" },
    xaxis: {
      title: { text: grid.x.label ?? label(grid.x.parameter), standoff: 12 },
      ...ticks(grid, "x"),
      range: [grid.x.plot_coordinates[0], grid.x.plot_coordinates.at(-1)!],
    },
    yaxis: {
      title: { text: grid.y.label ?? label(grid.y.parameter), standoff: 8 },
      ...ticks(grid, "y"),
      range: [grid.y.plot_coordinates[0], grid.y.plot_coordinates.at(-1)!],
    },
    showlegend: categorical,
    legend: { orientation: "h", y: -0.27, x: 0, font: { size: 11 } },
    dragmode: "zoom",
  };
  await Plotly.newPlot(host, traces, layout, {
    responsive: false,
    displaylogo: false,
    displayModeBar: false,
    scrollZoom: false,
  });
  const node = host as unknown as PlotlyHTMLElement;
  const point = (event: Readonly<Plotly.PlotMouseEvent>, pin: boolean) => {
    const p = event.points[0];
    if (!p) return;
    const px = Number(p.x),
      py = Number(p.y);
    const sample = p.customdata as unknown as number[] | undefined;
    onPoint(
      Array.isArray(sample)
        ? Number(sample[0])
        : grid.x.scale === "log"
          ? 10 ** px
          : px,
      Array.isArray(sample)
        ? Number(sample[1])
        : grid.y.scale === "log"
          ? 10 ** py
          : py,
      pin,
    );
  };
  node.on("plotly_hover", (event) => point(event, false));
  node.on("plotly_click", (event) => point(event, true));
  host.dataset.metric = categorical ? "joint_criteria" : metric;
  host.dataset.constant = String(constant);
  host.dataset.scale = JSON.stringify(scale);
  return {
    constant,
    min: count ? min : null,
    max: count ? max : null,
    below,
    above,
    count,
    notice: categorical
      ? criterionLabels
          .map(
            (name, i) =>
              `${name}: ${values.flat().filter((v) => v === i).length}`,
          )
          .join("; ") +
        ". Equality does not satisfy a strict criterion; mathematical boundaries remain separate."
      : count === 0
        ? "No defined values for this metric under the selected constraints."
        : constant
          ? `Constant ${response && min === 0 && max === 0 ? "zero response" : "under these constraints"}: ${min.toPrecision(6)} ${unitFor(metric, grid)}. Display scale ${scale[0]} to ${scale[1]}. ${below} below / ${above} above display scale.`
          : `Display scale ${scale[0]} to ${scale[1]} ${unitFor(metric, grid)}. ${below} below / ${above} above display scale. Values remain available in the inspector.${response ? " Zero-change contour separates increases and decreases where defined." : ""}`,
  };
}
export function purge(host: HTMLElement) {
  Plotly.purge(host);
}

export function crosshair(host: HTMLElement, grid: Grid, x: number, y: number) {
  const px = grid.x.scale === "log" ? Math.log10(x) : x,
    py = grid.y.scale === "log" ? Math.log10(y) : y;
  void Plotly.relayout(host, {
    shapes: [
      {
        type: "line",
        xref: "x",
        yref: "paper",
        x0: px,
        x1: px,
        y0: 0,
        y1: 1,
        line: { color: "#ffffff", width: 1, dash: "dot" },
      },
      {
        type: "line",
        xref: "paper",
        yref: "y",
        x0: 0,
        x1: 1,
        y0: py,
        y1: py,
        line: { color: "#ffffff", width: 1, dash: "dot" },
      },
    ],
  });
}

export type Slice = {
  axis: { parameter: string; scale: "linear" | "log"; coordinates: number[] };
  metrics: Record<string, (number | null)[]>;
  units: Record<string, string>;
};
export async function renderSlice(
  host: HTMLDivElement,
  slice: Slice,
  metrics: [string, string],
  width: number,
  objectives?: {
    do2_maximum?: { r: number } | null;
    sv_maximum?: { r: number } | null;
  },
) {
  const coords = slice.axis.coordinates.map((v) =>
    slice.axis.scale === "log" ? Math.log10(v) : v,
  );
  const traces: Data[] = metrics.map((metric, i) => ({
    type: "scatter",
    mode: "lines",
    x: coords,
    y: slice.metrics[metric].map((v) =>
      v === null ? null : v * factorFor(metric),
    ) as number[],
    line: {
      color: i === 0 ? "#176079" : "#ae682c",
      width: 2,
      dash: i === 0 ? "solid" : "dash",
    },
    connectgaps: false,
    xaxis: i === 0 ? "x" : "x2",
    yaxis: i === 0 ? "y" : "y2",
    name: titleFor(metric),
    customdata: slice.axis.coordinates.map(
      (v) => v * displayFactor(slice.axis.parameter),
    ),
    hovertemplate: `%{customdata:.7g}<br>%{y:.7g}<extra>${titleFor(metric)}</extra>`,
  }));
  const tickIndexes = [0, 0.25, 0.5, 0.75, 1].map((f) =>
    Math.round(f * (coords.length - 1)),
  );
  const axis = {
    title: { text: label(slice.axis.parameter) },
    tickvals: tickIndexes.map((i) => coords[i]),
    ticktext: tickIndexes.map((i) =>
      Number(
        (
          slice.axis.coordinates[i] * displayFactor(slice.axis.parameter)
        ).toPrecision(4),
      ).toString(),
    ),
  };
  const unit = (key: string) =>
    factorFor(key) === 100 ? "%" : slice.units[key];
  const shapes: NonNullable<Partial<Layout>["shapes"]> = [];
  if (slice.axis.parameter === "flow.r" && objectives)
    for (const kind of ["do2_maximum", "sv_maximum"] as const) {
      const maximum = objectives[kind];
      if (maximum) {
        const r = maximum.r;
        if (r < slice.axis.coordinates[0] || r > slice.axis.coordinates.at(-1)!)
          continue;
        const position = slice.axis.scale === "log" ? Math.log10(r) : r;
        for (const panel of ["x", "x2"] as const)
          shapes.push({
            type: "line",
            xref: panel,
            yref: "paper",
            x0: position,
            x1: position,
            y0: panel === "x" ? 0.58 : 0,
            y1: panel === "x" ? 1 : 0.42,
            line: {
              color: kind === "do2_maximum" ? "#7e3b62" : "#176079",
              dash: kind === "do2_maximum" ? "dashdot" : "dot",
              width: 2,
            },
          });
      }
    }
  await Plotly.newPlot(
    host,
    traces,
    {
      width: Math.max(280, width),
      height: 520,
      margin: { l: 65, r: 25, t: 45, b: 65 },
      paper_bgcolor: "white",
      plot_bgcolor: "#f6f7f7",
      showlegend: false,
      shapes,
      annotations: metrics.map((metric, i) => ({
        x: 0,
        y: i === 0 ? 1.075 : 0.49,
        xref: "paper",
        yref: "paper",
        xanchor: "left",
        showarrow: false,
        text: `${titleFor(metric)}<br>(${unit(metric)})`,
        align: "left",
        font: { size: 12 },
      })),
      xaxis: { ...axis, anchor: "y" },
      yaxis: {
        domain: [0.58, 1],
      },
      xaxis2: { ...axis, anchor: "y2" },
      yaxis2: {
        domain: [0, 0.42],
      },
    },
    { displayModeBar: false, displaylogo: false },
  );
}
