# Active implementation goal: T02 complete; T02R in progress

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

Next: implement T02R from docs/08 and its independent fixtures/oracle. The vectorized circuit, oxygen coupling and
R1–R6 numerical interfaces now pass 50 resistance tests (160 total). These include 40 preserved
60-digit fixtures, 2,000 seeded circuits, 80 additional Decimal-oracle checks, both closures,
normalized/physical units, ablation, matched references and frozen-anchor local responses.
Local lint/type/integrity checks pass. Record fresh-clone and exact-head CI before marking
T02R and R01–R23 complete. No new browser numerical-parity gate has been passed. Continue T03/T04, T05/T05R, T06/T06R and T07 in dependency order. T00A/T00S source
access limitations may remain visibly unresolved, but may never become successful source replication.
Update stage/gate records at meaningful checkpoints and synchronize verified changes to GitHub.

Provide stage updates and an ETA at least every 15 minutes during the active goal. The last estimate
was roughly 6–9 hours remaining, with most uncertainty in interaction, ensemble and live-browser
verification. Pages remains undeployed and blocked by the acceptance ledger until all application
gates have traceable evidence.
