# Question-led UI qualification receipt

Qualified source: `13d5295674b3b8b7795de8db01dde489773594f1`.
Baseline: `bcc43e6c7e0eaf20f624c2c1691c5cf584785645`.
Local qualification completed 2026-09-22 UTC (2026-09-21 America/Denver).
Delivery: [PR 3](https://github.com/reblocke/single_vent_sim/pull/3), implementing [issue 2](https://github.com/reblocke/single_vent_sim/issues/2).
The final delivery commit adds this evidence and documentation only. Successful latest [PR checks](https://github.com/reblocke/single_vent_sim/pull/3/checks) are required before merge; the PR records the final CI run and merge commit. This is not a deployment receipt.

## Result

The fresh experience asks what changes when Hb rises from 10 to 14 g/dL, with two shared-engine slices, A/B summaries and compact budgets. All previous map, comparison and source-workbench routes remain available. Five resolved oxygen-transport quantities show their roles and dependencies. Resistance calibration requires explicit Apply, percentage/multiplier controls share one value, and normalized/physical drafts remain distinct. Legacy UI-v1 saves reopen as their original maps; UI-v2 saves record the presentation and inactive drafts. Criteria remain analysis settings.

Only the presentation registry and UI-state validator changed inside the Python package. Scientific engine equations, original presets, independent fixtures, archives, source discrepancies and runtime locks are unchanged. TypeScript calls the shared Python engine; it adds no physiology solver.

## Verification

A fresh GitHub clone installed its own locked environment and browser binaries without original attachment paths. After the final correction it ran `make setup`, `make check`, `make reference-replay-full`, `make benchmark`, and `git diff --exit-code`, all successfully. Ruff, mypy and strict TypeScript checks passed. `make check` includes integrity, production science reports, quick reference replay and production ensemble replay.

| Evidence | Result |
|---|---|
| Python/schema/scientific tests | 328 passed |
| Browser suites | 180 passed at `/`; 180 passed at `/single_vent_sim/`; zero skipped, flaky or unexpected results |
| Engines | Chromium 153.0.8010.12, Firefox 155.0, WebKit 26.6 |
| Shared-engine parity | 430 cases in each browser/base combination; maximum absolute difference 8.526512829121202e-14 |
| Reference replay | Six 201×201 grids; 20,000 draws / 400,000 paired evaluations; all 29 compared payloads byte-identical |
| Repeated repaired R4 sequence | Nine passes: three per browser |
| Visual/accessibility evidence | Desktop, 1024/390-pixel layouts, keyboard/touch emulation, 200% layout magnification; inspected PNG exports and screenshots |
| Prescribed performance | Worker p95 175.5 ms; painted p95 249.7 ms |
| Resistance performance | Worker p95 118.0 ms; painted p95 199.9 ms |

Runtime: CPython 3.14.2, Pyodide 314.0.7, NumPy 2.4.6, Node 24.21.0. Performance used Apple M2, 8 GB RAM, Chromium, 201×201 grids, three warmups followed by 30 settled updates. Measured transfer was 12,145,423 Content-Length bytes for each benchmark; cold initialization plus first plot was approximately 3.1 seconds. These are local observations, not universal performance promises. Both budgets (500 ms worker / 1500 ms painted) passed. Prior hardening receipt measurements remain historical, without a claim of controlled comparative speedup.

Machine-readable results are in [acceptance.json](acceptance.json), [stages.json](stages.json), and [evidence](evidence/). [Visual review](evidence/VISUAL_REVIEW.md) identifies the inspected artifacts; [hashes](evidence/sha256.json) bind them. Browser qualification contains report hashes, runtime versions, parity and worker-object counts. Reference and science reports retain their original scope labels: the independent reference runner does not qualify the production application.

## Superseded attempts and correction

An earlier local run was interrupted by a 934-second clamshell sleep; another clone run was stopped to take updated source. A supplementary subpath preview initially retained root-path server configuration and was restarted correctly. None is counted as qualification.

Full testing of `afdfcce` exposed R4 share-link/save failures in all three browsers (177 other checks passed). A redundant delayed resize update could disable export during a click. `13d5295` tracks the rendered width, cancels obsolete resize work, and marks actual pending resize work immediately. The existing regression then passed nine repeated focused runs and both complete clean-clone browser suites. Earlier focused UI runs are retained as supporting evidence, not substitutes for final full qualification.

## Remaining limits

Clinician comprehension review is **pending** and cannot be passed from automated tests or screenshots. The handoff contains its task-based script. T00A/T00S source-access limitations and SD01–SD09 remain unchanged; unavailable source material is not successful replication. WebKit and touch emulation do not establish physical-device or actual screen-reader usability. This work makes no clinical-validity claim.

No deployment was performed. Pages remains manual, and the hosted application is the prior qualified release recorded in `evidence/before-build-info.json`.
