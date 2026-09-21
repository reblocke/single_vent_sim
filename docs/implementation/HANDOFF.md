# Targeted follow-up complete

Read [the current handoff](hardening/HANDOFF.md) and [follow-up final receipt](hardening/FINAL_RECEIPT.json). The qualified follow-up is deployed and its hosted hashes and 30 live-browser checks passed. All 108 application gates have evidence. Local sleep-interrupted runs are recorded separately; fresh-runner CI and Pages checks passed. Source gaps remain explicit.

The original deployment below is historical qualification.

# Completed goal: verified application and deployment

The execution goal is complete. The live application is
https://reblocke.github.io/single_vent_sim/.
Read [FINAL_RECEIPT.json](FINAL_RECEIPT.json) for the complete evidence receipt.

- Deployed commit: `76e401a20f7f92a2878004f824b84f8f083ae63f`.
- Release CI passed: https://github.com/reblocke/single_vent_sim/actions/runs/35566165951.
- Pages build/deployment passed: https://github.com/reblocke/single_vent_sim/actions/runs/35566246050.
- All 108 application gates passed. T01–T07 application stages, including resistance and
  ensemble extensions, are complete. T00A/T00S remain independently source-blocked as permitted.
- 313 Python tests; 123 browser checks at each base path; 420 parity cases per browser/base;
  maximum absolute parity difference 8.526512829121202e-14; exact statuses/nulls/metadata.
- A fresh GitHub clone with newly downloaded Python and browsers passed the aggregate.
  All 107 recovered source files and all 75 deterministic scientific outputs matched exactly.
- All 39 hosted static files matched the tested Pages artifact. The public app passed
  Chromium, Firefox and WebKit checks for runtime loading, calculations, import, downloads,
  accepted build identity, 108/108 gate display, no external HTTP requests and no page errors.
- Performance on Apple M2/8 GB: prescribed p95 worker/paint 170/235 ms; resistance 108/167 ms
  for 201×201 grids, after 3 warmups and 30 measured updates.

The final receipt commit changes documentation/evidence only; the deployed code remains the
accepted commit above. Future work should begin from the current repository state, not restart
setup or repeat this completed goal. Source-only follow-up requires new source material or access;
never reinterpret unresolved replication as successful or numerical checks as clinical validation.

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
| T07 application / live deployment | 78618a3 / 76e401a | t07-receipt.json; FINAL_RECEIPT.json |

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
