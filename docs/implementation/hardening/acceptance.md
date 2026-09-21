# Follow-up acceptance map

The supplied review is preserved verbatim in review-ticket.md and review-context.md. The user's approved implementation plan adds the editable R4 local factor and joint criterion view. Modular scientific contracts remain authoritative. Status: qualification in progress; historical receipts describe their original commits.

| Item | Implementation | Focused evidence | Affected gates |
|---|---|---|---|
| A1: authoritative absolute R4 inputs and legacy compatibility | Shared grid/inspector axis validation, derived input roles, UI import normalization with notice | tests/test_hardening.py; browser R4 control/configuration/share/export regression | R22, RV02, RV08, RV12 |
| Editable local factor | Canonical default 0.55, finite nonnegative input, preserved A/reference/calibration | Factor 0/0.2/0.55/1 and zero-Rp invariance; actual browser factor round trip and bundle | R22, RV02, RV12 |
| A2: resistance log axes | Physical values and log10 plot coordinates; sampled custom data | Browser R1/R3 log-x/log-y/log-log asymmetric grids, physical 0.5, point/table/crosshair/CSV/JSON/PNG/SVG | V03, V04, RV02, RV08 |
| B: offline initialized export | Hash-bound build/validation/runtime context retained from worker readiness | Block every HTTP(S) request, assert zero attempts and complete bundle; mismatch/retry and generation cancellation | S23, V12–V15, AV10, RV12 |
| C1: boundary tolerance | Forward balanced-state classification reused by optimizer/overlays; selected-criterion tolerance remains separate | Neighboring floats, beyond-tolerance infeasibility, strict tangencies; 430 browser parity cases | S17–S19, A06, A12, AV02 |
| C2: M0 objectives | Attained bounded lower endpoint; unbounded supremum and nonunique constant objectives | Literal r=0.5, DO2=35.01866666666667 and zero-content cases | S17–S19 |
| D: response interpretation | Declared symmetric scales, explicit refit/shared closure range, zero contours with neighbor masks, constant-zero notice | Browser scale/zero/refit checks and desktop/mobile/export visual review | V03, V04, V07, RV02, RV08 |
| D: selected-state summaries | Percent saturations, native units, normalized index terminology, existing paired decomposition | Explore/Compare/resistance tests and screenshots; full raw audit retained | V07, A16, RV08 |
| Joint criterion display | Existing Python classes, equality distinct from strict satisfaction, infeasibility and numerical failure distinct; H3/H4 excluded | Browser real literal equality/infeasibility/numerical-failure cases, configuration/export and responsive legends | A06, A12, A16, AV02, AV10 |
| Delivery | Locked local + clean-clone aggregate, full independent replay, benchmark, CI, exact Pages artifact/live tests | Follow-up receipt and retained numerical/browser/visual/hosted hash evidence | All reopened gates |

Run `make check`, `make reference-replay-full`, and `make benchmark`. The aggregate runs Python qualification, independent reference/ensemble replay, wheel and static builds, and Chromium/Firefox/Playwright WebKit at both `/` and `/single_vent_sim/`. The deployed artifact is checked with `make verify-live COMMIT=<sha> ACCEPTED_MANIFEST=<downloaded Pages artifact manifest>`; live tests include the focused hardening interactions.

Original fixtures, archived specification, dependency locks, and historical receipts are preserved. T00A/T00S source-access limits remain separate from application qualification and never count as source replication or clinical validation.
