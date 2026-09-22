# Visual review — 2026-09-21 (America/Denver)

The captured local build and exported figures identify code commit `13d5295674b3b8b7795de8db01dde489773594f1`. `sha256.json` binds the retained images and manifests. `before-live.png` and `before-build-info.json` document the preceding hosted build `b6ffef42d00e28a08cb05eacf7b95a11e3e7afe9`; they are historical comparison evidence, not deployment evidence for this change.

- `after-desktop.png`: 1440-pixel viewport. The opening Hb question, A/B five-quantity summary, target input, and both comparison plots are visible. Sa/Sv use distinct line styles; A/B markers and axes are readable.
- `after-phone.png`: 390-pixel viewport, full-page capture. Primary question/target controls precede the compact quantity tiles and stacked plots; secondary settings follow the plots. No horizontal page overflow was observed. Automated checks also exercise 1024 pixels, keyboard controls, and 200% layout magnification.
- `figure.png`: exported saturation sweep. Solid/dashed Sa/Sv curves, A/B markers, units, assumptions and provenance caption are legible.
- `figure-2.png`: exported delivery/uptake sweep. Delivery increases with Hb while net uptake remains at 6 mL O2/kg/min. The different transport quantities are clearly labeled; the caption carries the loaded build identity and selected criteria.

The exported PNGs were visually inspected in addition to assertions against JSON/CSV/SVG data. This review establishes rendering evidence only. It does not replace the pending clinician comprehension review, physical-device testing, or clinical validation.
