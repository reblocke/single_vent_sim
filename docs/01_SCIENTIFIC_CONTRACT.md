# 01 — Scientific contract

Normative core model: `barnea-parallel-bound-o2-v1` (unchanged). Specification revision: `1.2.0-spec`; boundary-layer version: `hemoglobin-criteria-v1`. Native BSA indexing and the criterion layer are normative in [07_AHMED_HEMOGLOBIN_EXTENSION.md](07_AHMED_HEMOGLOBIN_EXTENSION.md).

`MUST` denotes a release requirement. Statements labeled **Derived extension** are algebraic consequences used by this app, not additional empirical findings of Barnea et al. Source identifiers resolve in [SOURCES.md](SOURCES.md).

## 1. Scope and physical interpretation

The authoritative source for the core conservation equations is Barnea et al. 1998 [P1], especially Equations 1–8, Figure 1, and the limitations on journal pages 1407–1412. The modeled system has one completely mixed arterial pool feeding parallel pulmonary and systemic beds. Pulmonary arterial oxygen content equals systemic arterial content. Pulmonary venous blood returns at a prescribed saturation and oxygen-carrying capacity. Total effective ventricular output equals pulmonary plus systemic flow.

This is a deterministic, algebraic, steady-state parameter explorer. A grid evaluates independent equilibrium states; it is not a trajectory through time, a frequency distribution, a probability map, or a model of which states a child can attain.

The required v1 assumptions are complete mixing; equal hemoglobin/carrying capacity in all compartments; prescribed pulmonary venous saturation; prescribed positive flows; prescribed whole-body oxygen consumption; no net storage of oxygen at steady state; hemoglobin-bound oxygen only; and no separately modeled collateral, recirculation, regurgitant, or organ-specific flow.

The original paper represents HLHS. Generalizing its mass balance to another completely mixed pre-Glenn parallel circulation is a structural modeling extension, not validation in that anatomy. The model is not applicable unchanged to Glenn/Fontan physiology or a circulation in which pulmonary arterial and systemic arterial oxygen contents differ.

### Excluded mechanisms

The fixed-flow core contains no PVR/SVR or pressure response. Revision1.2 explicitly authorizes a SEPARATE resistance-driven flow provider with mean-pressure equations, assumed afterload sensitivity and quadratic shunt loss, solely as specified in [08_SAVORGNAN_RESISTANCE_EXTENSION.md](08_SAVORGNAN_RESISTANCE_EXTENSION.md). The old fixed-flow results do not gain hidden resistance feedback. Ductal-stent geometry/Doppler gradients, heart rate, stroke volume, autonomic compensation, viscosity, transfusion volume, blood volume, time constants, HbF/HbA fractions, P50,2,3-BPG,pH/temperature shifts,PaO2,FiO2,dissolved oxygen,regional perfusion,NIRS,pulse-oximeter error and supply-dependent consumption remain excluded. In particular, a transfusion-like A/B comparison changes Hb as a thought experiment; it does not predict the net physiologic response to giving blood.

Do not present a tissue-hypoxia probability, a clinical critical DO2, a safe saturation range, or a treatment target. The v1.1 amendment permits explicitly source-associated or user-selected saturation-criterion overlays, classified separately from model admissibility and never called treatment recommendations. No preset contains an actual patient's measurements.

## 2. Input contract and units

The per-kg contract below remains valid for legacy scenario-v1 and per-kg scenario-v2. Section 07 adds native per-m2 scenario-v2 inputs and a basis-neutral unit adapter; factors of 100 below assume blood flows have already been converted to mL/min per selected reference unit. Do not feed CI in L/min/m2 directly to this per-mL formula.

The core receives saturations as fractions, never percentages. UI fields explicitly labeled `%` divide by 100 once at the boundary. The serialized key is `spv_fraction`, so `98` is rejected rather than silently interpreted.

