import { bytes, download } from "./zip";
let audit: unknown = null;
export function modelRecord() {
  return {
    selected_state_audit: audit,
    scope:
      "Numerical verification is not clinical validation; source access and discrepancies remain independently unresolved",
  };
}
export async function showModel(previous: unknown) {
  document.getElementById("model")!.dataset.pending = "true";
  const snapshot = previous as Record<string, unknown> | undefined;
  const point = snapshot?.point as Record<string, unknown> | undefined;
  const result = snapshot?.result as Record<string, unknown> | undefined;
  const comparison = result?.comparison as Record<string, unknown> | undefined;
  const states = snapshot?.state
    ? [snapshot.state]
    : point?.displayed_state
      ? [point.displayed_state]
      : comparison
        ? [comparison.a, comparison.b]
        : [];
  audit = states.map((value) => {
    const state = value as Record<string, unknown>;
    return {
      requested: state.requested,
      status: state.status,
      hemodynamic_status: state.hemodynamic_status,
      oxygen_status: state.oxygen_status,
      residuals: state.residuals,
      reference_sha256: state.reference_sha256,
    };
  });
  document.getElementById("model-audit")!.textContent = states.length
    ? JSON.stringify(audit, null, 2)
    : "No forward selected state available. Select a forward Explore or Compare state to inspect its balance residuals here.";
  const build = await fetch(import.meta.env.BASE_URL + "build-info.json").then(
    (r) => r.json(),
  );
  document.getElementById("model-build")!.textContent = JSON.stringify(
    build,
    null,
    2,
  );
  const validation = await fetch(
    import.meta.env.BASE_URL + "validation.json",
  ).then((r) => r.json());
  document.getElementById("model-verification")!.textContent =
    `Recorded application gates: ${validation.gates.filter((g: { status: string }) => g.status === "passed").length} / ${validation.gates.length}. Each gate links to its tested commit and evidence. A passed numerical gate does not resolve a source-access limitation.`;
  document.getElementById("model")!.dataset.pending = "false";
  document.getElementById("model-audit-download")!.onclick = () =>
    download(
      new Blob(
        [bytes(JSON.stringify({ build, ...modelRecord() }, null, 2) + "\n")],
        { type: "application/json" },
      ),
      "selected-state-audit.json",
    );
}
