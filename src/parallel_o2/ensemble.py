"""Bounded paired ensembles: shared draws, frozen within-draw anchors, explicit exclusions."""

import csv
import hashlib
import io
import math
import platform
import random
from dataclasses import replace
from typing import Any, cast

import numpy as np
from numpy.typing import NDArray

from .comparison_presets import resistance_baseline
from .flow_providers import coupled_metrics, oxygen_for_hemodynamics
from .hemodynamics import FLOW_MODEL_VERSION, hemodynamics_arrays, resolve_resistance_reference
from .inputs import MODEL_VERSION, InputError, _number
from .serialization import dumps, finite_json
from .source_lab import metadata

DRAW_KEYS = (
    "draw_id",
    "qt0_l_min",
    "native_reference_share",
    "systemic_effect_multiplier",
    "pulmonary_effect_multiplier",
)
STATUS = (
    "eligible",
    "oxygen_infeasible",
    "invalid_configuration",
    "numerical_failure",
    "zero_venous_boundary",
)
MAX_DRAWS = 100000


def validate_draws(rows: list[dict[str, Any]]) -> NDArray[np.float64]:
    if not isinstance(rows, list) or not 1 <= len(rows) <= MAX_DRAWS:
        raise InputError("Ensemble requires 1–100000 draws")
    ids: set[int] = set()
    values = []
    for r in rows:
        if not isinstance(r, dict) or set(r) != set(DRAW_KEYS):
            raise InputError("Draw fields do not match the declared schema")
        ident = r["draw_id"]
        if type(ident) is not int or not 0 <= ident <= 2**53 - 1 or ident in ids:
            raise InputError("Draw IDs must be unique nonnegative safe integers")
        ids.add(ident)
        for key in DRAW_KEYS[1:]:
            _number(r[key], 0)
        _number(r["qt0_l_min"], positive=True)
        _number(r["native_reference_share"], 0, 1)
        values.append([r[k] for k in DRAW_KEYS])
    return np.asarray(values, dtype=np.float64)


def generate_draws(n: int = 20000, seed: int = 2026091804) -> list[dict[str, Any]]:
    if type(n) is not int or not 1 <= n <= MAX_DRAWS:
        raise InputError("Ensemble requires 1–100000 draws")
    if type(seed) is not int or not 0 <= seed <= 2**32 - 1:
        raise InputError("Seed must be an integer from 0 to 4294967295")
    rng = random.Random(seed)
    return [
        dict(
            zip(
                DRAW_KEYS,
                (
                    i,
                    rng.uniform(1.8, 2.2),
                    rng.uniform(0.1, 0.9),
                    rng.uniform(0.75, 1.25),
                    rng.uniform(0.75, 1.25),
                ),
                strict=True,
            )
        )
        for i in range(n)
    ]


def draw_csv(values: NDArray[np.float64]) -> str:
    stream = io.StringIO(newline="")
    writer = csv.writer(stream, lineterminator="\n")
    writer.writerow(DRAW_KEYS)
    for row in values:
        writer.writerow([int(row[0]), *map(float, row[1:])])
    return stream.getvalue()


