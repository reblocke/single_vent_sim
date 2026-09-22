# Question-led interface refactor

Issue: https://github.com/reblocke/single_vent_sim/issues/2
Baseline: `bcc43e6c7e0eaf20f624c2c1691c5cf584785645` (2026-09-21).
Implementation: [PR #3](https://github.com/reblocke/single_vent_sim/pull/3), merged and deployed as `be756ed`.

The implemented question-led One change presentation and shared five-quantity summaries passed local qualification on `13d5295`: 328 Python tests, 360 browser checks, full reference replay and both performance budgets. See [the receipt](FINAL_RECEIPT.md), [acceptance ledger](acceptance.json), and [six-stage ledger](stages.json). PR #3 and merged-main CI passed. The [deployment receipt](DEPLOYMENT_RECEIPT.json) records the accepted public build, 39 matching hosted assets and 60 passing live-browser checks.
Scientific equations, original comparison presets, source discrepancies, runtime locks and independent fixtures remain authoritative and unchanged. The new synthetic teaching fixtures are copied from issue 2, not regenerated from production outputs. C2 and C3 retain their original direction/source reconstruction; new single-change questions use the ticket's explicit synthetic C1 starting state.

The presentation registry is `src/parallel_o2/data/presentation.json`; `questions[].variants` is the complete old-to-new route manifest. Scientific IDs retain their meaning. Python validates the UI-v2 envelope and migrates v1 to map presentation. In map mode, `settings` owns the current experiment. In One change, `presentation.one_change` owns A, the target, slice and criteria; `settings` retains the map workspace for transitions and must not supply One-change captions or calculations. The active snapshot always comes from the active controller. Named drafts store inactive provider/oxygen modes. Fractions remain canonical while saturation editors and labels use percent.

Verification is tracked in `acceptance.json` and the final receipt. Historical receipts qualify their own exact builds and are not UI-refactor evidence. The user subsequently authorized deployment and accepted the review by attestation. Pages deployed the tested `be756ed` artifact on 2026-09-22; publication remains manual for future changes. Receipt-only commits after that build are not new deployments.

## Review and remaining limitations

- Review accepted by **user attestation**; see [the review record](CLINICIAN_REVIEW.md). Task-level observations were not supplied, and improved comprehension has not been empirically demonstrated.
- T00A/T00S source-access limitations and SD01–SD09 remain unchanged.
- Browser touch emulation does not establish physical-device usability or actual screen-reader comprehension.

## Formative review script

A clinician unfamiliar with the implementation should explain from the interface:
1. Whether Hb changes flow automatically.
2. How changing Qp/Qs differs from increasing both flows.
3. Why native Rp reduction need not proportionately reduce the whole pulmonary pathway.
4. Whether increased saturation guarantees increased delivery.
5. Why source-normalized mode cannot supply physical DO2.
6. How reference calibration differs from an R4 local perturbation.

Record the reviewer/date, task observations and unresolved misunderstandings. This is formative interface review, not clinical validation.
