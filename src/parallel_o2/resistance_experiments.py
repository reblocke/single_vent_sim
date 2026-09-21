"""Resistance grids, matched reference families, local responses and ablation."""

import math
from copy import deepcopy
from dataclasses import replace
from typing import Any, cast

import numpy as np
from numpy.typing import NDArray

from .experiments import axis_coordinates
from .flow_providers import (
    coupled_metrics,
    oxygen_for_hemodynamics,
    resistance_units,
    solve_resistance_state,
)
from .hemodynamics import (
    FrozenCircuitReference,
    hemodynamics_arrays,
    resolve_resistance_reference,
    validated_resistance,
)
from .inputs import InputError, _choice, _number, _object
from .serialization import finite_json

ABSOLUTE_ALIASES = {
    "current_rp_mmhg_min_l": "perturbation.rp_multiplier",
    "current_rshunt_nominal_mmhg_min_l": "perturbation.rshunt_multiplier",
}


def validate_resistance_axes(
    request: dict[str, Any], x: dict[str, Any], y: dict[str, Any], policy: str
) -> dict[str, Any]:
    """One axis/held-input contract for vectorized and selected-point evaluation."""
    for axis in (x, y):
        _axis(request, axis, policy)
    parameters = {x["parameter"], y["parameter"]}
    if len(parameters) != 2 or x["n"] * y["n"] > 160801:
        raise InputError("Distinct axes and at most 160801 cells required")
    roles: dict[str, Any] = {p: {"role": "axis"} for p in sorted(parameters)}
    for absolute, alias in ABSOLUTE_ALIASES.items():
        if absolute in parameters:
            if alias in parameters:
                raise InputError("Absolute resistance and its multiplier cannot be separate axes")
            if request["perturbation"][alias.split(".")[1]] != 1:
                raise InputError(
                    "Absolute resistance derives its multiplier; held placeholder must be 1"
                )
            roles[alias] = {"role": "derived", "from": absolute}
    roles["local_rp_multiplier"] = {
        "role": "local_response" if policy == "local_response" else "inactive"
    }
    for group in ("reference", "response", "perturbation", "oxygen"):
        for key in request[group]:
            roles.setdefault(group + "." + key, {"role": "held"})
    return roles


def _axis(request: dict[str, Any], axis: dict[str, Any], policy: str) -> None:
    _object(axis, "parameter min max n scale")
    allowed = {
        "perturbation.rs_multiplier",
        "perturbation.rp_multiplier",
        "perturbation.rshunt_multiplier",
        "response.alpha",
        "response.nonlinear_fraction",
    }
    if policy == "matched_reference_family":
        allowed.add("reference_native_fraction")
    if policy == "local_response":
        allowed.update(("current_rp_mmhg_min_l", "current_rshunt_nominal_mmhg_min_l"))
    if request["oxygen"]["mode"] == "physical":
        allowed.add("oxygen.hb_g_dl")
    _choice(axis["parameter"], tuple(allowed))
    _choice(axis["scale"], ("linear", "log"))
    for endpoint in (axis["min"], axis["max"]):
        _number(endpoint, 0)
        parameter = axis["parameter"]
        if parameter in (
            "response.alpha",
            "response.nonlinear_fraction",
            "reference_native_fraction",
        ):
            _number(endpoint, 0, 1)
        if parameter in ("perturbation.rs_multiplier", "oxygen.hb_g_dl") or axis["scale"] == "log":
            _number(endpoint, positive=True)
    if axis["min"] >= axis["max"]:
        raise InputError("Grid axis bounds must increase")
    if type(axis["n"]) is not int or not 3 <= axis["n"] <= 401:
        raise InputError("Axis n must be an integer from 3 to 401")


