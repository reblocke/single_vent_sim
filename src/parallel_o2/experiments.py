"""Vectorized parameter grids and slices through the same scalar oxygen kernel."""

import json
from typing import Any, cast

import numpy as np
from numpy.typing import NDArray

from .criteria import ANALYSIS_VERSION, SATURATION_TOLERANCE
from .derived import stationary_ratio
from .inputs import MODEL_VERSION, InputError, _criteria, metric_ids, parse_request, validate_axis
from .model import Basis, metric_names, oxygen_arrays, unit_registry, validated_scenario
from .serialization import csv_rows, finite_json


def axis_coordinates(axis: dict[str, Any]) -> NDArray[np.float64]:
    if axis["scale"] == "log":
        return np.geomspace(axis["min"], axis["max"], axis["n"], dtype=np.float64)
    # Weighted interpolation avoids overflow in max-min for opposite extreme bounds.
    t = np.linspace(0, 1, axis["n"], dtype=np.float64)
    return np.asarray((1 - t) * axis["min"] + t * axis["max"], dtype=np.float64)


def _evaluate(
    base: dict[str, Any],
    overrides: dict[str, NDArray[np.float64]],
    metrics: list[str],
    criteria: dict[str, Any] | None,
) -> dict[str, Any]:
    basis: Basis = base.get("indexing_basis", "per_kg")
    suffix = "ml_kg_min" if basis == "per_kg" else "l_min_m2"

    def value(key: str) -> NDArray[np.float64]:
        if key in overrides:
            return overrides[key]
        path = key.split(".")
        v = base[path[0]][path[1]] if len(path) == 2 else base[key]
        return np.asarray(v, dtype=np.float64)

    with np.errstate(all="ignore"):
        if base["flow"]["mode"] == "total_ratio":
            qt, r = value(f"flow.qt_{suffix}"), value("flow.r")
            p = np.where(r >= 1, qt / (1 + 1 / r), qt * (r / (1 + r)))
            s = qt / (1 + r)
        else:
            p, s = value(f"flow.qp_{suffix}"), value(f"flow.qs_{suffix}")
        capacity = (
            value("capacity.hb_g_dl") * value("capacity.kappa_ml_o2_g_hb")
            if base["capacity"]["mode"] == "hb_linear"
            else value("capacity.capacity_ml_dl")
        )
        m = value("vo2_target_ml_kg_min" if basis == "per_kg" else "vo2_target_ml_min_m2")
        scale = 1 if basis == "per_kg" else 1000
        o = oxygen_arrays(p * scale, s * scale, capacity, value("spv_fraction"), m)
    names = metric_names(basis)
    data = {}
    for key, name in names.items():
        if name in metrics:
            values = o.algebraic[key] / (scale if key in ("qp", "qs", "qt") else 1)
            # Every metric requested in a main plot is masked at invalid cells.
            data[name] = np.where(o.nonnegative, values, np.nan)
    criterion_result = None
    if criteria is not None:
        da = o.algebraic["sa"] - criteria["sa_lower_fraction"]
        dv = o.algebraic["sv"] - criteria["sv_lower_fraction"]
        arterial = np.where(
            abs(da) <= SATURATION_TOLERANCE, "on", np.where(da > 0, "above", "below")
        )
        venous = np.where(abs(dv) <= SATURATION_TOLERANCE, "on", np.where(dv > 0, "above", "below"))
        combined = np.where(
            (arterial == "above") & (venous == "above"),
            "both_above",
            np.where(
                arterial == "above",
                "arterial_only_above",
                np.where(venous == "above", "venous_only_above", "neither_above"),
            ),
        )
        combined = np.where((arterial == "on") | (venous == "on"), "on_selected_boundary", combined)
        criterion_result = {
            "status": np.where(o.nonnegative, combined, "not_evaluable"),
            "arterial": np.where(o.nonnegative, arterial, "not_evaluable"),
            "venous": np.where(o.nonnegative, venous, "not_evaluable"),
            "arterial_margin_percentage_points": np.where(o.nonnegative, 100 * da, np.nan),
            "venous_margin_percentage_points": np.where(o.nonnegative, 100 * dv, np.nan),
            "saturation_tolerance": SATURATION_TOLERANCE,
        }
    return dict(
        metrics=data,
        status=o.status,
        criteria_result=criterion_result,
        units={k: v for k, v in unit_registry(basis).items() if k in metrics},
        indexing_basis=basis,
        dtype="float64",
        model_version=MODEL_VERSION,
        analysis_version=ANALYSIS_VERSION,
        masked_count=int(np.count_nonzero(~o.nonnegative)),
        admissibility_margin_ml_dl=o.algebraic["cv"],
    )


