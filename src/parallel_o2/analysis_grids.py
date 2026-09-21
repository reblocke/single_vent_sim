"""Named derived H3/H4 grids using the scalar analytical kernels and oxygen engine."""

from copy import deepcopy
from typing import Any, cast

import numpy as np

from .criteria import ANALYSIS_VERSION, SATURATION_TOLERANCE, hb_boundary_component
from .experiments import axis_coordinates
from .indexing import flow_mode
from .inputs import MODEL_VERSION, InputError, _choice, _criteria, _number, _object, validate_axis
from .model import oxygen_arrays, resolve_inputs, validated_scenario
from .sensitivity import hb_gain_arrays
from .serialization import finite_json


def evaluate_analysis_grid(
    kind: str, base: dict[str, Any], x: dict[str, Any], y: dict[str, Any], criteria: dict[str, Any]
) -> dict[str, Any]:
    _choice(kind, ("hb_boundary", "hb_gain"))
    base = validated_scenario(base)
    _criteria(criteria)
    if base["capacity"]["mode"] != "hb_linear":
        raise InputError("Hb analysis requires Hb-linear capacity")
    if kind == "hb_boundary":
        base = flow_mode(base, "total_ratio")
        flow_key = (
            "flow.qt_ml_kg_min"
            if base.get("indexing_basis", "per_kg") == "per_kg"
            else "flow.qt_l_min_m2"
        )
        if x.get("parameter") != "flow.r" or y.get("parameter") != flow_key:
            raise InputError("Hb boundary axes must be ratio and total flow")
        validate_axis(base, x)
        validate_axis(base, y)
    else:
        if x.get("parameter") != "capacity.hb_g_dl" or y.get("parameter") != "delta_hb_g_dl":
            raise InputError("Hb gain axes must be baseline Hb and delta Hb")
        validate_axis(base, x)
        _object(y, "parameter min max n scale")
        _number(y["min"], positive=True)
        _number(y["max"], positive=True)
        _choice(y["scale"], ("linear", "log"))
        if y["max"] <= y["min"] or type(y["n"]) is not int or not 3 <= y["n"] <= 401:
            raise InputError("Invalid delta-Hb grid range/resolution")
    xs, ys = axis_coordinates(x), axis_coordinates(y)
    xx, yy = np.meshgrid(xs, ys, indexing="xy")
    resolved = resolve_inputs(base)
    kg = resolved.reference_unit == "per_kg"
    k, spv = base["capacity"]["kappa_ml_o2_g_hb"], resolved.spv_fraction
    m = np.float64(resolved.vo2_ml_min_per_unit)
    fixed = deepcopy(base)
    fixed["capacity"].pop("hb_g_dl")
    units: dict[str, str] = {}
    extra: dict[str, Any] = {}
    p: Any
    s: Any
    with np.errstate(all="ignore"):
        if kind == "hb_boundary":
            p = (yy / (1 + 1 / xx)) * (1 if kg else 1000)
            s = (yy / (1 + xx)) * (1 if kg else 1000)
            ga, gv = spv - criteria["sa_lower_fraction"], spv - criteria["sv_lower_fraction"]
            a = hb_boundary_component(p, s, m, k, ga, False)
            v = hb_boundary_component(p, s, m, k, gv, True)
            joint = np.maximum(a, v)
            valid = (ga > 0) & (gv > 0) & np.isfinite(joint) & (joint > 0)
            status = np.where(
                valid,
                np.where(joint > 25, "outside_display_range", "finite"),
                "no_finite_solution" if ga <= 0 or gv <= 0 else "numerical_failure",
            )
            binding = np.where(
                np.isclose(a, v, rtol=1e-12, atol=0), "both", np.where(a > v, "arterial", "venous")
            )
            if m == 0:
                no_bound = ga > SATURATION_TOLERANCE and gv > SATURATION_TOLERANCE
                status = np.full(
                    xx.shape, "no_positive_lower_bound" if no_bound else "no_solution_at_endpoint"
                )
                joint = np.zeros_like(xx) if no_bound else np.full_like(xx, np.nan)
                valid = np.zeros_like(xx, dtype=bool)
            equality = oxygen_arrays(p, s, k * np.where(valid, joint, np.nan), spv, m)
            metrics = {
                "joint_hb_g_dl": np.where(
                    valid | (status == "no_positive_lower_bound"), joint, np.nan
                ),
                "arterial_hb_g_dl": np.where(ga > 0, a, np.nan),
                "venous_hb_g_dl": np.where(gv > 0, v, np.nan),
                "binding_code": np.where(
                    valid,
                    np.where(binding == "arterial", 0, np.where(binding == "venous", 1, 2)),
                    np.nan,
                ),
            }
            units = {
                "joint_hb_g_dl": "g/dL",
                "arterial_hb_g_dl": "g/dL",
                "venous_hb_g_dl": "g/dL",
                "binding_code": "category: 0 arterial, 1 venous, 2 both",
            }
            extra = {
                "binding_criterion": np.where(valid, binding, np.asarray(None, dtype=object)),
                "equality_sa_fraction": np.where(valid, equality.algebraic["sa"], np.nan),
                "equality_sv_fraction": np.where(valid, equality.algebraic["sv"], np.nan),
                "display_range_g_dl": [0, 25],
                "baseline_hb_constraint": None,
            }
            fixed["flow"].pop("r")
            fixed["flow"].pop(flow_key.split(".")[1])
        else:
            p, s = np.float64(resolved.qp_ml_min_per_unit), np.float64(resolved.qs_ml_min_per_unit)
            first, second = (
                oxygen_arrays(p, s, xx * k, spv, m),
                oxygen_arrays(p, s, (xx + yy) * k, spv, m),
            )
            delivery = "do2_ml_kg_min" if kg else "do2_ml_min_m2"
            _, increments = hb_gain_arrays(xx, yy, k, m, p, s, spv, delivery)
            valid = first.nonnegative & second.nonnegative
            for values in increments.values():
                valid &= np.isfinite(values)
            status = np.where(valid, "finite", "masked_endpoint")
            metrics = {
                "delta_" + name: np.where(valid, values, np.nan)
                for name, values in increments.items()
            }
            units = {
                "delta_sa_fraction": "fraction",
                "delta_sv_fraction": "fraction",
                "delta_ca_ml_dl": "mL O2/dL",
                "delta_" + delivery: "mL O2/kg/min" if kg else "mL O2/min/m2",
            }
            extra = {
                "endpoint_status": [first.status, second.status],
                "endpoint_hb_g_dl": [xx, xx + yy],
            }
    return cast(
        dict[str, Any],
        finite_json(
            {
                "schema_version": "analysis-grid-v1",
                "kind": kind,
                "model_version": MODEL_VERSION,
                "analysis_version": ANALYSIS_VERSION,
                "indexing_basis": resolved.reference_unit,
                "requested": {"kind": kind, "base": base, "x": x, "y": y, "criteria": criteria},
                "fixed_inputs": fixed,
                "orientation": "y,x",
                "shape": list(xx.shape),
                "requested_resolution": [y["n"], x["n"]],
                "actual_resolution": list(xx.shape),
                "x": {
                    **x,
                    "coordinates": xs,
                    "plot_coordinates": np.log10(xs) if x["scale"] == "log" else xs,
                },
                "y": {
                    **y,
                    "coordinates": ys,
                    "plot_coordinates": np.log10(ys) if y["scale"] == "log" else ys,
                },
                "metrics": metrics,
                "units": units,
                "status": status,
                "masked_count": int(np.count_nonzero(~valid)),
                "criteria": criteria,
                **extra,
            }
        ),
    )
