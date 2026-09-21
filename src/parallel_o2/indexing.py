"""Explicit indexing/flow-mode conversions; no inferred body-size defaults."""

from copy import deepcopy
from typing import Any

from .inputs import _number
from .model import resolve_inputs, validated_scenario


def migrate_scenario(scenario: dict[str, Any]) -> dict[str, Any]:
    result = validated_scenario(scenario)
    if result["schema_version"] == "scenario-v1":
        result["schema_version"] = "scenario-v2"
        result["indexing_basis"] = "per_kg"
    return result


def convert_indexing(scenario: dict[str, Any], mass_kg: float, bsa_m2: float) -> dict[str, Any]:
    _number(mass_kg, positive=True)
    _number(bsa_m2, positive=True)
    out = migrate_scenario(scenario)
    from_kg = out["indexing_basis"] == "per_kg"
    factor = mass_kg / bsa_m2 if from_kg else bsa_m2 / mass_kg
    old = "ml_kg_min" if from_kg else "l_min_m2"
    new = "l_min_m2" if from_kg else "ml_kg_min"
    flow_factor = factor / 1000 if from_kg else factor * 1000
    out["flow"] = {
        key.replace(old, new): value * flow_factor if key.endswith(old) else value
        for key, value in out["flow"].items()
    }
    old_demand = "vo2_target_ml_kg_min" if from_kg else "vo2_target_ml_min_m2"
    new_demand = "vo2_target_ml_min_m2" if from_kg else "vo2_target_ml_kg_min"
    out[new_demand] = out.pop(old_demand) * factor
    out["indexing_basis"] = "per_m2" if from_kg else "per_kg"
    return validated_scenario(out)


def flow_mode(scenario: dict[str, Any], mode: str) -> dict[str, Any]:
    from .inputs import _choice

    _choice(mode, ("total_ratio", "independent_flows"))
    resolved = resolve_inputs(scenario)
    result = deepcopy(scenario)
    suffix = "ml_kg_min" if resolved.reference_unit == "per_kg" else "l_min_m2"
    scale = 1 if resolved.reference_unit == "per_kg" else 1000
    p, s = resolved.qp_ml_min_per_unit / scale, resolved.qs_ml_min_per_unit / scale
    result["flow"] = (
        {"mode": mode, f"qt_{suffix}": p + s, "r": p / s}
        if mode == "total_ratio"
        else {"mode": mode, f"qp_{suffix}": p, f"qs_{suffix}": s}
    )
    return validated_scenario(result)