def evaluate_grid(
    base: dict[str, Any],
    x: dict[str, Any],
    y: dict[str, Any],
    metrics: list[str],
    criteria: dict[str, Any] | None = None,
) -> dict[str, Any]:
    request = dict(
        schema_version="grid-request-v2"
        if base.get("schema_version") == "scenario-v2"
        else "grid-request-v1",
        base=base,
        x=x,
        y=y,
        metrics=metrics,
    )
    if criteria is not None:
        request["criteria"] = criteria
    try:
        request = parse_request(json.dumps(request, allow_nan=False))
    except (TypeError, ValueError, RecursionError) as exc:
        raise InputError("Invalid grid request") from exc
    xs, ys = axis_coordinates(x), axis_coordinates(y)
    xx, yy = np.meshgrid(xs, ys, indexing="xy")
    data = _evaluate(base, {x["parameter"]: xx, y["parameter"]: yy}, metrics, criteria)
    return cast(
        dict[str, Any],
        finite_json(
            {
                **data,
                "schema_version": "grid-v2"
                if base["schema_version"] == "scenario-v2"
                else "grid-v1",
                "requested": request,
                "constraint_overlays": _constraint_overlays(base, x, y, xs, ys),
                "orientation": "y,x",
                "shape": [len(ys), len(xs)],
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
                "requested_resolution": [y["n"], x["n"]],
                "actual_resolution": [len(ys), len(xs)],
            }
        ),
    )


def evaluate_slice(
    base: dict[str, Any],
    axis: dict[str, Any],
    metrics: list[str] | None = None,
    criteria: dict[str, Any] | None = None,
) -> dict[str, Any]:
    base = validated_scenario(base)
    validate_axis(base, axis)
    allowed = metric_ids(base.get("indexing_basis", "per_kg"))
    metrics = sorted(allowed) if metrics is None else metrics
    if (
        not isinstance(metrics, list)
        or not metrics
        or any(not isinstance(m, str) or m not in allowed for m in metrics)
        or len(set(metrics)) != len(metrics)
    ):
        raise InputError("Slice metrics must be distinct active-basis metric IDs")
    if criteria is not None:
        _criteria(criteria)
    coords = axis_coordinates(axis)
    data = _evaluate(base, {axis["parameter"]: coords}, metrics, criteria)
    return cast(
        dict[str, Any],
        finite_json(
            {
                **data,
                "schema_version": "slice-result-v1",
                "requested": {"base": base, "axis": axis, "metrics": metrics, "criteria": criteria},
                "axis": {**axis, "coordinates": coords},
                "orientation": "parameter_order",
                "requested_resolution": axis["n"],
                "actual_resolution": len(coords),
            }
        ),
    )


