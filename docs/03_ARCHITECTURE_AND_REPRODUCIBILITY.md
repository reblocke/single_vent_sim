# 03 — Architecture and reproducibility

## 1. Architecture decision

Use a **Python-first static application**. The production scientific engine is an importable Python package, executed in CPython for tests/CLI and in a Pyodide module worker for the browser. Use NumPy for vectorized grid evaluation; no ODE solver is needed. The browser shell is TypeScript + Vite, with Plotly.js heatmap/scatter/contour capabilities. Use Matplotlib only in the optional CPython report-generation dependency group for headless reference PNG/SVG figures; it is not bundled into the browser engine. Browser and report renderers consume the same scientific arrays and mask semantics, but need not be pixel-identical. A server, database, login, generative model, and patient-data integration are out of scope.

This preserves the verified scientific Python starter's `uv`/`src`/Ruff/pytest conventions [G1–G2] without maintaining independent Python and JavaScript physiology implementations. JavaScript may validate form syntax, format numbers, manage plot coordinates, and render; it must not be a second production solver.

Use the same Python wheel/source artifact in browser and CLI. Independent exact-arithmetic code is permitted only in tests/reference verification. Plotting and UI code must not be imported by the core.

### Dependency policy

The initial browser-runtime candidate recorded in specification v1.0 is Pyodide **314.0.7**, whose official documentation requires module-type workers [W1–W2]. The associated 314 series uses Python 3.14.2 according to its release record. Pin a compatible CPython environment and the exact bundled NumPy version during bootstrap, then commit the complete runtime/environment manifest. The candidate is not represented as tested in this seed.

Commit `pyproject.toml`, `uv.lock`, `.python-version`, `package.json`, `package-lock.json`, and a browser-runtime lock/manifest with runtime and wheel hashes. Pin Vite, TypeScript, Plotly.js, browser-test tooling, and their exact resolved versions. Never use an unversioned `latest`, `dev`, or `stable` runtime URL in the built app. If a verified compatibility issue requires another runtime, record the reason and parity results in an architectural decision; do not silently change the numerical contract.

Prefer vendoring the required Pyodide files and NumPy wheel into the build output using a pinned download manifest, rather than runtime dependency resolution. The production app should serve its assets from the same origin. Build artifacts may be large; do not commit the whole runtime to Git. Preserve third-party notices in distributions.

## 2. Target repository layout

```
AGENTS.md
README.md
CITATION.cff
LICENSE                         # maintainer-confirmed before public release
pyproject.toml
uv.lock
.python-version
Makefile
config/
  presets.json                  # canonical preset registry
  examples/
src/parallel_o2/
  __init__.py
  inputs.py                     # typed unions, units, validation, resolution
  model.py                      # pure forward model
  feasibility.py
  derived.py                    # analytic optimum and supported inverse demo
  experiments.py                # grids, slices, comparisons
  serialization.py              # null/status rules and export schemas
  provenance.py
  cli.py
web/
  package.json
  package-lock.json
  index.html
  src/
    main.ts
    state.ts
    worker.ts                   # module-type worker, only calls Python API
    worker-client.ts
    views/
    plotting/
    accessibility/
  tests/
  public/                       # generated model wheel/runtime in build flow
scripts/                        # thin setup/build/export orchestration
schemas/
  scenario-v1.schema.json
  grid-v1.schema.json
  export-manifest-v1.schema.json
tests/
  unit/
  properties/
  regression/
  fixtures/
docs/                           # specifications, source/decision registers
verification/                   # independent reference materials from seed
artifacts/                      # generated test and reproducibility manifests
reports/                        # generated figures/tables
.github/workflows/
```

No analysis logic hidden in notebooks. Notebooks may demonstrate public APIs but are not required to run the app or reproduce reference results. Rename all `scistarter` placeholders inherited from a starter. Do not copy the unrelated CV site or clinical documents.

## 3. Public Python interface

The V1 interfaces below remain supported compatibility interfaces. Revision1.2 adds the separately discriminated resistance request and flow-provider interfaces in Section08; it does not reinterpret a V1/V2 fixed-flow request. Add the V2 contracts in Section 07 and the supplied `schemas/scenario-v2.schema.json`. One basis-neutral scientific engine must serve both indexing modes. Do not fork the circulation solver for Ahmed or BSA.

Expose typed, documented entry points with no global mutable scientific state:

```
resolve_inputs(scenario: ScenarioV1) -> ResolvedInputs
solve_state(scenario: ScenarioV1) -> StateResultV1
evaluate_grid(base: ScenarioV1, x: AxisV1, y: AxisV1,
              metrics: Sequence[MetricId]) -> GridResultV1
evaluate_slice(base: ScenarioV1, axis: AxisV1) -> SliceResultV1
compare_states(a: ScenarioV1, b: ScenarioV1) -> ComparisonV1
conditional_optimum(scenario: ScenarioV1,
                    r_bounds: tuple[float,float] | None) -> OptimumResultV1
estimate_flow_ratio(inputs: InverseInputsV1) -> InverseResultV1
```

`evaluate_grid` uses vectorized float64 arrays. State and grid paths must use the same scientific implementation; no special formula that drifts only at large grids. Typed input objects may use frozen dataclasses and strict parsers; a heavy validation framework is not necessary.

### Canonical scenario example

```json
{
  "schema_version": "scenario-v1",
  "model_version": "barnea-parallel-bound-o2-v1",
  "flow": {
    "mode": "total_ratio",
    "qt_ml_kg_min": 400.0,
    "r": 1.0
  },
  "capacity": {
    "mode": "hb_linear",
    "hb_g_dl": 10.0,
    "kappa_ml_o2_g_hb": 1.34
  },
  "spv_fraction": 0.98,
  "vo2_target_ml_kg_min": 6.0
}
```

Alternative flow object: `{"mode":"independent_flows","qp_ml_kg_min":200.0,"qs_ml_kg_min":200.0}`. Alternative capacity object: `{"mode":"direct_capacity","capacity_ml_dl":22.0}`. Reject incompatible extra scientific fields, rather than accepting Qt/r/Qp/Qs simultaneously and choosing one silently.

Axis object: `{"parameter":"capacity.hb_g_dl","min":6,"max":20,"n":201,"scale":"linear"}`. Use full paths with a registry of permitted axes; do not execute arbitrary expressions from configuration. Two selected axes must be different and independent in the active input model. For public grid requests require finite increasing bounds, an integer n between 3 and 401 on each axis, and at most 160,801 cells; log bounds must be strictly positive. The separately specified paper-curve generator may use 4,001 one-dimensional samples. Refuse oversized requests before allocating arrays.

### State result

A state result includes:

- Exact requested scenario, resolved flow/capacity parameters, schema/model version.
- `status`, `is_admissible`, `warnings`, and machine-readable failure reasons.
- `metrics`: unit-suffixed fields for all contents/flows/saturations, DO2, OER, Omega, both oxygen budgets, gaps, and mathematical limit.
- `residuals`: systemic/pulmonary oxygen balance, mixing balance, and closed-form DO2 discrepancy.
- `audit.algebraic_metrics`: unmodified algebraic outputs, including those not valid as physiologic states. This record must be separately identified in UI/exports.

`is_admissible` is true for an interior admissible state; a separate `has_nonnegative_content_solution` is true at the zero-venous boundary as well. Do not leave the distinction implicit. Main UI may render the boundary with its separate style but cannot call it a safe state.

Mask invalid physiological metric outputs as null with a reason. Undefined ratios for zero-demand/zero-content cases are null rather than Infinity/NaN. Store requested M separately from any implied net algebraic flux; infeasible states must not claim achieved consumption.

### Grid result

Include x/y parameter IDs, physical coordinate arrays and optional edge/plot-coordinate arrays, `[ny,nx]` metric arrays, status masks, fixed inputs, numeric type, requested/actual resolution, capacity convention, and model version. CSV output is y-major, then x-major, with indices and physical coordinates so it can be reconstituted without guessing orientation.

## 4. Worker and application state contract

Workers receive only versioned typed messages: `init`, `solve_state`, `grid`, `slice`, `compare`, `paper`, `inverse`, and the v1.1 additions `criteria`, `criterion_boundary`, `ratio_interval`, and `hb_sensitivity`. Do not accept arbitrary Python code or expressions from UI, URLs, or imported JSON.

Each request and response has a monotonically increasing generation ID. The UI applies a response only if it matches the latest relevant configuration; stale responses cannot overwrite newer labels, maps, or inspector values. One worker owns the Python interpreter. Debounce high-frequency updates by approximately 150 ms and retain only the newest queued grid request.

Initialization shows explicit progress, failure details, and a retry action. Never show a previous successful plot under new parameter labels while a new result is pending. State transitions are atomic and loading indicators are visible.

