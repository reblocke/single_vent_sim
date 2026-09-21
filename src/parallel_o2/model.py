"""One float64 oxygen-conservation kernel for scalar, grid and flow-provider use."""

from dataclasses import asdict, dataclass
from typing import Any, Literal, cast

import numpy as np
from numpy.typing import ArrayLike, NDArray

from .inputs import MODEL_VERSION, InputError, parse_request
from .serialization import finite_json

Basis = Literal["per_kg", "per_m2", "absolute"]
FloatArray = NDArray[np.float64]


@dataclass(frozen=True)
class ResolvedInputs:
    """Blood flows in mL/min per reference unit; oxygen contents always mL/dL."""

    reference_unit: Basis
    qp_ml_min_per_unit: float
    qs_ml_min_per_unit: float
    capacity_ml_dl: float
    spv_fraction: float
    vo2_ml_min_per_unit: float


def validated_scenario(scenario: dict[str, Any]) -> dict[str, Any]:
    import json

    try:
        value = parse_request(json.dumps(scenario, allow_nan=False))
    except (ValueError, TypeError, RecursionError) as exc:
        raise InputError("Expected a finite, serializable scenario") from exc
    if value["schema_version"] not in ("scenario-v1", "scenario-v2"):
        raise InputError("Expected a fixed-flow scenario")
    return value


def resolve_inputs(scenario: dict[str, Any]) -> ResolvedInputs:
    s = validated_scenario(scenario)
    basis: Basis = s.get("indexing_basis", "per_kg")
    suffix = "ml_kg_min" if basis == "per_kg" else "l_min_m2"
    multiplier = 1.0 if basis == "per_kg" else 1000.0
    flow = s["flow"]
    with np.errstate(all="ignore"):
        if flow["mode"] == "total_ratio":
            qt, ratio = np.float64(flow[f"qt_{suffix}"]), np.float64(flow["r"])
            qp = qt / (1 + 1 / ratio) if ratio >= 1 else qt * (ratio / (1 + ratio))
            qs = qt / (1 + ratio)
        else:
            qp, qs = np.float64(flow[f"qp_{suffix}"]), np.float64(flow[f"qs_{suffix}"])
        cap = s["capacity"]
        capacity = (
            np.float64(cap["hb_g_dl"]) * cap["kappa_ml_o2_g_hb"]
            if cap["mode"] == "hb_linear"
            else np.float64(cap["capacity_ml_dl"])
        )
        demand = s["vo2_target_ml_kg_min" if basis == "per_kg" else "vo2_target_ml_min_m2"]
        return ResolvedInputs(
            basis,
            float(qp * multiplier),
            float(qs * multiplier),
            float(capacity),
            float(s["spv_fraction"]),
            float(demand),
        )


@dataclass
class OxygenArrays:
    algebraic: dict[str, FloatArray]
    status: NDArray[np.str_]
    nonnegative: NDArray[np.bool_]
    residuals: dict[str, FloatArray]


def oxygen_arrays(
    qp: ArrayLike, qs: ArrayLike, capacity: ArrayLike, spv: ArrayLike, demand: ArrayLike
) -> OxygenArrays:
    """The single scientific kernel; adapters supply mL blood/min per reference unit.

    Nonfinite diagnostics are retained internally until strict JSON conversion.
    No saturation clipping, demand adjustment or reference-helper imports occur.
    """
    p, s, b, v, m = np.broadcast_arrays(
        *[np.asarray(x, dtype=np.float64) for x in (qp, qs, capacity, spv, demand)]
    )
    with np.errstate(all="ignore"):
        qt, r = p + s, p / s
        cpv = b * v
        ca = cpv - (m / p) * 100
        cv = ca - (m / s) * 100
        sa, sv = ca / b, cv / b
        systemic_in, systemic_out = (s / 100) * ca, (s / 100) * cv
        pulmonary_in, pulmonary_out = (p / 100) * ca, (p / 100) * cpv
        net_use, net_add = systemic_in - systemic_out, pulmonary_out - pulmonary_in
        av, pv = sa - sv, v - sa
        oer = np.where(systemic_in != 0, m / systemic_in, np.nan)
        omega = np.where(m != 0, systemic_in / m, np.nan)
        fick = np.where((m != 0) & (pv > 0), av / pv, np.nan)
        # Harmonic flow avoids overflow in Qp*Qs. Endpoint capacity remains explicit.
        harmonic = np.minimum(p, s) / (1 + np.minimum(p, s) / np.maximum(p, s))
        limit = (harmonic / 100) * cpv
        tolerance = 1e-12 * np.maximum.reduce([np.ones_like(b), b, np.abs(ca), np.abs(cv)])
        boundary = np.abs(cv) <= tolerance
        status = np.full(qt.shape, "admissible", dtype="<U36")
        status = np.where(boundary & (m > 0), "zero_venous_boundary", status)
        status = np.where(cv < -tolerance, "infeasible_requested_consumption", status)
        status = np.where((m == 0) & (v == 0), "degenerate_zero_oxygen", status)
        raw = dict(
            qp=p,
            qs=s,
            qt=qt,
            r=r,
            capacity=b,
            cpv=cpv,
            ca=ca,
            cv=cv,
            sa=sa,
            sv=sv,
            do2=systemic_in,
            oer=oer,
            omega=omega,
            systemic_in=systemic_in,
            systemic_out=systemic_out,
            systemic_net_use=net_use,
            pulmonary_in=pulmonary_in,
            pulmonary_out=pulmonary_out,
            pulmonary_net_add=net_add,
            zero_venous_vo2_limit=limit,
            av_saturation_gap=av,
            pv_a_saturation_gap=pv,
            r_fick=fick,
        )
        # Ratios intentionally undefined at zero demand/content are not failures.
        numerical = (p <= 0) | (s <= 0) | (b <= 0) | ((m > 0) & (pv <= 0))
        for key, value in raw.items():
            if key not in ("oer", "omega", "r_fick"):
                numerical |= ~np.isfinite(value)
        numerical |= (m > 0) & ~np.isfinite(omega)
        numerical |= (systemic_in != 0) & ~np.isfinite(oer)
        numerical |= (m > 0) & (pv > 0) & ~np.isfinite(fick)
        closed = ((qt / 100) * cpv) / (1 + r) - m / r
        mixing = (p / qt) * cpv + (s / qt) * cv
        residuals = dict(
            systemic_balance=net_use - m,
            pulmonary_balance=net_add - m,
            complete_mixing=mixing - ca,
            closed_form_do2=systemic_in - closed,
        )
        for value in residuals.values():
            numerical |= ~np.isfinite(value)
        status = np.where(numerical, "numerical_failure", status)
    nonnegative = np.isin(status, ["admissible", "zero_venous_boundary", "degenerate_zero_oxygen"])
    return OxygenArrays(raw, status, nonnegative, residuals)


