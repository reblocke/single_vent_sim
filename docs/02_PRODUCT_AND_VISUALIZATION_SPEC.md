# 02 — Product and visualization specification

## 1. Finished application

The deployed page is a standalone static educational/research app titled **Parallel Circulation Oxygen Explorer**. The opening view is functional, not a landing-page mockup. It starts in hemoglobin-linked mode with the synthetic baseline Hb=10 g/dL, kappa=1.34 mL/g, Qt=400 mL/kg/min, r=1, Spv=.98, M=6 mL O2/kg/min. This baseline is a teaching example, not a normal range or a case reconstruction.

Four navigation views are required (retain these; the Ahmed extension is added within them, not a mandatory fifth top-level view): **Explore**, **Compare oxygen budgets**, **Paper laboratory**, and **Model & validation**. Advanced details are progressively disclosed; units and fixed/varied parameter information are never hidden.

A persistent mode-specific sentence reads: “Steady-state sensitivity experiment; [prescribed flows OR assumed resistance/output law], prescribed demand. Mathematical admissibility is not clinical safety.” Do not overwhelm the main view with repeated disclaimer paragraphs; place the detailed limitations one click away.

## 2. Explore layout and interactions

At desktop width, show a compact parameter/experiment column and two linked plot canvases. At mobile widths stack the two plots vertically. Each plot is a separate canvas with its own metric label and unit-bearing colorbar. The selected state inspector and an optional one-dimensional slice sit below the plots.

Required controls are experiment preset, capacity mode, flow mode, x variable/range/scale, y variable/range/scale, the remaining independent inputs, left/right output metrics, contour selector, and reset. Only independent parameters in the active parameterization can be axes. The same variable cannot occupy both axes. Hb is not an active axis in direct-capacity mode.

Support arbitrary pairs among the active independent parameters, in addition to the curated scenes below. Do not permit Sa, Sv, DO2, or Omega as an independent forward-model axis. The paper's parametric result plots are a separate view.

Sliders for non-axis parameters are labeled **held fixed across this map**. Axis values selected by a click determine the inspector state; they do not silently replace the grid's ranges. Switching from Qt/r to Qp/Qs preserves the selected numerical flow state. Switching mode or preset is atomic: both plots, labels, masks, and inspector must refer to the same configuration generation.

Every plot displays a concise **experiment contract**, for example:

> Varying Hb and Qp/Qs; fixed total ventricular output 400 mL/kg/min, consumption 6 mL O2/kg/min, pulmonary venous saturation 98%; capacity = 1.34 × Hb. Systemic and pulmonary flows both change as Qp/Qs changes.

The contract appears in exported captions and figure metadata too. Never label Qt merely “cardiac output” without its definition Qt=Qp+Qs.

### Initial exploration ranges

These are the per-kg defaults. In native per-m2 mode use the separate ranges and flux scales in Section 07. Changing only the displayed unit suffix without converting the value is prohibited.

Ranges are teaching defaults, not clinical reference ranges. Users may enter other values in the numerical domain.

| Parameter | Initial range | Default scale |
|---|---|---|
| Hb | 6–20 g/dL | linear |
| Qt | 150–600 mL/kg/min | linear |
| Qp | 50–400 mL/kg/min | linear |
| Qs | 50–400 mL/kg/min | linear |
| Qp/Qs | 0.2–4 | linear; log option |
| M | 2–18 mL O2/kg/min | linear |
| Spv | 0.80–1.00 | linear, displayed as % |
| Direct B | 8–30 mL O2/dL | linear |

A zero-demand preset exists in the validation gallery; M=0 is permitted via numeric entry. Positive axes can use logarithmic sampling; zero-inclusive axes cannot.

## 3. Required curated experiment scenes

Each scene must have a short question, fixed-variable contract, configured outputs, and a testable explanatory sentence. These sentences describe equations under assumptions, not predictions of intervention effects.

