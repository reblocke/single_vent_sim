# Validation summary — reference pack v1.2

The following checks were executed; this is not an application or clinical validation report.

| Check | Result |
|---|---|
| Original Barnea reference suite | Passed:15 fixed cases,345 metric comparisons,2000 seeded states. |
| Retained Ahmed-derived reference suite | Passed:8 fixed cases,160 comparisons,2000 seeded states. |
| Resistance extension reference suite | Passed:40 fixed cases,1440 comparisons,2000 seeded states,80 independent60-digit random-state cross-checks. |
| Savorgnan advanced table |25 nominal-reconstruction cells agree within reported rounding. This does not identify author code. |
| Primary table discrepancy | Retained: whole-pathway interpretation reproduces ratios/index changes; three arterial-saturation columns still differ beyond rounding. |
| Full reference pipeline | Passed:six201×201 grids,242406 grid cells,20000 sampled inputs reused across400000 paired profile/mechanism evaluations. |
| Clean-unzip run | Passed from an unrelated working directory, using only the Python standard library. |
| Full sampled-input replay | All20000 exported draws replayed; draws,400000 paired results and summary CSV files are byte-identical. |
| Packaging | Python syntax, relative links, JSON Schema positive/negative fixtures and numerical-output hashes checked; original fixtures/configs preserved. |

Python actually executed:3.13.5. Detailed reports live in `reports/reference/full_run/`, `verification/pack_integrity_checks_v1_2.json` and `verification/clean_unzip_replay_checks.json`. The reference pipeline regenerates its output reports; timestamps and timings are intentionally not deterministic scientific payloads.

**Unperformed/blocked:** production application and browser/visual tests; actual deployment; author executable-code audit; rendered source-figure audit; exact original Monte Carlo reproduction; Ahmed full-text replication; clinical validation. The supplied source-compatible reconstruction and new structural closure/ensemble are explicitly distinguished.
