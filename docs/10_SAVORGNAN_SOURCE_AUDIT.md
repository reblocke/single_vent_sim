# 10 — Savorgnan source audit and discrepancy register

Revision **1.2.0-spec**, accessed2026-09-18. This register preserves the user's supplied appraisal, checks it against retrieved publisher text/tables, and separates new numerical calculations from statements verified in the source.

## 1. Source record and access

**[P3]** Savorgnan F, Shah V, Turner E, Hu K, Pilla P, Visokay S, Ness K, Flores S, Loomba R, Acosta S. *Computational Modeling of Oxygen Delivery in Norwood Physiology: Differential Effects of Systemic and Pulmonary Vasodilator Conditions*. Journal of Cardiovascular Development and Disease.2026;13(8):347. DOI10.3390/jcdd13080347; PMID42645818. Published2026-07-23.

Publisher: https://www.mdpi.com/2308-3425/13/8/347

Bibliographic record: https://pubmed.ncbi.nlm.nih.gov/42645818/

Retrieved: indexed publisher article text, equations, Tables1–3 and figure captions. Direct publisher requests were rate-limited; PDF/XML retrieval and figure rendering were unsuccessful. An identified PMC endpoint did not provide usable full text during this run. No executable author code was retrieved or audited. Article text says Python3.8 and NumPy-based Monte Carlo, but a description of code is not the code itself.

No PDF bytes are bundled or assigned a checksum. The paper is described by the publisher as CC BY; this pack includes compact attributed numerical tables and original reconstructions, not copied full article text/figures. Private clinical records and unrelated repository material are excluded.

## 2. Source-to-implementation mapping

| Element | Source location | Treatment in this pack |
|---|---|---|
| NativeRp in series withRsh; common arterial source | Methods2.1 | Source-reported structure; common downstream equality is an explicit reconstruction assumption. |
| Oxygen mixing, constantHb andI=QsSm | Methods2.3–2.4 | Source-reported; normalized k=.19 derived from baseline; physicalDO2 unavailable without a declared capacity. |
| Rs40,Rp12,Rsh28 and balancedflows/saturations | Methods/baseline and table contexts | Stored as source values, not patient measurements. |
| Five resistance multiplier profiles; shunt unchanged | Methods2.4–2.5, Table1note | Immutable source-associated inputs; native-only default; scope discrepancy retained. |
|20,000MonteCarlo draws | Methods/code and Table2note | Iteration count verified; full distributions/correlations/seed unverified; new ensemble not called replication. |
| Afterload power-law,alpha.35 | Methods2.8 | Source-reported law; exact nominal/operating afterload treatment in nonlinear circuit not established from executable code. |
| Linear-plus-quadratic shunt,f.5 | Methods2.8, advancedresults | Concept/default verified; Kpartition/calibration declared as a reconstruction. |
| Effect multipliers0–1.25 | Methods2.8 | Source scaling range verified; called effect-size sensitivity, not validated pharmacological dose response. |
| Table1 and Table3 numerical checkpoints | Tables1,3 | Source fields remain distinct from computed values under each interpretation. |
| Rp/Rsh state surface | Methods/Results; Figure3caption | Structural inspiration; rendering/grid/anchor not verified. New state-vs-local-response pair specified explicitly. |
| Excluded mechanisms and lack of clinical validation | Limitations | Preserved in app scope and labels. |

The code and data provide **independent reconstructions of declared interpretations**. None is called corrected study results or an audit of author code.

## 3. Discrepancies and unresolved definitions

### SD01 — Native pulmonary resistance versus whole pulmonary pathway

Methods/table wording holds shunt resistance constant while applying pulmonary multipliers to nativeRp. At fixedQt2, the selective pulmonary profile gives nativeRp12→6.6,Rsh28 unchanged, r40/34.6≈1.156069,Qs≈.927614,Qp≈1.072386. CalculatedIchange≈−5.751525%.

Table1 reports r1.82 and indexchange−25.2%, matching the interpretation in which the entire40-unit pulmonary pathway is multiplied by.55: r≈1.818182,Qs≈.709677,Qp≈1.290323,Ichange≈−25.239919%.

All five reported Table1 ratios and delivery-index changes agree, to reported rounding, with whole-pathway multipliers under the declared reconstruction. This supports an unresolved implementation/reporting mismatch; it does not identify its origin or establish what the author code did. Keep both interpretations and source statements visible.

### SD02 — Additional Table1 saturation-column differences

Even the whole-pathway interpretation does not reproduce every source column. At k.19,Spv.99,Qt2:

| Profile annotation | ReportedSa | Computed whole-pathwaySa |
|---|---:|---:|
| Nicardipine |.769 |.7660714286 |
| Milrinone |.803 |.8052134146 |
| Sildenafil |.819 |.8211111111 |

