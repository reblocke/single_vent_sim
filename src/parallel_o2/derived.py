"""Conditional mathematical objectives and the separately supplied inverse demo."""

import math
from copy import deepcopy
from typing import Any

import numpy as np

from .indexing import flow_mode
from .inputs import InputError, _number
from .model import resolve_inputs, solve_state


def ratio_bounds(bounds: tuple[float, float] | None) -> tuple[float, float] | None:
    if bounds is not None:
        if not isinstance(bounds, (tuple, list)) or len(bounds) != 2:
            raise InputError("Ratio bounds require two endpoints")
        for value in bounds:
            _number(value, positive=True)
        if bounds[0] >= bounds[1]:
            raise InputError("Ratio bounds must increase")
    return bounds


def stationary_ratio(demand_over_capacity_flow: Any) -> Any:
    """Shared scalar/vectorized stationary ratio; callers enforce existence bounds."""
    with np.errstate(all="ignore"):
        root = np.sqrt(demand_over_capacity_flow)
        return root / (1 - root)


def conditional_optimum(
    scenario: dict[str, Any], r_bounds: tuple[float, float] | None = None
) -> dict[str, Any]:
    """DO2 and Sv maxima on one fixed-total-output, nonnegative-content slice."""
    bounds = ratio_bounds(r_bounds)
    x = resolve_inputs(scenario)
    m = x.vo2_ml_min_per_unit
    a = ((x.qp_ml_min_per_unit + x.qs_ml_min_per_unit) / 100) * (x.capacity_ml_dl * x.spv_fraction)
    result: dict[str, Any] = {
        "schema_version": "conditional-optimum-v1",
        "fixed_inputs": deepcopy(scenario),
        "r_bounds": bounds,
        "objective": "Maximum systemic DO2 on this fixed-total-output slice",
        "admissible_interval": None,
        "r_stationary": None,
        "do2_maximum": None,
        "sv_maximum": None,
    }
    if not math.isfinite(a) or solve_state(scenario)["status"] == "numerical_failure":
        return {**result, "status": "numerical_failure"}
    result["fixed_inputs"] = flow_mode(scenario, "total_ratio")
    result["fixed_inputs"]["flow"].pop("r")
    if m == 0:
        return {
            **result,
            "status": "zero_demand_no_interior_maximum",
            "sv_status": "constant_no_unique_maximum",
            "do2_limit": "supremum_as_r_approaches_zero" if a > 0 else "constant_zero",
        }
    # Scale by A to keep the discriminant bounded. Equality has its own state.
    if a == 0 or m / a > 0.25:
        return {**result, "status": "no_admissible_ratio"}
    u = m / a
    if u == 0:
        return {**result, "status": "numerical_failure"}
    low = 2 * u / (1 - 2 * u + math.sqrt(max(0, 1 - 4 * u)))
    high = 1 / low
    if not math.isfinite(high):
        return {**result, "status": "numerical_failure"}
    result["admissible_interval"] = [low, high]
    stationary = float(stationary_ratio(u))
    result["r_stationary"] = stationary
    lo, hi = (max(low, bounds[0]), min(high, bounds[1])) if bounds else (low, high)
    if lo > hi:
        return {**result, "status": "no_admissible_ratio_within_bounds"}

    def maximum(r: float, objective: str) -> dict[str, Any]:
        selected = max(lo, min(hi, r))
        s = flow_mode(scenario, "total_ratio")
        s["flow"]["r"] = selected
        return {
            "r": selected,
            "state": solve_state(s),
            "objective": objective,
            "location": "interior_optimum"
            if lo < selected < hi
            else "maximum_within_selected_bounds",
            "analytic_optimum_outside_plot": bool(bounds and not bounds[0] <= r <= bounds[1]),
        }

    return {
        **result,
        "status": "sole_zero_venous_boundary" if u == 0.25 else "finite",
        "do2_maximum": maximum(stationary, "systemic_do2"),
        "sv_maximum": maximum(1.0, "systemic_venous_saturation"),
    }


def inverse_ratio(sa: float, sv: float, spv_true: float, spv_assumed: float) -> dict[str, Any]:
    for value in (sa, sv, spv_true, spv_assumed):
        _number(value, 0, 1)
    if not sv < sa < min(spv_true, spv_assumed):
        raise InputError("Inverse demo requires 0 <= Sv < Sa < both Spv endpoints <= 1")
    true = (sa - sv) / (spv_true - sa)
    estimated = (sa - sv) / (spv_assumed - sa)
    relative = (estimated - true) / true
    excess = (true - estimated) / estimated
    psi = -spv_true / (spv_true - sa)
    local = psi * (spv_assumed - spv_true) / spv_true
    if not all(math.isfinite(x) for x in (true, estimated, relative, excess, psi, local)):
        return {"schema_version": "inverse-ratio-v1", "status": "numerical_failure"}
    return {
        "schema_version": "inverse-ratio-v1",
        "status": "finite",
        "inputs": dict(sa=sa, sv=sv, spv_true=spv_true, spv_assumed=spv_assumed),
        "r_true": true,
        "r_est": estimated,
        "relative_error_vs_true": relative,
        "true_excess_over_est": excess,
        "psi": psi,
        "local_relative_error": local,
        "spv_error_percentage_points": 100 * (spv_assumed - spv_true),
    }