Release Python/JS proxies and temporary arrays after conversion. A stress test makes 200 parameter updates without unbounded listener/proxy accumulation. Prefer ordinary module workers and transferable arrays; shared memory and special cross-origin-isolation headers are not required for v1.

## 5. Reproducible exports

A figure/grid export bundle contains:

```
scenario.json
plot.json                       # plot configuration and exact displayed scales
values.csv                      # long-form, unrounded scientific values and mask
figure.png
figure.svg
manifest.json
```

`manifest.json` records scenario/model/export schema versions, code commit or explicit `uncommitted`, app build ID, dependency manifest identifier, source identifier/DOI, capacity convention, all independent/fixed parameters, grid resolution/axis scales, mask rules, rendering size, and SHA256 for the exported numerical/configuration payloads. Record a timestamp separately from deterministic scientific payloads so clock changes do not defeat reproducibility checks.

Export from the exact displayed configuration, not a silently recomputed default. JSON is strict finite-number JSON with nulls as specified. CSV stores float64 values at sufficient precision (17 significant digits is acceptable). Deltas on fractional saturation are accompanied by percentage-point display units. Do not round inputs before calculating.

JSON import is size-bounded (1 MiB), schema-validated, numeric-only except enumerated IDs and metadata, and refuses unknown model versions with a useful error. No eval or arbitrary file paths. URL sharing uses an explicitly initiated versioned state in the fragment, not query parameters; bound its decoded state to 16 KiB and exclude arbitrary free text. Do not log simulation inputs to a server or analytics service. A browser is not a clinical record system; the UI asks users not to enter identifiers.

## 6. Target commands to implement

| Command | Required behavior |
|---|---|
| `make setup` | Install declared locked Python/JS dependencies and the pinned runtime assets; no deployment. |
| `make doctor` | Report versions, lock consistency, model import, required assets, and local prerequisites without modifying scientific files. |
| `make fmt` | Apply the repository's declared formatter(s); Python formatting uses Ruff. |
| `make lint` | Check Python with Ruff and declared TypeScript/format checks; no rewriting. |
| `make typecheck` | Run the declared Python type checker and TypeScript strict checks. |
| `make test` | Python unit, property, fixture, and serialization tests. |
| `make test-browser` | Worker parity and functional browser tests on the static app. |
| `make validate-science` | Recompute source comparisons, invariants, feasibility, analytic-optimum checks, and emit a machine-readable report. |
| `make dev` | Serve the local browser app. |
| `make build` | Create self-contained deployable static output at `web/dist/`, supporting a repository subpath. |
| `make reproduce` | Generate all required reference figures and numerical CSV/JSON outputs from committed presets. |
| `make check` | Run non-mutating release checks, including a production build and browser suite. |

CLI target examples:

```
uv run --locked python -m parallel_o2.cli state --config config/examples/baseline.json
uv run --locked python -m parallel_o2.cli grid --config config/examples/hb_ratio_grid.json --output artifacts/example-grid
uv run --locked python -m parallel_o2.cli paper --output reports/paper-reconstruction
```

If a command interface is changed during implementation, update all docs/tests in the same change and explain material deviations. Lock checks should use `uv lock --check`/`uv sync --locked`, rather than assuming a frozen but stale lock is consistent [W5]. Use `npm ci` for the committed JS lock.

## 7. CI, performance, and deployment gates

CI performs lock checks, lint/type checks, Python tests, independent fixtures, schema checks, wheel build, browser-worker parity, production build, and functional tests in Chromium/Firefox/WebKit. The deployment artifact is tested under both `/` and `/single_vent_sim/` bases. A Pages workflow follows Vite's documented static deployment pattern [W6], using least-required permissions and pinned action versions/SHAs. No automatic public release from an unreviewed pull request.

Performance target on a recorded reference laptop after runtime initialization: 201×201 grid computation p95 <=500 ms, and update-to-painted-plots p95 <=1.5 s over 30 settled changes. Hover/pin interaction must remain responsive. Cold initialization timing and transferred bytes are reported separately, not hidden in warm benchmarks. Performance failures require measurement and resolution/explicit gate failure, not silently lowering resolution.

Self-contained deployment means all scientific/runtime assets are included in the static build or its declared same-origin assets. Running already-loaded computations and exports must not require network requests. A first visit still requires downloading the static assets. No claim of offline-first service-worker installation is required for v1.