| ID | Independent axes | Fixed quantities | Initial linked outputs | Required lesson |
|---|---|---|---|---|
| E1 — Hemoglobin and flow balance | x=Hb, y=r | Qt=400, Spv=.98, M=6, kappa=1.34 | Sa and DO2 | Hb changes saturation as well as content; the effect of r is conditional on fixed total output. |
| E2 — Total flow and allocation | x=r, y=Qt | Hb=10, kappa=1.34, Spv=.98, M=6 | Sa and DO2, Sa contours on DO2 | The same saturation contour crosses states with different systemic delivery. |
| E3 — Separate the two flows | x=Qp, y=Qs | Hb=10, kappa=1.34, Spv=.98, M=6 | Sa and DO2 | At fixed Qp and demand, changing Qs does not change Sa but does change systemic delivery. |
| E4 — Carrying capacity and consumption | x=Hb, y=M | Qp=Qs=200, kappa=1.34, Spv=.98 | Sa and OER | Increased oxygen demand can raise lung uptake while lowering delivery and worsening extraction. |
| E5 — Pulmonary venous endpoint | x=Hb, y=Spv | Qp=Qs=200, kappa=1.34, M=6 | Ca and DO2 | Oxygen-carrying capacity and pulmonary venous saturation jointly set endpoint content. |

All these scenes permit choosing Sv, Ca, Cv, Omega, systemic venous return flux, gross pulmonary inlet/outlet flux, or net pulmonary uptake as either displayed metric. On E1, selecting net pulmonary uptake MUST produce a constant field over admissible cells, not a spurious gradient from automatic rescaling.

For E2, supply an overlay for r=1 and a toggle for the conditional DO2 maximum. Label the latter “Mathematical peak for fixed Qt, capacity, Spv, and consumption.” No green “best” zone. For E3, selectable iso-r rays and iso-Qt diagonals make the difference between changing total output and redistributing fixed output explicit. These are mathematical constraints, not treatment trajectories.

## 4. Heatmap numerical and graphical contract

### Grid and coordinates

Settled/default resolution is 201×201 samples. During dragging an explicitly marked 101×101 preview is allowed; pointer release recomputes the 201×201 map. An explicit high-resolution action produces 401×401. Exports record the actual resolution used. Never imply extra numerical resolution from image interpolation.

Arrays have shape `[ny, nx]`, so `metric[j][i]` corresponds to `(x[i],y[j])`. Coordinate arrays, cell boundaries, and transforms are explicit. Axis transposition tests are mandatory. For a log-sampled axis, either use geometric cell edges on a genuine log axis or use a linear plot coordinate log10(value) with correctly inverted tick labels; do not assign logarithmically sampled values to visually equal linear-width physical bins without disclosure.

### Masking

No saturation clipping. No bridging missing values. No contour paths drawn through infeasible cells. Main maps receive null/masked metric values for infeasible states. Draw those regions with neutral hatching or another non-color-only marker, and label the legend “No nonnegative-venous-content steady state at selected consumption.” A tooltip on a masked cell explains the failed constraint and shows requested M and the zero-venous-content mathematical limit, not a negative physiologic Sv as an ordinary result.

Admissibility boundaries are drawn with a clearly labeled line, preferably obtained from the analytic boundary or a grid-convergence-verified contour. “Admissible” must never be replaced with “safe.” Boundary cells are distinguished from interior cells in the inspector.

### Color and scale

Use a perceptually ordered sequential scale for nonnegative absolute quantities, with accessible contrast and no red/green safety encoding. Delta plots use a diverging scale centered exactly on zero. Use saturation percentage points, not percent-relative change, for saturation deltas.

Default absolute scales: saturation 0–100%, OER 0–1, Omega 1–10, DO2 0–80 mL/kg/min, and oxygen flux 0–100 mL/kg/min. Content scale is 0–30 mL/dL. These are display scales, not normal ranges. Out-of-scale values require visible endcaps/counts and a “refit scale” action; do not silently discard or truncate their tooltip/export values. A manual refit remains fixed until requested again. A/B maps for the same metric share a scale; delta scales are symmetric. Zooming does not recolor unchanged values.

A constant metric has an explicit “constant under these constraints” annotation and no invented contour detail. Do not expand floating-point roundoff into a colorful false gradient.

Use unsmoothed heatmap values (`zsmooth=false` where applicable), masked contour support, and no cosmetic spline overshoot. Numerical linear contour interpolation is allowed within valid grid cells; it must not conceal undersampling or cross invalid boundaries. At most five labeled contour levels are initially shown, selected for readability rather than clinical classification. No 3-D surface as the default presentation.

### Inspect, compare, and slices