def metric_names(basis: Basis) -> dict[str, str]:
    flow = {"per_kg": "ml_kg_min", "per_m2": "l_min_m2", "absolute": "l_min"}[basis]
    flux = {"per_kg": "ml_kg_min", "per_m2": "ml_min_m2", "absolute": "ml_min"}[basis]
    names = {key: f"{key}_{flow}" for key in ("qp", "qs", "qt")}
    names.update(
        {
            key: f"{key}_{flux}"
            for key in (
                "do2",
                "systemic_in",
                "systemic_out",
                "systemic_net_use",
                "pulmonary_in",
                "pulmonary_out",
                "pulmonary_net_add",
                "zero_venous_vo2_limit",
            )
        }
    )
    names.update({key: f"{key}_ml_dl" for key in ("capacity", "cpv", "ca", "cv")})
    names.update(
        {
            key: f"{key}_fraction"
            for key in ("sa", "sv", "oer", "av_saturation_gap", "pv_a_saturation_gap")
        }
    )
    names.update({key: key for key in ("r", "r_fick", "omega")})
    return names


def unit_registry(basis: Basis) -> dict[str, str]:
    names = metric_names(basis)
    flow = {"per_kg": "mL blood/kg/min", "per_m2": "L blood/min/m2", "absolute": "L blood/min"}[
        basis
    ]
    flux = {"per_kg": "mL O2/kg/min", "per_m2": "mL O2/min/m2", "absolute": "mL O2/min"}[basis]
    return {
        name: (
            flow
            if key in ("qp", "qs", "qt")
            else "mL O2/dL"
            if key in ("capacity", "cpv", "ca", "cv")
            else "fraction"
            if name.endswith("fraction")
            else "dimensionless"
            if key in ("r", "r_fick", "omega")
            else flux
        )
        for key, name in names.items()
    }


def state_from_resolved(resolved: ResolvedInputs, requested: dict[str, Any]) -> dict[str, Any]:
    """Coupling boundary also used by the separately specified resistance provider."""
    o = oxygen_arrays(
        resolved.qp_ml_min_per_unit,
        resolved.qs_ml_min_per_unit,
        resolved.capacity_ml_dl,
        resolved.spv_fraction,
        resolved.vo2_ml_min_per_unit,
    )
    status = str(o.status.item())
    names = metric_names(resolved.reference_unit)
    raw = {
        name: float(o.algebraic[key])
        / (1000 if key in ("qp", "qs", "qt") and resolved.reference_unit != "per_kg" else 1)
        for key, name in names.items()
    }
    masked = status in ("infeasible_requested_consumption", "numerical_failure")
    retained = {names[k] for k in ("qp", "qs", "qt", "r", "capacity")}
    metrics = {key: None if masked and key not in retained else value for key, value in raw.items()}
    undefined = {}
    for key, value in raw.items():
        if not np.isfinite(value):
            undefined[key] = (
                "undefined_zero_consumption"
                if resolved.vo2_ml_min_per_unit == 0 and key in ("omega", "r_fick")
                else "undefined_zero_content"
                if resolved.spv_fraction == 0 and resolved.vo2_ml_min_per_unit == 0
                else "numerical_nonfinite"
            )
    result = {
        "schema_version": "state-result-v1"
        if requested.get("schema_version") == "scenario-v1"
        else "state-result-v2",
        "model_version": MODEL_VERSION,
        "analysis_version": "hemoglobin-criteria-v1",
        "indexing_basis": resolved.reference_unit,
        "requested": requested,
        "resolved_inputs": asdict(resolved),
        "status": status,
        "is_admissible": status == "admissible",
        "has_nonnegative_content_solution": bool(o.nonnegative.item()),
        "metrics": metrics,
        "units": unit_registry(resolved.reference_unit),
        "residuals": {key: float(value) for key, value in o.residuals.items()},
        "warnings": [status] if status != "admissible" else [],
        "failure_reasons": [status] if masked else [],
        "undefined_reasons": undefined,
        "audit": {
            "algebraic_metrics": raw,
            "requested_consumption": resolved.vo2_ml_min_per_unit,
            "description": (
                "Unmodified algebraic values; masked states are not physiological predictions."
            ),
        },
    }
    return cast(dict[str, Any], finite_json(result))


def solve_state(scenario: dict[str, Any], criteria: dict[str, Any] | None = None) -> dict[str, Any]:
    result = state_from_resolved(resolve_inputs(scenario), validated_scenario(scenario))
    result["criterion_result"] = None
    if criteria is not None:
        from .criteria import assess_criteria

        result["criterion_result"] = assess_criteria(result, criteria)
    return result