def evaluate_pairs(values: NDArray[np.float64]) -> dict[str, Any]:
    """Broadcast the constrained reference family through the existing production kernels."""
    qt, rho, es, ep = (values[:, i] for i in range(1, 5))
    request = resistance_baseline()
    original = resolve_resistance_reference(request)
    # This declared family has Rs = Rp+Rsh = 40, hence reference Qp=Qs=Qt/2.
    # These are reference/calibration inputs, never achieved-state recalibration.
    ref = replace(
        original,
        qt_l_min=qt,
        rp_mmhg_min_l=40 * rho,
        rshunt_nominal_mmhg_min_l=40 * (1 - rho),
        calibration_qp_l_min=qt / 2,
        qs_l_min=qt / 2,
        driving_pressure_mmhg=20 * qt,
        k1_mmhg_min_l=20 * (1 - rho),
        k2_mmhg_min2_l2=40 * (1 - rho) / qt,
    )
    results = []
    for profile in metadata("profiles")["profiles"]:
        for variant in metadata("ensemble")["variants"]:
            alpha, f = variant["alpha"], variant["f"]
            baseline = hemodynamics_arrays(
                ref, np.ones(len(qt)), 1, 1, alpha, f, "nominal_parallel"
            )
            after = hemodynamics_arrays(
                ref,
                1 + es * profile["delta_rs_fraction"],
                1 + ep * profile["delta_native_rp_fraction"],
                1,
                alpha,
                f,
                "nominal_parallel",
            )
            ob, oa = (oxygen_for_hemodynamics(h, request["oxygen"]) for h in (baseline, after))
            mb, ma = (
                coupled_metrics(h, request["oxygen"], o) for h, o in ((baseline, ob), (after, oa))
            )
            invalid = (baseline.status == "invalid_hemodynamic_domain") | (
                after.status == "invalid_hemodynamic_domain"
            )
            numerical = (
                (baseline.status != "solved")
                | (after.status != "solved")
                | (ob.status == "numerical_failure")
                | (oa.status == "numerical_failure")
            ) & ~invalid
            boundary = (ob.status == "zero_venous_boundary") | (oa.status == "zero_venous_boundary")
            eligible = (
                (ob.status == "admissible") & (oa.status == "admissible") & ~invalid & ~numerical
            )
            status = np.where(
                invalid, 2, np.where(numerical, 3, np.where(boundary, 4, np.where(eligible, 0, 1)))
            ).astype(np.uint8)
            with np.errstate(all="ignore"):
                delta = np.where(
                    eligible,
                    100 * (ma["delivery_index_l_min"] / mb["delivery_index_l_min"] - 1),
                    np.nan,
                )
            results.append(
                dict(
                    profile_id=profile["id"],
                    variant=variant["id"],
                    status=status,
                    delta_delivery_percent=delta,
                    baseline_index=mb["delivery_index_l_min"],
                    perturbed_index=np.where(eligible, ma["delivery_index_l_min"], np.nan),
                    baseline_sa=np.where(
                        ob.nonnegative & (baseline.status == "solved"), mb["sa_fraction"], np.nan
                    ),
                    baseline_sv=np.where(
                        ob.nonnegative & (baseline.status == "solved"), mb["sv_fraction"], np.nan
                    ),
                )
            )
    return dict(results=results)


def summarize(status: NDArray[np.uint8], delta: NDArray[np.float64]) -> dict[str, Any]:
    n = len(status)
    valid = delta[status == 0]
    nv = len(valid)
    negative = int(np.count_nonzero(valid < 0))
    frac = negative / nv if nv else None
    return dict(
        n_requested=n,
        n_eligible=nv,
        n_oxygen_infeasible=int(np.count_nonzero((status == 1) | (status == 4))),
        n_boundary=int(np.count_nonzero(status == 4)),
        n_invalid_input=int(np.count_nonzero(status == 2)),
        n_numerical_failure=int(np.count_nonzero(status == 3)),
        negative_count=negative,
        eligible_fraction=nv / n,
        mean_delta_percent=float(np.mean(valid)) if nv else None,
        quantiles_delta_percent=dict(
            zip(
                ("p025", "p50", "p975"),
                np.quantile(valid, [0.025, 0.5, 0.975]).tolist(),
                strict=True,
            )
        )
        if nv
        else None,
        fraction_negative_among_eligible=frac,
        monte_carlo_se_fraction=math.sqrt(frac * (1 - frac) / nv) if frac is not None else None,
        negative_fraction_lower_all_requested=negative / n,
        negative_fraction_upper_unclassified=(negative + n - nv) / n,
    )


