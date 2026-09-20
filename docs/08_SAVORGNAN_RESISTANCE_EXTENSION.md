# 08 — Savorgnan resistance-response extension

Normative revision: **1.2.0-spec**. Flow-provider ID: `resistance-parallel-steady-v1`. The existing `barnea-parallel-bound-o2-v1` oxygen conservation engine and `hemoglobin-criteria-v1` analysis remain unchanged. This is an implementation contract, not evidence that the interactive app is implemented.

## 1. End state and evidence boundary

Add a separately selected **resistance-driven circulation** mode. The user can prescribe systemic resistance, native pulmonary vascular resistance, shunt pressure loss, and an explicit output/afterload rule; inspect the resulting flows and mean pressure; and pass those flows to the existing oxygen conservation engine. The fixed-flow E1–E5, Ahmed-inspired H1–H4, C1–C7, original source discrepancies, and their acceptance tests remain available and numerically unchanged.

The conceptual sequence is:

**prescribed resistance perturbation → assumed output response + pressure/flow solution → oxygen conservation → optional selected-saturation criteria.**

Each arrow is explicit. Oxygen conservation is not a substitute for a ventricular constitutive relation. The new relation is an assumed sensitivity rule, not a measured reserve curve or validated whole-body model.

[P3] Savorgnan et al., JCDD 2026;13(8):347, DOI `10.3390/jcdd13080347`, supplies the source model motivation, baseline, resistance profiles, afterload power law, quadratic shunt concept, and reported tables. Its indexed publisher text, equations, tables and captions were retrieved. Rendered source figures, author executable code, and complete Monte Carlo sampling definitions were not retrieved. The new implementation distinguishes:

| Evidence class | Meaning |
|---|---|
| `source_reported` | Values and relationships explicitly present in retrieved source text/tables. |
| `source_compatible_reconstruction` | A declared interpretation reproduces selected reported numbers; authors' implementation is not established. |
| `derived_extension` | New mathematics or sensitivity experiment with explicit assumptions, not claimed as a paper result. |
| `app_assumption` | UI ranges, common-outlet simplification, physical Hb example, distribution choices, and engineering policy. |
| `unresolved_source_discrepancy` | Source statements and/or reported values do not agree under the declared reconstruction. |

The article's clinical discussion is not converted into treatment advice, a drug ranking, a dosing algorithm, or a safe operating region. Profiles are named by resistance pattern first; source drug labels are optional annotations in the paper laboratory.

## 2. Compartment and unit contract

### 2.1 Topology and downstream pressure

One common arterial source supplies systemic and pulmonary branches. Both branches receive the same mixed arterial oxygen content. The pulmonary branch contains native pulmonary vascular resistance and a shunt/conduit pressure-loss element in series. This is a topology-neutral steady-state circuit; it does not reproduce the timing or anatomy of every Norwood, Sano, or PDA-stented circulation.

For the released resistance provider use **one common downstream pressure**: `Pv=Ppv=Pd`. Define driving pressure `P=Pa-Pd`. Default Pd=0 mmHg is a gauge convention, not a claim that actual venous pressures are zero. A uniform shift in Pd shifts Pa but leaves flows and oxygen calculations unchanged. Reject requests specifying unequal Pv/Ppv; do not insert them into the parallel-resistance formula or silently average them. Unequal outlet pressures require a separately versioned model and validation.

All reported pressures are steady mean circuit quantities. No systolic pressure, diastolic pressure, runoff waveform, coronary perfusion timing, pulsatility, or Doppler peak-gradient prediction is available.

### 2.2 Absolute source units

The source resistance experiment is native **absolute L blood/min**, not L/min/m² and not mL/kg/min. Use:

| Quantity | Serialized units / meaning |
|---|---|
| Qp, Qs, Qt | L blood/min, absolute |
| Rs, Rp, nominal Rsh | mmHg·min/L |
| K1 | mmHg·min/L |
| K2 | mmHg·min²/L² |
| P, Pa, Pd | mmHg |
| B and C | mL O2/dL blood |
| physical VO2 and DO2 | mL O2/min, absolute |
| k and source delivery index I | L blood/min × saturation fraction; NOT mL O2/min |

The absolute flow convention is not evidence that Qt=2 L/min is appropriate for a particular infant. Do not transfer this number into a per-kg or per-m² field unchanged.

