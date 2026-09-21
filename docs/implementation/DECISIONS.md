# Setup decisions

1. The user selected public reblocke/single_vent_sim, MIT with Brian W. Locke attribution, complete T01 setup, and later live Pages deployment. This overrides the specification's suggested repository slug. The application title and package name are retained.
2. The original 38.5 MB ZIP is tracked as the immutable source deliverable. Expanded reports are recovered or regenerated in ignored directories. Its manifest is scoped to the archive; working verification/config fixtures have a separate integrity inventory. The starter ZIP is hashed, not copied wholesale.
3. CPython 3.14.2 and NumPy 2.4.6 match Pyodide 314.0.7. Node 24.21.0/npm 11.19.0 are pinned. Hash-checked runtime assets are downloaded during setup/build and served same-origin. The shared package is built once as a pure-Python wheel and unpacked unchanged in Pyodide; NumPy loads from the local distribution. No runtime dependency resolution or physiology logic in TypeScript.
4. T01 supplies a strict standard-library parser rather than a production JSON Schema dependency. Committed schemas are independently checked with jsonschema in tests. Cross-field and bounded-input validation occurs in the parser. Result schemas, V1-to-V2 semantic adapters, production solver APIs and scientific parity remain T02/T04 work.
5. The browser checkpoint shows runtime readiness and optional configuration validation only. Its visual design is provisional; no empty experiment screens imply implemented science. Plotly is locked and available for later rendering.
6. Original scripts/verification artifacts are preserved byte-for-byte and excluded from owned-code lint/format checks. The pipeline runs legacy checkers from temporary copies. New repository orchestration has its own lint/type checks.
7. The source gates are independent of application completion. The user permits deployment of the correctly labeled application with unavailable source evidence left unresolved. No source replication or clinical validation is inferred from numerical agreement.
8. Pages uses /single_vent_sim/ and a manual workflow guarded by the complete application matrix. T01 never deploys. No actual Codex goal or token budget is created during setup.

T06 offline source metadata: src/parallel_o2/data bundles exact reported source claims,
resistance profile definitions and discrepancy prose for use in the wheel. Barnea landmark
metadata is an explicit subset containing only source locations, declared input conditions
and reported values. Computed fixture fields are excluded. tests/test_source_lab.py checks
these derived copies against their canonical modular documents and immutable original JSON.
No independent verification implementation or expected numerical oracle enters production.
All browser source comparisons execute the shared Python engines. Source discrepancy prose
is historical source interpretation, separately labeled from newly computed table values.

T06R keeps one compact ensemble job per Python runtime, guarded by a token and exact draw
cursor. Steps contain at most 1,000 draws; each uses the existing vectorized circuit/oxygen
kernels for all 20 profile/mechanism pairs. Cancellation stops between chunks and invalidates
old browser generations. The normal input-command limit remains 1 MiB. Authoritative CSV
replay is separately bounded to 100,000 rows / 32 MiB in the browser and loaded through
validated chunks no larger than 500,000 bytes. Replay has its own versioned sampling-assumption
record and does not infer a distribution or dependence law from the supplied draws. Generation
laws remain the immutable declared-demonstration-v1 defaults. Full production ensemble replay
is part of make check; independent reference commands remain separate.

## T07 state, figures and deployment artifacts

UI configuration uses `parallel-o2-ui-state-v1` and the shared Python bounded validator.
Only enumerated controls and numeric scientific inputs are restored; the original scientific
ScenarioV1/V2 and resistance schemas stay distinct. Share fragments are explicit and limited
to 16 KiB decoded. State import is limited to 1 MiB. Criteria origin, units, calibration,
selected coordinates, scales, pins and optional visible slices are preserved.

The browser serializes completed engine arrays and actual Plotly configuration into a bounded
ZIP32 bundle. It performs no physiology calculation. Generation/configuration checks abort an
export after an input/view change or a changed Plotly layout during image rendering.
Saved scientific configuration restores declared axes; transient zoom is captured in plot.json,
not reapplied as a scientific input. The bundle includes full-precision CSV/JSON, PNG/SVG, and
SHA256 hashes. SVG heat layers are embedded raster images; axes, text and curves remain SVG.
Source audits remain downloadable with reported/computed fields and unresolved statuses.
Images include model/source/build captions; slice samples and mixing diagrams are additional
bundle files. `schemas/export-manifest-v1.schema.json` validates actual downloaded manifests.

The post-build asset manifest hashes every static/runtime file. Pages uploads the exact
subpath distribution left by `make check`, without rebuilding it after browser verification.
Gate evidence is checked separately before deployment; source-only limitations stay explicit.
