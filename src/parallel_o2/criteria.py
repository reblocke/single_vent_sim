"""Selected saturation criteria, kept separate from physical feasibility."""

import math
from copy import deepcopy
from typing import Any

import numpy as np

from .derived import ratio_bounds
from .indexing import flow_mode
from .inputs import InputError, _choice, _criteria, _number
from .model import resolve_inputs, solve_state, validated_scenario

ANALYSIS_VERSION = "hemoglobin-criteria-v1"
SATURATION_TOLERANCE = 1e-10


def assess_criteria(state: dict[str, Any], criteria: dict[str, Any]) -> dict[str, Any]:
    _criteria(criteria)
    result: dict[str, Any] = {
        "schema_version": "criterion-result-v1",
        "analysis_version": ANALYSIS_VERSION,
        "criteria": deepcopy(criteria),
        "model_status": state["status"],
        "saturation_tolerance": SATURATION_TOLERANCE,
        "arterial": "not_evaluable",
        "venous": "not_evaluable",
        "arterial_margin_percentage_points": None,
        "venous_margin_percentage_points": None,
        "meets_both_strict_criteria": False,
    }
    if state["status"] in ("infeasible_requested_consumption", "numerical_failure"):
        return {**result, "status": "not_evaluable"}
    for name, metric, threshold in (
        ("arterial", "sa_fraction", "sa_lower_fraction"),
        ("venous", "sv_fraction", "sv_lower_fraction"),
    ):
        difference = state["metrics"][metric] - criteria[threshold]
        result[name] = (
            "on"
            if abs(difference) <= SATURATION_TOLERANCE
            else "above"
            if difference > 0
            else "below"
        )
        result[f"{name}_margin_percentage_points"] = 100 * difference
    a, v = result["arterial"], result["venous"]
    status = (
        "on_selected_boundary"
        if "on" in (a, v)
        else "both_above"
        if a == v == "above"
        else "arterial_only_above"
        if a == "above"
        else "venous_only_above"
        if v == "above"
        else "neither_above"
    )
    return {**result, "status": status, "meets_both_strict_criteria": status == "both_above"}


def hb_boundary_component(p: Any, s: Any, m: Any, k: Any, gap: float, venous: bool) -> Any:
    """One stable equality kernel for scalar and vectorized Hb boundaries."""
    with np.errstate(all="ignore"):
        limiting_flow = (
            np.minimum(p, s) / (1 + np.minimum(p, s) / np.maximum(p, s)) if venous else p
        )
        return (100 * (m / limiting_flow)) / (k * gap)


