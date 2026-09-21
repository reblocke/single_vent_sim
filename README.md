# Parallel Circulation Oxygen Explorer

Python-first educational and research software for parallel-circulation oxygen transport.
**Completed checkpoint: T02 — shared oxygen, indexing and selected-criterion engine.**
The fixed-flow production engine is implemented and independently tested. The browser remains
a runtime/input checkpoint; interactive experiment screens and numerical browser parity are pending.
The included independent numerical reference pipeline is executable; its success does not establish
application completion or clinical validity.

## Fresh-clone setup

Prerequisites: Git, `uv`, Python 3.12+ for bootstrap scripts, and network access for the initial locked downloads.
macOS (Apple Silicon/Intel) and Linux (x64/arm64) are supported by the Node bootstrap.

```bash
git clone https://github.com/reblocke/single_vent_sim.git
cd single_vent_sim
make setup
make browser-install
make check
make dev
```

Setup downloads hash-pinned Node 24.21.0 when the active version differs, installs CPython 3.14.2
through uv, uses committed dependency locks, and verifies Pyodide 314.0.7 / NumPy 2.4.6 assets.
On Linux, install browser OS dependencies with `npx playwright install --with-deps` from `web/`
using the pinned Node; CI performs this step. No credentials, private starter repository, original
Downloads directory, backend, or patient data are required.

| Command | Implemented behavior |
|---|---|
| `make setup` / `make doctor` | Install locked tooling / verify versions, runtime hashes and Python lock consistency |
| `make lint` / `make typecheck` / `make test` | Owned-code formatting/lint, mypy/TypeScript, input/schema/package/scientific tests |
| `make fmt` | Format owned Python and TypeScript files; preserve imported verification code |
| `make build APP_BASE=/single_vent_sim/` | Build the wheel and self-contained static checkpoint under `web/dist/` |
| `make test-browser` | Test the already-built checkpoint in Chromium, Firefox and WebKit |
| `make check` | Verify integrity and contracts, replay reference smoke, build/test both base paths |
| `make reference-replay-full` | Six 201×201 grids, 20,000 shared draws, 400,000 paired evaluations and replay |
| `make restore-reference` | Recover all 107 original files in `reports/source-pack-v1.2/` (must be new/empty) |

The production `validate-science` and `reproduce` report commands remain T03 work; the reference runner
is not an alias for them. `test-browser` is currently runtime/input-contract verification, not
scientific scalar/grid parity. Playwright WebKit is not a claim of real Safari/mobile-device testing.

## Specification and execution

Read [the complete ticket](IMPLEMENTATION_TICKET.md), [modular stages](docs/06_IMPLEMENTATION_TICKETS.md),
and [the implementation handoff](docs/implementation/HANDOFF.md).
[The saved execution goal](docs/implementation/EXECUTION_GOAL.md) is now active at the user’s request;
T01 setup is complete and the remaining stages are tracked independently. The machine-readable stage and 108-gate ledgers are alongside it.

Production code lives in `src/parallel_o2/`; the browser executes the same built wheel.
`parse_request(text, shared=False)` validates bounded V1/V2 scenarios, grids, criteria, and resistance
requests without computing circulation or certifying source fidelity. Import is limited to 1 MiB;
shared payloads are limited to 16 KiB. The shared parser preserves explicit indexing and input values.

The original specification ZIP is tracked once in `provenance/`; its manifest describes the archive,
not the evolving working tree. Input hashes, the historical introduction, and immutable working-file
hashes are retained there. Expanded generated results and downloaded runtimes are ignored.

## Scientific and release status

Ahmed full-text replication and unperformed author-code/figure/original-sampling audits remain separately
identified in the source contracts. Barnea and Savorgnan discrepancies are retained. Source-unavailable
is never a passed replication test. The eventual labeled app may be deployed with these limitations,
provided every application gate passes.

The public repository uses MIT for project code/documentation; retain [third-party notices](THIRD_PARTY_NOTICES.md)
and [scientific citations](docs/SOURCES.md). Pages deployment is prepared but not performed by T01.
The eventual deployment address is https://reblocke.github.io/single_vent_sim/.

## Python numerical interfaces

`parallel_o2.model.solve_state` evaluates a bounded V1/V2 scenario with the shared float64
kernel; `parallel_o2.experiments.evaluate_grid` and `evaluate_slice` use that same kernel.
`parallel_o2.indexing` handles explicit mass/BSA and flow-mode conversions.
`parallel_o2.criteria` provides separate criterion assessment, equality boundaries and
strict ratio intervals; `parallel_o2.sensitivity.hb_sensitivity` holds flows and demand fixed.
`parallel_o2.derived` provides conditional fixed-total-output maxima and the inverse-ratio demo.
`parallel_o2.comparison.compare_states` gives masked A/B deltas and exact log decomposition.

Results preserve native units, requested inputs, undefined values, raw audit values and status.
`grid_csv` exports y-major rows with the full experiment metadata in the first data row.
Equality does not satisfy a strict selected criterion; these are mathematical teaching quantities,
not treatment recommendations. Run `uv run --locked pytest tests/test_science.py` for the
independent production-engine tests.
