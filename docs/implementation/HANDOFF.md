# Active implementation goal: T02 through T04 complete; T05 in progress

The user activated EXECUTION_GOAL.md after T01. The persistent goal is active with no token
budget. Continue through the remaining stages and verified Pages deployment; do not restart setup.
Public repository: https://github.com/reblocke/single_vent_sim.

T01 is complete. Original evidence remains in setup-local-receipt.json,
clean-clone-receipt.json and reference-full-receipt.json. Original ZIP recovery and all 41
immutable working fixtures still pass. Source access audits remain independently unresolved.

T02 now implements the shared float64 oxygen kernel, both flow/capacity modes, kg/BSA adapters,
full ledger, feasibility and zero-demand statuses, conditional objectives, inverse ratio,
selected-criterion boundaries/intervals, continuous Hb sensitivities, vectorized grids/slices,
A/B comparisons, finite serialization and result schemas. New production tests use all preserved
V1/V2 fixtures plus 2,000 rational-oracle states and 2,000 indexed boundary/derivative cases.
No independent reference code is imported by production.

T02 is complete at code commit f437e911b545e11e87e311b08891ac1e1326fa71. See t02-receipt.json:
110 tests, strict checks, archive/fixture integrity, reference replay, root/subpath builds and
12 bootstrap browser tests passed from a clean clone. Exact-head Linux CI passed:
https://github.com/reblocke/single_vent_sim/actions/runs/35548285571.
All 40 T02 gates (S01–S22, A01–A18) have test-level evidence. Browser numerical parity and
application gates remain pending; bootstrap tests do not satisfy them.

T02R is complete at 04684b0bc48bcf64ebadcbca1528a5e59a38654a. See t02r-receipt.json:
160 total tests, 40 resistance fixtures, 2,000 seeded circuits and 80 additional 60-digit oracle
comparisons passed. Both closures, normalized/physical coupling, R1–R6 numerical interfaces,
matched reference families, frozen-anchor local responses and native-scope ablation are implemented.
Local and clean-clone aggregate checks and exact-head Linux CI passed:
https://github.com/reblocke/single_vent_sim/actions/runs/35549189059.
R01–R23 have test-level evidence; 63 of 108 total gates now pass.

T03 is complete at 550fc4f584d0c276e8c768652c19942629092df8. See t03-receipt.json:
175 tests and all aggregate checks passed locally and from a clean clone. Exact-head Linux CI:
https://github.com/reblocke/single_vent_sim/actions/runs/35550041695.
The 75 deterministic outputs were byte-identical on replay and from the fresh clone, including
13 PNG/SVG figures. All source discrepancies and unavailable-source statuses remain visible.
Matplotlib 3.11.2 is development-only; no plotting dependency enters the shared engine/browser.
S25 is passed, bringing the ledger to 64 of 108 gates. Figures were visually inspected; this does
not establish the future browser UI/export acceptance.

T04 is complete at 9b483e00d32079b25ad654242318ed8b6290a799. See t04-receipt.json:
223 Python tests, strict checks, reference replay, builds and 36 browser tests passed locally
and from a clean clone. Exact-head CI passed:
https://github.com/reblocke/single_vent_sim/actions/runs/35551019008.
Each browser/base combination checks 394 CPython parity cases. Maximum absolute difference
was 8.526512829121202e-14; statuses, metadata and nulls match exactly. Fourteen JSON/CSV round
trips, delayed/coalesced requests, useful errors, offline calculations and 200-request stress
checks pass. Collected Python object count did not increase. The visible inspector uses the
same engine. S23/S24/A19/A20/R24 pass: 69 of 108 total gates now have evidence.

T05 is in progress. The current explorer foundation implements E1–E5 and H1–H4, explicit
axes/fixed inputs, capacity/flow modes, body-size conversion, criterion editing/provenance,
linked physical coordinates, numeric/keyboard selection and pins, a scalar/boundary inspector,
fixed scales/refits, neutral masks, Cv0 boundary contours, and Sa/Sv criterion contours.
H3/H4 use vectorized kernels shared with the scalar boundary/sensitivity implementations.
The grid result schemas now describe the signed Cv constraint margin; it is not a main
physiological metric. JSON/CSV preserve it. No supplied fixture/schema input was replaced.

