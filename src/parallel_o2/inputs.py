"""Strict, bounded requests; no physiology calculations or source-fidelity claims."""

import json
import math
import re
from typing import Any

MAX_IMPORT_BYTES = 1024 * 1024
MAX_SHARE_BYTES = 16 * 1024
MODEL_VERSION = "barnea-parallel-bound-o2-v1"


class InputError(ValueError):
    """A structural or input-domain validation failure."""


def _object(value: Any, required: str, optional: str = "") -> dict[str, Any]:
    expected = set(required.split())
    allowed = expected | set(optional.split())
    if not isinstance(value, dict) or not expected <= value.keys() or value.keys() - allowed:
        raise InputError(f"Expected fields {sorted(expected)}; optional {optional or 'none'}")
    return value


def _number(
    value: Any, low: float | None = None, high: float | None = None, *, positive: bool = False
) -> None:
    try:
        finite = type(value) in (int, float) and math.isfinite(value)
    except OverflowError:
        finite = False
    if not finite:
        raise InputError("Expected a finite JSON number, not a boolean")
    if (low is not None and value < low) or (positive and value <= 0):
        raise InputError("Number below permitted input domain")
    if high is not None and value > high:
        raise InputError("Number above permitted input domain")


def _choice(value: Any, choices: tuple[str, ...]) -> None:
    if not isinstance(value, str) or value not in choices:
        raise InputError(f"Expected one of {choices}")


def _scenario(value: Any, version: str) -> None:
    v2 = version == "scenario-v2"
    if not isinstance(value, dict):
        raise InputError("Scenario must be an object")
    basis = value.get("indexing_basis", "per_kg")
    _choice(basis, ("per_kg", "per_m2"))
    flow_unit = "ml_kg_min" if basis == "per_kg" else "l_min_m2"
    demand = "vo2_target_ml_kg_min" if basis == "per_kg" else "vo2_target_ml_min_m2"
    required = f"schema_version model_version flow capacity spv_fraction {demand}"
    obj = _object(
        value, required + (" indexing_basis" if v2 else ""), "source_context" if v2 else ""
    )
    _choice(obj["schema_version"], (version,))
    _choice(obj["model_version"], (MODEL_VERSION,))
    if "source_context" in obj:
        _choice(
            obj["source_context"],
            ("synthetic", "ahmed-inspired-abstract-supported", "verified-source-preset"),
        )
    flow = obj["flow"]
    if not isinstance(flow, dict):
        raise InputError("Flow must be an object")
    if flow.get("mode") == "total_ratio":
        _object(flow, f"mode qt_{flow_unit} r")
        _number(flow[f"qt_{flow_unit}"], positive=True)
        _number(flow["r"], positive=True)
    else:
        _object(flow, f"mode qp_{flow_unit} qs_{flow_unit}")
        _choice(flow["mode"], ("independent_flows",))
        for key in (f"qp_{flow_unit}", f"qs_{flow_unit}"):
            _number(flow[key], positive=True)
    cap = obj["capacity"]
    if not isinstance(cap, dict):
        raise InputError("Capacity must be an object")
    if cap.get("mode") == "hb_linear":
        _object(cap, "mode hb_g_dl kappa_ml_o2_g_hb")
        _number(cap["hb_g_dl"], positive=True)
        _number(cap["kappa_ml_o2_g_hb"], positive=True)
    else:
        _object(cap, "mode capacity_ml_dl")
        _choice(cap["mode"], ("direct_capacity",))
        _number(cap["capacity_ml_dl"], positive=True)
    _number(obj["spv_fraction"], 0, 1)
    _number(obj[demand], 0)


