import type { Compute } from "./model-types";
type Summary = {
  profile_id: string;
  variant: string;
  n_requested: number;
  n_eligible: number;
  n_oxygen_infeasible: number;
  n_boundary: number;
  n_invalid_input: number;
  n_numerical_failure: number;
  mean_delta_percent: number | null;
  quantiles_delta_percent: { p025: number; p50: number; p975: number } | null;
  fraction_negative_among_eligible: number | null;
  monte_carlo_se_fraction: number | null;
  negative_fraction_lower_all_requested: number;
  negative_fraction_upper_unclassified: number;
};
type Report = {
  token: number;
  n_requested: number;
  paired_evaluations: number;
  seed: number | null;
  replay: boolean;
  draw_sha256: string;
  engine_sha256: string;
  reference_family_sha256: string;
  interpretation: string;
  source_status: string;
  summaries: Summary[];
  baseline_saturation_range: { sa: number[] | null; sv: number[] | null };
};
type Progress = {
  token: number;
  n_requested: number;
  completed: number;
  finished: boolean;
};
type Export = {
  token: number;
  start: number;
  stop: number;
  draws_csv: string;
  paired_results_csv: string;
};
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const fmt = (v: number | null) =>
  v === null ? "Undefined" : Number(v.toPrecision(7)).toString();
