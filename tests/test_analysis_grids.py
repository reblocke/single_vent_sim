"""H3/H4 coordinates and scalar equivalence, including deliberately invalid baseline Hb."""

import copy
import json
from pathlib import Path

import pytest

from parallel_o2.analysis_grids import evaluate_analysis_grid
from parallel_o2.criteria import criterion_boundary
from parallel_o2.inputs import InputError
from parallel_o2.sensitivity import hb_sensitivity

BASE = json.loads(Path("config/examples/ahmed_inspired_hb14_ci6.json").read_text())
CRITERIA = json.loads(Path("config/ahmed_criteria.json").read_text())


def axis(parameter, low, high, n=7, scale="linear"):
    return dict(parameter=parameter, min=low, max=high, n=n, scale=scale)


def test_h3_matches_scalar_boundaries_and_ignores_baseline_hb_feasibility():
    base = copy.deepcopy(BASE)
    base["capacity"]["hb_g_dl"] = 0.01
    grid = evaluate_analysis_grid(
        "hb_boundary",
        base,
        axis("flow.r", 0.2, 4, scale="log"),
        axis("flow.qt_l_min_m2", 2, 12, n=5),
        CRITERIA,
    )
    assert grid["shape"] == [5, 7]
    assert grid["baseline_hb_constraint"] is None
    assert "hb_g_dl" not in grid["fixed_inputs"]["capacity"]
    for j, flow in enumerate(grid["y"]["coordinates"]):
        for i, r in enumerate(grid["x"]["coordinates"]):
            s = copy.deepcopy(base)
            s["flow"].update(r=r, qt_l_min_m2=flow)
            out = criterion_boundary(s, CRITERIA)
            assert grid["metrics"]["joint_hb_g_dl"][j][i] == pytest.approx(out["joint_value"])
            assert grid["binding_criterion"][j][i] == out["binding_criterion"]
            assert grid["equality_sa_fraction"][j][i] == pytest.approx(
                out["equality_state"]["metrics"]["sa_fraction"]
            )
            assert grid["equality_sv_fraction"][j][i] == pytest.approx(
                out["equality_state"]["metrics"]["sv_fraction"]
            )
            assert grid["status"][j][i] == (
                "outside_display_range" if out["joint_value"] > 25 else "finite"
            )


@pytest.mark.parametrize(
    "m,spv,status",
    [
        (0, 0.98, "no_positive_lower_bound"),
        (0, 0.7, "no_solution_at_endpoint"),
        (150, 0.7, "no_finite_solution"),
        (150, 0.4, "no_finite_solution"),
    ],
)
def test_h3_zero_demand_and_impossible_endpoint_statuses(m, spv, status):
    base = {**BASE, "vo2_target_ml_min_m2": m, "spv_fraction": spv}
    grid = evaluate_analysis_grid(
        "hb_boundary", base, axis("flow.r", 0.2, 4), axis("flow.qt_l_min_m2", 2, 12), CRITERIA
    )
    assert all(cell == status for row in grid["status"] for cell in row)
    assert all(
        cell == (0 if status == "no_positive_lower_bound" else None)
        for row in grid["metrics"]["joint_hb_g_dl"]
        for cell in row
    )


@pytest.mark.parametrize("demand", [0, 150, 250])
def test_h4_scalar_gain_parity_and_both_endpoint_masks(demand):
    base = {**BASE, "vo2_target_ml_min_m2": demand}
    grid = evaluate_analysis_grid(
        "hb_gain",
        base,
        axis("capacity.hb_g_dl", 2, 20),
        axis("delta_hb_g_dl", 0.1, 4, n=5),
        CRITERIA,
    )
    for j, delta in enumerate(grid["y"]["coordinates"]):
        for i, h in enumerate(grid["x"]["coordinates"]):
            s = copy.deepcopy(base)
            s["capacity"]["hb_g_dl"] = h
            result = hb_sensitivity(s, delta)
            assert grid["status"][j][i] == result["status"]
            for name, value in result["increments"].items():
                actual = grid["metrics"]["delta_" + name][j][i]
                assert actual is None if value is None else actual == pytest.approx(value)
    if demand == 0:
        assert all(v == 0 for row in grid["metrics"]["delta_sa_fraction"] for v in row)


