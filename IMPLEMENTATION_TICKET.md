# Complete implementation ticket and pipeline — v1.2

This is the entire dependency-ordered work order for a **new repository**. Keep the complete unpacked bundle with this file. Every scientific/UI detail in [FULL_SPECIFICATION.md](FULL_SPECIFICATION.md) is part of acceptance; the runnable verification workflow is included here, not promised as future work. The application itself is still to be implemented.

---

# Master coding-agent implementation request — complete v1.2

Build a new repository implementing **Parallel Circulation Oxygen Explorer**. Use this entire unpacked specification/reference-pipeline bundle as the acceptance contract. Do not implement only the newest amendment or replace the earlier requirements with it.

## Required finished product

A static browser app and importable Python package share one transparent oxygen-transport engine. Users can explore prescribed-flow scenarios and separately selected resistance-driven scenarios, compare oxygen and mean-pressure budgets, inspect source reconstructions/discrepancies, evaluate selected-saturation criteria, and export reproducible data/figures. The resistance mode has frozen calibration, native pulmonary versus shunt resistance, two explicitly named output-law closures, separate normalized/physical oxygen modes and an assumption-labeled paired sensitivity ensemble.

Every panel displays what is prescribed, what is derived, the fixed reference, units/indexing, closure, perturbation semantics, oxygen-demand convention, masks and evidence status. The app must distinguish higher gross transport from higher net uptake, higher saturation from higher systemic delivery, and source-consistent calculations from clinical validation.

## Read and implement

Start with `AGENTS.md`, `FULL_SPECIFICATION.md`, and `docs/06_IMPLEMENTATION_TICKETS.md`. The authoritative modular documents are Sections01–10 and SOURCES. Section08 defines the resistance extension; Section09 defines the runnable reference pipeline; Section10 defines its source discrepancy register. The root `IMPLEMENTATION_TICKET.md` provides the complete dependency-ordered handoff, not just a patch.

Implement T01–T07 including T02R/T05R/T06R. Track source gates T00A/T00S independently. Numerical engines/units/calibration and independent verification come before interface polish. Preserve original E1–E5,H1–H4,C1–C7 and all old fixtures; add R1–R6,C8–C12 and their R/RV gates.

Use the recorded `locke_cv` starter conventions (Python source layout, uv locks, Ruff/pytest, thin scripts, separate generated outputs, short factual agent instructions). Do not copy the private CV repository or unrelated documents. The pack is self-contained and does not require access to that private repository to understand the requirements.

## Non-negotiable scientific boundaries

Do not infer a unique resistance circuit from saturation/flow alone, use achieved flow/r as additional free inputs, combine incompatible indexing, or make the source delivery index into physical DO2 without declared capacity. Do not hold normalized consumption fixed while claiming physical VO2 stayed fixed during an Hb sweep.

Native-Rp-only is the ordinary perturbation scope. Whole-pathway multipliers are a restricted labeled audit, not the baseline for alpha/nonlinearity attribution. Preserve Table1 discrepancies and the selected Table3 rounding agreement simultaneously. The nominal-afterload closure is a declared source-compatible reconstruction; the operating-circuit-secant closure is a new structural sensitivity, not an author-verified correction.

No clinical drug selection/dosing, safe Hb/r targets, patient identifiers, arbitrary output caps, Hb-viscosity feedback, unequal-outlet shortcut, supply-dependent consumption, pulsatility, diastolic waveform, organ perfusion or bradycardia model. Do not clip saturation or lower prescribed demand to repair infeasible states. Do not fit unknown source constants to make published numbers agree.

## What already runs versus what you must build

`python scripts/run_reference_pipeline.py --output reports/new-run` is an executable standard-library reference pipeline. Its checks and CSV grids are reference evidence, not the completed browser app. The new resistance calculator and high-precision oracle live in `verification/` and must not become a hidden production dependency. Implement a single shared production Python engine and test it against the preserved independent fixtures; TypeScript renders and orchestrates, not a duplicate solver.

The complete application still requires locked environments, model APIs, numerical/vectorized/browser parity, UI/screenshots, image/data downloads, import/replay, accessibility/performance checks and a deployable static build. Do not stop at scaffolding, generated grids, an attractive screenshot, or a notebook.

## Handoff