| Quantity | Symbol | Unit | Domain |
|---|---|---|---|
| Pulmonary blood flow | Qp | mL blood/kg/min | finite, >0 |
| Systemic blood flow | Qs | mL blood/kg/min | finite, >0 |
| Total ventricular output | Qt | mL blood/kg/min | finite, >0 |
| Pulmonary/systemic flow ratio | r | dimensionless | finite, >0 |
| Target steady-state oxygen consumption | M | mL O2/kg/min | finite, >=0 |
| Pulmonary venous saturation | Spv | fraction | 0–1 inclusive |
| Hemoglobin | Hb | g/dL | finite, >0 |
| Hb-bound oxygen coefficient | kappa | mL O2/g Hb | finite, >0 |
| Capacity at 100% saturation | B | mL O2/dL blood | finite, >0 |

Use exactly one flow parameterization:

- `total_ratio`: independent Qt and r; derive `Qs = Qt/(1+r)`, `Qp = Qt*r/(1+r)` using a numerically stable positive-flow calculation. Check their sum against Qt; avoid catastrophic subtraction for extremely small r.
- `independent_flows`: independent Qp and Qs; derive `Qt = Qp+Qs`, `r = Qp/Qs`.

Use exactly one carrying-capacity parameterization:

- `hb_linear`: independent Hb and a declared coefficient; `B = kappa*Hb`. Default exploration coefficient is **1.34**, an explicit convention adopted for this extension and the earlier worked example, not the paper's stated coefficient or a patient-specific calibration.
- `direct_capacity`: independent B. The paper-reconstruction default is **22 mL O2/dL**. Hb is not an active model input in this mode; an optional source annotation of 15 g/dL MUST NOT cause a hidden conversion or imply kappa=1.34.

Coefficients 1.34 and 1.38 may be selected in the advanced Hb-mode settings, with a custom positive coefficient permitted. Switching conventions MUST show the newly implied B and clear incompatible Hb-axis selections before recalculation. Never use B=22 and Hb=15,kappa=1.38 as simultaneously authoritative constraints.

UI exploration ranges are convenience ranges, not normal/reference ranges. Core validity uses the domains above, not arbitrary UI clinical-looking limits.

## 3. Required forward equations

All flows below are mL/kg/min and all contents mL O2/dL; the factor **100** is therefore required. Let B be oxygen capacity.

```
Cpv = B * Spv
Ca  = Cpv - 100*M/Qp
Cv  = Ca  - 100*M/Qs
Sa  = Ca/B
Sv  = Cv/B
DO2 = Qs*Ca/100
```

These equations combine the pulmonary and systemic oxygen-balance equations in [P1]. Do not replace them with an arterial saturation formula that holds systemic venous saturation fixed when Hb changes.

Required independently computed cross-checks:

```
A = Qt*Cpv/100
DO2_closed = A/(1+r) - M/r
Ca_mixing  = (Qp*Cpv + Qs*Cv)/Qt
```

The source's oxygen-excess factor is Omega (the PDF extraction sometimes renders the symbol as V). For admissible states with M>0:

```
OER   = M/DO2
Omega = DO2/M
av_saturation_gap = Sa-Sv
pv_a_saturation_gap = Spv-Sa
r_fick = (Sa-Sv)/(Spv-Sa)
```

OER is extraction fraction. Omega is delivery/consumption, not absolute delivery. `DO2 - M` is oxygen returning unconsumed per minute, not a validated maximum metabolic reserve.

## 4. Oxygen-flow ledger: mandatory output

All ledger fluxes use mL O2/kg/min:

```
systemic_in       = Qs*Ca/100       # DO2
systemic_out      = Qs*Cv/100       # unconsumed venous return
systemic_net_use  = systemic_in - systemic_out
pulmonary_in      = Qp*Ca/100
pulmonary_out     = Qp*Cpv/100
pulmonary_net_add = pulmonary_out - pulmonary_in
```

For an admissible positive-demand state:

```
systemic_net_use == pulmonary_net_add == M
pulmonary_out + systemic_out == Qt*Ca/100
DO2 == M + systemic_out
```

A rise in both pulmonary_in and pulmonary_out by the same amount increases gross oxygen transport but not net pulmonary uptake. The app MUST make this distinction visible in the A/B comparison, not only in a tooltip.