The common oxygen engine accepts a typed `reference_unit=absolute|kg|m2`. Convert L/min to mL/min by 1000 before calling its factor-100 equations. For an explicit whole-state conversion, require mass or BSA and transform all flow, consumption and resistance quantities together. Under a general change `q_new=c*q_old` with pressure unchanged, use `R_new=R_old/c`, `K1_new=K1_old/c`, `K2_new=K2_old/c²`, and `M_new=c*M_old` when the oxygen flux changes indexing by the same c. Contents/saturations remain invariant. A pure liters-to-milliliters change scales blood-flow numbers but not M; the flow-unit adapter accounts for that separately. The initial resistance input schema accepts only absolute units, avoiding mixed indexing silently entering the hemodynamic solver.

### 2.3 Mode-specific independent quantities

In fixed-flow modes Qt/r or Qp/Qs are prescribed. In resistance mode they are **outputs**. Only the reference Qt0 is an input to the output law. Do not make achieved Qt, Qp, Qs, r and pressure freely editable alongside resistances. Selecting resistance mode must not infer a unique circuit from an old fixed-flow state. The forward export of solved flows to fixed-flow mode is allowed and preserves oxygen metrics; the reverse direction requires a separately chosen reference circuit and is labeled a new experiment.

## 3. Reference calibration: immutable within an intervention

Define reference values `Rs0>0`, `Rp0>=0`, `Rsh0>=0`, `Rp0+Rsh0>0`, `Qt0>0`. For the balanced source example these are 40,12,28,2, respectively.

```
Rp_eff0 = Rp0 + Rsh0
Rhat0   = 1/(1/Rs0 + 1/Rp_eff0)
Qp_cal  = Qt0*Rs0/(Rs0+Rp_eff0)
Qs0     = Qt0 - Qp_cal
P0      = Qt0*Rhat0
```

For a selected nonlinear fraction `f` in [0,1], calibrate the shunt once at Qp_cal:

```
K1_0 = (1-f)*Rsh0
K2_0 = f*Rsh0/Qp_cal
```

Thus `K1_0+K2_0*Qp_cal=Rsh0` and the nonlinear pressure loss at the reference flow equals the nominal reference loss. At Rs0=40,Rp0=12,Rsh0=28,Qt0=2,f=.5: Qp_cal=1, K1=14,K2=14,P0=40.

**This precise partition/calibration is a declared source-compatible reconstruction, not a verified transcription of author code.** It also works for unbalanced reference circuits, where Qp_cal need not equal1. f denotes the fraction of shunt pressure loss assigned to the quadratic term **at the calibration flow**, not a constant fraction at every achieved flow.

Reference resistances, Qp_cal and P0 MUST remain frozen across each before/after perturbation and effect-size path. Never recalibrate K2 from the post-perturbation flow, reset the output law's anchor at each step, or use a nominal shunt resistance as though it were the operating nonlinear resistance.

Changing f defines a new structural-model comparison, calibrated to the same reference pressure and flows. This permits the alpha/f ablation without accidentally changing the baseline state. A matched-baseline family with a different reference Rp/Rsh partition is permitted only in the explicitly labeled R2 experiment; each family member then has its own declared frozen reference.

## 4. Resistance perturbation semantics

Represent changes by explicit nonnegative multipliers, not ambiguous signed percentages in the computational core:

```
Rs = Rs0 * ms
Rp = Rp0 * mp
Rsh_nominal = Rsh0 * mh
K1 = (1-f)*Rsh_nominal
K2 = f*Rsh_nominal/Qp_cal
```

`ms>0`; `mp,mh>=0`; current pulmonary pathway must retain positive resistance. A native pulmonary vasodilation perturbation has `mp<1,mh=1`. A change in shunt/conduit properties is a separate structural perturbation `mh`, not an implied drug effect.

### 4.1 Required default: native-Rp interpretation

`scope=native_rp` is the ordinary educational mode. With linear shunt resistance and fixed mh=1:

```
(Rp_eff1-Rp_eff0)/Rp_eff0 = [Rp0/(Rp0+Rsh0)] * (mp-1)
```

At the source reference a45% native Rp reduction is only a13.5% reduction in total nominal pulmonary resistance. This identity is not used as the complete nonlinear flow response: operating shunt resistance also varies with Qp when f>0. Show both nominal and operating native fractions.

### 4.2 Restricted historical audit: entire-pathway interpretation

