# 06 — Complete dependency-ordered implementation pipeline

Revision **1.2.0-spec**. These are finished-product requirements for a new repository. The included reference pipeline is executable; the production application still needs implementation. Preserve all original Barnea and Ahmed requirements. Section08 adds a separate resistance provider, not hidden changes to the fixed-flow model.

## T00A — Ahmed source-contract verification

**Evidence:** the abstract and bibliographic record were verified in the prior revision; full text was unavailable.

**Deliver:** a traceable methods/equation/figure inventory, including coefficients, pulmonary venous saturation, indexing, sweep grids and any additional constitutive assumptions from the actual source.

**Accept:** source-backed comparisons and an explicit evidence status. Until the full source is retrieved, retain `blocked_source_unavailable` and disable exact-Ahmed-reproduction labeling. Assumption-labeled teaching experiments may proceed. Do not fit unknown coefficients or invent figure definitions.

## T00S — Savorgnan source audit and discrepancy preservation

**Deliver:** immutable baseline and Tables1/3 registry; native-versus-whole-pathway distinction; SD01–SD09; source-image, author-code and original-sampling access statuses; independent table comparisons.

**Accept:** Table1 is not silently reconciled. Source statements, inferred reconstructions and the newly derived closure remain distinct. Keep author-code, rendered-figure and original-Monte-Carlo audits unperformed until actually completed. Retrieved source text supports the declared reconstruction, not claims about uninspected executable code.

## T01 — New repository and reproducible environment

**Deliver:** Python source layout; concise factual AGENTS/README; environment locks and pinned browser assets; TypeScript shell; legacyV1/indexedV2 scenarios plus the new resistance schema; CI. Follow the recorded starter conventions without copying private CV or patient material.

**Accept:** clean installation, lock checks, package import and bounded schema parsing work. Implement real format/lint/typecheck/test/build interfaces and document only commands that run. Browser-runtime loading is a compatibility gate, not numerical validation. Licensing, authorship and public-release authorization remain explicit maintainer decisions.

## T02 — Oxygen, indexing and criterion engine

Depends on T01.

**Deliver:** one pure oxygen-conservation engine; both fixed-flow parameterizations; direct/Hb capacity modes; complete oxygen ledger; feasibility/zero-demand states; original inverse-ratio and optimum functions; nativeBSA adapters; selected-criterion boundaries/intervals; continuous Hb sensitivities. Extend the typed reference unit to absolute when integrating T02R, without changing existing results.

**Accept:** S01–S22 and A01–A18 pass, including preserved independent fixtures, conservation and unit tests. No UI imports, hidden patient defaults, clipping, or clinical thresholds. Original source discrepancies remain.

## T02R — Resistance provider, closures and coupling

Depends on T02.

**Deliver:** frozen circuit reference and nonlinear calibration; nativeRp default and restricted whole-pathway audit; stable linear/quadratic flow split; nominal and newly derived circuit-secant output closures; pressure diagnostics; normalized/physical oxygen adapter; separate hemodynamic, oxygen and criterion statuses; R1–R6 numerical interfaces.

**Accept:** R01–R23 pass, including40 independent fixtures,2000 seeded states and high-precision oracle checks. Preserve alpha0, alpha1 and f0 limits; distinguish delivery index from physical flux; hold physicalM fixed in Hb sweeps. The production solver must not call reference helpers as its implementation. No arbitrary output cap, viscosity law, unequal-outlet shortcut, pulsatile model or clinical drug prediction.

## T03 — Source reports and reproducible numerical workflow

Depends on T02/T02R. Source labels are governed separately by T00A/T00S.

**Deliver:** original Barnea figure calculations under both capacity conventions; Ahmed-inspired examples and criteria; all Savorgnan table comparisons; same-scope2×2 mechanism ablation; effect-scale curves; separate reported/computed columns and discrepancy registers. Deterministic CLI exports work without a notebook or browser.

**Accept:** original landmarks, parameter ordering and infeasible-state handling remain correct. All25 Table3 rounded cells agree with the nominal reconstruction; Table1 agreement is claimed only for supported columns. Unavailable exact-Ahmed, source-image, author-code and source-Monte-Carlo reproductions remain gated. Known discrepancies do not disable unrelated tests or trigger hidden parameter changes.

