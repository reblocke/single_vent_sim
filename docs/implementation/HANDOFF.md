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
Chromium, Firefox and WebKit at both root and repository-subpath builds. Exact-head CI is
required after this checkpoint is committed.

Remaining T05 acceptance work includes touch and sustained UI-update checks, derived-map
edge-case assertions, comparisons/source screens and downloads. Some T05 acceptance items
explicitly reference C1–C7/Paper laboratory/T07 exports: keep those gates pending until the
actual features exist. T05 remains in progress. Next implement T05R resistance views, T06
comparisons/source laboratory, T06R paired ensemble/replay and T07 exports/accessibility/final
verification. Resistance work is currently drafted only under ignored reports/resistance-draft/;
those files are not tested production code. No gate is passed by that draft. Pages remains
undeployed and all application gates beyond the 69 accepted through T04 remain pending.

Provide stage updates and an ETA at least every 15 minutes during the active goal. The last estimate
was roughly 4–6 hours remaining, with most uncertainty in interaction, ensemble and live-browser
verification. Pages remains undeployed and blocked by the acceptance ledger until all application
gates have traceable evidence.