def _criteria(value: Any) -> None:
    obj = _object(
        value,
        "schema_version id sa_lower_fraction sv_lower_fraction comparison origin",
        "source_id",
    )
    _choice(obj["schema_version"], ("criteria-v1",))
    _choice(obj["comparison"], ("strict_greater_than",))
    _choice(obj["origin"], ("source_reported_abstract", "user_selected"))
    if not isinstance(obj["id"], str) or not re.fullmatch(r"[a-z0-9-]{1,100}", obj["id"]):
        raise InputError("Invalid criterion identifier")
    for key in ("sa_lower_fraction", "sv_lower_fraction"):
        _number(obj[key], 0, 1)
    if obj["sv_lower_fraction"] >= obj["sa_lower_fraction"]:
        raise InputError("Venous criterion must be less than arterial criterion")
    if obj["origin"] == "source_reported_abstract":
        if (
            obj.get("source_id"),
            obj["id"],
            obj["sa_lower_fraction"],
            obj["sv_lower_fraction"],
        ) != ("P2", "ahmed-abstract-70-40", 0.7, 0.4):
            raise InputError("Source-associated criteria must preserve recorded values")
    elif "source_id" in obj:
        raise InputError("User-selected criteria cannot claim source association")


def _resistance(value: Any) -> None:
    obj = _object(value, "schema_version flow_model_version reference response perturbation oxygen")
    _choice(obj["schema_version"], ("resistance-experiment-v1",))
    _choice(obj["flow_model_version"], ("resistance-parallel-steady-v1",))
    ref = _object(
        obj["reference"],
        "rs_mmhg_min_l rp_mmhg_min_l rshunt_nominal_mmhg_min_l "
        "qt_l_min common_downstream_pressure_mmhg",
    )
    for key in ("rs_mmhg_min_l", "qt_l_min"):
        _number(ref[key], positive=True)
    for key in ("rp_mmhg_min_l", "rshunt_nominal_mmhg_min_l"):
        _number(ref[key], 0)
    _number(ref["common_downstream_pressure_mmhg"])
    if ref["rp_mmhg_min_l"] == ref["rshunt_nominal_mmhg_min_l"] == 0:
        raise InputError("Reference pulmonary pathway requires positive resistance")
    response = _object(obj["response"], "closure alpha nonlinear_fraction")
    _choice(response["closure"], ("nominal_parallel", "circuit_secant"))
    for key in ("alpha", "nonlinear_fraction"):
        _number(response[key], 0, 1)
    perturb = _object(obj["perturbation"], "scope rs_multiplier rp_multiplier rshunt_multiplier")
    _choice(perturb["scope"], ("native_rp", "whole_pathway_audit"))
    _number(perturb["rs_multiplier"], positive=True)
    _number(perturb["rp_multiplier"], 0)
    _number(perturb["rshunt_multiplier"], 0)
    if perturb["scope"] == "whole_pathway_audit" and (
        response["alpha"] != 0
        or response["nonlinear_fraction"] != 0
        or perturb["rshunt_multiplier"] != 1
    ):
        raise InputError("Whole-pathway audit requires fixed output and a linear unchanged shunt")
    oxygen = obj["oxygen"]
    if not isinstance(oxygen, dict):
        raise InputError("Oxygen request must be an object")
    if oxygen.get("mode") == "normalized_source":
        _object(oxygen, "mode spv_fraction normalized_consumption_l_min")
        _number(oxygen["normalized_consumption_l_min"], 0)
    else:
        _object(oxygen, "mode spv_fraction hb_g_dl kappa_ml_o2_g_hb vo2_ml_min")
        _choice(oxygen["mode"], ("physical",))
        _number(oxygen["hb_g_dl"], positive=True)
        _number(oxygen["kappa_ml_o2_g_hb"], positive=True)
        _number(oxygen["vo2_ml_min"], 0)
    _number(oxygen["spv_fraction"], 0, 1)


def metric_ids(basis: str) -> set[str]:
    """The named fixed-flow metrics from the V1/V2 contracts."""
    flow = "ml_kg_min" if basis == "per_kg" else "l_min_m2"
    flux = "ml_kg_min" if basis == "per_kg" else "ml_min_m2"
    ids = {f"{q}_{flow}" for q in ("qp", "qs", "qt")}
    ids.update(
        f"{q}_{flux}"
        for q in (
            "do2",
            "systemic_in",
            "systemic_out",
            "systemic_net_use",
            "pulmonary_in",
            "pulmonary_out",
            "pulmonary_net_add",
            "zero_venous_vo2_limit",
        )
    )
    ids.update(
        "r capacity_ml_dl cpv_ml_dl ca_ml_dl cv_ml_dl sa_fraction sv_fraction "
        "oer_fraction omega av_saturation_gap_fraction "
        "pv_a_saturation_gap_fraction r_fick".split()
    )
    return ids