Report the actual implemented commit/build; commands/checks run and their results; original/new fixture hashes; source statuses and retained discrepancies; browser/runtime versions; image export checks; ensemble denominator/replay checks; measured performance; remaining blocked gates; and whether a remote repository/deployment actually occurred. Numerical reference success is not clinical validation. Remote writes, public release and deployment need the relevant authorization; do not claim those actions occurred when only local files were built.


---

# 06 — Complete dependency-ordered implementation pipeline

Revision **1.2.0-spec**. These are finished-product requirements for a new repository. The included reference pipeline is executable; the production application still needs implementation. Preserve all original Barnea and Ahmed requirements. Section08 adds a separate resistance provider, not hidden changes to the fixed-flow model.

## T00A — Ahmed source-contract verification

**Evidence:** the abstract and bibliographic record were verified in the prior revision; full text was unavailable.

**Deliver:** a traceable methods/equation/figure inventory, including coefficients, pulmonary venous saturation, indexing, sweep grids and any additional constitutive assumptions from the actual source.

**Accept:** source-backed comparisons and an explicit evidence status. Until the full source is retrieved, retain `blocked_source_unavailable` and disable exact-Ahmed-reproduction labeling. Assumption-labeled teaching experiments may proceed. Do not fit unknown coefficients or invent figure definitions.

## T00S — Savorgnan source audit and discrepancy preservation

**Deliver:** immutable baseline and Tables1/3 registry; native-versus-whole-pathway distinction; SD01–SD09; source-image, author-code and original-sampling access statuses; independent table comparisons.

**Accept:** Table1 is not silently reconciled. Source statements, inferred reconstructions and the newly derived closure remain distinct. Keep author-code, rendered-figure and original-Monte-Carlo audits unperformed until actually completed. Retrieved source text supports the declared reconstruction, not claims about uninspected executable code.

## T01 — New repository and reproducible environment

**Deliver:** Python source layout; concise factual AGENTS/README; environment locks and pinned browser assets; TypeScript shell; legacyV1/indexedV2 scenarios plus the new resistance schema; CI. Follow the recorded starter conventions without copying private CV or patient material.

**Accept:** clean installation, lock checks, package import and bounded schema parsing work. Implement real format/lint/typecheck/test/build interfaces and document only commands that run. Browser-runtime loading is a compatibility gate, not numerical validation. Licensing, authorship and public-release authorization remain explicit maintainer decisions.

## T02 — Oxygen, indexing and criterion engine

Depends on T01.

**Deliver:** one pure oxygen-conservation engine; both fixed-flow parameterizations; direct/Hb capacity modes; complete oxygen ledger; feasibility/zero-demand states; original inverse-ratio and optimum functions; nativeBSA adapters; selected-criterion boundaries/intervals; continuous Hb sensitivities. Extend the typed reference unit to absolute when integrating T02R, without changing existing results.

**Accept:** S01–S22 and A01–A18 pass, including preserved independent fixtures, conservation and unit tests. No UI imports, hidden patient defaults, clipping, or clinical thresholds. Original source discrepancies remain.

## T02R — Resistance provider, closures and coupling

Depends on T02.

**Deliver:** frozen circuit reference and nonlinear calibration; nativeRp default and restricted whole-pathway audit; stable linear/quadratic flow split; nominal and newly derived circuit-secant output closures; pressure diagnostics; normalized/physical oxygen adapter; separate hemodynamic, oxygen and criterion statuses; R1–R6 numerical interfaces.

**Accept:** R01–R23 pass, including40 independent fixtures,2000 seeded states and high-precision oracle checks. Preserve alpha0, alpha1 and f0 limits; distinguish delivery index from physical flux; hold physicalM fixed in Hb sweeps. The production solver must not call reference helpers as its implementation. No arbitrary output cap, viscosity law, unequal-outlet shortcut, pulsatile model or clinical drug prediction.

## T03 — Source reports and reproducible numerical workflow

Depends on T02/T02R. Source labels are governed separately by T00A/T00S.

**Deliver:** original Barnea figure calculations under both capacity conventions; Ahmed-inspired examples and criteria; all Savorgnan table comparisons; same-scope2×2 mechanism ablation; effect-scale curves; separate reported/computed columns and discrepancy registers. Deterministic CLI exports work without a notebook or browser.

**Accept:** original landmarks, parameter ordering and infeasible-state handling remain correct. All25 Table3 rounded cells agree with the nominal reconstruction; Table1 agreement is claimed only for supported columns. Unavailable exact-Ahmed, source-image, author-code and source-Monte-Carlo reproductions remain gated. Known discrepancies do not disable unrelated tests or trigger hidden parameter changes.

