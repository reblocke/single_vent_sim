**Updated to v1.2. The ZIP contains the entire integrated specification and implementation pipeline—not just the new amendment.** It preserves the Barnea and Ahmed work and adds the resistance-driven extension, executable reference calculations, numerical grids, source comparisons, and verification reports.

## Download

**[Complete v1.2 specification and reference-pipeline ZIP — 38.5 MB](sandbox:/mnt/data/parallel_circulation_oxygen_spec_pack_v1_2.zip)**

[Complete implementation ticket](sandbox:/mnt/data/parallel_o2_spec_pack_v1_2/IMPLEMENTATION_TICKET.md) · [Savorgnan extension ticket](sandbox:/mnt/data/parallel_o2_spec_pack_v1_2/SAVORGNAN_EXTENSION_TICKET.md) · [Full integrated specification](sandbox:/mnt/data/parallel_o2_spec_pack_v1_2/FULL_SPECIFICATION.md)

The bundle includes **107 files**, including the prior specifications and fixtures, new circuit schemas/configurations, a standard-library Python reference pipeline, six numerical heatmap grids, paired sensitivity-analysis outputs, and checksums. **The reference pipeline runs now; the interactive browser application remains the coding agents’ implementation task.**

## What changed

### 1. Resistance-driven flow is a separate model layer

The original prescribed-flow experiments remain unchanged. The new mode follows:

$$
\text{Prescribed resistance changes}
\rightarrow
\text{assumed ventricular-output response}
\rightarrow
\text{pressure and flow solution}
\rightarrow
\text{existing oxygen-conservation engine}.
$$

This preserves the distinction between oxygen accounting and the additional assumptions required to determine flow—the limitation Barnea explicitly identifies. 

In resistance mode, **achieved Qp, Qs, total output, Qp/Qs, and pressure are outputs**, not additional independently editable inputs. Native pulmonary resistance and shunt pressure loss remain separate throughout calculation, visualization, and export.

### 2. The pulmonary-resistance discrepancy becomes a required audit feature

The implementation has two explicitly different perturbation interpretations:

| Interpretation                           | Permitted use                                                                                         |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Native-Rp perturbation**               | Default: alter native pulmonary vascular resistance while retaining the specified shunt coefficients. |
| **Whole-pulmonary-pathway perturbation** | Restricted, clearly labeled fixed-output/linear-shunt audit for comparison with the primary table.    |

The paper describes native pulmonary resistance changes with shunt resistance held constant. That statement is preserved alongside the reported table values; it is not silently reconciled with whichever interpretation reproduces more numbers. ([MDPI][1])

The generated comparisons also retain an additional finding: the whole-pathway interpretation reproduces the primary table’s ratios and delivery-index changes, **but not every saturation column**. The specification therefore prohibits calling it a complete Table 1 reproduction.

### 3. The afterload rule now has an explicit, testable definition

I added a structural safeguard beyond the supplied reconstruction: **the afterload definition must be selectable and named**, because a nonlinear circuit’s operating resistance is not necessarily the nominal parallel resistance used before solving flow.

| Closure                                 | Specification                                                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Nominal parallel afterload**          | Calculate total output from the nominal equivalent resistance, then solve the nonlinear flow split. This is the declared reconstruction that matches the advanced table.       |
| **Operating circuit secant resistance** | Solve output and pressure together using the actual operating \(P/Q_T\). This is a **new derived sensitivity analysis**, not a claimed author-verified equation or correction. |

The source supplies the afterload power law and quadratic shunt concept. The exact closure and calibration used in its executable implementation have not been audited. ([MDPI][1])

An important acceptance test follows: **\(\alpha=1\) holds driving pressure constant in the operating-circuit closure, but need not do so in the nominal-afterload closure when the shunt is nonlinear.** The app must not carry the linear-model interpretation into the nonlinear model without qualification.

### 4. Nonlinear shunt calibration is frozen within each experiment

The specification defines the coefficients at a declared reference pulmonary flow:

$$
K_1=(1-f)R_{\mathrm{shunt},0},
\qquad
K_2=\frac{fR_{\mathrm{shunt},0}}{Q_{p,\mathrm{reference}}}.
$$

The reference flow and calibration remain fixed during a perturbation. Agents must not recalculate \(K_2\) from the achieved flow, which would inadvertently change the model being tested.

The inspector separately reports **nominal, operating secant, and incremental resistance**, together with the native pulmonary and shunt pressure drops. All pressures are steady mean-circuit quantities; no diastolic waveform or coronary-perfusion timing is inferred.

## New visualizations

The original heatmaps remain. Six additional experiments are specified, and their numerical grids are included in the ZIP.