def _batch(
    request: dict[str, Any],
    ref: FrozenCircuitReference,
    values: dict[str, NDArray[np.float64]],
    baseline: bool = False,
    local_multiplier: float | None = None,
    closure: str | None = None,
) -> dict[str, Any]:
    def value(path: str) -> Any:
        if path in values:
            return values[path]
        group, key = path.split(".")
        return request[group][key]

    ms = (
        np.ones_like(next(iter(values.values())))
        if baseline
        else value("perturbation.rs_multiplier")
    )
    mp = np.ones_like(ms) if baseline else value("perturbation.rp_multiplier")
    mh = np.ones_like(ms) if baseline else value("perturbation.rshunt_multiplier")
    if not baseline:
        if "current_rp_mmhg_min_l" in values:
            if np.any(np.asarray(ref.rp_mmhg_min_l) <= 0):
                raise InputError("Absolute native-Rp axes require a positive global reference Rp")
            mp = values["current_rp_mmhg_min_l"] / ref.rp_mmhg_min_l
        if "current_rshunt_nominal_mmhg_min_l" in values:
            if np.any(np.asarray(ref.rshunt_nominal_mmhg_min_l) <= 0):
                raise InputError("Absolute shunt axes require a positive global reference shunt")
            mh = values["current_rshunt_nominal_mmhg_min_l"] / ref.rshunt_nominal_mmhg_min_l
        if local_multiplier is not None:
            mp = mp * local_multiplier
    oxygen = deepcopy(request["oxygen"])
    if "oxygen.hb_g_dl" in values:
        oxygen["hb_g_dl"] = values["oxygen.hb_g_dl"]
    hemo = hemodynamics_arrays(
        ref,
        ms,
        mp,
        mh,
        value("response.alpha"),
        value("response.nonlinear_fraction"),
        closure or request["response"]["closure"],
        request["perturbation"]["scope"],
    )
    o2 = oxygen_for_hemodynamics(hemo, oxygen)
    raw = coupled_metrics(hemo, oxygen, o2)
    solved = hemo.status == "solved"
    valid = solved & o2.nonnegative
    metrics = {
        key: None
        if value is None
        else np.where(solved if key in hemo.metrics else valid, value, np.nan)
        for key, value in raw.items()
    }
    return dict(
        metrics=metrics,
        hemodynamic_status=hemo.status,
        oxygen_status=np.where(solved, o2.status, "not_evaluated"),
        eligible=valid,
        status=np.where(solved, o2.status, hemo.status),
    )


