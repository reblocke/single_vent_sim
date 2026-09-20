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