`scope=whole_pathway_audit` additionally applies mp to Rsh0. It is permitted only with alpha=0,f=0,mh=1 in this revision. The display states: **Pulmonary multiplier applies to native vessels AND shunt; differs from written source native-Rp-only description.** It is never the default, never called selective pulmonary vasodilation, and never mixed into the alpha/f mechanism-ablation baseline.

This mode reproduces Table1's flow ratios and delivery-index changes to printed precision under the stated reconstruction. It does not resolve all other Table1 columns and is not declared the authors' actual code. See Section10's discrepancy register.

### 4.3 Source-associated profile registry

| ID | Optional source annotation | ΔRs/Rs0 | ΔRp/Rp0 |
|---|---|---:|---:|
| predominantly_systemic | Nicardipine | −0.30 | −0.05 |
| mixed_systemic_pulmonary | Milrinone | −0.18 | −0.225 |
| preferentially_pulmonary | Sildenafil | −0.10 | −0.30 |
| selectively_pulmonary | Inhaled nitric oxide | 0 | −0.45 |
| pulmonary_with_systemic | Epoprostenol | −0.15 | −0.40 |

These are source-assumed perturbations, not calibrated pharmacodynamics. No clinical ordering or preference is generated from the model output. A profile editor becomes `user_selected` when changed; preserve original source values in separate immutable fields.

An effect-size path t in[0,1.25] uses `ms=1+t*ds`, `mp=1+t*dp`, `mh=1`. t is an **assumed effect multiplier**, not dose, elapsed time, infusion rate, or concentration. Refuse nonphysical multiplier values rather than clipping them. At t0 the state must equal the reference, and t1 equals the declared profile.

## 5. Two explicit output-law interpretations

Both closures are deterministic, steady-state sensitivity models. The second is a **new derived extension**, included to expose structural uncertainty rather than assert a corrected version of the study.

### 5.1 Nominal-equivalent-afterload closure: source-compatible reconstruction

```
Rhat = 1/(1/Rs + 1/(Rp+Rsh_nominal))
Qt = Qt0 * (Rhat0/Rhat)**alpha
```

Then solve the actual nonlinear pressure/flow split at that Qt. alpha is an assumed afterload sensitivity in[0,1], default .35; not measured reserve, contractility, maximum output, or ventricular safety. `Rhat` is a **nominal linear equivalent resistance**, even when nonlinear shunt flow is solved afterward.

The resulting operating secant resistance `P/Qt` generally differs from Rhat. Both values must be reported. Table3 agreement supports this declared reconstruction but does not establish which definition the authors used.

For f0: `P/P0=(Rhat/Rhat0)**(1-alpha)`; alpha0 holds Qt constant and alpha1 holds P constant. **For f>0 in this nominal closure, alpha1 need not hold the solved pressure constant.** Do not reuse the linear fixed-pressure interpretation without that qualification.

### 5.2 Operating-circuit-secant closure: new structural sensitivity

Use the operating circuit resistance itself:

```
Rsec = P/Qt
Qt = Qt0*(Rhat0/Rsec)**alpha
```

With `P0=Qt0*Rhat0`, solve the equivalent equation

```
(1-alpha)*ln(Qt/Qt0) + alpha*ln(P/P0) = 0
```

together with the circuit. This is self-consistent within the chosen steady-state law, not more clinically validated. It must be labeled `derived_extension`, not an Ahmed or Savorgnan result or a corrected primary analysis.

For positive passive branches the pressure is a strictly increasing function of Qt. With alpha in[0,1], the log residual is strictly increasing, giving a unique positive root. Implement a bracketing method on log flow or pressure; no unguarded Newton step. Handle alpha0 directly as fixed Qt0, alpha1 directly as fixed P0. For f0 the two closures agree across alpha. For f>0 they generally differ after a perturbation. This exact limiting-case behavior is an acceptance requirement.

### 5.3 Scope exclusions remain

No preload constraint, maximum output cap, time-varying elastance, myocardial oxygen consumption feedback, pulsatile conduit CFD, regurgitation, sympathetic control, Hb-viscosity law, or organ-specific autoregulation is added. Do not insert an arbitrary output cap and call it physiological reserve. Display excursions outside the teaching ranges as outside display bounds, not as an inferred clinical failure.

## 6. Pressure/flow solver and diagnostics

At prescribed Qt and common outlet pressure:

```
P = Rs*Qs = Rp*Qp + K1*Qp + K2*Qp²
Qt = Qs + Qp
K2*Qp² + (Rs+Rp+K1)*Qp - Rs*Qt = 0
```

For K2>0, the stable positive root is