Do not call pulmonary_out `lung uptake`. Do not label Qt*Ca/100 `systemic DO2`. Do not use Qp+Qs as the systemic flow in a delivery calculation.

## 5. Mathematical feasibility; no silent repairs

### Domain errors
Reject non-finite inputs, nonpositive flow/capacity parameters, negative M, and saturation outside [0,1]. Scalar APIs return a typed validation error. Invalid configurations are blocked before grid evaluation. A physiologically infeasible combination of otherwise valid inputs is a result, not an exception.

### Nonnegative-content condition
For positive prescribed M and positive capacity/flows, a nonnegative systemic venous oxygen content is required:

```
Cv >= 0
```

This implies `0 <= Sv < Sa < Spv <= 1` and `DO2 >= M`. Equality is an algebraic boundary, not a viable clinical target. For M=0, Sa=Sv=Spv, so inequalities are not strict.

**Derived extension:** the largest M compatible with Cv>=0 for fixed flows and endpoint content is

```
M_zero_venous_limit = Cpv*Qp*Qs / (100*(Qp+Qs))
                    = A*r/(1+r)**2
```

Call this the **zero-venous-content mathematical limit**, never clinical critical VO2 or maximum safe consumption. It assumes complete extraction is permitted by the algebra; the model contains no diffusion or organ-level extraction limit.

If M exceeds this limit, the ordinary physiologic metrics MUST be masked in the main UI. Explain: “No nonnegative-venous-content steady state supports the selected oxygen consumption under these assumptions.” Do not cap Sa/Sv, reduce M to the mathematical limit, report the computed consumption as achieved, or color a negative Sv as a real predicted saturation.

Keep the unmodified algebraic values in a clearly labeled audit/debug record, with the infeasibility reason and the requested M. A main plot exports `null` for masked metrics plus a status code. Raw algebraic exports require explicit selection and carry their warning in metadata.

### Numerical tolerance
Use IEEE float64. Feasibility content tolerance is `1e-12 * max(1, B, abs(Ca), abs(Cv))` in mL/dL. Values within that tolerance of zero are classified `zero_venous_boundary`; do not overwrite their raw values. All larger negative values are infeasible. Formatting may round a near-zero value; computation and exports retain the original.

Required statuses: `admissible`, `zero_venous_boundary`, `infeasible_requested_consumption`, `degenerate_zero_oxygen`, and `numerical_failure`. A numerical failure is not physiological infeasibility. Guard overflow and return diagnostic metadata rather than a false value.

### Zero-demand special cases
For M=0 and Spv>0: contents and saturations are equal across compartments, OER=0, Omega=null with reason `undefined_zero_consumption`, and Fick-derived r=null (`0/0`). Actual flow ratio remains known from flows. For M=0 and Spv=0: all fluxes and contents are zero; both OER and Omega are undefined; mark `degenerate_zero_oxygen`. For M>0 and Spv=0: infeasible.

Do not serialize NaN or Infinity as JSON numbers.

## 6. Conditional optimum and existence boundary

**Derived extensions**, not new empirically validated targets:

With A=Qt*Cpv/100 and fixed Qt, B, Spv, M>0, the unconstrained positive-r stationary point of DO2 is

```
r_stationary = 1 / (sqrt(A/M) - 1)
```

It only exists as a positive finite value if A>M. An admissible r exists at all only when **A>=4M**. Do not plot a clinically styled optimum merely because the derivative has a formal root.

When A>4M, the allowable r interval can be computed stably:

```
disc = sqrt(A*(A-4*M))
r_low  = 2*M/(A - 2*M + disc)
r_high = 1/r_low
```

When A=4M, the sole boundary state is r=1. When A<4M, no r supports the selected M. At M=0 there is no interior positive-r maximum; the formal supremum occurs as r approaches zero. Handle this explicitly.

A displayed maximum must identify its objective and fixed variables: “Maximum systemic DO2 on this fixed-total-output slice.” If restricting to a plotted r range, distinguish `interior optimum`, `maximum within selected bounds`, and `analytic optimum outside plot`. Compute the optimum analytically and verify numerically, not by declaring the brightest grid cell a general physiologic optimum. No clinical recommendation language.

