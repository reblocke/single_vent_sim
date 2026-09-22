type SummaryState = {
  metrics: Record<string, number | null>;
  units: Record<string, string>;
};
const formatted = (value: number) => Number(value.toPrecision(4)).toString();
export function stateSummary(state: SummaryState): string {
  const m = state.metrics,
    parts: string[] = [];
  for (const [key, label] of [
    ["sa_fraction", "Sa"],
    ["sv_fraction", "Sv"],
  ])
    if (m[key] !== null && m[key] !== undefined)
      parts.push(`${label} ${formatted(100 * m[key])}%`);
  for (const [prefix, label] of [
    ["ca_ml_dl", "Arterial content"],
    ["qs_", "Systemic flow"],
    ["do2_", "Systemic oxygen delivery"],
    ["systemic_net_use_", "Consumption"],
    ["delivery_index_l_min", "Normalized delivery index"],
    ["normalized_systemic_net_l_min", "Normalized consumption"],
  ]) {
    const key = Object.keys(m).find(
      (k) => k.startsWith(prefix) && m[k] !== null,
    );
    if (key) parts.push(`${label} ${formatted(m[key]!)} ${state.units[key]}`);
  }
  if (m.oer_fraction !== null && m.oer_fraction !== undefined)
    parts.push(`Extraction ${formatted(m.oer_fraction * 100)}%`);
  return parts.length
    ? parts.join(" · ")
    : "No defined oxygen summary; inspect model status and raw audit values below.";
}
export function pairedSummary(
  a: SummaryState,
  b: SummaryState,
  changes?: Record<string, { a: unknown; b: unknown }>,
): string {
  const changed = Object.keys(changes ?? {}).filter(
    (k) => changes![k].a !== changes![k].b,
  );
  const metric = (prefix: string) =>
    Object.keys(a.metrics).find((k) => k.startsWith(prefix));
  const direction = (prefix: string) => {
    const k = metric(prefix);
    if (!k || a.metrics[k] === null || b.metrics[k] === null) return null;
    const x = a.metrics[k]!,
      y = b.metrics[k]!;
    return Math.abs(x - y) <= 1e-10 * Math.max(1, Math.abs(x), Math.abs(y))
      ? 0
      : Math.sign(y - x);
  };
  if (changed.length === 1 && direction("sv_fraction") !== null) {
    const p = changed[0];
    if (
      p === "capacity.hb_g_dl" &&
      direction("ca_ml_dl") === 1 &&
      direction("do2_") === 1 &&
      direction("pulmonary_net_add_") === 0
    )
      return "Oxygen content and delivery increase. Net lung uptake is unchanged because prescribed consumption is unchanged.";
    if (
      p.startsWith("flow.qs_") &&
      direction("sa_fraction") === 0 &&
      direction("do2_") !== null
    )
      return "Arterial saturation is unchanged. Systemic delivery changes with systemic flow.";
    if (
      p === "flow.r" &&
      direction("sa_fraction") === 1 &&
      direction("do2_") === -1 &&
      direction("qs_") === -1 &&
      direction("ca_ml_dl") === 1
    )
      return "Arterial saturation increases, but systemic delivery decreases. The fall in systemic flow outweighs the rise in arterial content.";
    if (
      p.startsWith("vo2_target_") &&
      direction("pulmonary_net_add_") === 1 &&
      direction("do2_") === -1
    )
      return "Net lung uptake increases with specified consumption. Systemic oxygen delivery decreases under these fixed-flow assumptions.";
  }
  if (changes && changed.length > 1)
    return "Multiple specified changes. Inspect the A/B values and exact delivery decomposition; no single-cause explanation is assigned.";
  const clauses: string[] = [];
  for (const [prefix, label] of [
    ["sa_fraction", "Arterial saturation"],
    ["qs_", "systemic flow"],
    ["do2_", "physical delivery"],
    ["delivery_index_l_min", "normalized delivery index"],
  ]) {
    const key = Object.keys(a.metrics).find(
      (k) =>
        k.startsWith(prefix) && a.metrics[k] !== null && b.metrics[k] !== null,
    );
    if (!key) continue;
    const first = a.metrics[key]!,
      second = b.metrics[key]!;
    const equal =
      Math.abs(first - second) <=
      1e-10 * Math.max(1, Math.abs(first), Math.abs(second));
    clauses.push(
      `${label} ${equal ? "is unchanged" : second > first ? "increases" : "decreases"}`,
    );
  }
  return clauses.length
    ? "Modeled A→B: " +
        clauses.join("; ") +
        ". See the exact decomposition and assumptions; these are not clinical targets."
    : "Paired oxygen response is undefined under these inputs.";
}
export function summaryBefore(id: string, anchor: HTMLElement, text: string) {
  let summary = document.getElementById(id);
  if (!summary) {
    summary = document.createElement("p");
    summary.id = id;
    summary.className = "physiology-summary";
    anchor.before(summary);
  }
  summary.textContent = text;
}