```
a = Rs+Rp+K1
Qp = 2*Rs*Qt / (a + sqrt(a²+4*K2*Rs*Qt))
```

For K2=0 use the linear result `Qp=Rs*Qt/a`. Compute Qs from the pressure balance or a numerically safe subtraction, and check Qp+Qs against requested Qt. For an alpha1 circuit-secant state, solve `K2 Qp²+(Rp+K1)Qp-P0=0`, then `Qs=P0/Rs`.

Required diagnostic quantities:

- Reference and achieved Qp, Qs, Qt, r; P, Pd, Pa; frozen calibration Qp; Rs/Rp/nominalRsh; K1/K2.
- Native pulmonary and shunt pressure drops separately, plus their sum and systemic drop.
- Nominal network Rhat, operating network P/Qt, and incremental network resistance.
- Shunt secant resistance `K1+K2 Qp` versus incremental resistance `K1+2K2 Qp`.
- Incremental network resistance `harmonic(Rs, Rp+K1+2K2 Qp)`.
- Nominal native fraction `Rp/(Rp+Rsh_nominal)` and operating fraction `Rp/(Rp+K1+K2 Qp)`.
- Flow-sum residual; branch-pressure residual; and log output-law residual under the actually selected closure.

The term resistance must always identify which quantity is meant. At baselinef.5 the shunt secant resistance is28 but incremental resistance42; the source-compatible law uses nominal network20, not the shunt42.

### Failure handling

Input/schema errors are typed validation failures. A failure to bracket/converge, nonfinite result, underflowing zero flow, or failure of the numerical residual bound is `hemodynamic_numerical_failure`; it must not be described as a physiological no-solution region. The ordinary parameter domain has a positive unique solution for these closures. In a well-formed grid, a cell whose jointly selected parameters eliminate the entire pulmonary-pathway resistance is marked `invalid_hemodynamic_domain`; it is not clipped or called oxygen infeasibility, and other valid cells remain evaluable. Malformed global requests are rejected before grid calculation. Deliberately excluded zero-path-resistance or reverse-flow cases are domain exclusions, not simulated pathologies.

Use float64. Require branch residual ≤`1e-10*max(1,|P|)` mmHg, flow residual ≤`1e-10*max(1,Qt)` L/min and log-law residual ≤1e-10 for release. Scale quadratic evaluation to avoid overflow; report numerical failure instead of returning a very large spurious flow. An independent pressure-root solver validates the closed-form split; the production engine is not its own test oracle.

## 7. Couple to oxygen transport without conflating index and physical flux

### 7.1 Normalized source reconstruction

From the source balanced baseline:

```
k = Qs0*(Sa0-Sv0) = Qp0*(Spv0-Sa0) = .19 L/min
Sa = Spv - k/Qp
Sv = Sa - k/Qs
I = Qs*Sa
```

k is **consumption divided by blood oxygen capacity expressed in consistent units**; it is not physical oxygen consumption. With capacity B in mL/dL, `M=10 B k` and physical `DO2=10 B I`. The source reconstruction does not specify a numeric Hb/B, so its physical contents, physical VO2 and physical DO2 are null with `requires_declared_capacity`, not invented numbers. Saturations, flow, OER=`k/I`, Omega=`I/k`, and normalized gross/net fluxes can still be calculated. I must be labeled **source oxygen-delivery index** with its own units.

Keep k fixed under resistance perturbations in this source mode. Do not vary Hb here: there is no active Hb input. Changing baseline/reference flow while retaining k changes baseline saturations; do not overwrite them with .80/.61 in every state.

### 7.2 Physical oxygen/Hb exploration

A separate `oxygen.mode=physical` prescribes Hb, kappa, Spv and **absolute M in mL O2/min**. Resolve B=kappa Hb, k=M/(10 B), and call the common content-based oxygen core with the achieved flows.

A supplied synthetic bridge is Hb12, kappa1.34, Spv.99,M30.552, which gives k.19 only at Hb12. Hb12 and M30.552 are app-chosen scaling values, not source-measured inputs. Increasing Hb while holding M and the circuit fixed decreases k, raises content/DO2 and changes saturation; it does not increase net uptake. Keeping k fixed while changing Hb would instead increase physical M proportionally and answer a different question. The app MUST NOT do that silently.

No link from Hb to viscosity or resistance has been supplied. Therefore changing Hb alone does not change solved flow or pressure in this extension. A joint Hb/resistance experiment makes independent changes explicitly; it is not a model of the net effect of transfusion. No fluid-volume, rate, hematocrit, P50 or HbF intervention is inferred.

