import type { BuildContext } from "./protocol";
import Plotly from "plotly.js-dist-min";
import type { PlotlyHTMLElement } from "plotly.js";
import type { Compute } from "./model-types";
import type { UIState } from "./settings";
import { bytes, download, hash, zip, type Bytes } from "./zip";
import { csv, gridRows, paperRows, recordRows } from "./csv";

type RecordValue = Record<string, unknown>;
type Capture = {
  state: UIState;
  snapshot: RecordValue;
  host: HTMLElement;
  caption: string;
  ready: boolean;
};
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const escape = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const sources = [
  {
    id: "P1",
    doi: "10.1161/01.CIR.98.14.1407",
    status:
      "Equation reconstruction; capacity and landmark discrepancies retained",
  },
  {
    id: "P2",
    doi: "10.1016/j.jtcvs.2022.09.044",
    status:
      "Abstract supported; full-text settings unverified; not exact replication",
  },
  {
    id: "P3",
    doi: "10.3390/jcdd13080347",
    status:
      "Source table audit with unresolved discrepancies; original Monte Carlo not replicated",
  },
];
function wrap(text: string, limit = 105): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line.length + word.length > limit) {
      lines.push(line);
      line = "";
    }
    line += (line ? " " : "") + word;
  }
  if (line) lines.push(line);
  return lines;
}
async function captioned(
  svgText: string,
  caption: string,
  width: number,
  height: number,
): Promise<{ svg: Bytes; png: Bytes; width: number; height: number }> {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml"),
    root = doc.documentElement;
  if (root.localName !== "svg" || doc.querySelector("parsererror"))
    throw new Error("Plot export did not produce an SVG");
  root.setAttribute("x", "0");
  root.setAttribute("y", "56");
  root.setAttribute("width", String(width));
  root.setAttribute("height", String(height));
  const lines = wrap(caption),
    total = height + 100 + lines.length * 20;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${total}" viewBox="0 0 ${width} ${total}"><rect width="100%" height="100%" fill="white"/><text x="24" y="33" font-family="Arial,sans-serif" font-size="22" fill="#17313c">Parallel Circulation Oxygen Explorer</text>${new XMLSerializer().serializeToString(root)}${lines.map((line, i) => `<text x="24" y="${height + 85 + i * 20}" font-family="Arial,sans-serif" font-size="15" fill="#17313c">${escape(line)}</text>`).join("")}</svg>`;
  const svgBytes = bytes(svg),
    url = URL.createObjectURL(new Blob([svgBytes], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = total * 2;
    const context = canvas.getContext("2d")!;
    context.scale(2, 2);
    context.drawImage(image, 0, 0);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("PNG export failed")),
        "image/png",
      ),
    );
    return {
      svg: svgBytes,
      png: new Uint8Array(await png.arrayBuffer()),
      width,
      height: total,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
function encodeState(state: UIState) {
  const encoded = bytes(JSON.stringify(state));
  if (encoded.length > 16384)
    throw new Error(
      "State exceeds 16 KiB sharing limit; download JSON instead",
    );
  return btoa(String.fromCharCode(...encoded))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}
function decodeState(fragment: string) {
  if (fragment.length > 22000 || !/^[\w-]+$/.test(fragment))
    throw new Error("Invalid or oversized state fragment");
  return new TextDecoder("utf-8", { fatal: true }).decode(
    Uint8Array.from(
      atob(fragment.replaceAll("-", "+").replaceAll("_", "/")),
      (c) => c.charCodeAt(0),
    ),
  );
}

export class ExportPanel {
  private busy = false;
  private revision = 0;
  constructor(
    private capture: (includeSnapshot?: boolean) => Capture,
    private restore: (state: UIState) => void,
    private compute: Compute,
    private context: () => BuildContext | undefined,
  ) {
    el("export-state").addEventListener("click", () => void this.saveState());
    el("export-bundle").addEventListener("click", () => void this.bundle());
    el("share-state").addEventListener("click", () => void this.share());
    el("import-state").addEventListener("change", () => void this.importFile());
    // Any edited control invalidates a render in progress, even before change/blur commits it.
    document.addEventListener(
      "input",
      (event) => {
        if ((event.target as HTMLElement).closest(".view")) ++this.revision;
      },
      true,
    );
    document.addEventListener(
      "change",
      (event) => {
        if ((event.target as HTMLElement).closest(".view")) ++this.revision;
      },
      true,
    );
    new MutationObserver(() => this.buttons()).observe(
      document.querySelector("main")!,
      {
        subtree: true,
        attributes: true,
        attributeFilter: ["data-pending", "hidden", "data-state"],
      },
    );
    window.addEventListener("hashchange", () => void this.restoreFragment());
    this.buttons();
  }
  private buttons() {
    const ready = this.capture(false).ready;
    for (const id of ["export-state", "export-bundle", "share-state"])
      el<HTMLButtonElement>(id).disabled = this.busy || !ready;
  }
  private message(text: string) {
    el("export-status").textContent = text;
  }
  private async checked(shared = false) {
    const c = this.capture();
    if (!c.ready)
      throw new Error("Wait for a complete, valid displayed generation");
    await this.compute("validate_ui_state", {
      text: JSON.stringify(c.state),
      shared,
    });
    if (
      !this.capture(false).ready ||
      JSON.stringify(this.capture(false).state) !== JSON.stringify(c.state)
    )
      throw new Error(
        "Configuration changed; retry from the completed display",
      );
    return c;
  }
  private async run(task: () => Promise<void>) {
    if (this.busy) return;
    this.busy = true;
    this.buttons();
    try {
      await task();
    } catch (error) {
      this.message("Export/import error: " + String(error));
    } finally {
      this.busy = false;
      this.buttons();
    }
  }
  private async saveState() {
    await this.run(async () => {
      const c = await this.checked();
      download(
        new Blob([json(c.state)], { type: "application/json" }),
        "scenario.json",
      );
      this.message("Saved the exact displayed configuration.");
    });
  }
  private async share() {
    await this.run(async () => {
      const c = await this.checked(true);
      const url = new URL(location.href);
      url.search = "";
      url.hash = "state=" + encodeState(c.state);
      el<HTMLInputElement>("share-url").value = url.href;
      el("share-output").hidden = false;
      el<HTMLInputElement>("share-url").select();
      this.message(
        "Share link prepared. Configuration stays in the URL fragment; no patient identifiers or free text are accepted.",
      );
    });
  }
  private async importFile() {
    await this.run(async () => {
      const file = el<HTMLInputElement>("import-state").files?.[0];
      if (!file) return;
      if (file.size > 1048576)
        throw new Error("UI state exceeds 1 MiB import limit");
      await this.apply(await file.text(), false);
    });
  }
  async restoreFragment() {
    if (!location.hash.startsWith("#state=")) return;
    await this.run(async () =>
      this.apply(decodeState(location.hash.slice(7)), true),
    );
  }
  private async apply(text: string, shared: boolean) {
    const state = (await this.compute("validate_ui_state", {
      text,
      shared,
    })) as UIState;
    const original = JSON.parse(text) as UIState;
    const normalized =
      state.view === "explore" &&
      state.provider === "resistance" &&
      original.view === "explore" &&
      original.provider === "resistance" &&
      JSON.stringify(original.settings.request.perturbation) !==
        JSON.stringify(state.settings.request.perturbation);
    this.restore(state);
    this.message(
      "Validated configuration restored; the shared engine is recalculating its displayed results." +
        (normalized
          ? " Legacy absolute-axis multipliers were inactive; normalized to derived neutral placeholders (1)."
          : ""),
    );
  }
  private async bundle() {
    await this.run(async () => {
      this.message(
        "Rendering images and binding the displayed data to its configuration…",
      );
      const c = await this.checked(),
        revision = this.revision,
        signature = JSON.stringify(c.state),
        snapshot = JSON.stringify(c.snapshot);
      const layoutFingerprint = () =>
        JSON.stringify(
          [...c.host.querySelectorAll<PlotlyHTMLElement>(".js-plotly-plot")]
            .filter(
              (p) =>
                p.getBoundingClientRect().width > 0 && !p.closest("[hidden]"),
            )
            .map((p) => p.layout),
        );
      const capturedLayouts = layoutFingerprint();
      const valid = () => {
        const now = this.capture();
        if (this.context() !== loaded)
          throw new Error("Runtime changed during export");
        if (
          !now.ready ||
          revision !== this.revision ||
          layoutFingerprint() !== capturedLayouts ||
          JSON.stringify(now.state) !== signature ||
          JSON.stringify(now.snapshot) !== snapshot
        )
          throw new Error(
            "Display changed during export; no bundle was downloaded. Retry when settled",
          );
      };
      const loaded = this.context();
      if (!loaded) throw new Error("Build metadata is not initialized");
      const build = structuredClone(loaded.build),
        runtime = structuredClone(loaded.versions);
      const data = c.snapshot.grid as RecordValue | undefined;
      const paper = (c.snapshot.result as RecordValue | undefined)?.data as
        | RecordValue
        | undefined;
      const numericalMetadata = data
        ? Object.fromEntries(
            Object.entries(data).filter(
              ([key]) =>
                ![
                  "metrics",
                  "status",
                  "before_status",
                  "after_status",
                  "hemodynamic_status",
                  "oxygen_status",
                  "criteria_result",
                  "admissibility_margin_ml_dl",
                  "constraint_overlays",
                ].includes(key),
            ),
          )
        : paper
          ? {
              schema_version: paper.schema_version,
              units: paper.units,
              x_unit: paper.x_unit,
              y_unit: paper.y_unit,
              convention: paper.convention,
            }
          : {};
      const metadata = {
        numerical_metadata: numericalMetadata,
        configuration: c.state,
        build,
        runtime,
        sources,
        caption: c.caption,
        scope: "Mathematical educational model; not clinical validation",
        matrix_orientation: "rows=y, columns=x",
        null_policy:
          "Undefined/masked values stay null in JSON and empty in numeric CSV; never zero",
        fraction_policy:
          "_fraction fields are fractions; explicitly labeled presentation columns may be percent",
      };
      const values = data
        ? csv(gridRows(data, metadata))
        : paper?.schema_version === "paper-curves-v1"
          ? csv(paperRows(paper, metadata))
          : csv(recordRows({ metadata, result: c.snapshot }));
      const plots = [
        ...c.host.querySelectorAll<PlotlyHTMLElement>(".js-plotly-plot"),
      ].filter(
        (p) => p.getBoundingClientRect().width > 0 && !p.closest("[hidden]"),
      );
      const rendering: {
        name: string;
        width: number;
        height: number;
        png_scale: number;
      }[] = [];
      const entries: { name: string; bytes: Bytes }[] = [
        { name: "scenario.json", bytes: bytes(json(c.state)) },
        { name: "values.csv", bytes: bytes(values) },
        {
          name: "plot.json",
          bytes: bytes(
            json({
              metadata,
              snapshot: c.snapshot,
              plots: plots.map((p) => ({ data: p.data, layout: p.layout })),
            }),
          ),
        },
      ];
      if (c.snapshot.slice) {
        entries.push(
          { name: "slice.json", bytes: bytes(json(c.snapshot.slice)) },
          {
            name: "slice-values.csv",
            bytes: bytes(csv(recordRows(c.snapshot.slice))),
          },
        );
      }
      const criterionCaption =
        c.state.view === "explore" && c.state.provider === "prescribed"
          ? ` Selected criteria: Sa > ${100 * c.state.settings.criteria.sa_lower_fraction}%, Sv > ${100 * c.state.settings.criteria.sv_lower_fraction}%; ${c.state.settings.criteria.origin}.`
          : "";
      const caption =
        c.caption +
        criterionCaption +
        ` Model barnea-parallel-bound-o2-v1; resistance-parallel-steady-v1 when applicable. Build ${build.code_commit}; Python ${runtime.python}, NumPy ${runtime.numpy}.` +
        " " +
        (c.state.view === "explore"
          ? "Neutral masks: inadmissible/undefined oxygen states; saturation criteria remain separate. "
          : "") +
        "Source DOIs: " +
        sources.map((s) => s.doi).join("; ") +
        ". SVG heat layers are raster; axes and labels remain SVG. See manifest for source status.";
      for (const [i, plot] of plots.entries()) {
        valid();
        const width = Math.max(
            960,
            Math.ceil(plot.getBoundingClientRect().width),
          ),
          height = Math.max(
            540,
            Math.ceil(plot.getBoundingClientRect().height),
          );
        const uri = await Plotly.toImage(plot, {
          format: "svg",
          width,
          height,
        });
        const rendered = await captioned(
          await fetch(uri).then((r) => r.text()),
          (plot.closest(".plot-card")?.querySelector("h2")?.textContent ??
            (plot.previousElementSibling?.tagName === "P"
              ? plot.previousElementSibling.textContent
              : "Displayed result")) +
            ". " +
            caption,
          width,
          height,
        );
        rendering.push({
          name: i === 0 ? "figure.svg" : `figure-${i + 1}.svg`,
          width,
          height: rendered.height,
          png_scale: 2,
        });
        entries.push(
          {
            name: i === 0 ? "figure.svg" : `figure-${i + 1}.svg`,
            bytes: rendered.svg,
          },
          {
            name: i === 0 ? "figure.png" : `figure-${i + 1}.png`,
            bytes: rendered.png,
          },
        );
      }
      const diagrams = [
        ...c.host.querySelectorAll<SVGSVGElement>(
          '.comparison-cards svg[role="img"]',
        ),
      ];
      for (const [i, diagram] of diagrams.entries()) {
        valid();
        const copy = diagram.cloneNode(true) as SVGSVGElement;
        copy.removeAttribute("style");
        const label = diagram.getAttribute("aria-label") ?? "Mixing diagram";
        const rendered = await captioned(
          new XMLSerializer().serializeToString(copy),
          label + " " + caption,
          960,
          650,
        );
        rendering.push({
          name: `diagram-${i + 1}.svg`,
          width: rendered.width,
          height: rendered.height,
          png_scale: 2,
        });
        entries.push(
          { name: `diagram-${i + 1}.svg`, bytes: rendered.svg },
          { name: `diagram-${i + 1}.png`, bytes: rendered.png },
        );
      }
      if (!plots.length) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="220"><text x="25" y="45" font-family="Arial" font-size="22">${escape(c.state.view === "model" ? "Model and numerical validation" : "Source audit record")}</text>${wrap(
          c.caption,
        )
          .map(
            (line, i) =>
              `<text x="25" y="${80 + i * 22}" font-family="Arial" font-size="16">${escape(line)}</text>`,
          )
          .join("")}</svg>`;
        const rendered = await captioned(svg, caption, 1000, 260);
        rendering.push({
          name: "figure.svg",
          width: rendered.width,
          height: rendered.height,
          png_scale: 2,
        });
        entries.push(
          { name: "figure.svg", bytes: rendered.svg },
          { name: "figure.png", bytes: rendered.png },
        );
      }
      const files: Record<string, { sha256: string; bytes: number }> = {};
      for (const entry of entries)
        files[entry.name] = {
          sha256: await hash(entry.bytes),
          bytes: entry.bytes.length,
        };
      entries.push({
        name: "manifest.json",
        bytes: bytes(
          json({
            schema_version: "parallel-o2-export-v1",
            created_at: new Date().toISOString(),
            ...metadata,
            files,
            image_count: plots.length,
            diagram_count: diagrams.length,
            rendering,
            image_note:
              "Images show the selected scales and captions. plot.json retains every displayed numeric record, mask and source audit. Raster heat layers are embedded in SVG.",
          }),
        ),
      });
      valid();
      download(zip(entries), "parallel-o2-" + c.state.view + ".zip");
      this.message(
        `Exported one coherent generation: ${plots.length} plots, full-precision values, configuration and SHA256 manifest.`,
      );
    });
  }
}
