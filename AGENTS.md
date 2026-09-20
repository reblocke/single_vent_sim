# Repository instructions

## Scope and authority

This repository implements Parallel Circulation Oxygen Explorer. T01 is the environment/input-contract checkpoint; scientific engines and the application remain subsequent work. Read README, docs/implementation/HANDOFF.md, and docs/implementation/stages.json before continuing.

The user's approved choices govern repository identity (reblocke/single_vent_sim), MIT licensing, public GitHub synchronization, and eventual Pages deployment. The attached master prompt describes the eventual product; it does not authorize starting the later goal during setup. Modular docs/01–10 and docs/SOURCES.md govern scientific acceptance; root specification/ticket copies are generated reading copies. Regenerate them with scripts/compile_specification.py after modular changes.

## Change discipline

Before nontrivial changes, state assumptions, a short plan, silent-failure risks, and verification. Keep diffs small. Preserve original fixtures/configurations and source claims; never regenerate expected values from production code. Verification and reference calculators must not be production dependencies. TypeScript orchestrates/renders; it must not implement a second physiology engine.

Use the locked shared Python package in CPython and the Pyodide module worker. Keep source fidelity, numerical verification, browser checks, and clinical validity distinct. Preserve unavailable-source statuses and source discrepancies. Do not add clinical targets/dosing, hidden patient defaults, saturation clipping, demand adjustment, or unrequested physiology.

## Commands and handoff

`make setup`, `make browser-install`, `make check` verify the bootstrap. `make reference-replay-full` verifies the full independent reference workflow. `make restore-reference` recovers the complete original pack under ignored reports/. Browser tests must cover / and /single_vent_sim/. `make fmt` rewrites owned code only; the original verification scripts are preserved and excluded from formatting.

Update docs/implementation stage/gate evidence at meaningful checkpoints, not every turn. Never mark a scientific gate passed from the reference runner alone. Complete local/clean-clone checks and CI before calling a checkpoint complete. Pages remains disabled until all application gates have evidence; source-only access limitations may remain explicitly unresolved.
