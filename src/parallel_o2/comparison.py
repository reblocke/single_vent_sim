"""Explicit A/B changes, masked deltas and exact multiplicative decomposition."""

import math
from typing import Any

from .inputs import InputError
from .model import solve_state


def _flatten(value: dict[str, Any], prefix: str = "") -> dict[str, Any]:
    result = {}
    for key, item in value.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(item, dict):
            result.update(_flatten(item, path))
        else:
            result[path] = item
    return result


def compare_states(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    first, second = solve_state(a), solve_state(b)
    if first["indexing_basis"] != second["indexing_basis"]:
        raise InputError("Cross-basis comparison requires explicit body-size conversion first")
    allowed = (
        first["has_nonnegative_content_solution"] and second["has_nonnegative_content_solution"]
    )
    changes, same = {}, {}
    af, bf = _flatten(first["requested"]), _flatten(second["requested"])
    for key in sorted(af.keys() | bf.keys()):
        if af.get(key) == bf.get(key):
            same[key] = af.get(key)
        else:
            changes[key] = {"a": af.get(key), "b": bf.get(key)}
    deltas = {}
    for key, value in first["metrics"].items():
        other = second["metrics"][key]
        defined = allowed and value is not None and other is not None
        difference = other - value if defined else None
        saturation = key in (
            "sa_fraction",
            "sv_fraction",
            "av_saturation_gap_fraction",
            "pv_a_saturation_gap_fraction",
        )
        deltas[key] = {
            "absolute": difference,
            "relative": difference / value if defined and value != 0 else None,
            "percentage_points": 100 * difference
            if difference is not None and saturation
            else None,
            "unit": first["units"][key],
        }
    decomposition = None
    flow_key = "qs_ml_kg_min" if first["indexing_basis"] == "per_kg" else "qs_l_min_m2"
    flux_key = "do2_ml_kg_min" if first["indexing_basis"] == "per_kg" else "do2_ml_min_m2"
    keys = {
        "systemic_flow": flow_key,
        "capacity": "capacity_ml_dl",
        "arterial_saturation": "sa_fraction",
    }
    if allowed and all(first["metrics"][k] > 0 and second["metrics"][k] > 0 for k in keys.values()):
        factors = {
            name: second["metrics"][key] / first["metrics"][key] for name, key in keys.items()
        }
        if a["capacity"]["mode"] == b["capacity"]["mode"] == "hb_linear":
            factors.pop("capacity")
            factors["hb"] = b["capacity"]["hb_g_dl"] / a["capacity"]["hb_g_dl"]
            factors["kappa"] = b["capacity"]["kappa_ml_o2_g_hb"] / a["capacity"]["kappa_ml_o2_g_hb"]
        logs = {key: math.log(value) for key, value in factors.items()}
        total = math.log(second["metrics"][flux_key] / first["metrics"][flux_key])
        decomposition = {
            "multiplicative_factors": factors,
            "log_contributions": logs,
            "log_delivery_ratio": total,
            "log_residual": sum(logs.values()) - total,
        }
    return {
        "schema_version": "comparison-v1",
        "a": first,
        "b": second,
        "indexing_basis": first["indexing_basis"],
        "changed_inputs": changes,
        "unchanged_inputs": same,
        "deltas": deltas,
        "decomposition": decomposition,
        "status": "finite" if allowed else "masked_endpoint",
    }
