## Overall assessment

**The numerical foundation is sound in the cases I checked. I would keep the existing engine and make a targeted correction pass—not rewrite it.** The implementation preserves the important scientific distinctions we specified: systemic versus total flow, gross oxygen transport versus net uptake, physical oxygen delivery versus the normalized source index, and prescribed-flow versus resistance-driven experiments.

However, **I found defects in how some experiments are specified and interpreted by the interface, plus inconsistencies in boundary calculations.** Those matter in an educational simulator: a correct solver can still teach the wrong relationship when a displayed control does nothing or clicking a map selects a different physical state.

**[Download the audit, reproducible checks, and Codex follow-up ticket](sandbox:/mnt/data/single_vent_sim_audit_2026_09_21.zip)**
[Read the targeted implementation ticket](sandbox:/mnt/data/single_vent_sim_audit_2026_09_21/CODEX_FOLLOWUP_TICKET.md)

No repository files, issues, branches, or deployments were changed.

## What I audited and verified

I inspected `reblocke/single_vent_sim` at **`e807bc5`**, including the deployed application artifact containing runtime commit **`76e401a`**. The later commit records deployment verification rather than a new scientific implementation. The repository’s completion receipt reports all 108 acceptance gates passed; my audit goes beyond those recorded checks.

I extracted and executed the **actual Python package shipped in the deployment artifact**, rather than recreating its formulas independently and assuming the application used them.

| Check I independently ran                                                                      | Result                                                       |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Original Barnea, Ahmed, and resistance-model reference fixtures                                | **63 cases; 1,945 metric comparisons passed**                |
| Additional prescribed-flow states, including explicit per-kilogram/per-area equivalence checks | **3,000 cases passed**                                       |
| Additional circuit states against the independent high-precision pressure-root oracle          | **60 cases; 2,160 metric comparisons passed**                |
| Deployment artifact integrity                                                                  | **All 39 manifest entries matched their hashes and lengths** |

The largest checked numerical differences were approximately \(5.7\times10^{-14}\) for the prescribed-flow checks and \(1.7\times10^{-13}\) for the circuit checks—consistent with floating-point arithmetic.

**Verification limits:** these executions used the available CPython 3.13.5/NumPy 2.3.5 environment, not the repository’s exact locked environment. I also inspected its retained CI reports and screenshots. Those reports show 123 successful browser tests at each deployment base, but I did **not** independently rerun those browser suites: local/file browser navigation was blocked in this environment. Accordingly, I distinguish executed defects below from findings established through frontend source inspection.

## 1. R4 exposes resistance controls that do nothing

**Priority: fix next. This is the most consequential user-facing issue I found.**

**Relevant code:**
`src/parallel_o2/resistance_experiments.py::_axis()` and `_batch()`
`web/src/resistance.ts::controls()` and `args()`

In **R4—State versus local response**, the axes directly specify current native pulmonary resistance and current shunt resistance. The Python calculation then derives the corresponding resistance multipliers from those absolute values. That is reasonable.

The problem is that the interface **also offers editable “Native pulmonary resistance multiplier” and “Nominal shunt multiplier” controls**, and the caption describes them as held inputs—even though `_batch()` overwrites them with the axis-derived values before solving the circuit. The actual local perturbation remains a separate multiplier of 0.55.

### Executed reproduction

With the same R4 axes, I changed:

| Input                                  | Original | Changed |
| -------------------------------------- | -------: | ------: |
| Native pulmonary resistance multiplier |        1 |     0.2 |
| Shunt resistance multiplier            |        1 |     0.3 |

**The tested grid values remained identical. Both endpoints in the point inspector remained identical.**

The API also accepts an absolute current-Rp axis alongside an Rp-multiplier axis. One silently overrides the other, producing an invariant direction on the heatmap.

That is not physiological insensitivity. It is input precedence.

### Why this matters

A user could reasonably conclude:

> “Changing pulmonary resistance substantially has no effect in this part of the model.”

But the requested change never reached the circuit solver. This undermines exactly the distinction the simulator is supposed to teach.

### Recommended correction

In R4, make absolute current resistances authoritative and mark the corresponding multipliers as **derived**, not editable. Reject contradictory axis combinations.

An editable local-response strength would be useful, but it should explicitly change **`local_rp_multiplier`**—with 0.55 retained as the named preset—not an unrelated multiplier that gets overwritten.

The regression test should verify **which scientific parameter each control resolves to**, not require every output to change with every input. Genuine invariances, such as unchanged Sa when only Qs changes under the appropriate fixed-flow assumptions, must remain intact.

## 2. Logarithmic resistance configurations use inconsistent plot coordinates

**Priority: fix next. Default linear resistance presets are not affected by this particular defect.**

**Relevant code:**
`web/src/resistance.ts::update()`
`web/src/plots.ts::renderMap()` and its point handler

The saved-state validator and Python API accept logarithmic resistance axes. However, the resistance-view adapter replaces `plot_coordinates` with the **physical coordinates**. The shared point handler then treats those positions as logarithmic coordinates and applies \(10^x\) when decoding a hover or click.

