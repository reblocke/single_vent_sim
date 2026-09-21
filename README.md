# Parallel Circulation Oxygen Explorer

Python-first educational and research software for parallel-circulation oxygen transport.
**All 108 application acceptance gates are verified.** The shared Python engines, scientific
reports, browser views, exports, replay, accessibility alternatives and performance checks have
passed local, isolated-clone and exact-commit CI qualification. Deployment and live verification
are tracked in [the handoff](docs/implementation/HANDOFF.md) and
[the acceptance receipt](docs/implementation/t07-receipt.json).
Numerical verification does not establish source replication or clinical validity. Unavailable
source evidence and documented discrepancies remain visible throughout the application.

## Fresh-clone setup

Prerequisites: Git, `uv`, Python 3.12+ for bootstrap scripts, and network access for the initial locked downloads.
macOS (Apple Silicon/Intel) and Linux (x64/arm64) are supported by the Node bootstrap.

```bash
git clone https://github.com/reblocke/single_vent_sim.git
cd single_vent_sim
make setup
make browser-install
make check
make dev
```

Setup downloads hash-pinned Node 24.21.0 when the active version differs, installs CPython 3.14.2
through uv, uses committed dependency locks, and verifies Pyodide 314.0.7 / NumPy 2.4.6 assets.
On Linux, install browser OS dependencies with `npx playwright install --with-deps` from `web/`
using the pinned Node; CI performs this step. No credentials, private starter repository, original
Downloads directory, backend, or patient data are required.

| Command | Implemented behavior |
|---|---|
| `make setup` / `make doctor` | Install locked tooling / verify versions, runtime hashes and Python lock consistency |
| `make lint` / `make typecheck` / `make test` | Owned-code formatting/lint, mypy/TypeScript, input/schema/package/scientific tests |
| `make fmt` | Format owned Python and TypeScript files; preserve imported verification code |
| `make build APP_BASE=/single_vent_sim/` | Build the wheel and self-contained static checkpoint under `web/dist/` |
| `make test-browser` | Test the already-built checkpoint in Chromium, Firefox and WebKit |
| `make benchmark` | Build and measure 30 warm 201×201 updates in Chromium on the current machine |
| `make check` | Verify integrity, strict checks, production science reports, reference replay and both browser base paths |
| `make validate-science` / `make reproduce` | Production tests and source reports / deterministic calculation and figure regeneration |
| `make ensemble-replay` | Run 20,000 production draws / 400,000 paired evaluations and verify exported-draw replay |
| `make reference-replay-full` | Six 201×201 grids, 20,000 shared draws, 400,000 paired evaluations and replay |
| `make restore-reference` | Recover all 107 original files in `reports/source-pack-v1.2/` (must be new/empty) |

`make validate-science` executes the independent production tests and writes numerical/source
reports plus PNG/SVG figure reconstructions. `make reproduce` regenerates those calculations and
figures without rerunning tests. These use the production engines; the reference commands stay separate. `test-browser` generates CPython expectations and checks the shared wheel in three browser engines, including
scalar/grid parity, lossless exchange, delayed replies and repeated-request cleanup. Playwright WebKit is not a claim of real Safari/mobile-device testing.

## Specification and execution

Read [the complete ticket](IMPLEMENTATION_TICKET.md), [modular stages](docs/06_IMPLEMENTATION_TICKETS.md),
and [the implementation handoff](docs/implementation/HANDOFF.md).
[The saved execution goal](docs/implementation/EXECUTION_GOAL.md) is now active at the user’s request;
Application implementation is accepted; source-only audits and live deployment are tracked independently. The machine-readable stage and 108-gate ledgers are alongside it.

Production code lives in `src/parallel_o2/`; the browser executes the same built wheel.
`parse_request(text, shared=False)` validates bounded V1/V2 scenarios, grids, criteria, and resistance
requests without computing circulation or certifying source fidelity. Import is limited to 1 MiB;
shared payloads are limited to 16 KiB. The shared parser preserves explicit indexing and input values.

The original specification ZIP is tracked once in `provenance/`; its manifest describes the archive,
not the evolving working tree. Input hashes, the historical introduction, and immutable working-file
hashes are retained there. Expanded generated results and downloaded runtimes are ignored.

## Scientific and release status

Ahmed full-text replication and unperformed author-code/figure/original-sampling audits remain separately
identified in the source contracts. Barnea and Savorgnan discrepancies are retained. Source-unavailable
is never a passed replication test. All application gates have passed with these limitations retained.

The public repository uses MIT for project code/documentation; retain [third-party notices](THIRD_PARTY_NOTICES.md)
and [scientific citations](docs/SOURCES.md). The manually gated Pages workflow deploys the tested static artifact.
The deployment address is https://reblocke.github.io/single_vent_sim/.

## Python numerical interfaces

`parallel_o2.model.solve_state` evaluates a bounded V1/V2 scenario with the shared float64
kernel; `parallel_o2.experiments.evaluate_grid` and `evaluate_slice` use that same kernel.
`parallel_o2.indexing` handles explicit mass/BSA and flow-mode conversions.
`parallel_o2.criteria` provides separate criterion assessment, equality boundaries and
strict ratio intervals; `parallel_o2.sensitivity.hb_sensitivity` holds flows and demand fixed.
`parallel_o2.derived` provides conditional fixed-total-output maxima and the inverse-ratio demo.
`parallel_o2.comparison.compare_states` gives masked A/B deltas and exact log decomposition.