I's relative change equals DO2's relative change only when B is unchanged. The Hb view prioritizes physical DO2, not I. The finite-state decomposition, when all relevant quantities are positive, is:

```
ln(DO2_B/DO2_A) = ln(Qs_B/Qs_A) + ln(Hb_B/Hb_A)
                 + ln(Sa_B/Sa_A)                  # fixed kappa
```

Add `ln(kappa_B/kappa_A)` when changing coefficient. Display log contributions or exact multiplicative factors, not ordinary percent changes added together. Disable the decomposition for infeasible/nonpositive endpoints.

### 7.3 Feasibility, criteria and separation of statuses

After solving hemodynamics, apply the original nonnegative-Cv criterion. In normalized mode its equivalent is Sv>=0 and `k <= Spv*Qp*Qs/(Qp+Qs)`. In physical mode use the common content tolerance from Section01. The equivalent normalized tolerance is `1e-12*max(1,|Sa|,|Sv|)` because capacity has been normalized to1; do not claim identical near-boundary classifications for arbitrarily tiny physical B without appropriate scaling.

Keep separate fields for `hemodynamic_status`, `oxygen_status` and `criterion_status`. A solved circuit may fail the prescribed oxygen-demand condition. Its pressure/flow values remain inspectable in hemodynamic maps; normal saturation/content/delivery/achieved-uptake results are masked and raw algebraic continuations are audit-only. Do not reduce M or k, clip Sv, or relabel failed oxygen-demand support as solver failure.

Selected Sa/Sv criteria remain separate from model admissibility. All original criterion UI semantics apply. The old fixed-flow Hb boundary solver can use the achieved flows ONLY when the circuit and oxygen-independent response law remain fixed as Hb varies. A CI-boundary or r-interval calculation over prescribed flows is not automatically a realizable trajectory of the resistance model. Put such calculations in a labeled fixed-flow projection or disable the unsupported inverse. No unmodeled resistance optimization is inferred.

## 8. Required views and reference experiments

Keep four top-level views. Add a flow-provider selector and a resistance panel inside Explore; a Savorgnan tab inside Paper laboratory; and pressure/flow budgets plus mechanism comparison inside Compare. The default opening scene remains the original Hb experiment. No generic medication dosing UI.

The persistent contract becomes mode-specific: **Steady-state sensitivity experiment; [prescribed flows | assumed resistance/output law], prescribed demand. Mathematical admissibility is not clinical safety.**

### 8.1 Six resistance scenes

Defaults below are app-chosen exploration ranges, not patient ranges or verified source figure grids. Values use absolute units. Unless stated otherwise the reference is Rs40,Rp12,Rsh28,Qt2,Pd0,Spv.99,k.19, native scope, alpha.35,f.5, nominal closure. Hold this anchor frozen unless the scene explicitly says matched references.

| ID | x / y axes | Initial linked displays | Required interpretation |
|---|---|---|---|
| R1 — Resistance perturbation map | systemic multiplier .5–1.25 / nativeRp multiplier .1–1.5 | Sa and relative delivery-index change vs frozen reference | Saturation and delivery can move in opposite directions. Pressure, Qs,Qt,r,Sv are selectable. Show profile markers without ordering them as clinical choices. |
| R2 — Where pulmonary resistance resides | reference native fraction rho0–1 / nativeRp multiplier .1–1.5 | relative Qp change and relative index change vs matched reference | Keep reference Rp+Rsh40,Rs40,Qt2 for every rho. Same baseline r/flows can have different perturbation responses. Show reference Rp/Rsh, not just rho. At rho0 native-only perturbations have no effect. |
| R3 — Separate the added mechanisms | alpha0–1 / f0–1 | delivery-index change and mean driving-pressure change | NativeRp×.55,Rs unchanged. Show independently computed fixed/linear, response-only, nonlinear-only and both corners, not a comparison contaminated by a different resistance scope. |
| R4 — State versus local response | current nativeRp1–40 / current nominalRsh1–60 | absolute index at state and relative index change after that state's Rp×.55 | Retain ORIGINAL global reference and Qp_cal. For local response, solve A at each cell, then B with only that cell's Rp×.55; never reset the output-law anchor. A high state index is not itself evidence of a positive perturbation response. |
| R5 — Hb and independently prescribed resistance | Hb6–20 / systemic multiplier .5–1.25 | Sa and physicalDO2 | Spv.99,kappa1.34,M30.552 fixed; nativeRp unchanged. No hidden Hb-to-flow feedback. Existing oxygen budget must show fixed net uptake over admissible cells. |
| R6 — Structural closure sensitivity | alpha0–1 / f0–1 | nominal-closure delta and circuit-secant-closure delta, plus optional difference | Same nativeRp×.55, same reference and k. Two separate laws, one source-compatible and one newly derived. Difference is percentage points between modeled percent changes. |