These exceed half the reported.001saturation unit. Do not advertise entire Table1 reproduction on the basis of agreeing ratios/index deltas. Do not force the oxygen budget to match each inconsistent rounded saturation field separately.

### SD03 — Advanced output/afterload closure

The nominal-parallel-afterload then nonlinear-split reconstruction matches all25 Table3 values within the rounding interval: Qt,Qs,Qp,r to.001 and indexchange to.1percentage points for five profiles. This is consistency evidence, not proof of an explicitly documented author algorithm.

The precise afterload used with a nonlinear branch remains structurally consequential. The new circuit-secant closure is independently defined to probe this assumption. It is not attributed to the source or labeled a correction. Preserve bothnominalRhat and actualP/Qt and the alpha1 pressure caveat.

### SD04 — Calibration flow and nonlinear fraction

A nonlinear fraction is insufficient without a calibration rule and dimensional coefficients. This pack uses K1=(1-f)Rsh andK2=fRsh/Qp_cal; atQp_cal1,f.5 this yields14and14. Qp_cal is a frozen reference quantity. Exact author calibration for every sensitivity surface remains unverified. Never retune K2 to a displayed result or label an inferred partition author-verified.

### SD05 — Source index versus physical oxygen delivery

The source varies resistance with Hb held fixed and reports I=QsSm. Its units are not mLO2/min. The full content convention requires consistent factors of10 when flow isL/min and contentmL/dL. A normalized source reconstruction does not need an unknownHb; its absolute physicalDO2 is not identified. An explicitly declared physicalHb/M example is a different experiment.

### SD06 — Apparent fixed-to-advanced contrast combines more than two changes

The contrast between published−25.2% and−1.3% cannot be attributed uniquely to alpha and f while Table1 scope is unresolved. Hold nativeRp semantics fixed and compare:

| Added mechanisms | Calculated change inI from commonbaseline |
|---|---:|
| Neither: alpha0,f0 |−5.7515247989% |
| Output response only: alpha.35,f0 |−2.6925711305% |
| Nonlinear shunt only: alpha0,f.5 |−4.7666475846% |
| Both: alpha.35,f.5 |−1.2780860846% |

The nonzero2×2 interaction is computed in the pipeline. Label these as independent calculations under the nominal reconstruction, not separately reported source results.

### SD07 — Figure rendering, labels and surfaces

Retrieved captions identify Figure1 as drug-condition comparisons, Figure2 as effect-scale curves and Figure3 as the Rp/Rsh surface. Some running-text references are less clear. Images, pixel values, exact axis grids and surface calibration were not visually audited. Do not invent digitized data, image checksums, or full figure equivalence. Numerical R1–R6 grids are new teaching experiments with specified axes/anchors. Source captions alone do not prove that the source surface is an intervention-response surface rather than a state surface.

### SD08 — Monte Carlo scope and precision

The source's20,000iteration count is verified, but exact input distributions, covariance, state rejection policies and seed are not fully available. No exact-source stochastic reproduction is claimed. New sampling definitions are published completely; numerical sampling precision does not remove structural-model uncertainty. More iterations cannot resolveSD01–SD04.

### SD09 — Clinical and patient-specific inference

Neither the output power law nor its alpha supplies a maximum cardiac output, preload envelope, myocardial oxygen budget, diastolicpressure waveform, or regional oxygen-use threshold. The model has no mechanistic Hb-to-viscosity-to-resistance link. This limitation persists when the three papers are combined. No claim about a particular child's bradycardia, shunt obstruction, transfusion dose or safeHb is generated.

## 4. Required source-status report

Each release/export includes separate values for:

```
savorgnan_source_text_tables = retrieved_and_checked
savorgnan_table1_semantics = unresolved_source_discrepancy
savorgnan_table1_all_columns = not_fully_reproduced
savorgnan_table3_nominal_reconstruction = within_reported_rounding   # only after actual check
savorgnan_executable_code_audit = not_performed_code_not_retrieved
savorgnan_rendered_figure_audit = not_performed_rendering_unavailable
savorgnan_original_monte_carlo = blocked_sampling_contract_unverified
ahmed_full_text_replication = inherited_blocked_source_unavailable
clinical_validation = not_established
```

The archived run report, not this template, controls whether a numerical comparison passed. A future clarification or code retrieval must be versioned, preserve these prior comparisons, and add regression tests. Do not silently overwrite source-reported values or substitute new parameters while retaining the old reproduction label.

## 5. Priority of source information

The user's supplied appraisal is the requested starting basis. Indexed-source checks support its central resistance-scope distinction. Additional itemsSD02–SD05 and the explicitly different output closure are new implementation safeguards/derivations. Original Barnea and Ahmed source limitations remain intact. Scientific changes beyond this contract require a documented decision, not an agent's attempt to make a heatmap look more plausible.