## T04 — Static application and shared Python execution

Depends on T02/T02R; can overlap source-report completion.

**Deliver:** static TypeScript/Vite shell executing the packaged Python model in a Pyodide module worker; atomic configuration generations; bounded inputs/imports; useful loading/retry/error states; source and preset metadata.

**Accept:** S23–S24, A19–A20 and R24 pass. Scalar/grid/browser parity is demonstrated, stale responses cannot repaint, root and repository-subpath builds load, and memory/proxy stress tests pass. No alternate production physiology implementation in JavaScript. Report actual runtime/browser versions.

## T05 — Original and hemoglobin heatmaps

Depends on T03/T04.

**Deliver:** E1–E5 and H1–H4; independent-axis controls; linked maps; slices/pins; criteria; consistent scales; masks; accessible units and fixed-variable contracts.

**Accept:** V01–V07, V09–V14 and AV01–AV10 pass. Constant net-uptake fields stay flat; axes/orientation are correct; source-associated criteria are not clinical classification. Inspect actual desktop/tablet/mobile screenshots and numerical DOM assertions. Do not replace the existing opening example with a drug-condition screen.

## T05R — Resistance heatmaps and pressure inspection

Depends on T05/T02R.

**Deliver:** R1–R6; exact reference policy, scope, closure, f/alpha, units and demand mode; visual native/shunt separation; pressure budget; distinct matched-baseline and frozen-global-anchor experiments.

**Accept:** RV01–RV10 and shared visual gates pass. Achieved flows are not extra independent controls. Normalized oxygen mode has no active Hb slider. PhysicalM stays fixed in Hb sweeps. The nominal nonlinear alpha1 case is not falsely described as fixed pressure. High state-space DO2 is never automatically labeled a positive intervention response.

## T06 — Comparisons, budgets and source laboratory

Depends on T05/T05R.

**Deliver:** C1–C12; paired gross/net oxygen budgets in the active units; mean-pressure budgets; same-scope2×2 ablation with interaction; source discrepancies and closure comparison. All four top-level views are functional.

**Accept:** V08 and RV05–RV10 pass. Original C1 Hb10→14 preserves fixed net uptake. C8 makes perturbation scope explicit. C9 does not confound mechanisms with scope. C11 Hb12→14 at fixed physicalM30.552 has no hidden flow feedback. Exact logarithmic/multiplicative decomposition is correct. Infeasible endpoints do not receive ordinary improvement deltas.

## T06R — Paired sensitivity ensemble and replay

Depends on T06.

**Deliver:** optional declared-demonstration ensemble with20,000 default draws; explicit distributions/dependence/seed; shared draws across profiles and structural variants; within-draw paired comparisons; complete failure counts; quantiles; eligible fractions and Monte Carlo standard errors; replay/downloads; progress/cancellation/generation control.

**Accept:** R25/RV11 pass. All requested denominators reconcile; exported-draw replay is verified. No independent baseline sampling, hidden rejection or patient-probability claims. Do not label the new ensemble a reproduction of source Table2. Changes to distributions require a new versioned assumption record.

## T07 — Exports, validation, accessibility and release-ready handoff

Depends on all implementation tickets.

**Deliver:** complete static app build; reproducible PNG/SVG/CSV/JSON; import/share/replay; numerical and source-validation reports; actual browser/accessibility/performance checks; deployment workflow.

**Accept:** all S/V/A/AV/R/RV implementation gates pass. Downloads match displayed values, masks, scales, source/provider versions, units, reference hash and criteria. Chromium, Firefox and WebKit are tested; actual Safari/mobile-device testing is reported separately. No PHI, secrets, unauthorized source-PDF redistribution or private CV files. Public release must be authorized explicitly. A clean local build does not imply a remote deployment.

## Final handoff

Identify the implemented commit/build, exact commands/checks run, source statuses, retained discrepancies, measured runtime/browser versions and performance, artifact paths and actual deployment status. Preserve all original/new fixtures and link their checks. Do not invent unsupported mechanisms or inaccessible source details to make a screen pass. This numerical reference pack is the starting contract, not completion of a browser-app implementation request.
