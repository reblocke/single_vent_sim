# 05 — Barnea source reconstruction and discrepancy register

## 1. Source and interpretation

[P1] Barnea O, Santamore WP, Rossi A, Salloum E, Chien S, Austin EH. *Estimation of Oxygen Delivery in Newborns With a Univentricular Circulation*. Circulation. 1998;98:1407–1413. DOI 10.1161/01.CIR.98.14.1407.

The uploaded PDF has eight pages including the publisher end page. The model and source equations are on PDF pages 1–2, Figure 2 on page 2, Figures 3–4 on page 3, Figures 5A–B on page 4, Figures 6–7 on page 5, and limitations on page 6. The source PDF checksum is recorded in SOURCES.md.

The application reconstructs curves from equations; it is not a digitization of the published image and does not claim access to the authors' original simulation code. The source's defaults and the app's explicitly inferred/selected defaults must remain distinguishable.

## 2. Reconstruction modes

### P-stated-capacity (default)

B=22 mL O2/dL; M=9 mL O2/kg/min; Qt=300 and 450 mL/kg/min; r sampled from 0.2 to 10 at 4,001 logarithmically spaced points for the reference curves. Spv=.96 is a **declared reconstruction assumption**: it is used in the paper's worked estimation examples and approximately reconstructs several numerical landmarks, but the methods do not unambiguously designate it as the baseline for every simulation figure.

The paper describes Hb=15 as its source capacity annotation. It does not become an additional independent constraint in direct-capacity mode.

### P-formula-capacity (sensitivity/reconstruction comparison)

Identical inputs, except B=1.38×15=20.7 mL O2/dL. This follows the multiplication printed beside the stated capacity, not the separately stated 22. It is shown as an alternative interpretation of inconsistent source input information, not silently substituted as a correction.

### Hb-linked explorer

Separate mode with kappa=1.34 by default, variable Hb, and synthetic teaching values described in the product specification. Label all Hb sweeps as extensions; the original source held hemoglobin/capacity fixed.

## 3. Figure definitions

| Source figure | Required reconstruction | Notes |
|---|---|---|
| Figure 1 | Topology-neutral labeled parallel-circulation diagram | Explain equal pulmonary-inlet and systemic-arterial contents. Do not reproduce an anatomical drawing without need/rights. |
| Figure 2 | x=Sa%, y=DO2; two Qt values; parameter=r | Preserve curve ordering, r=1 markers, masked-domain breaks, and conditional maxima. |
| Figure 3 | x=Sv%, y=DO2; same states | This is a parametric curve with potentially two DO2 values at the same Sv; do not sort by Sv. |
| Figure 4 | x=(Sa−Sv) percentage points, y=DO2 | Label absolute percentage-point difference, not fractional extraction. |
| Figure 5A | x=r, y=DO2 | Display zero-venous boundaries and distinguish formal mathematical tails. |
| Figure 5B | Local sensitivity plus exact finite-error comparison | Do not conflate derivative approximation, true-relative error, and true-excess-over-estimate. |
| Figure 6 | x=Omega, y=DO2, M=9 | All admissible points lie on DO2=9 Omega by definition. |
| Figure 7 | x=Omega, y=DO2, M=9 and18, Qt450 | Lines have slopes 9 and18. Mask infeasible values; source formal extensions may be separately displayed. |

For the r=1 markers and optima, evaluate exact states rather than using the nearest log-grid sample. The displayed/extracted point must be tied to exact parameters.

## 4. Mandatory discrepancy register

### D01 — Oxygen-capacity arithmetic

Source: methods, journal page 1408 / PDF page 2. The text gives Hb=15 g/dL and O2 capacity=22 mL/dL, alongside 1.38×15. The multiplication yields **20.7**, not22. Both source statements are preserved; no assertion that they are identical is allowed. App policy: default to stated B=22 for reconstruction and expose the alternative B=20.7. Do not back-calculate a kappa of 22/15 and present it as the paper's coefficient.

### D02 — Baseline pulmonary venous saturation is not fully specified for all figures

Spv=.96 is an assumption for the reconstruction, supported by its use in worked examples and approximate numeric consistency, not an explicitly complete source declaration. Include this label in plot captions/export manifests. Do not call this a fully exact reproduction of the original computational experiment.

### D03 — High-output peak saturation under the declared reconstruction

