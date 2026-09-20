# 07 — Ahmed hemoglobin amendment: precise implementation contract

Specification **1.1.0-spec**, 2026-09-18. This is a source-aware amendment to the proposed app, not a finished app or clinical transfusion rule. It adds native body-surface-area indexing and saturation-criterion analysis to the existing Barnea conservation engine. The original seven coding tickets are amended; T00A is a separate source-verification gate.

## 1. Evidence status and interpretation

**Verified source record [P2]:** Ahmed M, Acosta SI, Hoffman GM, Tweddell JS, Ghanayem NS. *Mathematical analysis of hemoglobin target in univentricular parallel circulation*. J Thorac Cardiovasc Surg. 2023;166(1):214–220. DOI `10.1016/j.jtcvs.2022.09.044`; PMID 36357224. Published online in 2022; the issue is July 2023.

The available primary-source abstract reports varying Hb, Qp/Qs, and total cardiac output and examining saturations and extraction. Its representative conditions include total CI 6 L/min/m2, VO2 150 mL O2/min/m2, and r approximately 1. It reports arterial saturation below 70% and venous saturation below 40% at Hb 9; increasing total CI toward 9 or Hb above approximately 13 permits operating above the described boundaries. It also describes larger saturation gains when increasing Hb from levels below 12 and calls for prospective clinical investigation. These are conditional modeling statements, not outcome evidence or universal Hb prescriptions.

**Access limitation:** the full-text PDF and publisher full text could not be retrieved in this revision. The paper's exact Hb-binding coefficient, pulmonary venous saturation, figure-level grids, any additional constitutive assumptions, and supplement definitions remain **unverified**. No claim of a full-text review or exact source reconstruction is permitted. The primary abstract is enough to motivate the new experiments, not to establish all implementation constants.

The specification therefore separates:

| Evidence class | What belongs here |
|---|---|
| `source_reported` | Verified bibliographic information, abstract scenarios, criteria, and approximate findings. |
| `app_assumption` | Spv=.98, kappa=1.34, r=1 exactly, Hb14 as an example endpoint, exploration ranges and plot scales. |
| `derived_from_barnea_core` | Indexed equations, exact boundary solvers, criterion intervals, Hb derivatives, and all new numerical fixtures. |
| `unverified_ahmed_full_text` | Exact Ahmed coefficients, figure definitions, full constitutive equivalence, and exact-reproduction targets. |

T00A must fill the last category from the actual source before enabling a **verified Ahmed reproduction**. Do not reverse-engineer an unknown constant by tuning it to an approximate abstract number. The educational mode is labeled **Ahmed-inspired experiment; inherited app assumptions; full-text settings unverified** until then.

## 2. Required finished behavior

Within the existing four-view app, the user can load an Ahmed-inspired experiment, work natively in L/min/m2 and mL O2/min/m2, vary Hb/flow/allocation/demand, and see continuous Sa, Sv, DO2 and OER maps with optional selected-criterion overlays. They can distinguish:

1. Whether a nonnegative-venous-content steady state exists.
2. Whether it meets the selected Sa and Sv inequalities.
3. Which criterion binds first and the parameter value at equality.
4. Whether a plotted maximum optimizes DO2 or Sv, which are different objectives.
5. Whether changing Hb raises gross transport while net uptake remains fixed.

This layer must never report that the patient is safe, diagnose tissue hypoxia, prescribe transfusion, or compute a dose. No patient data or identifiers enter presets.

## 3. Native indexed units and schema-v2

Retain `barnea-parallel-bound-o2-v1` as the core model identifier. Add `hemoglobin-criteria-v1` as the analysis-layer identifier. Preserve all scenario-v1 examples and accept them via deterministic migration to per_kg scenario-v2 with unchanged values.

Scenario-v2 has top-level fields `schema_version`, `model_version`, `indexing_basis`, `flow`, `capacity`, `spv_fraction`, and exactly one native VO2 field. Optional `source_context` is provenance metadata, not a scientific input. The included JSON Schema is normative.

| Indexing basis | Native blood-flow keys | Native consumption key | Native blood-flow units | Oxygen-flux units |
|---|---|---|---|---|
| `per_kg` | `qt_ml_kg_min` or `qp_ml_kg_min`,`qs_ml_kg_min` | `vo2_target_ml_kg_min` | mL blood/kg/min | mL O2/kg/min |
| `per_m2` | `qt_l_min_m2` or `qp_l_min_m2`,`qs_l_min_m2` | `vo2_target_ml_min_m2` | L blood/min/m2 | mL O2/min/m2 |

