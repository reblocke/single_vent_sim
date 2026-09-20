# 04 — Acceptance tests and definition of done

All mandatory gates below must pass for v1 release. The existing seed verifier only checks reference-fixture arithmetic; it does not satisfy the future app's gates.

## 1. Numerical tolerances

For ordinary float64 state/flux/content identities use `abs(error) <= 1e-10 * max(1, abs(reference))`. For CPython/browser metric parity use `atol=1e-10`, `rtol=1e-10`; status masks must match exactly except explicitly documented tolerance-boundary cases, which have their own fixtures. Tests of rounded UI text use the formatter's declared precision, not full-precision numeric tolerance.

Finite-difference derivatives use centered differences in admissible interior states away from singular denominators, with analytic agreement within relative 1e-5. Analytic optimum versus an independent bounded scalar search must agree in r within 1e-6 when an interior optimum is present. Do not demand that a coarse displayed heatmap cell contain the exact analytic maximum.

Golden expected results must be committed independently from the production solver. A test that regenerates its own expected values from that solver is not a regression test. The supplied exact-arithmetic verifier is an independent reference helper, not production code to call from the app.

## 2. Scientific unit and property gates

| ID | Required test |
|---|---|
| S01 | Both flow input modes resolve to identical states for equivalent Qp/Qs and Qt/r. |
| S02 | Capacity=Hb×kappa in Hb mode; direct B has no hidden Hb conversion. |
| S03 | Factors of 100 are correct for mL blood/kg/min and content per dL. Include a hand-calculated non-unit-flow fixture. |
| S04 | Systemic oxygen balance, pulmonary oxygen balance, complete-mixing identity, and closed-form DO2 match independently. |
| S05 | For admissible positive-demand states, net lung uptake equals M, systemic extraction equals M, DO2=M+venous return, and OER×Omega=1. |
| S06 | Fick ratio reconstructed from model saturations equals prescribed r except degenerate zero-demand/zero-gap cases. |
| S07 | Hb 10→14 fixed-flow example matches every supplied content, saturation, flux, and extraction result. |
| S08 | Increasing Hb at fixed flows/M/Spv raises Sa, Ca, Sv, DO2; Ca and DO2 changes equal analytic derivatives; net lung uptake remains unchanged. |
| S09 | Varying Qs at fixed Qp/M/Spv/B preserves Sa but changes DO2 and Cv. |
| S10 | Varying r at fixed Qt increases Sa but produces the specified conditional DO2 maximum, with admissibility masking. |
| S11 | Increasing M at fixed flows decreases DO2 and raises net lung uptake until feasibility fails. |
| S12 | Scaling Qp, Qs, M together preserves contents/saturations/OER/Omega and scales fluxes. |
| S13 | M=0 yields equal contents/saturations, net uptake/use=0, OER=0 when DO2>0, and undefined Omega/Fick estimate. |
| S14 | M=0 and Spv=0 yield degenerate zero-oxygen state, not an OER or Omega of zero by arbitrary convention. |
| S15 | M=positive and Spv=0 is infeasible; invalid input numbers/domain combinations are rejected. |
| S16 | Cv<0, including a plausible-looking Sa with high r, is masked and never clipped into a feasible point. |
| S17 | M at the zero-venous limit yields a distinctly labeled boundary; values on either side classify correctly with stated tolerance. |
| S18 | A<4M has no admissible r; A=4M has the sole boundary r=1; A>4M yields the analytic reciprocal root interval. |
| S19 | Conditional optimum matches derivative/search; no formal interior optimum is promoted when no admissible state exists. |
| S20 | Spv inverse demo matches exact ratios and distinct finite-error denominators; local sensitivity has the correct negative sign. |
| S21 | Impossible inverse ordering or denominator <=0 yields no finite estimate, not a clipped/high number. |
| S22 | At least 2,000 seeded randomized parameter states verify identities and feasibility against an independent scalar oracle. Include all-infeasible grids. |
| S23 | Scalar, vectorized, and browser outputs agree; mesh orientation is `[y,x]` and transforms preserve physical coordinates. |
| S24 | JSON/CSV round trips preserve input mode, coefficient, precision, undefined values, feasibility, and grid indexing. |
| S25 | Source discrepancy fixtures retain the stated 22 versus calculated 20.7 distinction and never silently tune B to match a picture. |

## 3. Reference checkpoints

Full values appear in `verification/golden_cases.json`. These summaries are calculated examples, not patient data.

| Case | DO2 (mL/kg/min) | Sa (%) | Key result |
|---|---:|---:|---|
| Hb10, Qp=Qs200, Spv=.98, M6, kappa1.34 | 20.264 | 75.6119402985 | net pulmonary uptake 6 |
| Same except Hb14 | 30.7696 | 82.0085287846 | net pulmonary uptake still 6 |
| Baseline except Qs100 | 10.132 | 75.6119402985 | same Sa, half delivery |
| Baseline except M9 | 17.264 | 64.4179104478 | net pulmonary uptake rises to 9 |
| Paper B22, Spv=.96, Qt450, M9, Sa=.80 | 34.2 | 80 | different flow split from next row |
| Same source reconstruction at Sa=.85 | 14.6045454545 | 85 | higher Sa, lower delivery |
| B22, Spv=.96, Qt300, r10, M9 | masked | masked (raw Sa=81%) | raw DO2=4.86 and Cv<0; not an admissible state |