def evaluate_resistance_grid(
    request: dict[str, Any],
    x: dict[str, Any],
    y: dict[str, Any],
    metrics: list[str],
    baseline_policy: str = "frozen_reference",
    local_rp_multiplier: float = 0.55,
) -> dict[str, Any]:
    request = validated_resistance(request)
    _choice(baseline_policy, ("frozen_reference", "matched_reference_family", "local_response"))
    _number(local_rp_multiplier, 0)
    roles = validate_resistance_axes(request, x, y, baseline_policy)
    if baseline_policy == "matched_reference_family" and "reference_native_fraction" not in (
        x["parameter"],
        y["parameter"],
    ):
        raise InputError("Matched-reference grid requires the declared native fraction axis")
    if request["perturbation"]["scope"] != "native_rp":
        raise InputError("Advanced resistance grids require native-Rp scope")
    declared = set(solve_resistance_state(request)["metrics"])
    declared.update(
        f"relative_{key}_change"
        for key in (
            "delivery_index_l_min",
            "do2_ml_min",
            "qp_l_min",
            "qt_l_min",
            "driving_pressure_mmhg",
        )
    )
    declared.update(
        (
            "closure_nominal_relative_change",
            "closure_secant_relative_change",
            "closure_difference_percentage_points",
        )
    )
    if (
        not isinstance(metrics, list)
        or not metrics
        or any(not isinstance(m, str) or m not in declared for m in metrics)
        or len(set(metrics)) != len(metrics)
    ):
        raise InputError("Distinct known resistance metric IDs required")
    ref = resolve_resistance_reference(request)
    xs, ys = axis_coordinates(x), axis_coordinates(y)
    xx, yy = np.meshgrid(xs, ys, indexing="xy")
    values = {x["parameter"]: xx, y["parameter"]: yy}
    if "reference_native_fraction" in values:
        rho = values["reference_native_fraction"]
        total = ref.rp_mmhg_min_l + ref.rshunt_nominal_mmhg_min_l
        native, shunt = total * rho, total * (1 - rho)
        native.flags.writeable = shunt.flags.writeable = False
        ref = replace(
            ref,
            rp_mmhg_min_l=native,
            rshunt_nominal_mmhg_min_l=shunt,
            k1_mmhg_min_l=(1 - ref.nonlinear_fraction) * shunt,
            k2_mmhg_min2_l2=ref.nonlinear_fraction * shunt / ref.calibration_qp_l_min,
        )
    before = _batch(request, ref, values, baseline=baseline_policy != "local_response")
    after = _batch(
        request,
        ref,
        values,
        local_multiplier=local_rp_multiplier if baseline_policy == "local_response" else None,
    )
    paired = before["eligible"] & after["eligible"]
    fields = dict(after["metrics"])
    # Local-response state maps describe each cell before its native-Rp perturbation.
    if baseline_policy == "local_response":
        fields.update(before["metrics"])
    with np.errstate(all="ignore"):
        for key in (
            "delivery_index_l_min",
            "do2_ml_min",
            "qp_l_min",
            "qt_l_min",
            "driving_pressure_mmhg",
        ):
            a, b = before["metrics"][key], after["metrics"][key]
            fields[f"relative_{key}_change"] = (
                None if a is None else np.where(paired & (a != 0), (b - a) / a, np.nan)
            )
        # R6 compares the two explicitly different structural laws on identical inputs.
        other_closure = (
            "circuit_secant"
            if request["response"]["closure"] == "nominal_parallel"
            else "nominal_parallel"
        )
        if any(m.startswith("closure_") for m in metrics):
            other_before = _batch(
                request,
                ref,
                values,
                baseline=baseline_policy != "local_response",
                closure=other_closure,
            )
            other_after = _batch(
                request,
                ref,
                values,
                local_multiplier=local_rp_multiplier
                if baseline_policy == "local_response"
                else None,
                closure=other_closure,
            )
            a, b = (
                other_before["metrics"]["delivery_index_l_min"],
                other_after["metrics"]["delivery_index_l_min"],
            )
            other_delta = np.where(
                other_before["eligible"] & other_after["eligible"] & (a != 0), (b - a) / a, np.nan
            )
            this_delta = fields["relative_delivery_index_l_min_change"]
            nominal = (
                this_delta if request["response"]["closure"] == "nominal_parallel" else other_delta
            )
            secant = (
                other_delta if request["response"]["closure"] == "nominal_parallel" else this_delta
            )
            fields.update(
                closure_nominal_relative_change=nominal,
                closure_secant_relative_change=secant,
                closure_difference_percentage_points=100 * (secant - nominal),
            )
    if (
        not isinstance(metrics, list)
        or not metrics
        or any(not isinstance(m, str) or m not in fields for m in metrics)
        or len(set(metrics)) != len(metrics)
    ):
        raise InputError("Distinct known resistance metric IDs required")
    units = resistance_units(list(fields))
    for name in fields:
        if name.startswith(("relative_", "closure_")):
            units[name] = (
                "percentage points" if name.endswith("percentage_points") else "relative fraction"
            )
    shape = (len(ys), len(xs))
    return cast(
        dict[str, Any],
        finite_json(
            dict(
                schema_version="resistance-grid-v1",
                requested=request,
                baseline_policy=baseline_policy,
                local_rp_multiplier=local_rp_multiplier
                if baseline_policy == "local_response"
                else None,
                reference_sha256=ref.sha256,
                reference_policy_description=(
                    (
                        "Each native fraction has its own frozen reference "
                        "with identical baseline flows"
                    )
                    if baseline_policy == "matched_reference_family"
                    else (
                        "Each cell is A; B changes only that cell's native Rp "
                        "while preserving the original global reference"
                    )
                    if baseline_policy == "local_response"
                    else "Each response is compared with the unperturbed frozen reference"
                ),
                shape=list(shape),
                orientation="y,x",
                dtype="float64",
                input_roles=roles,
                x={
                    **x,
                    "coordinates": xs,
                    "plot_coordinates": np.log10(xs) if x["scale"] == "log" else xs,
                },
                y={
                    **y,
                    "coordinates": ys,
                    "plot_coordinates": np.log10(ys) if y["scale"] == "log" else ys,
                },
                requested_resolution=[y["n"], x["n"]],
                actual_resolution=list(shape),
                metrics={
                    key: np.full(shape, np.nan)
                    if fields[key] is None
                    else np.broadcast_to(fields[key], shape)
                    for key in metrics
                },
                units={key: units[key] for key in metrics},
                before_status=before["status"],
                after_status=after["status"],
                hemodynamic_status=after["hemodynamic_status"],
                oxygen_status=after["oxygen_status"],
                paired_eligible=paired,
            )
        ),
    )