Exactly one flow mode is accepted: `total_ratio` (total output plus r) or `independent_flows` (Qp and Qs). Mixing indexing bases, accepting both VO2 fields, or silently choosing among overdetermined flow inputs is an error. BSA-indexed total output is explicitly **total ventricular CI = CIp + CIs**, never systemic CI alone.

### One engine, explicit adapter

The internal core receives flows in mL blood/min per reference unit and VO2 in mL O2/min per the SAME reference unit. Multiply native L/min/m2 flow by 1000 before calling it. Carry `reference_unit=kg|m2` as typed metadata. The core factor100 is unchanged because content remains per dL. Do not use fake body size merely to reuse a variable named `_kg`.

For documentation and an independent unit cross-check, the equivalent native BSA form is:

```
CIp = CIt*r/(1+r)
CIs = CIt/(1+r)
B   = kappa*Hb
Cpv = B*Spv
Ca  = Cpv - M/(10*CIp)
Cv  = Ca  - M/(10*CIs)
Sa  = Ca/B
Sv  = Cv/B
DO2 = 10*CIs*Ca
```

Here CI is L blood/min/m2 and M is mL O2/min/m2. The factor10 converts L to dL. These are derived reformulations of the existing core, not equations asserted to have been transcribed from Ahmed's unavailable methods.

### Optional conversion between bases

Native per-m2 work requires neither mass nor BSA. Converting an existing state to the other basis does require explicit positive `mass_kg` and `bsa_m2`; no automatic infant BSA formula or default body size:

```
CI_l_min_m2 = q_ml_kg_min * mass_kg / (1000*bsa_m2)
M_ml_min_m2 = M_ml_kg_min * mass_kg / bsa_m2
DO2_ml_min_m2 = DO2_ml_kg_min * mass_kg / bsa_m2
```

Both blood flows and VO2 are converted together. Saturation, content, r, OER and Omega remain invariant. All oxygen fluxes change indexing together. Switching between flow parameterizations preserves the selected state as before; switching indexing bases without supplied conversion factors loads a separately identified preset or requires factors, and must not be described as preserving the same state. Cross-basis A/B deltas are blocked until normalized explicitly.

### Output/API extensions

StateResultV2 contains `schema_version=state-result-v2`, `model_version`, `analysis_version`, `indexing_basis`, requested and resolved inputs, metrics, a unit registry, model status, criterion results, residuals and audit outputs. Retain the existing per-kg metric IDs for per-kg results. For area results use blood-flow IDs `qp_l_min_m2`, `qs_l_min_m2`, `qt_l_min_m2`; substitute `_ml_min_m2` for `_ml_kg_min` on oxygen-flux/limit IDs. Content, saturation, OER, Omega and r IDs are unchanged. No area value may be serialized under a kg key.

Criteria are passed separately in an `experiment-v2` or `grid-request-v2` object with `base`, `criteria`, axes and metric selection; they are not part of the physical scenario and do not modify the forward solution. Criterion edits invalidate only analysis/rendering generations, not the meaning of the model inputs. Preserve complete experiment state in all exports.

Required new public interfaces:

```
convert_indexing(scenario, mass_kg, bsa_m2) -> ScenarioV2
assess_criteria(state, criteria) -> CriterionResultV1
criterion_boundary(scenario, criteria, solve_for='hb'|'total_flow'|'vo2') -> BoundaryResultV1
criterion_ratio_interval(scenario, criteria, r_bounds=None) -> RatioIntervalV1
hb_sensitivity(scenario, delta_hb_g_dl) -> HbSensitivityV1
```

For `total_flow`, hold r fixed, regardless of the supplied flow parameterization, and return total output in the active native unit: L/min/m2 or mL/kg/min. This is redistribution at a preserved ratio, not changing Qp alone. Hb-specific requests require Hb-linear capacity. The total-flow and VO2 inverses can use direct capacity B, replacing kappa*Hb by B rather than inventing a hemoglobin value.

A `BoundaryResultV1` MUST include `analysis_version`, `indexing_basis`, `solve_for`, `boundary_parameter`, `unit`, `fixed_inputs`, the full `criteria` object, arterial and venous component values/statuses, the joint value/status, `binding_criterion`, `strict_direction` (`above` for Hb/flow, `below` for VO2), and the evaluated equality state when finite. Undefined values are null with typed reasons. For example, `boundary_parameter=flow.qt_l_min_m2` and `unit=L blood/min/m2` cannot accompany a per-kg scenario. The forward state result remains separate from this inverse result.