@pytest.mark.parametrize(
    "kind,x,y",
    [
        ("hb_gain", axis("capacity.hb_g_dl", 6, 20), axis("delta_hb_g_dl", 0, 4)),
        ("hb_gain", axis("capacity.hb_g_dl", 6, 20), axis("delta_hb_g_dl", 0.1, 4, n=402)),
        ("hb_boundary", axis("flow.r", 0.2, 4), axis("flow.qt_l_min_m2", 0, 12)),
        ("hb_boundary", axis("flow.r", 0.2, 4), axis("flow.r", 0.2, 4)),
    ],
)
def test_derived_grid_rejects_inactive_axes_and_resource_abuse(kind, x, y):
    with pytest.raises(InputError):
        evaluate_analysis_grid(kind, BASE, x, y, CRITERIA)


def test_inverse_display_range_can_start_at_zero_without_changing_strict_domain():
    ordinary = criterion_boundary(BASE, CRITERIA, display_range=[0, 25])
    assert ordinary["joint_status"] == "finite"
    assert ordinary["joint_value"] == pytest.approx(13.326226012793176)
    for invalid in ([-1, 25], [0, 0], [True, 25], [25, 0], [0, float("inf")]):
        with pytest.raises(InputError):
            criterion_boundary(BASE, CRITERIA, display_range=invalid)


def test_grid_objective_overlays_match_scalar_and_preserve_log_coordinates():
    from parallel_o2.derived import conditional_optimum
    from parallel_o2.experiments import evaluate_grid

    x, y = axis("flow.r", 0.01, 4, n=17, scale="log"), axis("flow.qt_l_min_m2", 2, 12, n=13)
    g = evaluate_grid(BASE, x, y, ["sa_fraction"])
    lines = {line["kind"]: line for line in g["constraint_overlays"]}
    for j, qt in enumerate(g["y"]["coordinates"]):
        s = copy.deepcopy(BASE)
        s["flow"]["qt_l_min_m2"] = qt
        optimum = conditional_optimum(s)
        if optimum["do2_maximum"] is None:
            assert lines["do2_peak"]["x"][j] is None
        else:
            r = optimum["do2_maximum"]["r"]
            assert lines["do2_peak"]["x"][j] == pytest.approx(r)
            import math

            assert lines["do2_peak"]["plot_x"][j] == pytest.approx(math.log10(r))
            assert lines["sv_peak"]["x"][j] == 1
    zero = evaluate_grid({**BASE, "vo2_target_ml_min_m2": 0}, x, y, ["sa_fraction"])
    for line in zero["constraint_overlays"]:
        if line["kind"] != "ratio_1":
            assert all(v is None for v in line["x"])


def test_independent_flow_overlay_constraints_and_zero_display_range():
    from parallel_o2.experiments import evaluate_grid
    from parallel_o2.indexing import flow_mode

    s = flow_mode(BASE, "independent_flows")
    grid = evaluate_grid(
        s, axis("flow.qp_l_min_m2", 1, 8), axis("flow.qs_l_min_m2", 1, 8), ["sa_fraction"]
    )
    for line in grid["constraint_overlays"]:
        pairs = [(p, q) for p, q in zip(line["x"], line["y"], strict=True) if p is not None]
        expected = (0.5, 1, 2) if line["kind"] == "iso_ratio" else (4, 6, 9)
        quantities = [p / q if line["kind"] == "iso_ratio" else p + q for p, q in pairs]
        assert all(any(abs(v - e) < 1e-12 for e in expected) for v in quantities)
