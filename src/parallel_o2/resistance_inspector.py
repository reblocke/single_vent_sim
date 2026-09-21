"""Exact selected-point inspection for declared resistance grid experiments."""

from copy import deepcopy
from typing import Any

from .hemodynamics import validated_resistance
from .inputs import InputError, _choice, _number
from .resistance_experiments import compare_resistance_states, validate_resistance_axes


def inspect_resistance_point(
    request: dict[str, Any],
    x: dict[str, Any],
    y: dict[str, Any],
    x_value: float,
    y_value: float,
    baseline_policy: str = "frozen_reference",
    local_rp_multiplier: float = 0.55,
) -> dict[str, Any]:
    """Use the same frozen/global/matched policy as the vectorized grid."""
    request = validated_resistance(request)
    _choice(baseline_policy, ("frozen_reference", "matched_reference_family", "local_response"))
    _number(local_rp_multiplier, 0)
    roles = validate_resistance_axes(request, x, y, baseline_policy)
    if request["perturbation"]["scope"] != "native_rp":
        raise InputError("Resistance grid inspection requires native-Rp scope")
    if baseline_policy == "matched_reference_family" and "reference_native_fraction" not in (
        x["parameter"],
        y["parameter"],
    ):
        raise InputError("Matched-reference inspection requires the native fraction axis")
    after = deepcopy(request)
    for axis, value in ((x, x_value), (y, y_value)):
        _number(value, axis["min"], axis["max"])
        parameter = axis["parameter"]
        if parameter == "reference_native_fraction":
            total = (
                request["reference"]["rp_mmhg_min_l"]
                + request["reference"]["rshunt_nominal_mmhg_min_l"]
            )
            after["reference"].update(
                rp_mmhg_min_l=total * value, rshunt_nominal_mmhg_min_l=total * (1 - value)
            )
        elif parameter.startswith("current_"):
            key = parameter.removeprefix("current_")
            reference = request["reference"][key]
            if reference <= 0:
                raise InputError("Absolute resistance axes require a positive global reference")
            multiplier = "rp_multiplier" if key.startswith("rp_") else "rshunt_multiplier"
            after["perturbation"][multiplier] = value / reference
        else:
            group, key = parameter.split(".")
            after[group][key] = value
    before = deepcopy(after)
    if baseline_policy == "local_response":
        after["perturbation"]["rp_multiplier"] *= local_rp_multiplier
    else:
        before["perturbation"].update(rs_multiplier=1, rp_multiplier=1, rshunt_multiplier=1)
    comparison = compare_resistance_states(before, after)
    closures = {}
    for closure in ("nominal_parallel", "circuit_secant"):
        a, b = deepcopy(before), deepcopy(after)
        a["response"]["closure"] = b["response"]["closure"] = closure
        closures[closure] = compare_resistance_states(a, b)
    return dict(
        schema_version="resistance-point-v1",
        input_roles=roles,
        requested=dict(
            request=request,
            x=x,
            y=y,
            x_value=x_value,
            y_value=y_value,
            baseline_policy=baseline_policy,
            local_rp_multiplier=local_rp_multiplier,
        ),
        comparison=comparison,
        closure_comparisons=closures,
        displayed_state=comparison["a"] if baseline_policy == "local_response" else comparison["b"],
        reference_policy=baseline_policy,
    )