For example, for a physical resistance multiplier of **0.5**:

$$
\text{Correct plotted log coordinate}=\log_{10}(0.5)\approx-0.30103.
$$

The resistance adapter instead supplies **0.5** as the plot coordinate. The point handler then decodes:

$$
10^{0.5}\approx3.16228.
$$

The result is an inspected coordinate of **3.16 rather than 0.5**. Depending on the axis bounds, that can select a different state or trigger a range error.

I verified that a saved configuration activating this path is accepted by the Python validator. The coordinate defect is established from the frontend code and its arithmetic; I did not execute a fresh browser click.

### Recommended correction

Use one coordinate-transform contract across both providers:

$$
\text{physical coordinate}
\;\longleftrightarrow\;
\text{plot coordinate}.
$$

Either consistently use log-transformed positions on linear plot axes, or consistently use native values with genuine logarithmic plot axes. Do not mix the two.

**The critical new browser test:** restore a logarithmic resistance configuration, click a known sample, and verify that the selected physical coordinates and state values equal the Python calculation for that exact sample.

This illustrates a limitation of the existing validation strategy: **Python/browser numerical parity can pass while the JavaScript presentation layer connects the correct array to the wrong inspected point.**

## 3. Export is not reliably independent of the network after initialization

**Priority: practical reliability correction.**

**Relevant code:** `web/src/export.ts::bundle()`

The export operation performs and awaits a new request for `build-info.json`. It has no in-memory fallback for that metadata.

That conflicts with the v1.2 requirement that **already-loaded calculations and exports must not require network requests**. 

This does **not** mean every offline export will fail: browser caching may satisfy the request. It means success depends on cache/network behavior rather than solely on the initialized application. If the fetch cannot be satisfied, export fails despite the model and displayed results already being loaded.

### Recommended correction

Retain the immutable build/runtime metadata during initialization and pass it into export generation. This also ensures that an export identifies the **loaded application version**, rather than potentially fetching metadata from a newer deployment during a long-lived session.

Add a browser test that initializes the application, computes a result, blocks subsequent network requests, and then successfully exports the figure/data bundle.

This is a **source-level dependency finding**, not an independently executed offline-browser failure.

## 4. The forward solver and optimizer disagree at numerical boundaries

**Priority: lower than the interface issues, but worth fixing because boundary interpretation is a central feature.**

**Relevant code:**
`src/parallel_o2/model.py::oxygen_arrays()`
`src/parallel_o2/derived.py::conditional_optimum()`

The forward model uses a tolerance when deciding whether venous oxygen content is effectively at zero. The optimizer instead uses exact floating-point comparisons for the corresponding existence condition:

```python
m / a > 0.25
u == 0.25
```

Consequently, the two functions can classify the same state differently.

### Executed reproduction

For Hb 6 g/dL, \(\kappa=1.34\), total flow 250 mL/kg/min, Qp/Qs 1, Spv 99%, and consumption **4.974750000000001 mL O₂/kg/min**:

| Calculation               | Returned result               |
| ------------------------- | ----------------------------- |
| Forward state             | `zero_venous_boundary`        |
| Raw venous oxygen content | \(-8.88\times10^{-16}\) mL/dL |
| Conditional optimum       | `no_admissible_ratio`         |

Changing consumption to **4.97475** gives the sole boundary state in both paths.

This is a **numerical-policy inconsistency**, not a physiologically meaningful difference in oxygen consumption. It could nevertheless produce contradictory inspector messages or inconsistent boundary overlays.

### Recommended correction

Use consistent tolerance semantics across forward feasibility, inverse/existence calculations, and overlays. Preserve raw values and the distinction between a boundary and an admissible interior; do not introduce substantive clipping.

Test neighboring floating-point values around known boundaries, not only randomly selected interior states.

## 5. Zero-demand optimization ignores an explicitly bounded ratio range

**Priority: low; a genuine edge-case API error.**

**Relevant code:** `src/parallel_o2/derived.py::conditional_optimum()`

When consumption is zero, the function returns before applying the requested ratio bounds. It reports no maximum and describes a supremum as Qp/Qs approaches zero. That is appropriate for the **unbounded positive-ratio domain**, but not necessarily for a bounded interval.

For the synthetic Hb 10, Spv 98%, total-flow 400 example:

$$
DO_2(r)=\frac{52.528}{1+r}.
$$

With requested bounds \(r\in[0.5,2]\), the maximum is attained at:

$$
r=0.5,\qquad DO_2=35.0186667\ \text{mL O₂/kg/min}.
$$

The current function returns `do2_maximum=null`.

The fix is straightforward: distinguish an unbounded supremum from a bounded endpoint maximum. Sv remains constant, so its maximizer is not unique. Zero oxygen content requires its own constant-zero case.

---

## What is implemented correctly and should be preserved

### The oxygen accounting is not the problem