def _constraint_overlays(
    base: dict[str, Any],
    x: dict[str, Any],
    y: dict[str, Any],
    xs: NDArray[np.float64],
    ys: NDArray[np.float64],
) -> list[dict[str, Any]]:
    """Exact fixed-flow constraints/objectives, not treatment trajectories."""
    lines: list[dict[str, Any]] = []
    kg = base.get("indexing_basis", "per_kg") == "per_kg"
    suffix = "ml_kg_min" if kg else "l_min_m2"

    def line(kind: str, label: str, xp: Any, yp: Any) -> None:
        xp, yp = np.broadcast_arrays(
            np.asarray(xp, dtype=np.float64), np.asarray(yp, dtype=np.float64)
        )
        inside = (xp >= x["min"]) & (xp <= x["max"]) & (yp >= y["min"]) & (yp <= y["max"])
        xp, yp = np.where(inside, xp, np.nan), np.where(inside, yp, np.nan)
        with np.errstate(all="ignore"):
            lines.append(
                {
                    "kind": kind,
                    "label": label,
                    "x": xp,
                    "y": yp,
                    "plot_x": np.log10(xp) if x["scale"] == "log" else xp,
                    "plot_y": np.log10(yp) if y["scale"] == "log" else yp,
                }
            )

    if base["flow"]["mode"] == "total_ratio" and "flow.r" in (x["parameter"], y["parameter"]):
        ratio_x = x["parameter"] == "flow.r"
        other, coordinates = (y, ys) if ratio_x else (x, xs)

        def value(path: str) -> Any:
            if other["parameter"] == path:
                return coordinates
            parts = path.split(".")
            return np.float64(base[parts[0]][parts[1]] if len(parts) == 2 else base[path])

        with np.errstate(all="ignore"):
            qt = value("flow.qt_" + suffix)
            capacity = (
                value("capacity.hb_g_dl") * value("capacity.kappa_ml_o2_g_hb")
                if base["capacity"]["mode"] == "hb_linear"
                else value("capacity.capacity_ml_dl")
            )
            a = (qt * (1 if kg else 1000) / 100) * capacity * value("spv_fraction")
            m = value("vo2_target_ml_kg_min" if kg else "vo2_target_ml_min_m2")
            u = m / a
            allowed = np.isfinite(a) & np.isfinite(u) & (u > 0) & (u <= 0.25)
            peak = np.where(allowed, stationary_ratio(u), np.nan)
            sv = np.where(allowed, 1.0, np.nan)
            balanced = np.where(np.isfinite(a) & (m <= a / 4), 1.0, np.nan)
        for kind, label, ratio in [
            ("ratio_1", "Qp/Qs = 1 (equal prescribed branch flows)", balanced),
            (
                "do2_peak",
                "Mathematical DO2 peak for fixed total output, capacity, Spv and consumption",
                peak,
            ),
            ("sv_peak", "Sv maximum at fixed total output, capacity, Spv and consumption", sv),
        ]:
            line(kind, label, ratio if ratio_x else coordinates, coordinates if ratio_x else ratio)
    if {x["parameter"], y["parameter"]} == {"flow.qp_" + suffix, "flow.qs_" + suffix}:
        cap = base["capacity"]
        capacity = (
            cap["hb_g_dl"] * cap["kappa_ml_o2_g_hb"]
            if cap["mode"] == "hb_linear"
            else cap["capacity_ml_dl"]
        )
        demand = base["vo2_target_ml_kg_min" if kg else "vo2_target_ml_min_m2"]
        scale = 1 if kg else 1000

        def flow_line(kind: str, label: str, yp: Any) -> None:
            p, s = (xs, yp) if x["parameter"].startswith("flow.qp_") else (yp, xs)
            valid = oxygen_arrays(
                p * scale, s * scale, capacity, base["spv_fraction"], demand
            ).nonnegative
            line(kind, label, xs, np.where(valid, yp, np.nan))

        for r in (0.5, 1.0, 2.0):
            flow_line(
                "iso_ratio",
                f"Qp/Qs = {r:g}; mathematical constraint",
                xs / r if x["parameter"].startswith("flow.qp_") else xs * r,
            )
        unit = "mL blood/kg/min" if kg else "L blood/min/m2"
        for qt in (200.0, 400.0, 600.0) if kg else (4.0, 6.0, 9.0):
            flow_line(
                "iso_total", f"Qt = Qp + Qs = {qt:g} {unit}; mathematical constraint", qt - xs
            )
    return lines


def grid_csv(grid: dict[str, Any]) -> str:
    """Lossless y-major rows; complete experiment metadata is in the first data row."""
    metadata = json.dumps(
        {
            key: value
            for key, value in grid.items()
            if key not in ("metrics", "status", "criteria_result", "admissibility_margin_ml_dl")
        },
        allow_nan=False,
        separators=(",", ":"),
    )
    rows = []
    for yi, y in enumerate(grid["y"]["coordinates"]):
        for xi, x in enumerate(grid["x"]["coordinates"]):
            row = {
                "y_index": yi,
                "x_index": xi,
                "x": x,
                "y": y,
                "status": grid["status"][yi][xi],
                "metadata_json": metadata if xi == yi == 0 else "",
                "admissibility_margin_ml_dl": grid["admissibility_margin_ml_dl"][yi][xi],
            }
            row.update({key: values[yi][xi] for key, values in grid["metrics"].items()})
            if grid["criteria_result"] is not None:
                row["criteria_json"] = json.dumps(
                    {
                        key: value[yi][xi] if isinstance(value, list) else value
                        for key, value in grid["criteria_result"].items()
                    }
                )
            rows.append(row)
    return csv_rows(rows)