| Scene                                    | Parameters explored                                         | Main distinction                                                                                         |
| ---------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **R1: Resistance perturbations**         | Systemic × native pulmonary resistance multipliers          | Saturation, systemic delivery, output, and pressure can move differently.                                |
| **R2: Location of pulmonary resistance** | Native resistance fraction × pulmonary perturbation         | Identical baseline flows can have different responses depending on where resistance resides.             |
| **R3: Mechanism separation**             | Afterload sensitivity \(\alpha\) × nonlinear fraction \(f\) | Output responsiveness and nonlinear shunt behavior are isolated without changing perturbation semantics. |
| **R4: State versus response**            | Native pulmonary × shunt resistance                         | Absolute delivery at a state is separated from the change after a perturbation from that state.          |
| **R5: Hemoglobin and resistance**        | Hb × independently prescribed systemic resistance change    | Carrying capacity and flow effects are combined without inventing transfusion hemodynamics.              |
| **R6: Structural-model uncertainty**     | \(\alpha\) × \(f\), comparing the two closures              | The consequences of the selected output-law interpretation are visible.                                  |

**R2 and R4 deliberately use different reference policies.** R2 constructs matched-baseline circuits. R4 retains a fixed global model reference and calculates a local before/after change at every grid point. Those policies appear in captions and exported metadata rather than being hidden in code.

### A required same-scope mechanism comparison

The reference pipeline reproduces the following **independent calculations**, applying the 45% change only to native pulmonary resistance throughout:

| Assumptions                | Calculated change in delivery index |
| -------------------------- | ----------------------------------: |
| Fixed output, linear shunt |                            −5.7515% |
| Responsive output only     |                            −2.6926% |
| Nonlinear shunt only       |                            −4.7666% |
| Both additions             |                            −1.2781% |

The app must show the four results and their interaction term. It must **not** use the approximately −25.2% whole-pathway result as the baseline for attributing the effects of ventricular responsiveness and shunt nonlinearity.

## Hemoglobin integration: physical consumption stays fixed

The paper’s \(Q_sS_a\) index is retained for source reconstruction because its hemoglobin is held constant. It is kept separate from physical oxygen delivery. ([MDPI][1])

The revised model distinguishes:

$$
k=\frac{\dot VO_2}{10B},
\qquad
I=Q_sS_a,
\qquad
DO_2=10BI,
$$

where \(B\) is oxygen capacity in mL O₂/dL and flow is in L/min.

In a physical hemoglobin experiment, **\(\dot VO_2\) stays fixed and \(k\) is recalculated as Hb changes**. Holding \(k\) fixed while claiming constant physical consumption would be an error.

The source-normalized mode therefore has no active Hb slider and does not report physical DO₂ without a declared capacity. The combined Hb mode uses explicit physical units and preserves the oxygen-budget identities. No Hb-to-viscosity-to-resistance relationship is introduced.

## The pipeline is included and executable

From the unpacked directory:

```bash
python scripts/run_reference_pipeline.py --output reports/new-full-run
```

A smaller run is available:

```bash
python scripts/run_reference_pipeline.py --quick --output reports/new-smoke-run
```

It requires the **Python standard library only**, with no network access or package installation. Output directories must be new or empty.

The full run produces source-comparison tables, mechanism-ablation tables, effect-size curves, six **201×201** numerical grids, and a **20,000-draw sensitivity ensemble** reused across five profiles and four mechanism settings—**400,000 paired evaluations**, not 400,000 independent draws.

The ensemble’s distributions are fully declared **new app assumptions**, not a reconstruction of the paper’s incompletely available sampling definitions. Summaries retain eligible and ineligible denominators and label quantiles and negative-effect fractions as properties of the chosen ensemble, not clinical probabilities. The source itself characterizes its Monte Carlo analysis as directional robustness rather than patient-specific probability estimation. ([MDPI][1])

## Verification completed

All three reference suites passed: **63 fixed reference cases, 1,945 metric comparisons, and 6,000 seeded parameter states**, including **80 independent high-precision circuit cross-checks**. The nominal advanced reconstruction matched all **25 checked Table 3 cells** within their reported rounding intervals.

I also ran the pipeline from a cleanly unpacked ZIP in an unrelated working directory, then replayed all 20,000 exported sampled inputs. The draws, 400,000 paired results, and summary CSVs were **byte-identical**. Original numerical fixtures and example configurations were preserved, and archive contents and hashes were checked.

**Remaining boundaries are explicit:** no completed browser app, browser/visual validation, remote repository modification, or deployment; no author-code or rendered-source-figure audit; no exact original Monte Carlo reproduction; and the inherited Ahmed full-text verification gate remains unresolved.

The coding-agent entry point is **`MASTER_IMPLEMENTATION_PROMPT.md` with the entire ZIP unpacked alongside it**.

[1]: https://www.mdpi.com/2308-3425/13/8/347 "https://www.mdpi.com/2308-3425/13/8/347"
