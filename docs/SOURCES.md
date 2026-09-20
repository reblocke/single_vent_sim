# Sources and provenance

## Primary scientific source

**[P1]** Barnea O, Santamore WP, Rossi A, Salloum E, Chien S, Austin EH. Estimation of Oxygen Delivery in Newborns With a Univentricular Circulation. *Circulation*. 1998;98:1407–1413. DOI: `10.1161/01.CIR.98.14.1407`.

User-provided PDF source: https://bchcicu.org/wp-content/uploads/2018/06/1998-circulation-theoretical-do2-calculations-following-s1p.pdf

SHA256 of the supplied file: `ac78e5cbf403616b10476ce540e634e08c73b6eed166f853cc90e78c0ebbef5c`.

Equation/source mapping:

| App content | Source support | Classification |
|---|---|---|
| Parallel circulation, common mixed arterial supply | Figure1, PDFpp1–2 | Source-derived |
| Oxygen balances and Qt=Qp+Qs | Equations1–4, PDFpp1–2 | Source-derived |
| Systemic DO2 formula | Equation5, PDFp2 | Source-derived |
| Saturation-derived Qp/Qs and sensitivity | Equations6–7, PDFp2 | Source-derived; finite-error interpretation made explicit |
| Omega definition | Equation8, PDFp2; Figures6–7, PDFp5 | Source-derived |
| B22, Hb15, coefficient1.38, M9, Qt300/450 | Methods, PDFp2 | Source-derived; arithmetic discrepancy retained |
| Fixed-flow Hb changes | Conservation equations + B=kappa×Hb | Derived extension; not source-tested transfusion effect |
| Nonnegative-Cv mask, zero-venous limit, optimum/root formulas | Algebraic consequences of Equations1–5 | Derived extension; not clinical safety thresholds |
| Spv=.96 baseline for reconstructed curves | Used in source worked examples; reconstructs several landmarks | Explicit assumption, not fully specified source input |
| kappa1.34 teaching default | Selected specification convention matching preceding worked example | Explicit app assumption, not claimed as the paper's coefficient |
| No whole-body treatment response prediction | Limitations, PDFp6 | Source-derived limitation |
| Caval samples are not ideal mixed venous blood | Limitations, PDFp6 | Source-derived limitation |

No source article text or copyrighted figure is copied wholesale into this pack. The actual PDF is not included in the proposed public application. The new figures are equation-based reconstructions labeled with assumptions.

## Verified starter-pack conventions

Read on 2026-09-18 via the connected GitHub tools, from:

`reblocke/locke_cv`

Directory: `LLM Repo Start/scientific-starter-python-codex-ready`

Commit: `5856022f5ce2be620c82f137f82c68f6b0cb1202`.

**[G1] README.md**
https://github.com/reblocke/locke_cv/blob/5856022f5ce2be620c82f137f82c68f6b0cb1202/LLM%20Repo%20Start/scientific-starter-python-codex-ready/README.md

Verified: uv/pyproject/uv.lock; Ruff/pytest; source layout; immutable raw inputs and separate processed/derived/reports; thin scripts; agent/decision documentation. File blob SHA: `b2dcab04b407bf69a644c70d888388d92e0215bb`.

**[G2] AGENTS.md**
https://github.com/reblocke/locke_cv/blob/5856022f5ce2be620c82f137f82c68f6b0cb1202/LLM%20Repo%20Start/scientific-starter-python-codex-ready/AGENTS.md

Verified: document only real scaffold facts; preserve meaningful VERIFY/TODO items; pure/reusable logic in src; report checks actually run; resolve scientific policy questions explicitly; no required per-turn continuity edits. Build and typecheck were not scaffolded commands. File blob SHA: `54e5cd2d737ee316a7ba4a3fa2099ba129996a3b`.

This specification follows these conventions but adds project-specific architecture, browser tests, scientific contracts, and required build/typecheck/export commands. It does not claim these additions were already implemented in the starter. Private GitHub URLs above contain no authentication token and are provenance references, not prerequisites for understanding this self-contained pack.

## Official software documentation checked 2026-09-18

**[W1] Pyodide web-worker usage.** https://pyodide.org/en/stable/usage/webworker.html
Stable documentation observed at314.0.7. Requires module-type worker; isolates synchronous Python execution from UI. The implementation must use a version-pinned runtime, not the moving stable URL.

**[W2] Pyodide changelog.** https://pyodide.org/en/stable/project/changelog.html
314.0.7 dated2026-09-14; 314.0.0 reports Python3.14.2. This identifies an initial candidate, not a browser environment tested during preparation of this specification.

**[W3] Plotly.js heatmap reference.** https://plotly.com/javascript/reference/heatmap/
Array-coordinate orientation, cell edges/centers, and heatmap controls.

