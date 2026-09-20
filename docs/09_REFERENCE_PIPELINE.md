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
