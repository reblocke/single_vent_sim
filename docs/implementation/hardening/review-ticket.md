# Targeted hardening ticket — single_vent_sim

Audit baseline: main `e807bc511f28fe465a33892d4d1240c2324ffef6`, runtime `76e401a20f7f92a2878004f824b84f8f083ae63f`.

Read AUDIT.md and the repo's current AGENTS.md. Confirm whether subsequent commits already fix each issue before editing. Preserve unrelated working-tree changes and all original model/source distinctions. This is a correction/presentation ticket, not authorization to introduce additional physiology.

## End state

The existing shared Python oxygen/circuit engine remains numerically unchanged for ordinary valid reference cases. Every offered resistance input has an explicit active/derived/inactive role. Every accepted log-axis configuration plots and inspects the same physical point. Exports work after initialization without network dependence. Boundary and bounded-optimum reports agree with the numerical contract. The highest-value sensitivity plots show small modeled changes clearly without hiding scale choices or implying clinical targets.

## A. Repair resistance experiment semantics and coordinates

### A1 — R4 active inputs

Root: resistance_experiments._batch overrides rp/rshunt multipliers when absolute current-resistance axes exist; resistance.ts still offers these multipliers as held inputs.

- Hide/disable these inactive controls and explain the derived multipliers.
- Make axis/request validation reject or explicitly normalize incompatible aliases. No silently unused parameter/axis.
- Keep local_rp_multiplier separate. Default R4 remains native Rp ×0.55, same global anchor and shunt calibration.
- An optional editable local multiplier must change that parameter, not an overwritten baseline control, and must be serialized in the complete UI/export configuration if introduced.
- Do not multiply the absolute value and shadowed multiplier together as an accidental double perturbation.

Tests: current reproducer shows rp multiplier1->.2 and shunt multiplier1->.3 have no effect. Add UI tests verifying these fields are absent/disabled/explicitly derived. Reject aliased two-axis requests. Verify a real local multiplier change changes B while retaining A and reference calibration. Retain intended mathematical invariances.

### A2 — Resistance log coordinates

Root: resistance.ts.update assigns physical coordinates to plot_coordinates, but plots.ts decodes log positions with10**position.

Use one invertible transform contract for prescribed/resistance grids, ticks, cell coordinates, hover/click, crosshairs and exports. Prefer reusing the existing prescribed plot-coordinate policy. If unsupported log configurations are instead disallowed, reject them consistently before rendering and document the narrowed contract; do not accept-and-misrender.

Tests: import log-x/log-y/log-log R1/R3 or compatible resistance states, select a known cell, and compare its physical coordinates and every displayed state metric with the engine's exact point. A physical.5 on a log axis must be recovered as.5, never3.16227766. Check PNG/SVG/CSV/JSON consistency. Run actual browser tests, not only worker parity.

## B. Make initialized exports independent of network

Root: export.ts.bundle awaits a new build-info.json fetch.

Inject/cache immutable initialization metadata already associated with the loaded wheel and runtime. Preserve all existing generation/revision guards and hashes. Do not silently substitute a different build manifest if a deployment changes during a session.

Test: after initialization and a successful calculation, block all network requests and export a full figure/data bundle. It must succeed and identify the loaded build. This was a static contract finding in the audit; verify the actual browser failure/success path during implementation.

## C. Correct boundary and degenerate optimization reporting

### C1 — Numerical boundary policy

Use consistent tolerance semantics for forward Cv classification and the optimum existence condition A versus4M. Preserve raw outputs and distinguish boundary from admissible interior.

Regression: Hb6,kappa1.34,Qt250,r1,Spv.99,M=math.nextafter(4.97475,math.inf). The current forward state iszero_venous_boundary while conditional_optimum saysno_admissible_ratio. Return coherent classifications within the specified tolerance. Also test genuinely infeasible values beyond tolerance. Review selected-criterion tangencies with dedicated cases rather than loosening inequalities indiscriminately.

### C2 — M0 with finite bounds

At M0,positiveCpv,Qt400,Hb10,kappa1.34,Spv.98,bounds[.5,2], return the bounded DO2 maximum at r=.5,DO2=35.01866666666667. Keep r->0 supremum only for the unbounded positive-r domain. Sv isconstant/no_unique_maximum. For zero content both objectives areconstant and not unique.

## D. Improve physiological explanation without adding a model

- Add an explicit zero-change contour for response heatmaps and scene-appropriate, declared delta scales. Refit already exists; preserve shared/frozen scale behavior rather than auto-rescaling after every edit.
- Put a compact interpreted physiological summary before the full raw metric/residual table.
- Make R4 state A versus local A->B response explicit in plot titles, captions and exports.
- Consider a selectable joint-criterion category view, with infeasibility separate from subcriterion but admissible states.

Do not remove raw scientific exports, reference fixtures, source discrepancies, normalized/physical separation, or the ability to inspect assumptions.

## Acceptance and handoff

All original scientific fixtures remain passing. Add focused regression tests for A–C; run Python tests, locked build, actual browser parity and interface tests, export checks, and responsive screenshots. Reopen/update the affected acceptance-matrix entries rather than leaving all gates marked passed while their new regressions fail. Document exactly which checks were executed, the runtime/environment, resulting commit and real deployment status.

Do not broaden this into an architecture rewrite, new dependency framework, drug-effect predictor, transfusion model, or clinical validation claim.