**[W4] Plotly.js contour reference.** https://plotly.com/javascript/reference/contour/
Explicit gap handling and contour configuration. App requirements override cosmetically smoothing or connecting undefined physiology.

**[W5] uv locking/syncing.** https://docs.astral.sh/uv/concepts/projects/sync/
Lock consistency checks and locked versus frozen semantics.

**[W6] Vite static deployment.** https://vite.dev/guide/static-deploy.html
Static build and repository-subpath deployment conventions.

These software sources justify implementation mechanics, not physiologic claims. The chosen software stack, UI layout, tests, and performance thresholds are design decisions in this specification.

## Later hemoglobin model — amendment evidence register

**[P2]** Ahmed M, Acosta SI, Hoffman GM, Tweddell JS, Ghanayem NS. Mathematical analysis of hemoglobin target in univentricular parallel circulation. *J Thorac Cardiovasc Surg*. 2023;166(1):214–220. DOI `10.1016/j.jtcvs.2022.09.044`; PMID36357224. Online publication2022; issueJuly2023.

Primary institutional record and abstract, accessed2026-09-18:
https://digitalcommons.library.tmc.edu/baylor_docs/5729/

PubMed bibliographic/abstract record:
https://pubmed.ncbi.nlm.nih.gov/36357224/

Publisher abstract:
https://www.sciencedirect.com/science/article/pii/S0022522322010364

AATS central-message record:
https://www.aats.org/resources/mathematical-analysis-of-hemoglobin-target-in-univentricular-parallel-circulation

The full-text institutional PDF endpoint and publisher full-text/PDF endpoints returned access errors during this revision. No PDF is bundled or checksum asserted. Source information beyond the verified abstract/bibliographic record is intentionally left unverified. Exact Ahmed constants/figures are not supplied in this pack; see T00A.

| Amendment element | Evidence class |
|---|---|
| Hb/CI/r variation and extraction/saturation outcomes | P2 abstract, source_reported |
| CI6, M150, r approximately1, Hb9, approximate CI9/Hb>13 findings | P2 abstract, source_reported |
| Sa70 and Sv40 boundary discussion; greater saturation gain below12 | P2 abstract, source_reported; not a clinical prescription or mathematical kink |
| Spv.98 and kappa1.34 in new examples | Explicit inherited app assumptions; unverified as Ahmed settings |
| Native factor10 BSA equations and all exact numeric examples | Derived from the established Barnea conservation core and declared app assumptions |
| Hb/CI/M equality solvers, strict r intervals, derivatives, two objectives | Derived extension; not claimed as formulas newly verified in Ahmed |
| Exact source figure inventory, parameters and equation equivalence | unverified_ahmed_full_text; blocked source gate |

No source text is copied wholesale. The machine-readable record contains compact paraphrases and source locators, not reconstructed copyrighted full text. Software/starter provenance elsewhere in this file is preserved from v1.0, not rereviewed during the hemoglobin amendment.

## Resistance-driven model — revision1.2

**[P3]** Savorgnan F, Shah V, Turner E, Hu K, Pilla P, Visokay S, Ness K, Flores S, Loomba R, Acosta S. Computational Modeling of Oxygen Delivery in Norwood Physiology: Differential Effects of Systemic and Pulmonary Vasodilator Conditions. *J Cardiovasc Dev Dis*.2026;13(8):347. DOI `10.3390/jcdd13080347`; PMID42645818. Published2026-07-23.

Publisher: https://www.mdpi.com/2308-3425/13/8/347

Bibliographic record: https://pubmed.ncbi.nlm.nih.gov/42645818/

Accessed2026-09-18 through indexed publisher text: Methods2.1–2.8, Results/Tables1–3, Limitations and captions. PDF/XML/figure access attempts did not provide usable rendered source material; executable author code was not retrieved. No source-PDF checksum is asserted. Source Table1/3 numbers and retrieved-baseline definitions are stored in `verification/savorgnan_source_claims.json`.

The user's supplied review is the starting basis for the resistance interpretation. Explicit native versus whole-pathway semantics, nominal closure and nonlinear calibration are independent reconstruction choices. A further operating-circuit-secant closure, paired local-response maps, physicalHb bridge and declared sensitivity ensemble are newly specified derivations/assumptions, not claimed paper findings. See Section10 for SD01–SD09, source locators and status definitions. Reproducing rounded Table3 numbers does not establish clinical validation or audit of author code. The source's complete MonteCarlo distributions/seed remain unverified.

The current revision preserves the original software/starter provenance without rereviewing or modifying the private `locke_cv` repository. The executable reference pipeline uses only the installed Python standard library and records its actual version; no future browser-runtime compatibility has been inferred from these checks.