Results preserve native units, requested inputs, undefined values, raw audit values and status.
`grid_csv` exports y-major rows with the full experiment metadata in the first data row.
Equality does not satisfy a strict selected criterion; these are mathematical teaching quantities,
not treatment recommendations. Run `uv run --locked pytest tests/test_science.py` for the
independent production-engine tests.

`parallel_o2.flow_providers.solve_resistance_state` evaluates absolute-unit resistance requests
through the same oxygen kernel, with frozen calibration and separate circuit/oxygen statuses.
`parallel_o2.resistance_experiments` supplies paired comparisons, the same-scope 2×2 ablation,
and vectorized grids under frozen-reference, matched-reference-family or local-response policies.
The circuit-secant closure is a derived sensitivity model. Source-normalized results do not
invent an Hb or physical oxygen flux. Run `uv run --locked pytest tests/test_resistance.py`
for independent fixture, pressure-root and perturbation checks.

Source reports use a new output directory on each run. To choose one, pass
`SCIENCE_OUTPUT=reports/my-run` to either command; the directory must be new or empty.
Validation artifacts default to `artifacts/` for CI retention; reproduction defaults to `reports/`.
Both preserve original source fields, supplied fixture hashes and unresolved source status.
Figures 2, 3, 4, 5A, 6 and 7 are generated under B=22 and B=20.7; a separate Figure 5B companion
shows exact finite errors and local sensitivity. No source images are copied or digitized.
The optional Matplotlib development dependency renders these figures; the browser package still
depends only on NumPy. Reports record masks, conditional maxima, tests actually run and code state.

## Browser engine protocol

`parallel_o2.commands.dispatch_json` accepts an `engine-command-v1` envelope with an explicit
operation and arguments. It validates the 1 MiB input limit and bounded grids/scalar batches.
The module worker evaluates a constant Python expression against this data and returns JSON
primitives; user code is never evaluated and no returned PyProxy needs retaining. The client
runs one request at a time, keeps only the newest queued configuration and rejects superseded
promises. A stalled worker terminates after 30 seconds; retry constructs a new worker.

`parallel_o2.exchange` exports/imports complete result envelopes as JSON or typed, long-form CSV.
CSV paths preserve nested grid orientation, empty containers, nulls, booleans and full-precision
numbers alongside input mode, criteria, provenance and units. Imported records do not become
trusted scientific evidence or executable requests. `experiments.grid_csv` separately provides
conventional y-major grid rows for analysis. Browser parity expectations are generated under
ignored `artifacts/`; independent fixture values remain unchanged in `verification/`.

Explore includes E1–E5 and H1–H4 with explicit units and constraints,
linked plots, criterion controls, exact state inspection and body-size conversion. H3/H4 use
vectorized kernels shared with the scalar boundary and sensitivity APIs. Matrices are `[y,x]`;
log axes use log10 plot coordinates with physical tick labels. Masks remain separate from
selected saturation criteria, and off-scale values are counted rather than changed.

The application also includes objective overlays, exact slices, six resistance explorers,
C1–C12/pinned comparisons with oxygen and pressure budgets, and the Paper laboratory. Source
values, equation reconstructions and unavailable-source statuses remain separate. The inverse
workbench labels exact error denominators and local approximations explicitly. T05/T05R/T06
include accepted cross-view and export checks. The optional Savorgnan ensemble
uses declared independent uniforms, shared draws and within-draw baselines, with progress,
cancellation and authoritative CSV replay. Its summaries distinguish all requested/eligible
counts, exclusions, parameter-ensemble quantiles and conditional Monte Carlo sampling error.
CSV draws, every paired effect and a hash-bound manifest can be downloaded. Source Table 2
replication is not claimed. Generic plot/state downloads and final application checks have passed. Deployment and live
verification remain separately recorded in the handoff.

## Save, share and audit an experiment

Choose **Download configuration JSON** to preserve the active view, actual inputs, selected
point, scales, criteria, reference policy, pins and optional slice. **Restore UI configuration**
validates this versioned record before recalculating. **Create share link** explicitly encodes
this configuration in a bounded URL fragment; no simulation state is sent to an analytics
service. Scientific request files remain separately supported by the input-contract checker.

**Download plot and data bundle** saves scenario.json, plot.json, values.csv, PNG/SVG figures
and manifest.json with SHA256 hashes. Additional slices and mixing diagrams have separate
files. JSON and CSV keep unrounded values, null/status distinctions, units and source evidence.
Images include constraints and citations. SVG heat layers are raster; axes/text/curves remain
vector. Changes during export cancel the download to avoid mixing display generations.
The Savorgnan ensemble also provides authoritative draws, all paired results and a replay
manifest. Model & validation displays the last selected state's residuals and downloadable
build/gate/source records. Static asset hashes in asset-manifest.json identify the exact build.

Release verification uses `make verify-live COMMIT=<accepted-sha> ACCEPTED_MANIFEST=<absolute-path>`
after downloading the Pages workflow's tested artifact. It compares all hosted files against
that artifact and runs the deployed app in Chromium, Firefox and WebKit. This command does
not deploy or rebuild the app. Pages remains a manually triggered, application-gated workflow.