def criterion_boundary(
    scenario: dict[str, Any],
    criteria: dict[str, Any],
    solve_for: str = "hb",
    display_range: tuple[float, float] | None = None,
) -> dict[str, Any]:
    _criteria(criteria)
    _choice(solve_for, ("hb", "total_flow", "vo2"))
    if display_range is not None:
        if not isinstance(display_range, (tuple, list)) or len(display_range) != 2:
            raise InputError("Display range requires two finite endpoints")
        _number(display_range[0], 0)
        _number(display_range[1], positive=True)
        if display_range[0] >= display_range[1]:
            raise InputError("Display range must increase")
    scenario = validated_scenario(scenario)
    if solve_for == "hb" and scenario["capacity"]["mode"] != "hb_linear":
        raise InputError("Hb inverse requires Hb-linear capacity")
    x = resolve_inputs(scenario)
    kg = x.reference_unit == "per_kg"
    suffix = "ml_kg_min" if kg else "l_min_m2"
    demand_key = "vo2_target_ml_kg_min" if kg else "vo2_target_ml_min_m2"
    parameter = {"hb": "capacity.hb_g_dl", "total_flow": f"flow.qt_{suffix}", "vo2": demand_key}[
        solve_for
    ]
    unit = {
        "hb": "g/dL",
        "total_flow": "mL blood/kg/min" if kg else "L blood/min/m2",
        "vo2": "mL O2/kg/min" if kg else "mL O2/min/m2",
    }[solve_for]
    fixed = flow_mode(scenario, "total_ratio") if solve_for == "total_flow" else deepcopy(scenario)
    path = parameter.split(".")
    if len(path) == 2:
        fixed[path[0]].pop(path[1])
    else:
        fixed.pop(parameter)
    result: dict[str, Any] = {
        "schema_version": "boundary-result-v1",
        "analysis_version": ANALYSIS_VERSION,
        "indexing_basis": x.reference_unit,
        "solve_for": solve_for,
        "boundary_parameter": parameter,
        "unit": unit,
        "fixed_inputs": fixed,
        "criteria": deepcopy(criteria),
        "strict_direction": "below" if solve_for == "vo2" else "above",
        "binding_criterion": None,
        "joint_value": None,
        "equality_state": None,
        "equality_criteria": None,
        "display_range": display_range,
        "description": "Derived equality boundary; equality does not satisfy strict criteria.",
    }
    p, s, b, m = map(
        np.float64,
        (x.qp_ml_min_per_unit, x.qs_ml_min_per_unit, x.capacity_ml_dl, x.vo2_ml_min_per_unit),
    )
    gap_a = x.spv_fraction - criteria["sa_lower_fraction"]
    gap_v = x.spv_fraction - criteria["sv_lower_fraction"]
    components: dict[str, dict[str, Any]] = {}
    with np.errstate(all="ignore"):
        for name, gap in (("arterial", gap_a), ("venous", gap_v)):
            if solve_for != "vo2" and m == 0:
                components[name] = {
                    "value": 0.0 if gap > SATURATION_TOLERANCE else None,
                    "status": "no_positive_lower_bound"
                    if gap > SATURATION_TOLERANCE
                    else "no_solution_at_endpoint",
                }
                continue
            if gap <= 0:
                components[name] = {"value": None, "status": "no_finite_solution"}
                continue
            harmonic = min(p, s) / (1 + min(p, s) / max(p, s))
            limiting_flow = p if name == "arterial" else harmonic
            if solve_for == "hb":
                value = hb_boundary_component(
                    p, s, m, scenario["capacity"]["kappa_ml_o2_g_hb"], gap, name == "venous"
                )
            elif solve_for == "total_flow":
                value = (100 * (m / b) / gap) * ((p + s) / limiting_flow) / (1 if kg else 1000)
            else:
                value = (limiting_flow / 100) * b * gap
            components[name] = {
                "value": float(value) if np.isfinite(value) and value > 0 else None,
                "status": "finite" if np.isfinite(value) and value > 0 else "numerical_failure",
            }
    result.update(components)
    statuses = {c["status"] for c in components.values()}
    if statuses == {"no_positive_lower_bound"}:
        return {
            **result,
            "joint_value": 0.0,
            "joint_status": "no_positive_lower_bound",
            "reason": "Zero is an unattained infimum outside the positive parameter domain",
        }
    if statuses != {"finite"}:
        reason = (
            "numerical_failure"
            if "numerical_failure" in statuses
            else "no_solution_at_endpoint"
            if m == 0 and solve_for != "vo2"
            else "no_finite_solution"
        )
        return {**result, "joint_status": reason}
    a, v = components["arterial"]["value"], components["venous"]["value"]
    value = min(a, v) if solve_for == "vo2" else max(a, v)
    binding = (
        "both"
        if math.isclose(a, v, rel_tol=1e-12, abs_tol=0)
        else "arterial"
        if value == a
        else "venous"
    )
    equality = (
        flow_mode(scenario, "total_ratio") if solve_for == "total_flow" else deepcopy(scenario)
    )
    if len(path) == 2:
        equality[path[0]][path[1]] = value
    else:
        equality[parameter] = value
    equality_state = solve_state(equality)
    result.update(
        joint_value=value,
        joint_status="outside_display_range"
        if display_range and not display_range[0] <= value <= display_range[1]
        else "finite",
        binding_criterion=binding,
        equality_state=equality_state,
        equality_criteria=assess_criteria(equality_state, criteria),
    )
    if solve_for == "vo2":
        result["prescribed_demand_margin"] = value - float(m)
        metric = "zero_venous_vo2_limit_ml_kg_min" if kg else "zero_venous_vo2_limit_ml_min_m2"
        result["zero_venous_mathematical_limit"] = equality_state["audit"]["algebraic_metrics"][
            metric
        ]
    return result