`RatioIntervalV1` includes lower/upper values, endpoint-inclusion booleans, the unclipped criterion interval, optional analysis bounds, the post-intersection interval, and an explicit empty-interval reason. A ratio-interval request requires positive M; at M=0 return the entire positive domain intersected with the selected bounds if the endpoint satisfies both criteria, otherwise an empty interval. No finite root calculation is performed in that case.

`HbSensitivityV1` includes both fully evaluated endpoint scenarios/statuses, the fixed-variable contract, analytic first/second derivatives, finite increments, native units, and analysis/source metadata. Main-view increments are null when either endpoint is inadmissible; raw algebraic differences are audit-only. Require finite delta_hb_g_dl>0 in the initial H4 comparison request. Arbitrary expressions or negative dose-like changes are not part of this interface.

Reject unsupported capacity modes for Hb-specific inverse/sensitivity requests: direct B contains no active Hb. For an Hb-boundary request, baseline Hb is not a fixed scientific constraint; display which variables are held fixed. M/r/flow changes must not be secretly optimized by an Hb solve.

## 4. Criteria are not feasibility or clinical targets

Default source-associated criteria are `Sa > .70` and `Sv > .40`. Their exact strictness is the experiment's declared choice based on the abstract wording; source-specific inequalities are verified in T00A. The model's separate mathematical boundary remains Cv=0, not Sv=.40.

Canonical criterion object:

```
{
  "schema_version": "criteria-v1",
  "id": "ahmed-abstract-70-40",
  "sa_lower_fraction": 0.70,
  "sv_lower_fraction": 0.40,
  "comparison": "strict_greater_than",
  "origin": "source_reported_abstract",
  "source_id": "P2"
}
```

Allow criteria satisfying `0 <= beta < alpha <= 1`. If the user edits a value, use `origin=user_selected` and remove the claim that the changed value is an Ahmed setting. Spv may fall below alpha/beta during exploration; this is a meaningful no-solution case, not a reason to silently constrain Spv upward. Only `strict_greater_than` is required in this version.

For admissible states return individual statuses `above`, `on`, `below`; combine as `both_above`, `arterial_only_above`, `venous_only_above`, `neither_above`, or `on_selected_boundary` with individual statuses retained. Use a declared numerical saturation tolerance of 1e-10 around equality, far smaller than display rounding. `on` does not meet a strict inequality. Test mathematical equality with exact-arithmetic fixtures as well as floating-point neighbors.

If the state is infeasible or has a numerical failure, criterion status is `not_evaluable`. A zero-venous mathematical boundary retains its special model status and is not an ordinary interior state. Degenerate zero-oxygen cases retain the existing handling. The default beta=.40 will not be met at Sv=0.

Show `100*(Sa-alpha)` and `100*(Sv-beta)` as **signed percentage-point margins to selected criteria**. These are not tissue oxygen reserve, risk estimates, or outcome probabilities. Ordinary continuous maps retain admissible subcriterion values; do not mask them as though mathematically impossible. Use hatching for infeasible states and a distinct categorical overlay for criteria.

## 5. Analytic boundary solver: a derived extension

Let h=Hb, p=CIp, s=CIs, M=VO2; alpha and beta are the selected Sa/Sv lower boundaries. For M>0 and Spv greater than the corresponding boundary:

```
h_at_Sa_boundary = M / (10*kappa*p*(Spv-alpha))
h_at_Sv_boundary = M*(1/p + 1/s) / (10*kappa*(Spv-beta))
h_joint_boundary = max(h_at_Sa_boundary, h_at_Sv_boundary)
```

Return both component values, the binding criterion (`arterial`, `venous`, `both`), the equality state and the fixed-variable contract. With strict inequalities this is an **infimum/equality boundary**, not an attained minimum satisfying the criteria. Display “Hb at selected-boundary equality; strict criteria require a larger value,” never “recommended Hb” or a rounded integer prescription.

At fixed r, Hb and Spv, the total-CI boundaries are:

```
CI_at_Sa_boundary = M*(1+r) / (10*kappa*h*r*(Spv-alpha))
CI_at_Sv_boundary = M*(1+r)**2 / (10*kappa*h*r*(Spv-beta))
CI_joint_boundary = max(CI_at_Sa_boundary, CI_at_Sv_boundary)
```