## 4. Visual and interaction acceptance gates

| ID | Required behavior |
|---|---|
| V01 | E1–E5 presets load the exact configured independent inputs, fixed inputs, outputs, and explanatory contract. |
| V02 | Both plots, inspector, captions, and state export reference one configuration generation. Artificially delay worker responses and prove stale responses cannot repaint. |
| V03 | Hover/pin A/B uses the same physical state on both plots; asymmetric known x/y fixtures expose transposition or log-coordinate bugs. |
| V04 | Masks and contour boundaries match engine states. No contour crosses an invalid region; no negative saturation is rendered as a real physiologic result. |
| V05 | Net uptake on E1 is visually constant over admissible cells, with no false gradient from tiny roundoff. |
| V06 | In E3, the Sa field is invariant along Qs at fixed Qp within the admissible region. |
| V07 | Fixed absolute color scales and shared A/B scales work; out-of-range values are disclosed; delta scale centered on zero. |
| V08 | C1–C4 comparisons show the prescribed changes and all oxygen-ledger identities with correct units and rounding. |
| V09 | Capacity switching does not combine mutually inconsistent B/Hb/kappa constraints or retain an inactive Hb axis. |
| V10 | Ratio/independent-flow mode switching preserves the selected state and updates what is held fixed. |
| V11 | Folded paper curves preserve parameter order and break at masked intervals rather than sorting their x metric. |
| V12 | All-infeasible, zero-demand, undefined-index, worker-loading, worker-error, and malformed-import states have useful non-crashing displays. |
| V13 | Keyboard, touch, and numeric input alternatives work. Units and important results are not available only on hover. |
| V14 | Desktop/tablet/mobile screenshots have no clipped legends, overlap, unlabelled controls, or horizontal page overflow. |
| V15 | Downloaded PNG/SVG and CSV/JSON contain the same inputs, colorscale, masks, values, and version as the visible plot. |
| V16 | Color/appearance comparisons are not inferred solely from screenshot hashes; tests also assert numerical/DOM results. |

## 5. Scientific reproducibility and source gates

`make validate-science` generates a report with test IDs, numeric residual maxima, fixture version/hash, all declared constants, masked-state count per reference plot, independently checked optima, source numerical comparisons, and unresolved source discrepancies. Source text values and computed values occupy separate columns. A known source discrepancy is an explicitly documented finding, not a silently failed regression test or excuse to disable other tests.

`make reproduce` regenerates Figures 2, 3, 4, 5A, 6, 7 under both direct-capacity conventions plus the exact-versus-local Spv-error demonstration. Raw formal continuations, when exported, have an explicit flag. Independent source numbers must remain immutable reference fields.

## 6. Software and release gates

- Clean checkout + documented prerequisites + `make setup && make check` succeeds without preexisting untracked scientific files.
- Locks are consistent and runtime assets are versioned/hashed. No `latest`/`dev` asset imports.
- The importable numerical package works without a browser or plotting library.
- The browser uses the packaged Python engine; parity tests cover fixtures, random states, and selected grid coordinates.
- Chromium, Firefox, and WebKit pass functional/parity tests. Actual Safari/mobile-device testing is reported separately and not inferred from WebKit alone.
- Static build works at root and repository subpath and emits no unexpected cross-origin requests while manipulating already-loaded states.
- Performance measurements meet the declared benchmark thresholds or release remains blocked with an accurate report. No silent resolution downgrade.
- Generated examples and golden fixtures contain no PHI, secrets, signed URLs, or private CV files. Source PDF is not automatically redistributed.
- README contains verified install/run/test/build/export instructions, source scope, limitations, and an explicit nonclinical-validation statement.
- Licensing/author metadata and publication authorization are resolved before public release. Deployability does not imply an actual remote deployment occurred.

## 7. What does not count as completion

A screenshot-only mockup; a notebook that does not run from a clean environment; hand-coded example images disconnected from the engine; tests that assert only page loads; a heatmap that hides impossible states with clipped saturation; high unit-test coverage without unit/identity tests; a second JS solver with unverified drift; or a purportedly exact paper reproduction that silently changes constants.

## 8. v1.1 additional acceptance gates
The original S01–S25 and V01–V16 remain mandatory. Add A01–A20 and AV01–AV10 from Section 07. The source gate T00A is reported separately: source-unavailable is neither a passed replication test nor a reason to silently drop the amendment. An explicitly labeled educational extension can be built and tested while this source gate remains pending. A source-faithful Ahmed reproduction cannot be released or described as complete until the gate passes.

Run both reference helpers in this specification pack. Their reports test reference arithmetic only; the production tests, browser runs, schemas, accessibility, and exports still require actual implementation.

## 9. v1.2 additional acceptance gates
Add R01–R25 and RV01–RV12 from Section08. The runnable reference reports are evidence of the checks actually listed in them, not blanket satisfaction of the production/browser gates. The new fixtures use an independent60-digit pressure-root oracle; original golden files are preserved unchanged. Keep source Table1 discrepancy and Table3 consistency visible simultaneously. No aggregate green status may hide unperformed author-code/figure/sampling audits or the inherited Ahmed source gate.

A clean-unzip reference run must succeed offline with only the documented Python standard library. Replay sampled inputs and compare deterministic ensemble payloads. Verify all archive paths/hashes and that source/patient files are not inadvertently included. Reference output hashes exclude their own manifest and separate timestamps from deterministic numeric content.