def criterion_ratio_interval(
    scenario: dict[str, Any],
    criteria: dict[str, Any],
    r_bounds: tuple[float, float] | None = None,
) -> dict[str, Any]:
    _criteria(criteria)
    bounds = ratio_bounds(r_bounds)
    x = resolve_inputs(scenario)
    result: dict[str, Any] = {
        "schema_version": "ratio-interval-v1",
        "analysis_version": ANALYSIS_VERSION,
        "indexing_basis": x.reference_unit,
        "criteria": deepcopy(criteria),
        "fixed_inputs": flow_mode(scenario, "total_ratio"),
        "analysis_bounds": bounds,
        "unclipped_interval": None,
        "interval": None,
        "empty_reason": None,
    }
    result["fixed_inputs"]["flow"].pop("r")
    a = x.spv_fraction - criteria["sa_lower_fraction"]
    b = x.spv_fraction - criteria["sv_lower_fraction"]
    m = x.vo2_ml_min_per_unit

    def empty(reason: str) -> dict[str, Any]:
        return {**result, "status": "no_ratio_meets_selected_criteria", "empty_reason": reason}

    if m == 0:
        if min(a, b) <= SATURATION_TOLERANCE:
            return empty("zero_demand_endpoint_does_not_meet_both")
        whole = {
            "lower": 0.0,
            "upper": None,
            "lower_included": False,
            "upper_included": False,
            "upper_reason": "unbounded_positive_domain",
        }
        interval = (
            whole
            if bounds is None
            else dict(lower=bounds[0], upper=bounds[1], lower_included=True, upper_included=True)
        )
        return {
            **result,
            "status": "entire_positive_domain",
            "unclipped_interval": whole,
            "interval": interval,
        }
    with np.errstate(all="ignore"):
        u = float(
            (np.float64(m) / x.capacity_ml_dl)
            * 100
            / (np.float64(x.qp_ml_min_per_unit) + x.qs_ml_min_per_unit)
        )
    if not math.isfinite(u) or u <= 0:
        return {**result, "status": "numerical_failure"}
    if a - u <= SATURATION_TOLERANCE:
        return empty("arterial_endpoint_unattainable")
    if b - 4 * u <= SATURATION_TOLERANCE:
        return empty(
            "venous_tangent_only"
            if abs(b - 4 * u) <= SATURATION_TOLERANCE
            else "venous_interval_empty"
        )
    z = u / b
    vlow = 2 * z / (1 - 2 * z + math.sqrt(1 - 4 * z))
    if vlow == 0:
        return {**result, "status": "numerical_failure"}
    low, high = max(u / (a - u), vlow), 1 / vlow
    if not math.isfinite(high):
        return {**result, "status": "numerical_failure"}
    result["venous_roots"] = [vlow, high]
    result["arterial_lower"] = u / (a - u)
    if low >= high:
        return empty("disjoint_arterial_and_venous_intervals")
    whole = dict(lower=low, upper=high, lower_included=False, upper_included=False)
    result["unclipped_interval"] = whole
    if bounds is None:
        return {**result, "status": "finite", "interval": whole}
    lo, hi = max(low, bounds[0]), min(high, bounds[1])
    if lo >= hi:
        return empty("selected_bounds_exclude_qualifying_interval")
    included = []
    for r, interior in ((lo, lo > low), (hi, hi < high)):
        trial = flow_mode(scenario, "total_ratio")
        trial["flow"]["r"] = r
        included.append(
            interior and assess_criteria(solve_state(trial), criteria)["meets_both_strict_criteria"]
        )
    return {
        **result,
        "status": "finite",
        "interval": dict(
            lower=lo, upper=hi, lower_included=included[0], upper_included=included[1]
        ),
    }