Source: results, journal page1409 / PDF page3. The text reports high-output peak delivery of45.4 at Sa64%; low-output peak24.6 at Sa60%. With B22, Spv.96, M9, the equations give:

- Qt300: r*=0.6048509656099867, Sa*=59.818638650668%, DO2*=24.60060301888224.
- Qt450: r*=0.4445204353404167, Sa*=66.458042164960%, DO2*=45.54692348662108.

The 64% versus66.46% difference must be visible. This is a discrepancy **under the declared reconstruction assumptions**, not proof of which source entry is erroneous. Do not tune Spv separately for the peak while using .96 for neighboring points unless explicitly creating a different scenario.

### D04 — Rounded numerical landmarks

Source example: high-output Sa80→85%, DO2 reported34.1→14.6. The declared reconstruction gives34.2→14.60454545. Show computed and reported columns with their differences; do not label the first number an exact match. Likewise the published70% values are approximately21.9 and45.0, versus calculated21.96923077 and45.06923077.

### D05 — Finite error versus local sensitivity and denominator choice

Source example: Sa=.77, Sv=.45, assumed Spv=.96, true Spv=.873. Exact ratios are r_est=1.6842105263157894 and r_true=3.1067961165048543. Relative error versus true is−45.7894736842%. The true ratio is84.4660194175% larger than the estimate. These are different denominators. The source's approximate85% wording and local sensitivity must not become a claim that the estimate is85% below the true ratio.

The local logarithmic sensitivity is Psi=−Spv/(Spv−Sa). Its finite perturbation approximation is only local. The text's examples also sometimes describe absolute saturation changes as relative percentages. The app always labels percentage points separately from relative percent.

### D06 — Formal states outside nonnegative-content feasibility

The source explores broad ratio ranges, including parameter values for which the equations imply Cv<0 while keeping M fixed. For B22, Spv.96, M9:

- Qt300 permits nonnegative Cv only for r approximately[0.2069068328,4.8330931672].
- Qt450 permits nonnegative Cv only for r approximately[0.1184618228,8.4415381772].

These boundaries are derived extensions of source conservation equations. They are not clinical-safe ranges. The main app masks inadmissible portions; an audit overlay may retain the raw formal continuation. Do not suppress this difference between the app's default plotting and a literal rendering of the paper's algebraic curves.

## 5. Source numerical comparison table

Generate a table with `source_location`, `reported_quantity`, `reported_value`, `computed_value`, `absolute_difference`, `capacity_convention`, `spv_assumption`, `comparison_status`, and `notes`. Source values are immutable fixtures. Computed values come from the engine. Use statuses `approximately_consistent`, `discrepant_under_declared_assumptions`, and `not_uniquely_specified`; do not reduce source interpretation to a single pass/fail number.

Required landmarks include the Sa80/85 delivery pair, Sa65 atQt300 versusSa70 atQt450, both Sa70 deliveries, both reported maxima, the Sv50 two-state illustration, and exact Spv=.96/.914/.873 ratio examples. Evaluate the Sv50 roots by independently solving the quadratic in r and compare to the paper's rounded r=.38 and2.68, rather than treating these rounded values as exact roots.

At least one test checks that Figure3's branches are preserved and that a source-discrepant value stays visibly discrepant in the generated table.

## 6. Later hemoglobin study
The study-specific Ahmed source register is Section 07 and `verification/ahmed_source_claims.json`. Do not reuse Barnea's B=22 or kappa=1.38 as an assumed Ahmed constant. Barnea's Spv=.96 reconstruction assumption also must not propagate into an alleged exact Ahmed reconstruction. The new teaching experiments retain declared app constants kappa=1.34 and Spv=.98, while the true Ahmed values remain unverified.

There is no Ahmed figure-number inventory in this pack because its full text was not accessible. Adding guessed figure numbers or treating abstract inequalities as exact saturation pairs fails the source gate.

## 7. Savorgnan source laboratory
The new source audit is [10_SAVORGNAN_SOURCE_AUDIT.md](10_SAVORGNAN_SOURCE_AUDIT.md). Preserve this document's Barnea assumptions/discrepancies; do not replace them with the newer source defaults. Tables1/3 from Savorgnan are reported separately from native-only, whole-pathway audit, nominal-closure and derived circuit-secant computations. Exact source figure/code/MonteCarlo replication remains unclaimed where unavailable. The six new numerical surfaces are explicitly defined teaching scenes, not digitized source figures.