Do not automatically apply the fixed-total-flow analytic r optimum to a resistance trajectory with changing total flow. Such an overlay belongs only in an explicitly labeled fixed-flow projection. At least one selectable plot in R3/R6 shows Qt versus pressure response to make increased output with reduced pressure visible. Default absolute pressure scale0–80mmHg, absolute Qt scale0–4L/min, index scale0–2L/min×sat, and physical flux scale0–800mLO2/min are graphical choices only. Off-scale values remain available with endcaps/counts. All delta maps use common symmetric scales; no safe/unsafe colors.

201×201 remains the settled application resolution,101 preview and401 explicit export. The reference pipeline also generates six numerical grids, but does not implement plotting or validate browser heatmaps. Every grid records axes, rows[y,x], calibration policy, closure, scope, fixed demand convention, and source status. R2 reanchoring and R4 non-reanchoring are intentionally different and must be obvious in captions.

### 8.2 Pressure budget and numeric inspector

For A and B, show `Rs Qs` alongside `Rp Qp + K1 Qp + K2 Qp²`. These are equal pressure drops along parallel paths, not quantities to add across the two branches. Label total, native vascular, linear shunt and quadratic shunt drops separately. Show common downstream offset without calling the result a predicted cuff systolic/diastolic pressure.

For source oxygen mode, the familiar oxygen ledger uses normalized flux units and physical flux controls are disabled. In physical mode it uses real mLO2/min and the original gross-versus-net identities. Any state interchange or downloaded export must preserve which ledger is being used.

### 8.3 Mandatory comparisons

Add C8(native versus whole-pathway audit at alpha0,f0), C9(native-only2×2mechanism ablation), C10(nominal versus circuit-secant closure), C11(physical Hb12→14 at fixed resistances and M30.552), and C12(R4 chosen-state local response with global anchor retained). C8 is explicitly an implementation-semantics audit, not two competing estimates of a clinical drug effect. C11 is explicitly NOT a transfusion-hemodynamics prediction.

For C9 report all four effects relative to the same calibrated baseline. The interaction is `D11-D10-D01+D00` on the declared scale. Do not imply the full combined change equals the sum of two isolated changes if the interaction is nonzero. Under the declared nominal closure, selective nativeRp−45% gives −5.751525%,−2.692571%,−4.766648%,−1.278086%, respectively. These are independently computed reference values.

The corresponding −25.239919% whole-pathway audit is not the proper baseline for attributing the effects of alpha or shunt nonlinearity. Display the source's −25.2% and −1.3% separately with the unresolved source-scope warning.

## 9. Sensitivity ensemble: declared assumptions, not clinical uncertainty

Implement an optional deterministic-seed sampling experiment. The source reports20,000 iterations but complete sampling laws, correlations, seeds and code are not established here. **The supplied runnable ensemble is new and labeled `declared-demonstration-v1`, not a reproduction of source Table2.**

Default independent uniform draws per iteration:

| Quantity | Distribution |
|---|---|
| Qt0 | U[1.8,2.2] L/min |
| Native fraction of reference pulmonary resistance | U[.1,.9] |
| Systemic perturbation effect multiplier | U[.75,1.25] |
| Native pulmonary perturbation effect multiplier | U[.75,1.25] |

Hold Rs0=40, reference Rp+Rsh=40,Spv=.99,k=.19. Reference r remains1 in this demonstration, unlike the source's described variation around1; do not claim equivalent ensembles. Keeping k fixed while Qt0 varies means baseline saturation is recomputed, not forced to.80/.61. Alpha/f are structural scenarios, not randomly interpreted patient reserve values: fixedlinear(0,0),responseonly(.35,0),nonlinearonly(0,.5),both(.35,.5),nominal closure. The same four draws are reused across all five profiles and all four mechanism settings.