class EnsembleJob:
    """One compact job; steps bounded at 1000 draws, no retained Python proxies."""

    def __init__(
        self,
        n: int = 20000,
        seed: int | None = 2026091804,
        rows: list[dict[str, Any]] | None = None,
    ):
        self.replay = rows is not None
        self.seed = None if self.replay else seed
        self.values = validate_draws(
            rows if rows is not None else generate_draws(n, cast(int, seed))
        )
        self.n = len(self.values)
        self.completed = 0
        self.status = np.full((20, self.n), 255, dtype=np.uint8)
        self.delta = np.full((20, self.n), np.nan, dtype=np.float64)
        self.baseline_index = np.full(self.n, np.nan, dtype=np.float64)
        self.baseline_sa = np.full(self.n, np.nan, dtype=np.float64)
        self.baseline_sv = np.full(self.n, np.nan, dtype=np.float64)
        self.identifiers = [
            (p["id"], v["id"])
            for p in metadata("profiles")["profiles"]
            for v in metadata("ensemble")["variants"]
        ]
        self.draw_sha256 = hashlib.sha256(draw_csv(self.values).encode()).hexdigest()

    def step(self, count: int = 1000) -> dict[str, Any]:
        if type(count) is not int or not 1 <= count <= 1000:
            raise InputError("Ensemble steps require 1–1000 draws")
        start, stop = self.completed, min(self.n, self.completed + count)
        if stop > start:
            result = evaluate_pairs(self.values[start:stop])["results"]
            for i, row in enumerate(result):
                self.status[i, start:stop] = row["status"]
                self.delta[i, start:stop] = row["delta_delivery_percent"]
            self.baseline_index[start:stop] = result[0]["baseline_index"]
            self.baseline_sa[start:stop] = result[0]["baseline_sa"]
            self.baseline_sv[start:stop] = result[0]["baseline_sv"]
        self.completed = stop
        return dict(
            completed=stop,
            model_version=MODEL_VERSION,
            flow_model_version=FLOW_MODEL_VERSION,
            numpy=np.__version__,
            profile_definitions=metadata("profiles"),
            perturbation_scope="native_rp",
            rshunt_multiplier=1,
            oxygen_mode="normalized_source",
            units=dict(
                flow="L/min",
                pressure="mmHg",
                resistance="mmHg min/L",
                delivery_index="L blood/min × saturation fraction",
                delta="percent",
            ),
            calibration_policy=(
                "Each draw freezes its own reference Qt and Qp=Qt/2; "
                "K1=(1-f)Rsh; K2=f Rsh/Qp_reference. No achieved-state reanchoring."
            ),
            sampling_assumption_record=dict(
                version="exported-draw-replay-v1" if self.replay else "declared-demonstration-v1",
                distribution_and_dependence="not_inferred_from_supplied_draws"
                if self.replay
                else "four independent uniforms with the declared bounds",
                authoritative_draw_sha256=self.draw_sha256,
            ),
            source_gate_statuses=dict(
                ahmed_full_text="blocked_source_unavailable",
                savorgnan_current_access="unresolved",
                savorgnan_author_code="unverified",
                savorgnan_rendered_figures="unverified",
                savorgnan_original_sampling="unverified",
            ),
            n_requested=self.n,
            paired_evaluations=stop * 20,
            finished=stop == self.n,
        )

    def report(self) -> dict[str, Any]:
        if self.completed != self.n:
            raise InputError("Complete all requested draws before reporting or exporting results")
        result = dict(
            schema_version="resistance-ensemble-result-v1",
            definition={**metadata("ensemble"), "n": self.n, "seed": self.seed},
            sampling_mode="authoritative_exported_draws" if self.replay else "independent_uniforms",
            model_version=MODEL_VERSION,
            flow_model_version=FLOW_MODEL_VERSION,
            numpy=np.__version__,
            profile_definitions=metadata("profiles"),
            perturbation_scope="native_rp",
            rshunt_multiplier=1,
            oxygen_mode="normalized_source",
            units=dict(
                flow="L/min",
                pressure="mmHg",
                resistance="mmHg min/L",
                delivery_index="L blood/min × saturation fraction",
                delta="percent",
            ),
            calibration_policy=(
                "Each draw freezes its own reference Qt and Qp=Qt/2; "
                "K1=(1-f)Rsh; K2=f Rsh/Qp_reference. No achieved-state reanchoring."
            ),
            sampling_assumption_record=dict(
                version="exported-draw-replay-v1" if self.replay else "declared-demonstration-v1",
                distribution_and_dependence="not_inferred_from_supplied_draws"
                if self.replay
                else "four independent uniforms with the declared bounds",
                authoritative_draw_sha256=self.draw_sha256,
            ),
            source_gate_statuses=dict(
                ahmed_full_text="blocked_source_unavailable",
                savorgnan_current_access="unresolved",
                savorgnan_author_code="unverified",
                savorgnan_rendered_figures="unverified",
                savorgnan_original_sampling="unverified",
            ),
            n_requested=self.n,
            paired_evaluations=self.n * 20,
            seed=self.seed,
            replay=self.replay,
            rng="Python random.Random MT19937; exported draws authoritative",
            python=platform.python_version(),
            draw_sha256=self.draw_sha256,
            reference_family_sha256=hashlib.sha256(
                dumps(dict(draw_sha256=self.draw_sha256, definition=metadata("ensemble"))).encode()
            ).hexdigest(),
            source_status="not_source_Table2_replication_sampling_laws_and_seed_unverified",
            interpretation=(
                "Assumed-ensemble fractions and parameter-ensemble quantiles, "
                "not clinical probabilities or clinical-effect confidence intervals. "
                "Monte Carlo SE describes finite simulation noise only. Oxygen-excluded "
                "counts include zero-venous boundaries; no zero effects imputed."
            ),
            summaries=[
                dict(profile_id=p, variant=v, **summarize(self.status[i], self.delta[i]))
                for i, (p, v) in enumerate(self.identifiers)
            ],
            baseline_saturation_range=dict(
                sa=self._finite_range(self.baseline_sa),
                sv=self._finite_range(self.baseline_sv),
            ),
        )

        return cast(dict[str, Any], finite_json(result))

    @staticmethod
    def _finite_range(values: NDArray[np.float64]) -> list[float] | None:
        finite = values[np.isfinite(values)]
        return [float(np.min(finite)), float(np.max(finite))] if len(finite) else None

    def export_chunk(self, start: int = 0, count: int = 1000) -> dict[str, Any]:
        if self.completed != self.n:
            raise InputError("Only complete ensembles may be exported")
        if (
            type(start) is not int
            or not 0 <= start < self.n
            or type(count) is not int
            or not 1 <= count <= 1000
        ):
            raise InputError("Export requires a valid start and 1–1000 draws")
        stop = min(self.n, start + count)
        stream = io.StringIO(newline="")
        writer = csv.writer(stream, lineterminator="\n")
        writer.writerow(
            ["draw_id", "profile_id", "variant", "pair_status", "delta_delivery_percent"]
        )
        for j in range(start, stop):
            for i, (profile, variant) in enumerate(self.identifiers):
                delta = float(self.delta[i, j])
                writer.writerow(
                    [
                        int(self.values[j, 0]),
                        profile,
                        variant,
                        STATUS[self.status[i, j]],
                        delta if math.isfinite(delta) else "",
                    ]
                )
        return dict(
            start=start,
            stop=stop,
            draws_csv=draw_csv(self.values[start:stop]),
            paired_results_csv=stream.getvalue(),
        )


def run_resistance_ensemble(
    n: int = 20000, seed: int = 2026091804, draws: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    job = EnsembleJob(n, seed, draws)
    while job.completed < job.n:
        job.step()
    return cast(
        dict[str, Any],
        finite_json(
            dict(
                report=job.report(),
                draw_columns=DRAW_KEYS,
                status_codes=STATUS,
                draws=job.values,
                pairs=[
                    dict(
                        profile_id=p,
                        variant=v,
                        status=job.status[i],
                        delta_delivery_percent=job.delta[i],
                    )
                    for i, (p, v) in enumerate(job.identifiers)
                ],
            )
        ),
    )
