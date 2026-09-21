"""Resistance-to-oxygen coupling; physical flux never inferred from a normalized index."""

from dataclasses import asdict
from typing import Any, cast

import numpy as np

from .criteria import assess_criteria
from .hemodynamics import (
    FLOW_MODEL_VERSION,
    HemodynamicArrays,
    hemodynamics_arrays,
    resolve_resistance_reference,
    validated_resistance,
)
from .inputs import MODEL_VERSION
from .model import OxygenArrays, oxygen_arrays
from .serialization import finite_json


def oxygen_for_hemodynamics(hemo: HemodynamicArrays, oxygen: dict[str, Any]) -> OxygenArrays:
    """Unit conversion is the only coupling: the conservation equations are shared."""
    normalized = oxygen["mode"] == "normalized_source"
    with np.errstate(all="ignore"):
        b = 1.0 if normalized else np.float64(oxygen["hb_g_dl"]) * oxygen["kappa_ml_o2_g_hb"]
        m = (
            10 * np.float64(oxygen["normalized_consumption_l_min"])
            if normalized
            else oxygen["vo2_ml_min"]
        )
        return oxygen_arrays(
            hemo.metrics["qp_l_min"] * 1000,
            hemo.metrics["qs_l_min"] * 1000,
            b,
            oxygen["spv_fraction"],
            m,
        )


def resistance_units(names: list[str]) -> dict[str, str]:
    result = {}
    for name in names:
        result[name] = (
            "mmHg min2/L2"
            if name.endswith("mmhg_min2_l2")
            else "mmHg min/L"
            if name.endswith("mmhg_min_l")
            else "mmHg"
            if name.endswith("mmhg")
            else "mL O2/dL"
            if name.endswith("ml_dl")
            else "mL O2/min"
            if name.endswith("ml_min")
            else "L blood/min × saturation fraction"
            if name.startswith(("normalized_", "delivery_index"))
            else "L blood/min"
            if name.endswith("l_min")
            else "fraction"
            if name.endswith("fraction")
            else "dimensionless"
        )
    return result


def coupled_metrics(
    hemo: HemodynamicArrays, oxygen: dict[str, Any], o2: OxygenArrays
) -> dict[str, Any]:
    raw: dict[str, Any] = dict(hemo.metrics)
    normalized = oxygen["mode"] == "normalized_source"
    b = o2.algebraic["capacity"]
    m = oxygen.get("vo2_ml_min")
    with np.errstate(all="ignore"):
        k = (
            np.broadcast_to(oxygen["normalized_consumption_l_min"], b.shape)
            if normalized
            else np.asarray(m, dtype=np.float64) / (10 * b)
        )
        raw.update(
            sa_fraction=o2.algebraic["sa"],
            sv_fraction=o2.algebraic["sv"],
            oer_fraction=o2.algebraic["oer"],
            omega=o2.algebraic["omega"],
            normalized_consumption_l_min=k,
        )
        for output, key in {
            "delivery_index_l_min": "do2",
            "normalized_systemic_out_l_min": "systemic_out",
            "normalized_pulmonary_in_l_min": "pulmonary_in",
            "normalized_pulmonary_out_l_min": "pulmonary_out",
            "normalized_pulmonary_net_l_min": "pulmonary_net_add",
            "normalized_systemic_net_l_min": "systemic_net_use",
            "normalized_zero_venous_limit_l_min": "zero_venous_vo2_limit",
        }.items():
            raw[output] = o2.algebraic[key] / (10 * b)
        for output, key in {
            "capacity_ml_dl": "capacity",
            "cpv_ml_dl": "cpv",
            "ca_ml_dl": "ca",
            "cv_ml_dl": "cv",
            "do2_ml_min": "do2",
            "systemic_out_ml_min": "systemic_out",
            "pulmonary_in_ml_min": "pulmonary_in",
            "pulmonary_out_ml_min": "pulmonary_out",
            "pulmonary_net_add_ml_min": "pulmonary_net_add",
            "systemic_net_use_ml_min": "systemic_net_use",
            "zero_venous_vo2_limit_ml_min": "zero_venous_vo2_limit",
        }.items():
            raw[output] = None if normalized else o2.algebraic[key]
        raw["vo2_ml_min"] = (
            None if normalized else np.broadcast_to(np.asarray(m, dtype=np.float64), b.shape)
        )
    return raw


def solve_resistance_state(
    request: dict[str, Any], criteria: dict[str, Any] | None = None
) -> dict[str, Any]:
    request = validated_resistance(request)
    ref = resolve_resistance_reference(request)
    p, response, oxygen = request["perturbation"], request["response"], request["oxygen"]
    hemo = hemodynamics_arrays(
        ref,
        p["rs_multiplier"],
        p["rp_multiplier"],
        p["rshunt_multiplier"],
        response["alpha"],
        response["nonlinear_fraction"],
        response["closure"],
        p["scope"],
    )
    hemo_status = str(hemo.status.item())
    o2 = oxygen_for_hemodynamics(hemo, oxygen)
    raw = coupled_metrics(hemo, oxygen, o2)
    oxygen_status = str(o2.status.item()) if hemo_status == "solved" else "not_evaluated"
    has_solution = hemo_status == "solved" and bool(o2.nonnegative.item())
    fields = {
        key: (
            None
            if (key not in hemo.metrics and not has_solution) or hemo_status != "solved"
            else value
        )
        for key, value in raw.items()
    }
    criterion = (
        assess_criteria(
            {
                "status": oxygen_status if hemo_status == "solved" else "numerical_failure",
                "metrics": {
                    "sa_fraction": float(o2.algebraic["sa"]),
                    "sv_fraction": float(o2.algebraic["sv"]),
                },
            },
            criteria,
        )
        if criteria
        else None
    )
    reasons = {key: "requires_declared_capacity" for key, value in raw.items() if value is None}
    if oxygen_status in ("admissible", "zero_venous_boundary", "degenerate_zero_oxygen"):
        if float(o2.algebraic["do2"]) == 0:
            reasons["oer_fraction"] = "undefined_zero_delivery"
        demand = oxygen.get("normalized_consumption_l_min", oxygen.get("vo2_ml_min"))
        if demand == 0:
            reasons["omega"] = "undefined_zero_consumption"
    result = dict(
        schema_version="resistance-state-result-v1",
        flow_model_version=FLOW_MODEL_VERSION,
        model_version=MODEL_VERSION,
        requested=request,
        reference=asdict(ref),
        reference_sha256=ref.sha256,
        closure=response["closure"],
        scope=p["scope"],
        oxygen_mode=oxygen["mode"],
        indexing_basis="absolute",
        metrics=fields,
        units=resistance_units(list(raw)),
        hemodynamic_status=hemo_status,
        oxygen_status=oxygen_status,
        status=oxygen_status if hemo_status == "solved" else hemo_status,
        has_nonnegative_content_solution=has_solution,
        criterion_result=criterion,
        residuals={
            **hemo.residuals,
            **{f"oxygen_{key}": value for key, value in o2.residuals.items()},
        },
        solver=dict(
            method="scaled_quadratic_and_bracketed_log_pressure",
            bisection_iterations=hemo.iterations,
        ),
        undefined_reasons=reasons,
        evidence_class="source_compatible_reconstruction"
        if response["closure"] == "nominal_parallel"
        else "derived_extension",
        audit=dict(
            algebraic_metrics=raw,
            description="Unmodified algebraic values; infeasible oxygen is not a prediction.",
        ),
    )
    return cast(dict[str, Any], finite_json(result))
