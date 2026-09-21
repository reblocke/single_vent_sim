"""Fixed-flow Hb derivatives and finite changes; no treatment-response model."""

from copy import deepcopy
from typing import Any, cast

import numpy as np

from .criteria import ANALYSIS_VERSION
from .inputs import InputError, _number
from .model import resolve_inputs, solve_state, validated_scenario
from .serialization import finite_json


def hb_gain_arrays(
    h: Any, delta: Any, k: Any, m: Any, p: Any, s: Any, spv: Any, delivery_key: str
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Shared scalar/vectorized derivative kernel; flows are mL blood/min per unit."""
    with np.errstate(all="ignore"):
        ka, kv = 100 * (m / p) / k, 100 * (m / p + m / s) / k
        slope = (s / 100) * k * spv
        derivatives = {
            "dsa_dhb": (ka / h) / h,
            "dsv_dhb": (kv / h) / h,
            "d2sa_dhb2": -2 * ((ka / h) / h) / h,
            "d2sv_dhb2": -2 * ((kv / h) / h) / h,
            "dca_dhb": k * spv,
            "ddo2_dhb": slope,
        }
        increments = {
            "sa_fraction": (ka / h) * (delta / (h + delta)),
            "sv_fraction": (kv / h) * (delta / (h + delta)),
            "ca_ml_dl": k * spv * delta,
            delivery_key: slope * delta,
        }
    return derivatives, increments


def hb_sensitivity(scenario: dict[str, Any], delta_hb_g_dl: float) -> dict[str, Any]:
    _number(delta_hb_g_dl, positive=True)
    scenario = validated_scenario(scenario)
    if scenario["capacity"]["mode"] != "hb_linear":
        raise InputError("Hb sensitivity requires Hb-linear capacity")
    x = resolve_inputs(scenario)
    h = np.float64(scenario["capacity"]["hb_g_dl"])
    delta = np.float64(delta_hb_g_dl)
    endpoint = deepcopy(scenario)
    endpoint["capacity"]["hb_g_dl"] = float(h + delta)
    _number(endpoint["capacity"]["hb_g_dl"], positive=True)
    first, second = solve_state(scenario), solve_state(endpoint)
    k = np.float64(scenario["capacity"]["kappa_ml_o2_g_hb"])
    m, p, s = map(np.float64, (x.vo2_ml_min_per_unit, x.qp_ml_min_per_unit, x.qs_ml_min_per_unit))
    derivatives, increments = hb_gain_arrays(
        h,
        delta,
        k,
        m,
        p,
        s,
        x.spv_fraction,
        "do2_ml_kg_min" if x.reference_unit == "per_kg" else "do2_ml_min_m2",
    )
    finite = all(np.isfinite(v) for v in [*derivatives.values(), *increments.values()])
    allowed = (
        finite
        and first["has_nonnegative_content_solution"]
        and second["has_nonnegative_content_solution"]
    )
    fixed = deepcopy(scenario)
    fixed["capacity"].pop("hb_g_dl")
    return cast(
        dict[str, Any],
        finite_json(
            {
                "schema_version": "hb-sensitivity-v1",
                "analysis_version": ANALYSIS_VERSION,
                "source_class": "derived_from_barnea_core",
                "indexing_basis": x.reference_unit,
                "status": "finite"
                if allowed
                else "masked_endpoint"
                if finite
                else "numerical_failure",
                "endpoints": [first, second],
                "delta_hb_g_dl": float(delta),
                "fixed_inputs": fixed,
                "fixed_variable_contract": (
                    "Qp, Qs, M, Spv and kappa remain fixed; Hb is the only change."
                ),
                "derivatives": derivatives if allowed else {k: None for k in derivatives},
                "increments": increments if allowed else {k: None for k in increments},
                "units": {
                    **first["units"],
                    "hb": "g/dL",
                    "first_derivative_denominator": "g/dL",
                    "second_derivative_denominator": "(g/dL)^2",
                },
                "audit": {"algebraic_derivatives": derivatives, "algebraic_increments": increments},
            }
        ),
    )