At fixed flows, Hb and Spv, the selected-demand boundaries are:

```
M_at_Sa_boundary = 10*kappa*h*p*(Spv-alpha)
M_at_Sv_boundary = 10*kappa*h*(Spv-beta)/(1/p+1/s)
M_joint_boundary = min(M_at_Sa_boundary, M_at_Sv_boundary)
```

Demand below this boundary satisfies both strict criteria when their denominators/gaps are valid. Display `M_joint_boundary - requested_M` as a signed **prescribed-demand margin to chosen saturation criteria**. Do not call it measured VO2 reserve, achievable exercise capacity, a treatment tolerance, or an estimated critical VO2. The Cv=0 mathematical limit must remain separately available:

```
M_zero_venous_limit = 10*Cpv*p*s/(p+s)
```

These inverse quantities are consequences of the Barnea-based engine and selected constants, not clinical validations and not claimed as new formulas supplied by Ahmed.

### Special cases

For positive M, Spv<=alpha or Spv<=beta makes the corresponding lower-bound inequality impossible at finite positive Hb/flows. Return `no_finite_solution` with the limiting endpoint and no Infinity value. Do not convert negative boundary formulas into a negative Hb target. Finite parameter solutions outside the displayed range are `outside_display_range`, not `no_solution`.

At M=0, Sa=Sv=Spv for every positive Hb/flow. Criteria are either already satisfied independently of Hb/flow (`no_positive_lower_bound`, equality infimum0 not in the domain) or unattainable (`no_solution_at_endpoint`). There is no finite unique Hb/CI threshold. The VO2-boundary calculation remains a hypothetical positive-demand capacity calculation with its own label, not division by zero. Null and reason fields replace undefined quantities.

### Fixed-Hb flow-ratio interval

Let `u=M/(10*kappa*h*CIt)`, `a=Spv-alpha`, and `b=Spv-beta`, with M>0.

Arterial criterion:

```
a > u is required
r > u/(a-u)
```

Venous criterion:

```
b > 4*u is required for a nonempty strict interval
D = sqrt(b*(b-4*u))
r_v_low  = 2*u/(b-2*u+D)
r_v_high = 1/r_v_low
r_v_low < r < r_v_high
```

Intersect these intervals and any explicitly selected display/analysis r bounds. Preserve open/closed endpoints: physiological-criterion equality endpoints are open for strict inequalities; an arbitrary plotting bound may be included when its endpoint meets both inequalities. If b=4u, r=1 only touches the venous equality boundary and does not satisfy the strict condition. If the intersection is empty, return `no_ratio_meets_selected_criteria`; this is distinct from no mathematically admissible r.

Use stable roots, numerical tolerance, overflow handling and independently checked boundary evaluation. Do not infer an interval from occupied heatmap pixels alone.

## 6. Two objectives: maximum DO2 is not maximum Sv

This is a derived teaching comparison, not a newly verified Ahmed result. Define `A=10*CIt*Cpv` and hold total CI, capacity, Spv and M fixed:

```
DO2(r) = A/(1+r) - M/r
Sv(r)  = Spv - [M/(10*B*CIt)]*(r+2+1/r)
```

For positive demand, Sv is maximized at r=1. The unconstrained positive-r stationary point for DO2 is `1/(sqrt(A/M)-1)`. As in v1, restrict maxima to nonnegative-content states; an admissible ratio exists only if A>=4M. If A>4M the DO2 maximum is below1 while the Sv maximum is at1. At A=4M only the zero-venous r=1 boundary exists; at A<4M there is no admissible optimum. M=0 has no unique Sv maximum (Sv is constant) and no interior positive-r DO2 maximum.

Offer two separately labeled overlays: **DO2 maximum at fixed total CI** and **Sv maximum at fixed total CI**. Selected saturation criteria can exclude either maximum. Any constrained optimization must disclose its objective, selected constraints and bounds; no single “optimal circulation” badge.

## 7. Hb gains: continuous derivatives, not a 12-g/dL breakpoint

At fixed p,s,M,Spv,kappa define:

```
Ka = M/(10*kappa*p)
Kv = M*(1/p+1/s)/(10*kappa)
Sa(h) = Spv-Ka/h
Sv(h) = Spv-Kv/h
```

Then:

```
dSa/dh = Ka/h**2       d2Sa/dh2 = -2*Ka/h**3
dSv/dh = Kv/h**2       d2Sv/dh2 = -2*Kv/h**3
DeltaSa = Ka*delta_h/(h*(h+delta_h))
DeltaSv = Kv*delta_h/(h*(h+delta_h))
dDO2/dh = 10*s*kappa*Spv
DeltaDO2 = 10*s*kappa*Spv*delta_h
```

Use percentage points/(g/dL) for displayed saturation derivatives. At fixed r, `dSv/dh=(1+r)*dSa/dh`; at r=1 the venous percentage-point increment is twice the arterial increment. Sa and Sv gains diminish continuously with Hb; absolute DO2 gains per unit Hb are constant under these fixed-flow assumptions. Net uptake stays M. At M=0 saturation derivatives and finite increments are zero.

The abstract's observation about larger gains below12 is recorded as source wording, not encoded as a kink, sigmoid transition, discontinuity or clinical threshold. Hb9/12/13 reference markers may be enabled and must say **values discussed in the abstract**, not inferred physiologic breakpoints. A joint boundary surface can have a kink where the binding criterion changes (because it is a max of two functions); that is not an inflection in Sa(Hb).

## 8. Required heatmap scenes and interactions

Keep E1–E5 and the original opening preset. Add the following, with native per-m2 units. Every initial Spv=.98 and kappa=1.34 setting is labeled **app assumption, not verified Ahmed parameter**. r=1 is an exact representative choice for the abstract's approximately1 scenario.

| ID | Axes | Fixed inputs | Initial displays | Required understanding |
|---|---|---|---|---|
| H1 — Hb and total CI | x=Hb 6–20, y=CIt 2–12 | r1, M150, Spv.98, kappa1.34 | Sa and Sv; optional DO2/OER | Same Hb meets or misses criteria depending on flow/demand. Both criterion equality curves are independently drawn. |
| H2 — Hb and allocation | x=Hb 6–20, y=r .2–4 | CIt6, M150, Spv.98, kappa1.34 | Sa and Sv; DO2 selectable | Raising r may improve Sa while worsening Sv beyond r1. Display strict qualifying-r interval for selected Hb separately from admissibility. |
| H3 — Conditional Hb boundary | x=r .2–4, y=CIt 2–12 | M150, Spv.98, kappa1.34, criteria70/40 | Joint Hb equality surface and binding criterion category | No universal Hb minimum: the boundary depends on flow and chosen constraints. This is a boundary surface, not a forward state with fixed Hb. |
| H4 — Marginal Hb gain | x=baseline Hb6–20, y=delta Hb .1–4 | CIt6, r1, M150, Spv.98, kappa1.34 | DeltaSa and DeltaDO2; DeltaSv selectable | Continuous saturation diminishing returns coexist with constant absolute delivery gain per unit Hb. Both endpoints must be mathematically admissible. |

M is an editable held-fixed input in H1–H4; provide a clearly marked synthetic demand sweep75–250 mL O2/min/m2, not a source-reported grid or clinical normal range. H1/H2 may switch to an M axis through the existing independent-axis explorer. H4 is a named derived-comparison grid with endpoint inputs, not permission to use arbitrary dependent forward-model axes.

Default per-m2 scales: blood-flow plots0–12 L/min/m2; oxygen delivery/flux0–1200 mL O2/min/m2; Hb equality0–25 g/dL. Preserve the original saturation/content/index scales. Scales are graphical defaults; off-scale values retain their numeric values with endcaps/counts. Delta scales are symmetric and shared as appropriate; no fake precision or safety color coding.

H3 has no baseline-Hb constraint and no erroneous masking because a separate displayed baseline Hb is infeasible. Compute the finite equality boundary directly; evaluate its returned equality state and record which criterion is on. If H3's threshold exceeds25, show outside-display-range, not impossible.

In H1/H2 a thin source-associated Sa70 contour and Sv40 contour may overlay the metric maps. Their intersection identifies where both inequalities can hold. Admissibility hatching remains separate. Keep criterion status legible without a red/green safe/unsafe scheme or hover-only values.

A compact **Boundary inspector** shows Hb equality, CI equality, demand equality, binding criterion, signed margins and the exact held-fixed inputs. These are alternative inverse questions, not simultaneous prescriptions. Show exact floating values at sufficient precision and the strict/equality distinction; do not round13.326 to13 then classify Hb13 as meeting the arterial boundary.

