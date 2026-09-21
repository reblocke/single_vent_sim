# Active implementation goal: T02 and T02R complete; T03 in progress

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

Next is T03 source reports and make validate-science/reproduce. A local uncommitted paper.py draft
has the Barnea curve and source-comparison calculations, but needs lint/type fixes, tests, CLI
orchestration, deterministic exports and figure rendering/inspection. Preserve reported versus
computed fields and all source discrepancies. It reuses the production kernel and never imports
reference implementations. No plotting dependency has been added yet. Continue T03/T04, T05/T05R, T06/T06R and T07 in dependency order. T00A/T00S source
access limitations may remain visibly unresolved, but may never become successful source replication.
Update stage/gate records at meaningful checkpoints and synchronize verified changes to GitHub.

Provide stage updates and an ETA at least every 15 minutes during the active goal. The last estimate
was roughly 5–8 hours remaining, with most uncertainty in interaction, ensemble and live-browser
verification. Pages remains undeployed and blocked by the acceptance ledger until all application
gates have traceable evidence.