For each draw: construct its reference, freeze it, solve its own baseline and perturbed state, and compute a within-draw change. Do not compare a random perturbed state to a population-average baseline or draw the two endpoints independently. Do not independently sample r in addition to a fully specified reference circuit.

Store every draw and paired result for replay. Export seed,RNG/version,distribution bounds,dependence assumptions,draw and code hashes,n_requested,n_eligible,n_oxygen_infeasible,n_invalid_input,n_numerical_failure. Report quantiles as **parameter-ensemble quantiles**, not confidence intervals for a clinical effect. A fraction with a negative delta is an assumed-ensemble fraction. Its binomial Monte Carlo standard error quantifies finite simulation noise conditional on the selected ensemble, not biological uncertainty.

Ineligible draws are not assigned a zero effect and are not silently discarded. Summaries state the eligible denominator and counts for all excluded categories. Show bounds `negative_count/n_requested` to `(negative_count+unclassified)/n_requested` when some draws lack an evaluable effect. These are missing-classification bounds, not clinical probability intervals. Boundary states with zero venous content are not counted as ordinary eligible comparisons.

Support sampled-input replay as the authoritative cross-runtime reproduction mechanism; do not promise identical PRNG sequences from different libraries merely because the seed is the same. A future source-exact Table2 mode requires a separate sampling/code source gate.

## 10. API, schema, version and export changes

Keep ScenarioV1/V2 and old fixtures unchanged. Add a distinct **resistance-experiment-v1** request, rather than interpreting it as an overdetermined flow scenario. The bundled JSON Schema and examples are normative. Fields are `schema_version,flow_model_version,reference,response,perturbation,oxygen`. Reject unknown keys, nonfinite values, booleans-as-numbers, incompatible oxygen fields, unequal downstream pressures and indexed resistance keys.

```
resolve_resistance_reference(request) -> FrozenCircuitReference
solve_resistance_state(request) -> ResistanceStateResultV1
evaluate_resistance_grid(request, x, y, metrics, baseline_policy) -> ResistanceGridV1
compare_resistance_states(request_a, request_b) -> ResistanceComparisonV1
mechanism_ablation(request, alpha_values, nonlinear_values) -> AblationV1
run_resistance_ensemble(definition, seed_or_draws) -> EnsembleResultV1
```

The engine uses a shared Python flow-provider boundary, then the shared oxygen transport core. Proposed modules: `hemodynamics.py`, `resistance_inputs.py`, `flow_providers.py`, `resistance_experiments.py`, `ensemble.py`. Browser workers invoke those APIs; no alternate JS physiology. The reference calculator in `verification/` is not a replacement production module and must remain independent of final app tests.

Results include the complete original request, frozen reference, achieved hemodynamics, oxygen mode/metrics/status, separate criterion status, residuals, scope, closure, equation/provider/core versions, and evidence-class annotations. Normalized and physical fields have distinct IDs and units. Envelopes for grids/sampling include baseline policy, exact axes/draws, eligibility masks and denominator definitions.

Worker messages add `resistance_state,resistance_grid,ablation,resistance_ensemble` with generation IDs. Long ensembles must report progress and support cancellation without replacing newer results. Apply the existing size bounds to grids; ensemble defaults20,000, maximum100,000 draws per explicit request, no background cost or external API. Validate requests before allocation. Invalid JSON/form requests cannot execute arbitrary formulas/code.

Exports carry pressure and oxygen units, reference-state/calibration hash, perturbation semantics, selected closure and f/alpha, normalized-versus-physical demand, all source gate statuses, and the parameter-distribution definition where relevant. A source-derived profile label never replaces numeric multipliers. Do not claim a Table3 rounding match is exact-source code reproduction.

## 11. Additional acceptance gates

Original S/V/A/AV gates remain. R01–R25 and RV01–RV12 are additional mandatory app requirements. The included independent verifier/pipeline tests a subset of the numerical/reference gates; it does not complete the app gates.