Hover links both plots to the same sample. Clicking pins A; a second explicit “pin B” action sets B. Keyboard users can select a cell with numeric inputs or arrow navigation. The inspector states whether coordinates are a grid sample or an exactly reevaluated arbitrary point. Do not report interpolated quantities as exact solver results.

The optional slice plot changes one independent parameter with all others fixed at the selected state. A caption describes those constraints. On folded paper curves, preserve their r parameter ordering; never sort by Sa/Sv and reconnect points incorrectly.

A scale/legend and the complete input values are available without hover. The app is usable on touch screens.

## 5. Compare oxygen budgets

This is a required first-class view, not an advanced debug page. It displays two complete states A and B with explicit changed and unchanged inputs, absolute/relative metric deltas, and paired oxygen budgets. No inference about how the states were achieved is made.

Use a topology-neutral mixing diagram: one mixed arterial source divides toward lung and systemic beds, which return pulmonary venous and systemic venous blood. Uniform-width arrows with numeric blood flow, oxygen content, and oxygen flux are sufficient and preferred to an ambiguous Sankey. If variable widths are used, the legend must state whether width encodes blood flow or oxygen flux; never change the encoding within a diagram.

Required visible identities for EACH state:

- Systemic delivery = tissue consumption + unconsumed systemic venous return.
- Gross pulmonary outlet transport = gross pulmonary inlet transport + net pulmonary uptake.
- Net pulmonary uptake = tissue consumption at steady state.

For feasible A/B comparisons, show systemic delivery as a bar partitioned into consumed and returning-unconsumed oxygen. Show pulmonary inlet and outlet transport alongside an explicit net-addition bracket or separate number. Use common axes across A and B. Display units on all fluxes.

### Four required comparison presets

**C1 — More Hb, unchanged net lung uptake.** Hb 10→14; Qp=Qs=200, Spv=.98, M=6, kappa=1.34 remain fixed. Show DO2 20.264→30.7696, Sa 75.61194→82.00853%, net pulmonary uptake 6→6. Label “Prescribed Hb change, fixed flows and demand — not a prediction of transfusion hemodynamics.”

**C2 — Same saturation, different delivery.** Qs 100→200; Qp=200, Hb=10, Spv=.98, M=6, kappa=1.34 fixed. Sa remains 75.61194%; DO2 doubles 10.132→20.264. Note that total output changes.

**C3 — Higher saturation from redistribution.** Paper direct B=22, Spv=.96 (declared reconstruction assumption), Qt=450, M=9. Use the exact Qp/Qs values producing Sa=.80 and .85, respectively. DO2 changes 34.2→14.60454545. The source's corresponding printed values are 34.1 and 14.6; show that source comparison separately, not as exact computed equality.

**C4 — More uptake is not more delivery.** M 6→9; Hb=10, Qp=Qs=200, Spv=.98, kappa=1.34 fixed. Net lung uptake rises 6→9 while DO2 falls 20.264→17.264 and extraction rises. Both endpoints are admissible.

State changes are parameter thought experiments. An optional 0–1 path slider is labeled “interpolation between prescribed states,” never seconds or minutes. If implemented, interpolate in the active independent inputs, disclose linear/log interpolation, evaluate the solver at every step, and retain feasibility masking. Do not animate a physically unsupported transfusion time course.

For an infeasible endpoint, show the input change and failed constraint, but do not present ordinary numerical “improvement” deltas. Any raw algebraic comparison belongs only in the audit view.

## 6. Paper laboratory

Include reconstructions of Figures 2, 3, 4, 5A, 6, and 7, with Figure 5B's error/sensitivity issue as its own workbench. Details are normative in `05_PAPER_RECONSTRUCTION.md`.

The laboratory includes a separate Ahmed tab as specified in Section 07, initially labeled **Ahmed-inspired: abstract-supported; full-text settings unverified**. Its exact-source reproduction mode remains unavailable until T00A passes.

Each reconstructed Barnea figure displays selected capacity convention, Spv assumption, M, total outputs, r range, and whether formal infeasible continuations are visible. By default show admissible portions only. An explicit “show formal algebraic continuation” overlay may show infeasible portions dashed and marked; it must not turn them into ordinary colored physiological states.

The Figure 6/7 view explicitly states that DO2=Omega×M is a definitional relation and its slope changes with M; it is not an independent validation of an index. The discrepancy register is linked next to the capacity selector, not buried in a release note.