## T04 — Static application and shared Python execution

Depends on T02/T02R; can overlap source-report completion.

**Deliver:** static TypeScript/Vite shell executing the packaged Python model in a Pyodide module worker; atomic configuration generations; bounded inputs/imports; useful loading/retry/error states; source and preset metadata.

**Accept:** S23–S24, A19–A20 and R24 pass. Scalar/grid/browser parity is demonstrated, stale responses cannot repaint, root and repository-subpath builds load, and memory/proxy stress tests pass. No alternate production physiology implementation in JavaScript. Report actual runtime/browser versions.

## T05 — Original and hemoglobin heatmaps

Depends on T03/T04.

**Deliver:** E1–E5 and H1–H4; independent-axis controls; linked maps; slices/pins; criteria; consistent scales; masks; accessible units and fixed-variable contracts.

**Accept:** V01–V07, V09–V14 and AV01–AV10 pass. Constant net-uptake fields stay flat; axes/orientation are correct; source-associated criteria are not clinical classification. Inspect actual desktop/tablet/mobile screenshots and numerical DOM assertions. Do not replace the existing opening example with a drug-condition screen.

## T05R — Resistance heatmaps and pressure inspection

Depends on T05/T02R.

**Deliver:** R1–R6; exact reference policy, scope, closure, f/alpha, units and demand mode; visual native/shunt separation; pressure budget; distinct matched-baseline and frozen-global-anchor experiments.

**Accept:** RV01–RV10 and shared visual gates pass. Achieved flows are not extra independent controls. Normalized oxygen mode has no active Hb slider. PhysicalM stays fixed in Hb sweeps. The nominal nonlinear alpha1 case is not falsely described as fixed pressure. High state-space DO2 is never automatically labeled a positive intervention response.

## T06 — Comparisons, budgets and source laboratory

Depends on T05/T05R.

**Deliver:** C1–C12; paired gross/net oxygen budgets in the active units; mean-pressure budgets; same-scope2×2 ablation with interaction; source discrepancies and closure comparison. All four top-level views are functional.

**Accept:** V08 and RV05–RV10 pass. Original C1 Hb10→14 preserves fixed net uptake. C8 makes perturbation scope explicit. C9 does not confound mechanisms with scope. C11 Hb12→14 at fixed physicalM30.552 has no hidden flow feedback. Exact logarithmic/multiplicative decomposition is correct. Infeasible endpoints do not receive ordinary improvement deltas.

## T06R — Paired sensitivity ensemble and replay

Depends on T06.

**Deliver:** optional declared-demonstration ensemble with20,000 default draws; explicit distributions/dependence/seed; shared draws across profiles and structural variants; within-draw paired comparisons; complete failure counts; quantiles; eligible fractions and Monte Carlo standard errors; replay/downloads; progress/cancellation/generation control.

**Accept:** R25/RV11 pass. All requested denominators reconcile; exported-draw replay is verified. No independent baseline sampling, hidden rejection or patient-probability claims. Do not label the new ensemble a reproduction of source Table2. Changes to distributions require a new versioned assumption record.

## T07 — Exports, validation, accessibility and release-ready handoff

Depends on all implementation tickets.

**Deliver:** complete static app build; reproducible PNG/SVG/CSV/JSON; import/share/replay; numerical and source-validation reports; actual browser/accessibility/performance checks; deployment workflow.

**Accept:** all S/V/A/AV/R/RV implementation gates pass. Downloads match displayed values, masks, scales, source/provider versions, units, reference hash and criteria. Chromium, Firefox and WebKit are tested; actual Safari/mobile-device testing is reported separately. No PHI, secrets, unauthorized source-PDF redistribution or private CV files. Public release must be authorized explicitly. A clean local build does not imply a remote deployment.

## Final handoff

Identify the implemented commit/build, exact commands/checks run, source statuses, retained discrepancies, measured runtime/browser versions and performance, artifact paths and actual deployment status. Preserve all original/new fixtures and link their checks. Do not invent unsupported mechanisms or inaccessible source details to make a screen pass. This numerical reference pack is the starting contract, not completion of a browser-app implementation request.

---

# 09 — Executable reference pipeline and coding-agent workflow

Revision **1.2.0-spec**. This document distinguishes what runs in this pack from what the implementation tickets require the future application to do.

## 1. What is included and runs now

