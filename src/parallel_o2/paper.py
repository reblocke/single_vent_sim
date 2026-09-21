"""Equation-based source reconstructions; reported data are separate caller inputs."""

import math
from typing import Any, cast

import numpy as np

from .derived import conditional_optimum, inverse_ratio
from .inputs import MODEL_VERSION, InputError, _choice, _number
from .model import metric_names, oxygen_arrays, solve_state, unit_registry
from .serialization import finite_json

CAPACITY_CONVENTIONS = {"P-stated-capacity": 22.0, "P-formula-capacity": 20.7}
FIGURES = {
    "2": "sa_fraction",
    "3": "sv_fraction",
    "4": "av_saturation_gap_fraction",
    "5A": "r",
    "6": "omega",
    "7": "omega",
}


def paper_scenario(
    qt: float = 450, m: float = 9, r: float = 1, convention: str = "P-stated-capacity"
) -> dict[str, Any]:
    _choice(convention, tuple(CAPACITY_CONVENTIONS))
    for value in (qt, r):
        _number(value, positive=True)
    _number(m, 0)
    return dict(
        schema_version="scenario-v1",
        model_version=MODEL_VERSION,
        flow=dict(mode="total_ratio", qt_ml_kg_min=qt, r=r),
        capacity=dict(mode="direct_capacity", capacity_ml_dl=CAPACITY_CONVENTIONS[convention]),
        spv_fraction=0.96,
        vo2_target_ml_kg_min=m,
    )


def paper_curves(
    figure: str, convention: str = "P-stated-capacity", n: int = 4001, raw_audit: bool = False
) -> dict[str, Any]:
    _choice(figure, tuple(FIGURES))
    _choice(convention, tuple(CAPACITY_CONVENTIONS))
    if type(n) is not int or not 3 <= n <= 4001:
        raise InputError("Paper curves require 3–4001 parameter samples")
    if type(raw_audit) is not bool:
        raise InputError("Raw audit must be an explicit boolean")
    r = np.geomspace(0.2, 10, n)
    conditions = [(450, 9), (450, 18)] if figure == "7" else [(300, 9), (450, 9)]
    curves = []
    for qt, m in conditions:
        scenario = paper_scenario(qt, m, convention=convention)
        o = oxygen_arrays(qt * r / (1 + r), qt / (1 + r), CAPACITY_CONVENTIONS[convention], 0.96, m)
        names = metric_names("per_kg")
        metrics = {
            name: np.where(o.nonnegative, o.algebraic[key], np.nan) for key, name in names.items()
        }
        raw = {name: o.algebraic[key] for key, name in names.items()} if raw_audit else None
        coordinate = metrics[FIGURES[figure]]
        if figure == "5A":
            coordinate = r  # ratio is an input, retained even at masked y points
        if figure in ("2", "3", "4"):
            coordinate = coordinate * 100
        optimum = conditional_optimum(scenario, (0.2, 10))
        boundaries = []
        for ratio in optimum.get("admissible_interval") or []:
            if 0.2 <= ratio <= 10:
                boundary = paper_scenario(qt, m, ratio, convention)
                boundaries.append(solve_state(boundary))
        curves.append(
            dict(
                qt_ml_kg_min=qt,
                vo2_ml_kg_min=m,
                scenario=scenario,
                r=r,
                x=coordinate,
                y=metrics["do2_ml_kg_min"],
                status=o.status,
                metrics=metrics,
                exact_r1=solve_state(scenario),
                conditional_optimum=optimum,
                boundary_states=boundaries,
                masked_count=int(np.count_nonzero(~o.nonnegative)),
                raw_algebraic_metrics=raw,
            )
        )
    return cast(
        dict[str, Any],
        finite_json(
            dict(
                schema_version="paper-curves-v1",
                model_version=MODEL_VERSION,
                figure=figure,
                capacity_convention=convention,
                capacity_ml_dl=CAPACITY_CONVENTIONS[convention],
                spv_assumption=0.96,
                source_status="equation_reconstruction_not_digitization",
                parameter_order="increasing_r_never_sorted_by_result_coordinate",
                n=n,
                curves=curves,
                x_metric=FIGURES[figure],
                x_unit="percentage points"
                if figure == "4"
                else "percent"
                if figure in ("2", "3")
                else "dimensionless",
                y_metric="do2_ml_kg_min",
                y_unit="mL O2/kg/min",
                units=unit_registry("per_kg"),
                raw_audit=raw_audit,
                raw_warning="Formal algebraic continuations are not physiological predictions"
                if raw_audit
                else None,
                caption=(
                    f"Barnea Figure {figure}, equation reconstruction; {convention}, "
                    f"B={CAPACITY_CONVENTIONS[convention]} mL/dL; "
                    "Spv=.96 is a reconstruction assumption. "
                    "Curves follow r; infeasible segments are masked."
                ),
            )
        ),
    )