Before public release confirm software licensing/author metadata and third-party redistribution notices. These administrative decisions do not block local implementation and testing. Do not redistribute the source article PDF in the deployed app by default; cite it and link to its publisher/source instead.

## 8. Metric and request identifiers

Normative metric IDs use the same names as the reference fixtures:

```
qp_ml_kg_min, qs_ml_kg_min, qt_ml_kg_min, r
capacity_ml_dl, cpv_ml_dl, ca_ml_dl, cv_ml_dl
sa_fraction, sv_fraction
do2_ml_kg_min, oer_fraction, omega
systemic_in_ml_kg_min, systemic_out_ml_kg_min, systemic_net_use_ml_kg_min
pulmonary_in_ml_kg_min, pulmonary_out_ml_kg_min, pulmonary_net_add_ml_kg_min
zero_venous_vo2_limit_ml_kg_min
av_saturation_gap_fraction, pv_a_saturation_gap_fraction, r_fick
```

Input Spv and requested M also remain available in resolved inputs; an export may repeat them with their explicit names `spv_fraction` and `vo2_target_ml_kg_min`. Unknown metrics are rejected. Each registered metric has a unit, display formatter, plain-language definition, and applicability rule. Undefined/infeasible masks are not encoded as zero.

`grid-request-v1` consists of `schema_version`, `base` (ScenarioV1), `x` (AxisV1), `y` (AxisV1), and `metrics` (distinct known IDs). Add its schema to `schemas/grid-request-v1.schema.json`; `grid-v1.schema.json` describes the result rather than the request. The supplied `config/examples/hb_ratio_grid.json` is a concrete request.

A numerical-failure audit record stores non-finite computed fields as null with a specific overflow/underflow or denominator reason, preserving JSON validity. This exception is numerical diagnostic handling, not clipping a finite inadmissible physiological value.

## 9. v1.1 implementation additions
Add `indexing.py` for explicit input/output conversion and optional mass/BSA conversion; `criteria.py` for saturation-criterion evaluation and analytic boundary solvers; `sensitivity.py` for declared fixed-variable Hb derivatives. These modules consume the common model and must not implement a second unconstrained circulation.

`ScenarioV2`, `GridRequestV2`, and `StateResultV2` use the supplied scenario schema and the precise result/request contract in Section 07. Implement result/grid schemas as part of T01/T02. Legacy V1 payloads remain valid and deterministically migrate to per_kg V2 without changing numeric values or inventing body size. V2 reference cases are new independent fixtures, not replacements for V1 fixtures.

`make validate-science` must emit separate `model_arithmetic`, `indexing`, `criterion_layer`, `barnea_source_reconstruction`, `ahmed_abstract_scenario_consistency`, and `ahmed_full_text_replication` statuses. The last must remain `blocked_source_unavailable` until the evidence gate is completed, even if all numerical tests pass. `make reproduce` exports labeled Ahmed-inspired surfaces in addition to Barnea results; it must not claim source-figure replication without a verified inventory.

For area-indexed values use L blood/min/m2 for displayed CI, mL O2/min/m2 for transport/consumption, and unchanged content/saturation units. The browser's axis/metric registry and exports must be basis-aware. Cross-basis A/B comparison requires explicit conversion or is blocked; no implicit mass/BSA assumption.

## 10. v1.2 flow-provider architecture and executable scope
Add `hemodynamics.py`, `resistance_inputs.py`, `flow_providers.py`, `resistance_experiments.py` and `ensemble.py` in the production package. Extend basis-neutral oxygen accounting with absolute units without creating a second production oxygen solver. Legacy V1/V2 payloads, constants and expected outputs remain unchanged. The supplied `resistance-experiment-v1.schema.json` is a new tagged request, not an overloaded Qt/r form.

Worker message types add resistance states/grids/ablation/ensemble. Browser/CPython parity covers both closures, native/audit semantics and normalized/physical oxygen units. Production app commands listed above remain target interfaces. The separate standard-library `scripts/run_reference_pipeline.py` IS implemented in this pack and generates reference artifacts only. Root `make reference-*` targets, when present, wrap that reference pipeline and do not mean the future `make build/check` app targets exist.

`make validate-science` in the future app reports the R-gates, selected closure residuals, Table1 discrepancy and Table3 comparison separately from existing Barnea/Ahmed statuses. Ensemble distributions and exact draws must be exported; no statistical summary is allowed to omit ineligible draw counts. The new source status schema is described in Section10.