| ID | Scientific acceptance |
|---|---|
| R01 | Source baseline yields Qp=Qs1,Qt2,P40,Sa.80,Sv.61,I.80,k.19; no physicalDO2 invented. |
| R02 | NativeRp−45% changes nominal pulmonary path40→34.6; fixedlinear r40/34.6; shunt stays28. |
| R03 | Whole-pathway audit gives r1/.55 and is disallowed in normal mode/advanced ablation. |
| R04 | Table1 r/index changes match audit reconstruction while native interpretation and remaining columns retain discrepancies. |
| R05 | All25 Table3 flow/ratio/delta cells match nominal reconstruction within half the displayed rounding unit; do not fit parameters. |
| R06 | Qp_cal calibration preserves baseline pressure/flows for allf including0and1 and unbalanced references. |
| R07 | Positive quadratic root agrees with independent pressure-root oracle; branch/sum residuals pass. |
| R08 | Secant versus incremental shunt resistance have correct units and analytic derivatives; baseline28versus42 atf.5. |
| R09 | Alpha0 holds total output fixed for both closures; no pressure assertion is inferred. |
| R10 | Circuit-secant alpha1 holds driving pressure; nominalalpha1 nonlinear example explicitly need not. |
| R11 | Closures agree when f0; zero perturbation recovers the same reference for everyalpha/f. |
| R12 | Self-consistent closure has a bracketed unique solution in the documented domain and returns typed numerical failure outside computational bounds. |
| R13 | Output-law residual uses the selected nominal or actual resistance, not the other by accident. |
| R14 | Pressure gauge shifts and coherent unit/indexing transforms preserve the intended physical state; K2 scales quadratically. |
| R15 | Normalized/physical bridge usesM=10Bk; Hb sweeps keep physicalM fixed and recomputek. |
| R16 | With Hb-only changes, circuitflows/pressures stayfixed, physicalDO2changes, netuptakestaysM; Irelativechange is not confused withDO2relativechange. |
| R17 | Exact log-decomposition closes; ordinary percentchanges are not added as exact contributions. |
| R18 | Hemodynamic/oxygen/criterion failures remain distinct; impossible oxygen states are masked, not clipped. |
| R19 | Zero-demand,zero-oxygen,zero-venous-boundary,zero-native-resistance andpurequadratic cases have explicit tested handling. |
| R20 | Same native-scope2×2ablation agrees with all independent checkpoints; interaction and baseline definitions preserved. |
| R21 | R2 reference families sharebaselineflows but yield different perturbationresponses; rho0 has no nativeRp effect. |
| R22 | R4 localresponse uses each cell's beforestate while retaining globalanchor/calibration; not confused with stateindex. |
| R23 | At least2,000 seeded states test hemodynamic identities and oxygen bookkeeping; independently check80 with high-precision pressure-root solver. |
| R24 | CPython scalar/vectorized/browser solver outputs/statuses agree; grids obey[y,x]; referencefixtures are not regenerated by productioncode. |
| R25 | Ensemble pairing,complete denominators,drawreplay,quantiles/MCSE and source-status provenance pass; failures are never discarded silently. |

| ID | Visual/behavioral acceptance |
|---|---|
| RV01 | R1–R6 andC8–C12 initialize exact configuration, referencepolicy and units without destroying oldscenes. |
| RV02 | Closure,alpha,f,perturbationscope,referenceanchor and oxygenmode visible in every plot/export. |
| RV03 | No free achievedQt/r input in resistance mode; mode switching does not infer unique resistances from flow. |
| RV04 | Native/shunt circuit elements visually separate; secant/incremental/nominal labels cannot be interchanged. |
| RV05 | Normalized index and physicalDO2 use distinct controls/units; Hb inactive in normalized mode. |
| RV06 | Paired mean-pressurebudget and oxygenbudget reconcile; no diastolicwaveform or clinicaldrug recommendation appears. |
| RV07 | Source Table1 mismatch visible in downloadable comparisons; Table3 numericalagreement is not labeled validatedphysiology. |
| RV08 | State and localresponse maps have different baselinecaptions; no contour of highstateDO2 labeled benefit ofadrug. |
| RV09 | IncreasedQt with decreasedP is inspectable; nominalalpha1f>0 pressureexception appears correctly. |
| RV10 | Infeasibleoxygen overlays do not hide solvedpressure/flows; mathematical/criterion/solver status remain distinct. |
| RV11 | Ensemble progress/cancel/generation,complete denominators,replay and assumptionlabels work; no patientprobability claim. |
| RV12 | Existing responsive,keyboard,touch,export,scaling and stale-worker tests also cover resistanceviews. |

## 12. Definition of this revision's completion

The app is complete only when the integrated old and new tickets pass their numerical and UI gates. Exact paper-code reproduction, actual rendered-figure audits, and the unavailable Ahmed full text are reported as separate source statuses. A reference table reconstruction may be complete while those source statuses remain unresolved. The downloadable pack already includes an executable reference pipeline; it does NOT include the completed browser app, a remote repository creation, or a deployment.