def source_landmarks(
    records: dict[str, Any], convention: str = "P-stated-capacity"
) -> list[dict[str, Any]]:
    """Use only immutable reported fields; compute all comparison values with production."""
    _choice(convention, tuple(CAPACITY_CONVENTIONS))
    rows = []
    sv_root_index = 0
    for entry in records["landmarks"]:
        qt = entry.get("qt_ml_kg_min", 450)
        scenario = paper_scenario(qt=qt, convention=convention)
        capacity = CAPACITY_CONVENTIONS[convention]
        if "reported_sa_fraction" in entry:
            optimum = conditional_optimum(scenario)
            state = optimum["do2_maximum"]["state"] if optimum["do2_maximum"] else None
        elif "sv_fraction" in entry:
            # Solve r + 2 + 1/r = (Spv-Sv)/u using a scaled stable reciprocal pair.
            u = 100 * 9 / (capacity * qt)
            ratio = (0.96 - entry["sv_fraction"]) / u - 2
            low = 2 / (ratio + math.sqrt(ratio * ratio - 4)) if ratio >= 2 else None
            r = (low if sv_root_index == 0 else 1 / low) if low else None
            sv_root_index += 1
            scenario["flow"]["r"] = r
            state = solve_state(scenario) if r else None
        else:
            gap = 0.96 - entry["sa_fraction"]
            qp = 100 * 9 / (capacity * gap)
            scenario["flow"] = dict(mode="independent_flows", qp_ml_kg_min=qp, qs_ml_kg_min=qt - qp)
            state = solve_state(scenario) if qt > qp else None
        for reported_key, reported_value in entry.items():
            if not reported_key.startswith("reported_"):
                continue
            metric = reported_key.removeprefix("reported_")
            computed = state["metrics"][metric] if state is not None else None
            # Preserve mismatches rather than modifying coefficients to fit source rounding.
            tolerance = 0.005 if metric in ("sa_fraction", "sv_fraction", "r") else 0.05
            difference = computed - reported_value if computed is not None else None
            rows.append(
                dict(
                    source_location=entry["source"],
                    reported_quantity=metric,
                    reported_value=reported_value,
                    computed_value=computed,
                    absolute_difference=abs(difference) if difference is not None else None,
                    signed_difference=difference,
                    capacity_convention=convention,
                    spv_assumption=0.96,
                    comparison_status="not_uniquely_specified"
                    if computed is None
                    else "approximately_consistent"
                    if difference is not None and abs(difference) <= tolerance
                    else "discrepant_under_declared_assumptions",
                    notes=(
                        "Independent equation reconstruction; "
                        "source fields unchanged, Spv assumed. "
                        "Comparison uses reported precision."
                    ),
                )
            )
    rows.extend(
        [
            dict(
                source_location="P1 Methods / PDF page 2",
                reported_quantity="capacity_ml_dl",
                reported_value=22.0,
                computed_value=1.38 * 15,
                absolute_difference=abs(1.38 * 15 - 22),
                signed_difference=1.38 * 15 - 22,
                capacity_convention="source_arithmetic_discrepancy",
                spv_assumption=0.96,
                comparison_status="discrepant_under_declared_assumptions",
                notes=(
                    "Source also states Hb15 and coefficient1.38; multiplication gives20.7, "
                    "not22. Both remain visible."
                ),
            ),
            dict(
                source_location="P1 Methods / worked examples",
                reported_quantity="spv_fraction",
                reported_value=None,
                computed_value=0.96,
                absolute_difference=None,
                signed_difference=None,
                capacity_convention=convention,
                spv_assumption=0.96,
                comparison_status="not_uniquely_specified",
                notes=(
                    "Spv.96 is not unambiguously specified as the baseline for every source figure."
                ),
            ),
        ]
    )
    return rows


def inverse_error_demo() -> dict[str, Any]:
    examples = [inverse_ratio(0.77, 0.45, true, 0.96) for true in (0.96, 0.914, 0.873)]
    curves = []
    for sa in (0.65, 0.77, 0.85):
        samples = []
        for assumed in np.linspace(0.9, 0.99, 101):
            samples.append(inverse_ratio(sa, 0.45, 0.96, float(assumed)))
        curves.append(dict(sa_fraction=sa, sv_fraction=0.45, spv_true=0.96, samples=samples))
    return dict(
        schema_version="inverse-error-demo-v1",
        examples=examples,
        curves=curves,
        source_status="source_example_plus_derived_local_and_exact_comparison",
        note=(
            "Saturation percentage points, relative error versus true, true excess over "
            "estimate and local approximation have different meanings."
        ),
    )


def inverse_error_map(sv: float = 0.45, spv_true: float = 0.96, n: int = 81) -> dict[str, Any]:
    """Finite-error map with invalid saturation ordering explicitly masked."""
    _number(sv, 0, 1)
    _number(spv_true, 0, 1)
    if sv >= spv_true:
        raise InputError("Inverse map requires Sv < true Spv")
    if type(n) is not int or not 3 <= n <= 201:
        raise InputError("Inverse map requires 3–201 samples per axis")
    x, y = np.linspace(0.8, 1, n), np.linspace(0.5, 0.95, n)
    names = ("relative_error_vs_true", "true_excess_over_est", "local_relative_error", "psi")
    metrics: dict[str, list[list[float | None]]] = {k: [] for k in names}
    status, masked = [], 0
    for sa in y:
        row: dict[str, list[float | None]] = {k: [] for k in names}
        statuses = []
        for assumed in x:
            if not sv < sa < min(spv_true, assumed):
                for key in names:
                    row[key].append(None)
                statuses.append("invalid_saturation_order")
                masked += 1
            else:
                result = inverse_ratio(float(sa), sv, spv_true, float(assumed))
                for key in names:
                    row[key].append(result.get(key))
                statuses.append(result["status"])
        for key in names:
            metrics[key].append(row[key])
        status.append(statuses)
    return dict(
        schema_version="inverse-error-map-v1",
        x=x.tolist(),
        y=y.tolist(),
        x_parameter="spv_assumed_fraction",
        y_parameter="sa_fraction",
        fixed=dict(sv_fraction=sv, spv_true_fraction=spv_true),
        metrics=metrics,
        status=status,
        masked_count=masked,
        offscale_count=sum(
            v is not None and abs(v) > 1 for row in metrics["relative_error_vs_true"] for v in row
        ),
        orientation="y_major_x_minor",
        error_denominator="true_ratio",
        local_approximation="first_order_only",
    )