The production kernel correctly calculates systemic delivery using **Qs rather than Qt**, derives both arterial and venous oxygenation from conservation, and keeps systemic extraction and pulmonary oxygen uptake distinct from gross transport. It does not incorrectly hold venous saturation constant while changing hemoglobin.

The resistance-to-oxygen adapter also handles the crucial hemoglobin issue correctly: in physical mode, changing Hb changes capacity while physical consumption remains the prescribed input; the normalized consumption term is recalculated. The source-normalized index is not silently presented as physical DO₂.

### The resistance extension has the intended structure

The code separates native Rp from shunt resistance, retains reference-flow shunt calibration, and implements the nominal and circuit-secant output laws separately. It also restricts the whole-pathway audit interpretation to its intended fixed-output, linear-shunt setting. These are not collapsed into one supposedly universal cardiovascular response model.

The additional high-precision checks did not uncover an error in those circuit solutions.

### The verification infrastructure is substantial

The fixture comparisons, shared Python engine, retained deployment evidence, hashes, and source-status distinctions are useful. The issue is **coverage of particular interactions**, not an absence of testing.

I would therefore avoid framing the next Codex task as “repair the broken physiology.” A more accurate instruction is:

> **Preserve the validated calculations; repair how experiments, coordinates, boundary statuses, and exports are represented.**

## What would most improve physiological understanding

The application currently communicates its auditability better than it communicates its physiology. That is partly a consequence of how much verification detail we asked the specification to expose.

### A. Give response maps useful default scales and a zero-effect contour

The resistance maps default to **−100% to +100%** for relative effects. That is transparent, but effects of a few percentage points can become visually difficult to distinguish. The retained R4 screenshot is a good example: much of the response map appears nearly featureless. A refit button exists, so this is not missing functionality; it is a default-presentation problem.

I would use a declared, scene-specific sensitivity scale and make the **zero-change contour** prominent:

$$
\Delta DO_2=0
\quad\text{or}\quad
\Delta I=0,
$$

depending on the active oxygen mode.

That contour directly answers the scientific question: **under these assumptions, where does the modeled perturbation change from increasing to decreasing delivery?**

Keep scales fixed across a comparison and disclose off-scale values. Do not solve the readability problem with silent rescaling after every input change.

### B. Put a small physiological summary before the full numerical ledger

The selected-state inspector currently renders a long metric table and, in some places, lengthy boundary descriptions with many decimals or serialized details. The information is useful, but the hierarchy is weak.

For the main interpretation, prioritize:

**Sa, Sv, Ca, Qs, systemic DO₂, and extraction/consumption.**

Then keep the full metric list, raw values, residuals, and provenance in the expanded audit section. Saturation should be immediately readable as a percentage, while exports retain unrounded fractions.

The goal is for a selected point to read like:

> “Arterial saturation rose, but systemic flow fell more; systemic oxygen delivery therefore decreased.”

—not require the user to reconstruct that conclusion from twenty rows.

### C. Make “state” versus “response” unmistakable

R4 is scientifically valuable because it separates the baseline state at each coordinate from the response to a perturbation from that state.

Its titles should make that explicit:

**Left: delivery in each cell’s state A.**
**Right: change from that A after native Rp × the selected factor.**

The existing explanatory text describes the distinction, but the generic metric title “change vs stated baseline” is less immediate. The improvement is to bring the experiment’s meaning into the plot title, not add more explanatory prose below it.

### D. Add an optional joint-criterion view

The continuous Sa/Sv maps and separate criterion contours are useful. An optional categorical view would make it easier to distinguish **arterial criterion only, venous criterion only, both, and neither**.

Mathematical infeasibility must remain a separate category—not be merged with an admissible state that simply misses a selected saturation criterion.

This would particularly improve the Ahmed-inspired experiments, where the main question is often about the **intersection of two conditions**, not the value of either saturation alone.

## How I would direct the next Codex pass

The attached ticket is deliberately bounded:

| Pass                                         | Required outcome                                                                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Experiment and coordinate correctness** | Remove R4’s silently inactive controls/aliases; fix resistance log-coordinate mapping; add actual interface-to-engine round-trip tests. |
| **2. Reliability and boundary consistency**  | Remove the export network dependency; reconcile numerical boundary policies; implement the bounded zero-demand optimum.                 |
| **3. Interpretation and regression**         | Improve response-map scales, zero-effect contours, and selected-state hierarchy; rerun the full locked-environment and browser suite.   |

The most important testing addition is to follow the complete chain:

$$
\text{control}
\rightarrow
\text{resolved input}
\rightarrow
\text{calculation}
\rightarrow
\text{plotted coordinate}
\rightarrow
\text{selected state}
\rightarrow
\text{export}.
$$

The existing numerical checks cover the calculation step well. **The defects I found are concentrated at the connections between those steps.**

I would not add viscosity feedback, diastolic waveforms, finite ventricular reserve, or supply-dependent consumption during this correction pass. Those would be new scientific models, not fixes to the present implementation. **Keep the current engine; make the experiments and visual interpretation as trustworthy as the calculations already appear to be.**