The **Objective comparison** in the slice inspector overlays separately evaluated maxima of Sv and DO2, with objective and constraints in both legends. All states, overlays, formulas and labels belong to one versioned UI generation. Changes to criteria, indexing or assumptions update both plots and exports atomically.

## 9. New A/B comparisons and independent numerical checkpoints

C1–C4 stay unchanged. Add C5 (Hb9→14 at totalCI6), C6 (CI6→9 at Hb9), and C7 (M150→200 at Hb14/CI6). All set r1, Spv.98 and kappa1.34. C7's endpoint200 is a synthetic demand perturbation, not a claimed Ahmed simulation setting. Each comparison uses the existing gross-versus-net oxygen budgets and criterion status before/after.

**Calculated teaching examples under declared app assumptions, not exact Ahmed source-reproduction values:**

| Hb g/dL | Total CI L/min/m2 | M mL O2/min/m2 | r | Sa % | Sv % | DO2 mL O2/min/m2 |
|---|---:|---:|---:|---:|---:|---:|
| 9 | 6 | 150 | 1 | 56.54063018 | 15.08126036 | 204.564 |
| 13 | 6 | 150 | 1 | 69.29735936 | 40.59471871 | 362.148 |
| 14 | 6 | 150 | 1 | 71.34754797 | 44.69509595 | 401.544 |
| 9 | 9 | 150 | 1 | 70.36042012 | 42.72084024 | 381.846 |
| 14 | 6 | 200 | 1 | 62.46339730 | 26.92679460 | 351.544 |

These reproduce the direction and qualitative inequalities described in the abstract under the chosen assumptions; this is **abstract-scenario consistency**, not validation that those assumptions equal the paper's. All rows have nonnegative venous content even when selected criteria are missed.

At r1, CI6 and M150 with the same constants:

```
Hb at Sa=.70: 13.326226012793176 g/dL
Hb at Sv=.40: 12.866700977869275 g/dL
Joint equality boundary: 13.326226012793176 g/dL (arterial binds)
```

At Hb9 the joint CI equality boundary is8.884150675195452 L/min/m2. Values at equality do not meet the strict criteria. These decimals must not be labeled a clinical recommended target or transcribed into the immutable source-reported values.

At Hb13/CI6/M150, the strict joint qualifying-r interval is approximately `(1.0514804845, 1.2253399365)` under the selected constants and criteria. Thus missing one criterion at r1 does not mean no allocation can meet both. Do not treat r approximately1 in an abstract as a universal exact1 constraint.

The derivation also predicts finite analytic boundaries at lower Hb when r is adjusted, but no automatic optimized Hb/transfusion recommendation is part of the app. Any additional minimum-over-r analysis requires an explicitly selected mathematical objective and bounds.

## 10. New numerical and visual acceptance gates

All original gates remain mandatory for the application. New gates:

| ID | Testable end state |
|---|---|
| A01 | Equivalent per-kg/native-BSA states with supplied mass/BSA preserve saturations/content/ratios and scale every transport quantity correctly. |
| A02 | CI inputs in L/min/m2 convert by1000 into the common mL-flow engine; native factor10 and common factor100 equations agree. |
| A03 | Mixed-basis inputs/VO2 keys and area values under kg output keys are rejected; no implicit BSA. |
| A04 | Legacy V1 migration preserves numeric results and does not change the declared capacity convention. |
| A05 | New fixture saturation/content/flux/OER values match an independent conservation oracle. |
| A06 | Model admissibility and all selected-criterion statuses are distinct; subcriterion admissible points remain plottable. |
| A07 | At the Hb13 r1 teaching point, Sv criterion is met but Sa criterion is not; Hb13 is not hard-coded as passing. |
| A08 | Hb boundary components and binding criterion agree with forward evaluation just below/on/above the calculated boundary. |
| A09 | CI boundary solver agrees with forward evaluation and includes the full r-dependence. |
| A10 | Demand-boundary solver agrees with forward evaluation; selected demand margin is distinct from the Cv0 mathematical limit. |
| A11 | Spv at/below a criterion gives no finite positive-demand solution; M0 and undefined-limit cases produce typed statuses, not NaN/Infinity. |
| A12 | Analytic qualifying-r intervals match independently evaluated states, reciprocal venous roots, and empty/tangent/intersected cases. |
| A13 | Hb derivatives and finite increments agree with centered finite differences; M0 saturation sensitivities are zero. |
| A14 | There is no hard-coded break at Hb12 or13; positive-demand Sa/Sv second derivatives stay negative throughout the admissible interior. |
| A15 | Fixed-flow DO2 slope is constant across Hb and net lung uptake remains M; dSv/dHb=(1+r)dSa/dHb. |
| A16 | Sv maximum is r1; DO2 maximum follows the existing conditional formula; inadmissible or degenerate optima are not promoted. |
| A17 | At least2,000 seeded parameter cases test boundary/criterion/derivative/unit properties against an independent oracle. |
| A18 | Source metadata distinguishes reported values, app assumptions and derived fixtures. Unknown Ahmed constants/figure IDs cannot be marked verified. |
| A19 | CPython scalar/grid and browser results agree for V2, all inverse/sensitivity requests, endpoints, and status masks. |
| A20 | Numeric JSON/CSV round trips retain basis, units, criteria, provenance, analysis version, strict endpoints and undefined states. |

