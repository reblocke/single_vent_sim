# Active implementation goal: T02, T02R and T03 complete; T04 in progress

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

Next is T04 shared-engine worker protocol and browser parity. A local uncommitted commands.py
currently provides an explicit bounded JSON operation dispatcher; it needs parser/dispatch tests
and final review before browser integration. Add compute messages to web/src/protocol.ts and
worker.ts using dispatch_json, with no dynamic user code or expression evaluation. Extend
RuntimeClient to coalesce pending requests and prevent stale replies repainting. Retain loading,
retry and same-origin assets. Test all fixtures, seeded cases, grids, criteria boundaries,
sensitivities and resistance results against CPython in all three browsers and both URL bases;
add repeated-request/proxy cleanup and delayed-response tests. The shell may expose a small model
checkpoint inspector while T05 builds the full application. Keep S23/S24/A19/A20/R24 separate until
actual browser/export evidence exists. Continue T04, T05/T05R, T06/T06R and T07 in dependency order. T00A/T00S source
access limitations may remain visibly unresolved, but may never become successful source replication.
Update stage/gate records at meaningful checkpoints and synchronize verified changes to GitHub.

Provide stage updates and an ETA at least every 15 minutes during the active goal. The last estimate
was roughly 5–8 hours remaining, with most uncertainty in interaction, ensemble and live-browser
verification. Pages remains undeployed and blocked by the acceptance ledger until all application
gates have traceable evidence.