The Spv workbench has an exact finite-error map and optional local-sensitivity contours. Label percentage-point versus fractional changes and the error denominator. Reject impossible measured-saturation ordering and nonpositive denominators.

## 7. Model & validation view

Show the compartment assumptions, excluded mechanisms, unit dictionary, source-derived versus extension flags, exact source metadata, model version, code commit/build version, environment manifest, and a machine-readable validation-report link. The page must distinguish passing numerical tests from clinical validation. Include a concise derivation accessible from any plot.

A live state-audit panel shows mass-balance residuals and the feasibility reason. A passed mass balance is a numerical check, not a clinical safety badge.

## 8. Exports and accessibility

Export each plot as PNG and SVG, the plotted grid as long-form CSV, and the full state/preset as versioned JSON. SVG heatmaps may embed a raster heat layer; document that honestly, retain vector axes/text where supported, and provide high-resolution PNG. Do not claim every SVG cell is vector graphics without verifying it.

Image exports include title, units, varied/fixed parameters, capacity convention, feasibility legend, model version, and paper citation. Numerical exports contain unrounded values and status codes. CSV saturation columns use `_fraction` names; a separate presentation column may use `_percent`, never an ambiguous `sat` field.

Required viewport checks: 1440×1000, 1024×768, and 390×844. No horizontal page overflow, clipped labels, or unavailable controls. Every control has an accessible name and keyboard path; numeric state and a compact result table provide alternatives to purely visual encoding. Screenshots and DOM/number assertions both belong in tests. No color-only warnings, hover-only essential values, or reduced-motion violations.

## 9. Required v1.1 additions
Implement H1–H4 heatmap scenes, C5–C7 comparisons, a saturation-criteria settings panel, signed criterion margins, native BSA-indexed inputs, and the analytical boundary workbench exactly as specified in Section 07. Criteria must not remove otherwise mathematically admissible cells from ordinary continuous Sa/Sv/DO2 maps. A separate categorical overlay identifies which selected criteria are met. Every export preserves criterion provenance, strict/equality semantics, indexing basis, and Ahmed evidence status.

## 10. Required v1.2 additions
Add the resistance-provider selector, R1–R6 scenes, C8–C12 comparisons, mean-pressure budgets, same-scope mechanism ablation, structural closure sensitivity and paired sensitivity-ensemble view from Section08. Keep the four top-level views and the original initial Hb scene. The Savorgnan laboratory presents source text/table status and SD01–SD09, not unverified source-image replication. Native pulmonary resistance and conduit loss must be visually distinct. Achieved flows and pressure are outputs, not extra freely editable inputs.

In the resistance view, physically infeasible oxygen-demand states mask oxygen metrics but do not erase independently solved flow/pressure metrics. All other original accessibility/generation/export requirements remain. Source-normalized index/flux labels must never be displayed as physical DO2. R2 matched references and R4 frozen-global-anchor local changes use explicitly different baseline policies.

## Approved question-led presentation adaptation (2026-09-21, issue 2)

Fresh launch uses the existing C1 synthetic Hb10→14 calculation as a One change presentation;
legacy saved experiments restore as maps. The shared comparison and slice operations also support
the specified Qs200→100, Qt400/r1→3 and consumption6→9 teaching examples. Original C2/C3 source
comparisons remain available and unchanged. The question/variant manifest lives in
`src/parallel_o2/data/presentation.json`.

B, Spv, M, Qp and Qs follow the resolved selected state or A/B pair. Roles and dependencies are
separate: Hb-derived capacity and Qt/r-derived flows do not become independently editable.
H3 uses the equality state; H4 shows endpoints. Source-normalized mode supplies neither physical
capacity nor consumption. Saturation editors use percentages and serialize fractions without
magnitude guessing. Resistance calibration requires explicit Edit/Apply or Cancel; ordinary
perturbations retain the frozen reference. Relative change and multiplier are two presentations
of one perturbation. Criteria classify/analyze the state and do not alter forward physiology.

One change and Compare show compact systemic and pulmonary ledgers, with full diagrams expandable.
Explanations depend on the actual changed inputs and computed outcomes. Multi-input comparisons
receive neutral wording. No automatic Hb/Spv-to-resistance feedback is introduced. Objective UI
checks and the separate pending clinician comprehension review are recorded under
`docs/implementation/ui-refactor/`; historical completion receipts do not qualify the new UI.