The foundation is verified at 6dfda925d0dad870b16b8cf17b8991dcfd82cde8, including exact-head CI
https://github.com/reblocke/single_vent_sim/actions/runs/35553457202 and clean-clone setup/check.
See t05-foundation-receipt.json. It has 237 passing Python tests and 397 CPython/browser parity cases.
New browser tests cover all nine scenes, constant uptake, Hb13 Sa/Sv distinction, mode and
basis conversions, exact log coordinates, responsive layouts, zero-demand/undefined maps,
all-infeasible states and rapid/invalid edits. Pending or invalid generations hide prior plots
and disable pinning. The implementation uses one worker and a bounded newest-request queue.
`make benchmark` rebuilds for the selected APP_BASE and measures 3 warmups then 30 settled
201×201 changes. The current Apple M2/8-GB Chromium measurement is about 182 ms worker p95
and 250 ms update-to-paint p95. This is a foundation measurement, not final app acceptance.
The original active-source assumptions and unavailable-source labels remain visible.

The next T05 checkpoint adds shared-Python conditional DO2/Sv and flow-constraint overlays,
exact one-parameter slice plots with separate objective markers, and runtime failure recovery
without duplicate explorer listeners. New browser checks verify objective/slice records,
asymmetric physical hover/pins, and criterion provenance without changes to core transport.
Visual review corrected long contour labels and clipped slice titles. The current code has
239 Python tests; make check passed with reference replay and 96 browser checks across
Chromium, Firefox and WebKit at both root and repository-subpath builds. Exact-head CI passed at 51304a63fdbc779b7c1edf0130238994995b6575:
https://github.com/reblocke/single_vent_sim/actions/runs/35554979023.

Remaining T05 acceptance work includes touch and sustained UI-update checks, derived-map
edge-case assertions, comparisons/source screens and downloads. Some T05 acceptance items
explicitly reference C1–C7/Paper laboratory/T07 exports: keep those gates pending until the
actual features exist. T05 remains in progress. Next implement T05R resistance views, T06
comparisons/source laboratory, T06R paired ensemble/replay and T07 exports/accessibility/final
verification. Five additional original/Hb browser gates are accepted at the verified overlay checkpoint:
V05, V09, V10, AV03 and AV04. The ledger now has 74 of 108 passed gates.

T05R remains in progress, with its explorer foundation verified at
5cc4be88ce7d8fd58ed78b628aea0a171a983adc. Exact-head CI passed:
https://github.com/reblocke/single_vent_sim/actions/runs/35556203479.
See t05r-foundation-receipt.json: 248 Python tests, 403 parity cases and 114 browser checks.
R1–R6, exact reference policies, closure controls, profile markers, exact point inspection and
paired pressure budgets are implemented. Mean-pressure components distinguish native, linear
shunt and quadratic shunt drops. Cross-view/export/ensemble RV gates remain pending.

T06 is now in progress in the working tree. C1–C12, pinned A/B transfers, reconciled oxygen
and pressure budgets, exact decompositions, source status and same-scope ablation are integrated.
The comparison checkpoint passed 272 Python tests and 12 focused browser tests. A resize race
was reproduced and repaired, including a test that an old comparison cannot replace a new preset.
The source laboratory is integrated but still undergoing verification: Barnea figures under both
capacity conventions, exact-versus-local inverse errors, Ahmed assumption-labeled examples,
Savorgnan Tables1/3 and SD01–SD09. Packaged offline metadata contains reported source values,
not expected fixture outputs. tests/test_source_lab.py verifies its exact canonical-source subset.
281 Python tests currently pass. Source-tab and comparison checks pass across three engines.
The inverse-error map, exact/local denominator distinctions, Figure5A boundaries and both
source discrepancy registers are implemented. Visual review corrected the phone colorbar;
a test preserves each pin's selected criteria and origin. The full aggregate check passed in reports/t06-aggregate-verified.log: 281 Python tests,
419 parity cases per browser and 81 browser checks at each base path (162 total).
Archive/fixture integrity, strict checks, scientific reports and reference replay also passed.
The comparison/source checkpoint is being committed; exact-head CI remains required.
CI timeout is now 45 minutes because the expanded two-base application suite exceeds the
original bootstrap workload. No application gate is advanced solely from the local run.
Ensemble drafts live under ignored reports/ensemble-draft only; they are not integrated.
Final model/export/ensemble screens remain follow-up work.

The active goal continues through all application gates and verified Pages deployment. No Pages
deployment has occurred. Provide progress/ETA updates at least every 15 minutes. Last estimate:
3–5 hours remaining, with ensemble, exports and final interaction/deployment checks the main work.