## 7. Derivatives and invariances to teach and test

The following are derived from the core and hold only under the stated constraints, in the admissible interior:

At fixed Qp, Qs, Spv, M, kappa:

```
Spv-Sa = 100*M/(kappa*Hb*Qp)
dCa/dHb = kappa*Spv
dDO2/dHb = Qs*kappa*Spv/100
```

Sa increases nonlinearly with Hb, while Ca and DO2 increase linearly. The same Hb increment shifts Cpv, Ca, Cv by the same content increment; both lung gross fluxes change but net uptake remains M.

At fixed Qp, B, Spv, M, Sa does not depend on Qs. DO2 increases in proportion to Qs while Ca remains fixed. This statement does not hold for changing r at fixed Qt, because Qp and Qs then both change.

At fixed Qp, Qs, B, Spv, increasing M decreases Ca, Sa, Sv and DO2, while increasing net pulmonary uptake (equal to M); the latter is not an improvement in delivery.

At fixed Qt, B, Spv, M, increasing r increases Sa but moves DO2 through a conditional maximum and eventually reduces it. Mask points whose M cannot be sustained.

Scaling both flows and M by the same positive multiplier preserves saturations, contents, OER, and Omega, and scales all oxygen fluxes by that multiplier. This is a useful unit/property test.

## 8. Inverse demonstration: saturation-derived flow ratio

This separate workbench takes supplied Sa, ideal systemic mixed Sv, and true/assumed Spv. It does not infer all flows from an SpO2 alone.

```
r_true = (Sa-Sv)/(Spv_true-Sa)
r_est  = (Sa-Sv)/(Spv_assumed-Sa)
relative_error_vs_true = (r_est-r_true)/r_true
true_excess_over_est  = (r_true-r_est)/r_est
Psi = -Spv_true/(Spv_true-Sa)
```

For a small fractional perturbation delta_Spv/Spv_true, local relative error is approximately `Psi*delta_Spv/Spv_true`. Display exact finite error separately. Reject zero/nonpositive denominators rather than showing a finite answer. Percentage-point saturation errors and percentage-relative errors must have different labels.

For the positive-demand inverse demo require `0 <= Sv < Sa < min(Spv_true,Spv_assumed) <= 1`. It is a mathematical measurement demonstration, not a validated estimator from a caval sample. [P1] specifically discusses why caval samples are not truly mixed systemic venous samples.

## 9. Non-identifiability illustration

The app must illustrate different DO2 at identical Sa. A minimal exact example varies Qs from 100 to 200 while Qp=200, Hb=10, kappa=1.34, Spv=.98, and M=6 remain fixed. Sa stays about 75.61194%, while DO2 doubles from 10.132 to 20.264. Both states are admissible.

Do not claim that a specified Sa reveals Hb, Qp, Qs, M, or their cause. If an equi-saturation curve is generated analytically, disclose the parameters assumed to generate it; do not label it an estimated patient state.

## 10. Relationship to the Ahmed amendment
The original fixed-flow Hb sweeps were extensions of Barnea. Ahmed's retrieved abstract [P2] provides a directly relevant later modeling question and source-associated saturation criteria. Full constitutive equivalence to Ahmed has not been verified. Reuse this conservation engine for assumption-labeled experiments and do not invent a new physiological solver from the abstract. The exact native indexed equations, inverse criteria, continuous Hb derivatives, and two-objective distinction are specified in Section 07.

## 11. Resistance-provider amendment
The new provider computes flows from a separately versioned circuit request, then calls this unchanged conservation core. It uses absolute rather than implicitly indexed units and supports either source-normalized oxygen flux or explicitly declared physical Hb/VO2. The new provider is not a whole-body-response model, and no Hb-to-resistance feedback exists. Section08 governs its closure/calibration/units and mode-specific independent inputs. The original fixed-flow partial derivatives and optima apply only under their stated constraints, not automatically along a resistance perturbation path. Section10 preserves the source discrepancies; Section09 documents the runnable reference pipeline.