A standard-library Python pipeline executes the retained Barnea/Ahmed-derived reference checks, verifies a new resistance calculator against independently computed fixtures, writes source comparison tables, generates six numerical heatmap grids, and runs an explicitly assumption-based paired sensitivity ensemble. It has no network requirement, credentials, external API charges, patient data, application server, plotting dependency, or browser-runtime dependency.

From the unpacked root, with Python3.11 or newer and assertions enabled:

```bash
python scripts/run_reference_pipeline.py --output reports/my-reference-run
```

The output directory must be new or empty. The supplied full-run artifacts are in `reports/reference/full_run/`; use a different directory to rerun. The script resolves its own root, so it can also run from another working directory. It refuses output into the authoritative docs/config/code/fixture directories. It does not remove or overwrite existing results.

Defaults are six201×201 grids and20,000 draws shared across five profiles and four mechanism settings, yielding400,000 before/after evaluations. Each evaluation consists of a reference and perturbed circuit; these are not400,000 independent Monte Carlo draws. Timing and actual counts are recorded in the run report.

For a smaller explicitly labeled smoke run:

```bash
python scripts/run_reference_pipeline.py --quick --output reports/smoke-run
```

This uses41×41 grids and2,000 shared draws, while still running the independent numerical checks. `--grid-n` allows3–401; `--mc-n` allows1–100,000; `--seed` is recorded. `--quick` overrides the two resolution/count options and the report states the actual values.

To replay an already exported sampled-input file:

```bash
python scripts/run_reference_pipeline.py \
  --grid-n 41 \
  --replay-draws reports/reference/full_run/ensemble/draws.csv \
  --output reports/replay-run
```

Replay uses the file's row count, not `--mc-n`; the seed is not used to regenerate draws. Same code plus identical draws should reproduce deterministic ensemble results. Timestamps, timing, and explicitly different grid resolutions need not match. Malformed records are rejected or reported with an explicit pair status; the pipeline does not invent missing parameters. Treat replay as scientific configuration, not a patient-data import.

## 2. Components and their separation

| File | Role |
|---|---|
| `verification/check_golden.py` | Retained exact-Fraction Barnea reference checker. |
| `verification/check_ahmed_extension.py` | Retained indexed/criterion/derivative reference checker; Ahmed full-text status remains blocked. |
| `verification/resistance_reference.py` | New float64/standard-library reference calculator, including both explicit closures. NOT the final production engine. |
| `verification/resistance_oracle.py` | Independent60-digit Decimal pressure-root formulation; does not import the float64 solver. |
| `verification/savorgnan_golden_cases.json` |40 independently computed cases/1440 flattened reference values, committed as data. |
| `verification/savorgnan_source_claims.json` | Reported Tables1/3, baseline, source scope, known discrepancies; never overwritten by simulation. |
| `verification/check_resistance_extension.py` | Fixture/limit/identity/scope/rounding/derivative/randomized checks. |
| `scripts/run_reference_pipeline.py` | Thin orchestration, CSV/JSON grids, paired sensitivity simulation, reports and hashes. |

The source-table data are not golden values for every interpretation. A computed-vs-reported difference is retained rather than asserting all interpretations match. The golden fixture's provenance is independent Decimal arithmetic, not author code. The float64 reference result is not the oracle that generates its own expected data during tests.

When building the application, production modules must implement the specification independently and test against these fixtures. They may not call `verification/` as their production solver or duplicate physiology equations in JavaScript. The source-aware mass-balance core remains shared between browser and CPython execution. Model speed/precision changes require parity tests and must not change fixed-flow results.

## 3. Pipeline stages and generated artifacts

1. **Validate reference arithmetic.** Run old checkers from temporary copies because they write reports beside themselves; original fixtures and historic reports are not modified. Execute the new checker. Failure stops the pipeline with a nonzero exit code.
2. **Compare reported and computed tables.** Table1 is evaluated under native-only and whole-pathway audit semantics. Table3 is evaluated under nominal and circuit-secant closures. Store original source value, computed value, difference and reported-rounding status separately.
3. **Isolate mechanisms.** Generate each profile's2×2 alpha/nonlinearity table and interaction. NativeRp semantics remain fixed. Generate effect multipliers0–1.25 in steps.01 under both closures.
4. **Generate reference grids.** R1–R6 CSV rows are y-major then x-major, with x/y indices/values, flow/pressure, saturation/index/physicalDO2 and relevant deltas. Sidecars specify baseline policy, source status and resolution. All cells are direct solver evaluations, not interpolated images. R2 no-native-resistance invariance and grid orientation are checked.
5. **Run paired ensemble.** Generate or replay four input draws; reuse each draw across profiles/mechanism variants; solve its reference and perturbed state. Export complete draws/results, eligibility counts, quantiles, fractions and Monte Carlo standard errors. See Section08 for distributions and interpretation.
6. **Write reports and integrity manifest.** Reports identify actual commands/counts/timing and unrun source/application gates. SHA256 covers every output payload other than the self-referential output manifest itself.