const nextPaint = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const sha = async (blob: Blob) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
export class EnsembleView {
  private generation = 0;
  private token?: number;
  private report?: Report;
  private files?: { draws: Blob; pairs: Blob; manifest: Blob };
  private build = fetch(import.meta.env.BASE_URL + "build-info.json").then(
    (r) => {
      if (!r.ok) throw new Error("Build manifest unavailable");
      return r.json() as Promise<Record<string, unknown>>;
    },
  );
  constructor(private compute: Compute) {
    el("ensemble").innerHTML = `<h2>Paired sensitivity ensemble</h2>
      <p class="source-note">Declared-demonstration-v1: an assumed parameter ensemble, not source Table 2 replication or clinical uncertainty. Same draws across five resistance profiles and four mechanism variants. Every change is paired with that draw's own frozen baseline.</p>
      <p>Independent uniforms: Qt₀ 1.8–2.2 L/min; native share of reference pulmonary resistance 0.1–0.9; systemic and native-pulmonary effect multipliers each 0.75–1.25. Rs₀=40 and Rp₀+Rsh₀=40 mmHg min/L; Spv=.99, normalized consumption k=.19 L/min. Baseline r=1; baseline Sa/Sv are recomputed. Nominal closure, (α,f)=(0,0),(.35,0),(0,.5),(.35,.5). No patient probability or drug ranking.</p>
      <div class="numeric-selection"><label>Requested draws (1–100,000)<input id="ensemble-n" type="number" min="1" max="100000" step="1" value="20000"></label><label>Deterministic seed<input id="ensemble-seed" type="number" min="0" max="4294967295" step="1" value="2026091804"></label></div>
      <div class="button-row"><button id="ensemble-run" type="button">Run declared ensemble</button><button id="ensemble-cancel" type="button" disabled>Cancel ensemble</button><button type="button" disabled>Exact source Table 2 unavailable</button></div>
      <label>Replay exported draws CSV (≤100,000 rows; ≤32 MiB)<input id="ensemble-replay" type="file" accept=".csv,text/csv"></label>
      <progress id="ensemble-progress" value="0" max="20000"></progress><p id="ensemble-status" role="status" aria-live="polite">Optional experiment; no ensemble has been run.</p>
      <div id="ensemble-result" hidden><p id="ensemble-contract"></p><div class="table-scroll"><table><thead><tr><th>Resistance profile / mechanism</th><th>Eligible / requested</th><th>Oxygen excluded (boundary subset)</th><th>Invalid / numerical</th><th>Mean change (%)</th><th>Parameter-ensemble quantiles 2.5 / 50 / 97.5 (%)</th><th>Negative fraction / MCSE</th><th>All-requested missing-classification bounds</th></tr></thead><tbody id="ensemble-summary"></tbody></table></div>
      <div class="button-row"><button id="ensemble-draws" type="button" disabled>Download replay draws CSV</button><button id="ensemble-pairs" type="button" disabled>Download all paired results CSV</button><button id="ensemble-manifest" type="button" disabled>Download summary and manifest JSON</button></div><details><summary>Full assumption, count and provenance record</summary><pre id="ensemble-json"></pre></details></div>`;
    el("ensemble-run").addEventListener("click", () => void this.run());
    el("ensemble-cancel").addEventListener("click", () => this.cancel());
    el("ensemble-replay").addEventListener("change", () => {
      const f = el<HTMLInputElement>("ensemble-replay").files?.[0];
      if (f) {
        el<HTMLInputElement>("ensemble-replay").value = "";
        void this.run(f);
      }
    });
    for (const id of ["ensemble-n", "ensemble-seed"])
      el(id).addEventListener("change", () =>
        this.invalidate(
          "Inputs changed; run again to generate a matching record.",
        ),
      );
    for (const kind of ["draws", "pairs", "manifest"] as const)
      el("ensemble-" + kind).addEventListener("click", () => {
        if (!this.files) return;
        const url = URL.createObjectURL(this.files[kind]),
          a = document.createElement("a");
        a.href = url;
        a.download =
          kind === "manifest"
            ? "ensemble-manifest.json"
            : kind === "draws"
              ? "ensemble-draws.csv"
              : "ensemble-paired-results.csv";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
    window.addEventListener("parallel-o2-ensemble-suspend", () =>
      this.suspend(),
    );
    void this.build.catch(() => undefined);
  }
  snapshot() {
    return this.report ? structuredClone(this.report) : undefined;
  }
  private busy(value: boolean) {
    for (const id of [
      "ensemble-run",
      "ensemble-n",
      "ensemble-seed",
      "ensemble-replay",
    ])
      el<HTMLInputElement>(id).disabled = value;
    el<HTMLButtonElement>("ensemble-cancel").disabled = !value;
  }
  private downloads(value: boolean) {
    for (const id of ["draws", "pairs", "manifest"])
      el<HTMLButtonElement>("ensemble-" + id).disabled = !value;
  }
  invalidate(message = "Runtime reset; rerun or replay the ensemble.") {
    el("ensemble").dataset.state = "idle";
    ++this.generation;
    this.token = undefined;
    this.report = undefined;
    this.files = undefined;
    this.downloads(false);
    this.busy(false);
    el("ensemble-result").hidden = true;
    el("ensemble-status").textContent = message;
  }
  suspend() {
    if (!el<HTMLButtonElement>("ensemble-cancel").disabled) this.cancel();
  }
  private cancel() {
    ++this.generation;
    const token = this.token;
    this.token = undefined;
    this.report = undefined;
    this.files = undefined;
    this.downloads(false);
    this.busy(false);
    el("ensemble-result").hidden = true;
    el("ensemble").dataset.state = "cancelled";
    el("ensemble-status").textContent =
      "Cancelled. Partial calculations are not reported as a complete ensemble; no effects were imputed.";
    if (token !== undefined)
      void this.compute("ensemble", { action: "cancel", token }).catch(
        () => undefined,
      );
  }
  private async run(file?: File) {
    const generation = ++this.generation;
    this.report = undefined;
    this.files = undefined;
    this.downloads(false);
    this.busy(true);
    el("ensemble-result").hidden = true;
    el("ensemble").dataset.state = "running";
    el("ensemble-status").textContent = file
      ? "Validating exported draw inputs…"
      : "Generating shared draws…";
    try {
      let start: { token: number; n_requested: number };
      if (file) {
        if (file.size > 32 * 1024 * 1024)
          throw new Error("Replay exceeds 32 MiB");
        const lines = (await file.text())
          .replaceAll("\r\n", "\n")
          .trimEnd()
          .split("\n");
        if (generation !== this.generation) return;
        const n = lines.length - 1;
        if (n < 1 || n > 100000)
          throw new Error("Replay requires 1–100000 rows");
        start = (await this.compute("ensemble", {
          action: "replay_start",
          n,
        })) as typeof start;
        this.token = start.token;
        for (let offset = 0; offset < n; offset += 1000) {
          if (generation !== this.generation) return;
          await this.compute("ensemble", {
            action: "replay_append",
            token: start.token,
            start: offset,
            text:
              [
                lines[0],
                ...lines.slice(offset + 1, Math.min(n, offset + 1000) + 1),
              ].join("\n") + "\n",
          });
          if (generation !== this.generation) return;
          el("ensemble-status").textContent =
            `Loaded ${Math.min(n, offset + 1000)} / ${n} exported draws. No new random inputs sampled.`;
          await nextPaint();
        }
      } else
        start = (await this.compute("ensemble", {
          action: "start",
          n: el<HTMLInputElement>("ensemble-n").valueAsNumber,
          seed: el<HTMLInputElement>("ensemble-seed").valueAsNumber,
        })) as typeof start;
      if (generation !== this.generation) return;
      this.token = start.token;
      el<HTMLProgressElement>("ensemble-progress").max = start.n_requested;
      el<HTMLProgressElement>("ensemble-progress").value = 0;
      let completed = 0;
      while (completed < start.n_requested) {
        const p = (await this.compute("ensemble", {
          action: "step",
          token: start.token,
          start: completed,
          count: 1000,
        })) as Progress;
        if (generation !== this.generation) return;
        completed = p.completed;
        el<HTMLProgressElement>("ensemble-progress").value = completed;
        el("ensemble-status").textContent =
          `Completed ${completed} / ${start.n_requested} draws (${completed * 20} paired evaluations).`;
        await nextPaint();
        if (generation !== this.generation) return;
      }
      const report = (await this.compute("ensemble", {
        action: "report",
        token: start.token,
      })) as Report;
      if (generation !== this.generation) return;
      this.report = report;
      this.render(report);
      el("ensemble-status").textContent =
        "Calculations complete; preparing hash-bound replay exports…";
      const drawParts: string[] = [],
        pairParts: string[] = [];
      for (let offset = 0; offset < start.n_requested; offset += 1000) {
        const chunk = (await this.compute("ensemble", {
          action: "export",
          token: start.token,
          start: offset,
          count: 1000,
        })) as Export;
        if (generation !== this.generation) return;
        const strip = (text: string) =>
          offset === 0 ? text : text.slice(text.indexOf("\n") + 1);
        drawParts.push(strip(chunk.draws_csv));
        pairParts.push(strip(chunk.paired_results_csv));
        await nextPaint();
        if (generation !== this.generation) return;
      }
      const draws = new Blob(drawParts, { type: "text/csv" }),
        pairs = new Blob(pairParts, { type: "text/csv" });
      const drawHash = await sha(draws),
        pairHash = await sha(pairs),
        build = await this.build;
      if (generation !== this.generation) return;
      if (drawHash !== report.draw_sha256)
        throw new Error("Exported draws hash differs from evaluated inputs");
      const manifest = {
        ...report,
        build,
        files: {
          "ensemble-draws.csv": { sha256: drawHash, bytes: draws.size },
          "ensemble-paired-results.csv": {
            sha256: pairHash,
            bytes: pairs.size,
          },
        },
      };
      this.files = {
        draws,
        pairs,
        manifest: new Blob([JSON.stringify(manifest, null, 2) + "\n"], {
          type: "application/json",
        }),
      };
      el("ensemble-json").textContent = JSON.stringify(manifest, null, 2);
      this.downloads(true);
      this.busy(false);
      el("ensemble").dataset.state = "complete";
      el("ensemble-status").textContent =
        `Complete: ${start.n_requested} shared draws and ${report.paired_evaluations} within-draw paired evaluations. Replay files verified against the input hash.`;
    } catch (error) {
      if (generation !== this.generation) return;
      this.busy(false);
      this.downloads(false);
      el("ensemble-result").hidden = true;
      el("ensemble").dataset.state = "error";
      el("ensemble-status").textContent = "Ensemble failed: " + String(error);
    }
  }
  private render(report: Report) {
    const body = el("ensemble-summary");
    body.replaceChildren();
    for (const s of report.summaries) {
      const tr = document.createElement("tr"),
        q = s.quantiles_delta_percent;
      for (const value of [
        `${s.profile_id} / ${s.variant}`,
        `${s.n_eligible} / ${s.n_requested}`,
        `${s.n_oxygen_infeasible} (${s.n_boundary})`,
        `${s.n_invalid_input} / ${s.n_numerical_failure}`,
        fmt(s.mean_delta_percent),
        q ? [q.p025, q.p50, q.p975].map(fmt).join(" / ") : "Undefined",
        `${fmt(s.fraction_negative_among_eligible)} / ${fmt(s.monte_carlo_se_fraction)}`,
        `${fmt(s.negative_fraction_lower_all_requested)} to ${fmt(s.negative_fraction_upper_unclassified)}`,
      ]) {
        const td = document.createElement("td");
        td.textContent = value;
        tr.append(td);
      }
      body.append(tr);
    }
    el("ensemble-contract").textContent =
      `${report.interpretation} ${report.replay ? "Replay uses supplied draws; seed is not used. Supplied values are domain-validated and are not asserted to follow the demonstration's uniform laws." : "Independent uniform draws under the declared demonstration."} Actual baseline Sa range ${report.baseline_saturation_range.sa?.map(fmt).join("–") ?? "no finite nonnegative baseline"}; Sv ${report.baseline_saturation_range.sv?.map(fmt).join("–") ?? "no finite nonnegative baseline"} (fractions).`;
    el("ensemble-json").textContent = JSON.stringify(report, null, 2);
    el("ensemble-result").hidden = false;
  }
}
