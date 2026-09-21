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
export function pairedSummary(a: SummaryState, b: SummaryState): string {
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