Output layout:

```text
checks/
  checks_run.json
  ahmed_checks_run.json
  resistance_checks.json
  *.log
tables/
  table1_source_comparisons.csv
  table3_source_comparisons.csv
  mechanism_ablation.csv
  ablation_<profile>_<closure>.json
  effect_scale_curves.csv
grids/
  R1.csv ... R6.csv
  R1.json ... R6.json
ensemble/
  ensemble_definition.json
  draws.csv
  paired_results.csv
  summary.csv
pipeline_report.json
output_manifest.json
README.md
```

CSV empty metric values mean null/not evaluable, never numerical zero. Full unrounded floats are stored; source rounding is represented separately. Raw impossible saturation/content values remain in reference audit records, not the ordinary grid columns. Pressure/flow fields remain available for a solved circuit even if its requested oxygen consumption is infeasible.

The pipeline does not render six pictures and claim that this completes the heatmap UI. Actual image output, caption placement, color mapping, browser responsiveness, keyboard interaction and downloaded SVG/PNG equivalence remain app acceptance gates. Numeric grids and reference sidecars are provided to make those gates testable.

## 4. Actual checks versus future requirements

The new reference checker runs40golden cases,1440metric comparisons,2000seeded circuit states,80independent high-precision random-state checks,25Table3 rounding comparisons,10Table1 ratio/index comparisons, and additional limiting-case/invalid-input tests. The run-generated JSON is the authority on what passed; do not copy these intended counts into a success report after a failure.

Existing reference checkers cover15cases345metrics and8cases160metrics, each with2000seeded states; preserve their JSON reports separately from the new circuit checks. These are not three independent clinical validation datasets.

No claim is made here about the future app's strict parser, vectorized core, Pyodide parity, visual accuracy, runtime lock compatibility, browser tests, production build, accessibility, or deployment. Those must be implemented and tested. The pipeline uses the current installed CPython standard library; it records the actual version and does not pretend that a future locked application environment has already been tested.

## 5. New repository bootstrapping and agent sequence

Use the supplied master implementation request and complete integrated specification. The pack follows the previously verified `locke_cv` starter conventions; no access to private CV material is needed to understand it. Build the target repository from scratch with a clean source layout, declared environment locks, short factual AGENTS instructions and an explicit decision log.

Finish T02's oxygen core and T02R's flow provider/adapter before wiring diagrams or heatmaps. Source verification T00A/T00S is tracked separately from numerical implementation. Missing author code must not block assumption-labeled teaching experiments or be silently replaced by claims of exact reproduction. Scientific scope changes require an explicit decision; preserve all existing fixtures and their expected values.

Suggested execution graph:

```text
T00A Ahmed source gate ───────────────→ exact Ahmed source reproduction only
T00S Savorgnan source audit ──────────→ source-status/reproduction labels
T01 repository → T02 oxygen/indexing/criteria → T02R resistance/closures
                             ↓                       ↓
                        T03 source reports ←─────────┘
                             ↓
                        T04 shared-engine browser
                             ↓
                  T05 original/Hb maps + T05R circuit maps
                             ↓
                  T06 budgets/source workbenches/ablation
                             ↓
                  T06R paired ensemble and replay
                             ↓
                  T07 export/accessibility/release gates
```

T04 can begin after the scientific interfaces are stable while T03 reports are completed. No browser delivery claim precedes actual testing. Public licensing, publication authorization and deployment remain separate decisions, not assumed from a successful local numerical run.

## 6. Handoff checklist

The agent's final report identifies the implemented commit/build, exact tests run, numeric residual maxima, source comparisons/discrepancies, active closure/scope/demand conventions, browser/runtime versions, figure export checks, sampled-draw reproducibility and any remaining gates. Distinguish verified source text, inferred reconstructions, derived additions and unverified source code/figures. State whether a remote repository/deployment actually occurred. Do not close an implementation task with only this specification pack; this pack is the starting contract for that work.
