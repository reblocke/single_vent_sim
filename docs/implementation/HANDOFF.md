# Active goal: final qualification and deployment

The user activated `EXECUTION_GOAL.md`; the persistent goal is active without a token budget.
Continue through accepted GitHub Pages deployment. Do not restart setup or mark completion
from a successful reference runner, local build, or source-only audit.

All planned production engines and application views are implemented. T07 adds bounded
configuration import/share, coherent JSON/CSV/PNG/SVG bundles, model/validation records,
keyboard/touch alternatives, sustained UI tests, asset hashes and live deployment verification.
An export/zoom race was reproduced and fixed: changing a Plotly range during image rendering
now cancels the bundle instead of mixing ranges across files.

The T07 local aggregate has passed: 313 Python tests, 420 CPython/browser parity cases per
browser, and 123 browser checks at each of `/` and `/single_vent_sim/`. Maximum absolute parity
difference is 8.526512829121202e-14. All three browsers retained unchanged tracked Python object
counts after the stress checks. Exact-commit CI and a fresh isolated clone still gate acceptance.
The final resistance preset/pressure-label assertions and live import round trip are part of the
checkpoint verification. T07 remains in progress; 84 of 108 gates currently have accepted evidence.

## Immediate next steps

1. Verify the T07 checkpoint from an isolated clone with fresh Python, Node dependencies and
   browser downloads, and inspect exact-commit GitHub CI. Preserve logs and compare deterministic
   outputs. Record final performance on an otherwise idle machine.
2. Attach evidence for the remaining 24 application gates; complete T05/T05R/T06 once their
   cross-view/export requirements are accepted. Keep source-only stages separately unresolved.
3. Commit and synchronize acceptance metadata. Enable Pages and manually dispatch the gated
   workflow. Its last `make check` build at `/single_vent_sim/` is the artifact to deploy.
4. Download that workflow's `github-pages` artifact. Use its asset manifest with
   `make verify-live COMMIT=<accepted-sha> ACCEPTED_MANIFEST=<absolute-path>`.
   Verify every hosted byte and all three live browsers, including import and download.
5. Record the deployed commit, CI/deployment links, numerical/visual/performance evidence and
   unresolved source statuses. Synchronize the final receipt and confirm local/remote equality.
   Only then complete the persistent goal.

## Accepted checkpoints

| Stage | Commit | Evidence |
|---|---|---|
| T01 | bd8044d | setup-local-receipt.json; clean-clone-receipt.json; reference-full-receipt.json |
| T02 | f437e91 | t02-receipt.json |
| T02R | 04684b0 | t02r-receipt.json |
| T03 | 550fc4f | t03-receipt.json |
| T04 | 9b483e0 | t04-receipt.json |
| T05 foundation/overlays | 6dfda92 / 51304a6 | t05-foundation-receipt.json; t05-overlay-receipt.json |
| T05R foundation | 5cc4be8 | t05r-foundation-receipt.json |
| T06 foundation | 0341f7a | t06-foundation-receipt.json |
| T06R | e8ed4fc | t06r-receipt.json; CI run 35560191288 |

Every receipt identifies its exact CI and test scope. The stage and gate ledgers are authoritative;
foundation checkpoints do not imply completion of later cross-view or export requirements.

## Preserved qualifications

- All 41 immutable working files and the original ZIP remain hash-verified. A fresh clone can
  restore all 107 supplied artifacts with `make restore-reference`.
- T00A remains `blocked_source_unavailable`; T00S remains `blocked_current_source_access`.
  See `source-access-recheck.json`. Preserve the original historical evidence and SD01–SD09.
- Declared ensemble distributions are demonstrations. Original Table 2 sampling, author code,
  rendered source figures and Ahmed full-text settings remain unaudited/unavailable.
- Source-unavailable is not successful replication. Numerical verification is not clinical
  validation. Playwright WebKit/touch emulation is not a real Safari/physical-device claim.
- Independent reference and production replay stay separate. The original reference runner's
  `app_browser_tests: not_implemented_not_run` field describes that preserved runner's scope;
  application evidence comes from the production and browser receipts.

Public repository: https://github.com/reblocke/single_vent_sim
Deployment target: https://reblocke.github.io/single_vent_sim/