def validate_axis(base: dict[str, Any], axis: Any) -> None:
    """Validate one active independent axis before allocating grid or slice arrays."""
    allowed = {f"flow.{k}" for k in base["flow"] if k != "mode"}
    allowed.update(f"capacity.{k}" for k in base["capacity"] if k != "mode")
    allowed.update(k for k in base if k.startswith("vo2_target_") or k == "spv_fraction")
    axis = _object(axis, "parameter min max n scale")
    _choice(axis["parameter"], tuple(sorted(allowed)))
    _choice(axis["scale"], ("linear", "log"))
    _number(axis["min"])
    _number(axis["max"])
    if axis["min"] >= axis["max"] or (axis["scale"] == "log" and axis["min"] <= 0):
        raise InputError("Axis bounds must increase; log bounds must be positive")
    if type(axis["n"]) is not int or not 3 <= axis["n"] <= 401:
        raise InputError("Axis n must be an integer between 3 and 401")
    for endpoint in (axis["min"], axis["max"]):
        trial = json.loads(json.dumps(base))
        path = axis["parameter"].split(".")
        if len(path) == 2:
            trial[path[0]][path[1]] = endpoint
        else:
            trial[path[0]] = endpoint
        _scenario(trial, base["schema_version"])


def _grid(value: Any, version: str) -> None:
    v2 = version == "grid-request-v2"
    obj = _object(value, "schema_version base x y metrics", "criteria" if v2 else "")
    _scenario(obj["base"], "scenario-v2" if v2 else "scenario-v1")
    if "criteria" in obj:
        _criteria(obj["criteria"])
    base = obj["base"]
    for dim in ("x", "y"):
        validate_axis(base, obj[dim])
    if obj["x"]["parameter"] == obj["y"]["parameter"]:
        raise InputError("Grid axes must be distinct independent inputs")
    if obj["x"]["n"] * obj["y"]["n"] > 160801:
        raise InputError("Grid exceeds 160801 cells")
    metrics = obj["metrics"]
    allowed_metrics = metric_ids(base.get("indexing_basis", "per_kg"))
    if (
        not isinstance(metrics, list)
        or not metrics
        or any(not isinstance(m, str) or m not in allowed_metrics for m in metrics)
        or len(set(metrics)) != len(metrics)
    ):
        raise InputError("Metrics must be distinct known IDs in the active indexing basis")


def _pairs(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise InputError(f"Duplicate JSON field: {key}")
        result[key] = value
    return result


def _reject_constant(value: str) -> None:
    raise InputError(f"Nonfinite JSON constant: {value}")


def parse_request(text: str, *, shared: bool = False) -> dict[str, Any]:
    """Validate bounded JSON, preserving its version and exact requested values."""
    limit = MAX_SHARE_BYTES if shared else MAX_IMPORT_BYTES
    try:
        if len(text.encode("utf-8")) > limit:
            raise InputError(f"Request exceeds {limit} bytes")
        obj = json.loads(text, object_pairs_hook=_pairs, parse_constant=_reject_constant)
        if not isinstance(obj, dict):
            raise InputError("Request must be an object")
        version = obj.get("schema_version")
        if version in ("scenario-v1", "scenario-v2"):
            _scenario(obj, version)
        elif version == "resistance-experiment-v1":
            _resistance(obj)
        elif version == "criteria-v1":
            _criteria(obj)
        elif version in ("grid-request-v1", "grid-request-v2"):
            _grid(obj, version)
        else:
            raise InputError("Unknown schema version")
    except (json.JSONDecodeError, RecursionError, OverflowError, UnicodeError) as exc:
        raise InputError("Malformed or excessively nested JSON") from exc
    return obj