def compare_resistance_states(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    first, second = solve_resistance_state(a), solve_resistance_state(b)
    allowed = (
        first["has_nonnegative_content_solution"] and second["has_nonnegative_content_solution"]
    )
    deltas = {}
    for key, value in first["metrics"].items():
        other = second["metrics"][key]
        valid = allowed and value is not None and other is not None
        delta = other - value if valid else None
        deltas[key] = dict(
            absolute=delta, relative=delta / value if delta is not None and value != 0 else None
        )
    decomposition = None
    if (
        allowed
        and a["oxygen"]["mode"] == b["oxygen"]["mode"] == "physical"
        and first["metrics"]["sa_fraction"] > 0
        and second["metrics"]["sa_fraction"] > 0
    ):
        factors = {
            "systemic_flow": second["metrics"]["qs_l_min"] / first["metrics"]["qs_l_min"],
            "hb": b["oxygen"]["hb_g_dl"] / a["oxygen"]["hb_g_dl"],
            "kappa": b["oxygen"]["kappa_ml_o2_g_hb"] / a["oxygen"]["kappa_ml_o2_g_hb"],
            "arterial_saturation": second["metrics"]["sa_fraction"]
            / first["metrics"]["sa_fraction"],
        }
        logs = {key: math.log(value) for key, value in factors.items()}
        total = math.log(second["metrics"]["do2_ml_min"] / first["metrics"]["do2_ml_min"])
        decomposition = dict(
            multiplicative_factors=factors,
            log_contributions=logs,
            log_delivery_ratio=total,
            log_residual=sum(logs.values()) - total,
        )
    return dict(
        schema_version="resistance-comparison-v1",
        decomposition=decomposition,
        a=first,
        b=second,
        status="finite" if allowed else "masked_endpoint",
        deltas=deltas,
        same_frozen_reference=first["reference_sha256"] == second["reference_sha256"],
    )


def mechanism_ablation(
    request: dict[str, Any],
    alpha_values: tuple[float, float] = (0, 0.35),
    nonlinear_values: tuple[float, float] = (0, 0.5),
) -> dict[str, Any]:
    request = validated_resistance(request)
    if request["perturbation"]["scope"] != "native_rp":
        raise InputError("Mechanism ablation requires a common native-Rp perturbation")
    for values in (alpha_values, nonlinear_values):
        if len(values) != 2:
            raise InputError("A 2×2 ablation requires two values for each mechanism")
        for value in values:
            _number(value, 0, 1)
    rows = []
    for alpha in alpha_values:
        for f in nonlinear_values:
            after = deepcopy(request)
            after["response"].update(alpha=alpha, nonlinear_fraction=f)
            before = deepcopy(after)
            before["perturbation"].update(rs_multiplier=1, rp_multiplier=1, rshunt_multiplier=1)
            comparison = compare_resistance_states(before, after)
            rows.append(
                dict(
                    alpha=alpha,
                    nonlinear_fraction=f,
                    comparison=comparison,
                    relative_index_change=comparison["deltas"]["delivery_index_l_min"]["relative"],
                )
            )
    changes = [row["relative_index_change"] for row in rows]
    return dict(
        schema_version="ablation-v1",
        requested=request,
        cells=rows,
        interaction_relative_fraction=changes[3] - changes[2] - changes[1] + changes[0]
        if all(v is not None for v in changes)
        else None,
        description=(
            "Same native-Rp scope and frozen baseline; alpha and nonlinear fraction "
            "form a 2×2 comparison."
        ),
    )