| ID | Required UI/export behavior |
|---|---|
| AV01 | H1–H4 and C5–C7 load declared inputs, native units, criteria and assumptions exactly. |
| AV02 | Both Sa70 and Sv40 boundaries are identified; no clinical safe/unsafe labeling or conflation with Cv0. |
| AV03 | Criterion edits change provenance to user_selected without modifying core oxygen content or flux. |
| AV04 | Hb13 r1 inspector shows arterial-only failure accurately despite rounded Hb thresholds. |
| AV05 | H4 shows diminishing saturation gain without a manufactured12-g/dL breakpoint and constant delivery slope in baselineHb. |
| AV06 | Unit switches preserve state only with explicit body-size conversion; inconsistent cross-basis comparisons are blocked. |
| AV07 | H3 is a boundary surface, handles out-of-display-range separately from no solution, and uses no implicit fixed Hb. |
| AV08 | Source-faithful Ahmed mode cannot be enabled while source gate is incomplete; user-facing evidence-status note remains visible. |
| AV09 | Paired budget numbers and common native scales reconcile gross transport and net uptake for C5–C7. |
| AV10 | Downloaded plots/data contain source status, assumptions, criteria, units/indexing and exact visible values; stale responses never mix generations. |

The pack's executable reference checker verifies arithmetic, indexing and derived constraints only. It is not a production API implementation, a browser test, a patient model validation, or an exact-source reproduction.

## 11. Source-replication gate and release status

T00A must verify all of the following from the full text before exact replication is labeled complete: parameter units and normalization, total-versus-systemic output definition, kappa and dissolved-oxygen convention, Spv endpoint, whole-body uptake/consumption assumption, Qp/Qs and Hb grid values, mathematical constraints, plotted objectives, saturation inequality definitions, any alternative figures/supplements, and any additional Hb-to-flow or viscosity relation. Record that a feature is absent only after actual full-text inspection, not because the abstract does not mention it.

If verified Ahmed equations are the same conservation model, implement a source preset/annotation rather than a second solver. If they differ, first add a separately documented equation/version contract with independent tests; do not silently merge mechanisms or relax the original exclusions. A viscosity/flow or supply-dependent-consumption module is not authorized solely by its possible mention in the source and remains a separate scientific design decision.

Source audit and arithmetic are independent statuses. Numerical agreement with an approximate abstract finding cannot establish verified source constants. A good source-status report can legitimately have `ahmed_abstract_scenario_consistency=passed` and `ahmed_full_text_replication=blocked_source_unavailable`.

**Definition of this amendment's end state:** all native-indexing, boundary, derivative, visualization and export requirements are implemented and tested; the app communicates the named source's verified findings and all limitations without fabricating unverified source settings. Exact Ahmed reproduction is separately unavailable until the source gate passes. A final implementation handoff must explicitly report both statuses, along with actual deployment status.

## 12. Integration with revision1.2
All native-indexing/criterion requirements and T00A remain. The resistance provider in Section08 is a separate upstream flow calculation, not a verified additional Ahmed mechanism. In its physical oxygen mode, pass achieved flows to the same core and retain fixed physical VO2 when varying Hb. There is no Hb-to-viscosity-to-resistance law. Do not reuse the prescribed-flow CI/r inverse boundaries as attainable resistance-intervention paths without a separate derivation; a labeled fixed-flow projection is allowed. The original Hb partial derivatives remain valid when the circuit and its Hb-independent flow law are fixed.
