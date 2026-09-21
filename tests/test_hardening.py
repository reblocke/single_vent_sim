"""Regression cases independently specified by the September follow-up audit."""

import json
import math
from copy import deepcopy
from pathlib import Path

import numpy as np
import pytest

from parallel_o2.criteria import assess_criteria, criterion_ratio_interval
from parallel_o2.derived import conditional_optimum
from parallel_o2.experiments import evaluate_grid
from parallel_o2.inputs import InputError
from parallel_o2.model import solve_state
from parallel_o2.resistance_experiments import evaluate_resistance_grid
from parallel_o2.resistance_inspector import inspect_resistance_point
from parallel_o2.ui_state import validate_ui_state

ROOT = Path(__file__).resolve().parents[1]


def scenario(hb=6, qt=250, spv=0.99, demand=4.97475):
    return dict(
        schema_version="scenario-v1",
        model_version="barnea-parallel-bound-o2-v1",
        flow=dict(mode="total_ratio", qt_ml_kg_min=qt, r=1),
        capacity=dict(mode="hb_linear", hb_g_dl=hb, kappa_ml_o2_g_hb=1.34),
        spv_fraction=spv,
        vo2_target_ml_kg_min=demand,
    )


def axis(parameter, lo, hi, n=3, scale="linear"):
    return dict(parameter=parameter, min=lo, max=hi, n=n, scale=scale)


def resistance():
    return json.loads((ROOT / "config/resistance/normalized_reference.json").read_text())


@pytest.mark.parametrize(
    "demand", [math.nextafter(4.97475, -math.inf), 4.97475, math.nextafter(4.97475, math.inf)]
)
def test_forward_optimum_and_overlays_share_boundary(demand):
    s = scenario(demand=demand)
    raw = solve_state(s)
    optimum = conditional_optimum(s)
    assert raw["status"] == "zero_venous_boundary"
    assert optimum["status"] == "sole_zero_venous_boundary"
    assert optimum["admissible_interval"] == [1, 1]
    assert optimum["do2_maximum"]["r"] == 1
    assert optimum["do2_maximum"]["state"]["audit"] == raw["audit"]
    assert conditional_optimum(s, (1.1, 2))["status"] == "no_admissible_ratio_within_bounds"
    grid = evaluate_grid(
        s, axis("flow.r", 0.5, 1.5), axis("capacity.hb_g_dl", 5, 7), ["sa_fraction"]
    )
    for line in grid["constraint_overlays"]:
        if line["kind"] in ("do2_peak", "sv_peak", "ratio_1"):
            assert line["x"][1] == 1


def test_boundary_tolerance_does_not_relax_infeasible_demand():
    s = scenario(demand=4.97475 + 1e-9)
    assert solve_state(s)["status"] == "infeasible_requested_consumption"
    assert conditional_optimum(s)["status"] == "no_admissible_ratio"
    assert solve_state(s)["audit"]["algebraic_metrics"]["cv_ml_dl"] < -1e-10
    assert conditional_optimum(scenario(demand=4.97475 - 1e-9))["status"] == "finite"


def test_zero_demand_bounded_unbounded_and_zero_content():
    s = scenario(10, 400, 0.98, 0)
    bounded = conditional_optimum(s, (0.5, 2))
    assert bounded["status"] == "zero_demand_bounded_maximum"
    assert bounded["do2_maximum"]["r"] == 0.5
    assert bounded["do2_maximum"]["state"]["metrics"]["do2_ml_kg_min"] == pytest.approx(
        35.01866666666667
    )
    assert bounded["sv_maximum"] is None
    assert bounded["sv_status"] == "constant_no_unique_maximum"
    assert conditional_optimum(s)["do2_limit"] == "supremum_as_r_approaches_zero"
    s["spv_fraction"] = 0
    for bounds in (None, (0.5, 2)):
        result = conditional_optimum(s, bounds)
        assert result["do2_maximum"] is result["sv_maximum"] is None
        assert result["do2_status"] == result["sv_status"] == "constant_no_unique_maximum"


def test_criterion_tangent_neighbors_stay_strict():
    criteria = dict(
        schema_version="criteria-v1",
        id="user-selected",
        origin="user_selected",
        sa_lower_fraction=0.6,
        sv_lower_fraction=0.4,
        comparison="strict_greater_than",
    )
    for m in [math.nextafter(7.772, -math.inf), 7.772, math.nextafter(7.772, math.inf)]:
        s = scenario(10, 400, 0.98, m)
        assert assess_criteria(solve_state(s), criteria)["venous"] == "on"
        assert criterion_ratio_interval(s, criteria)["empty_reason"] == "venous_tangent_only"
    assert (
        criterion_ratio_interval(scenario(10, 400, 0.98, 7.772 - 1e-7), criteria)["status"]
        == "finite"
    )
    assert (
        criterion_ratio_interval(scenario(10, 400, 0.98, 7.772 + 1e-7), criteria)["empty_reason"]
        == "venous_interval_empty"
    )


@pytest.mark.parametrize(
    "absolute,alias",
    [
        ("current_rp_mmhg_min_l", "perturbation.rp_multiplier"),
        ("current_rshunt_nominal_mmhg_min_l", "perturbation.rshunt_multiplier"),
    ],
)
@pytest.mark.parametrize("reverse", [False, True])
def test_aliases_rejected_in_grid_and_point(absolute, alias, reverse):
    axes = [axis(absolute, 1, 40), axis(alias, 0.2, 1)]
    if reverse:
        axes.reverse()
    with pytest.raises(InputError, match="separate axes"):
        evaluate_resistance_grid(resistance(), *axes, ["sa_fraction"], "local_response")
    with pytest.raises(InputError, match="separate axes"):
        inspect_resistance_point(
            resistance(), *axes, axes[0]["min"], axes[1]["min"], "local_response"
        )


def test_local_control_preserves_a_and_frozen_calibration():
    r = resistance()
    x, y = axis("current_rp_mmhg_min_l", 1, 40), axis("current_rshunt_nominal_mmhg_min_l", 1, 60)
    points = [
        inspect_resistance_point(r, x, y, 12, 28, "local_response", factor)
        for factor in [0.55, 0.2, 1, 0]
    ]
    assert all(p["comparison"]["a"] == points[0]["comparison"]["a"] for p in points)
    assert points[0]["comparison"]["b"]["metrics"] != points[1]["comparison"]["b"]["metrics"]
    assert points[2]["comparison"]["a"]["metrics"] == points[2]["comparison"]["b"]["metrics"]
    for p in points:
        a, b = p["comparison"]["a"], p["comparison"]["b"]
        assert a["reference"] == b["reference"]
        assert a["reference_sha256"] == b["reference_sha256"]
    sample_x, sample_y = (
        axis("current_rp_mmhg_min_l", 12, 40),
        axis("current_rshunt_nominal_mmhg_min_l", 28, 60),
    )
    for factor, point in zip([0.55, 0.2, 1, 0], points, strict=True):
        grid = evaluate_resistance_grid(
            r,
            sample_x,
            sample_y,
            ["delivery_index_l_min", "relative_delivery_index_l_min_change"],
            "local_response",
            factor,
        )
        a, b = point["comparison"]["a"]["metrics"], point["comparison"]["b"]["metrics"]
        assert grid["metrics"]["delivery_index_l_min"][0][0] == pytest.approx(
            a["delivery_index_l_min"]
        )
        assert grid["metrics"]["relative_delivery_index_l_min_change"][0][0] == pytest.approx(
            (b["delivery_index_l_min"] - a["delivery_index_l_min"]) / a["delivery_index_l_min"]
        )
    zero_axis = axis("current_rp_mmhg_min_l", 0, 40)
    zero = inspect_resistance_point(r, zero_axis, y, 0, 28, "local_response", 0.2)
    assert zero["comparison"]["a"]["metrics"] == zero["comparison"]["b"]["metrics"]
    r["perturbation"]["rp_multiplier"] = 0.2
    with pytest.raises(InputError, match="placeholder"):
        evaluate_resistance_grid(r, x, y, ["sa_fraction"], "local_response")


def test_legacy_r4_normalization_and_log_coordinates():
    r = resistance()
    r["perturbation"].update(rp_multiplier=0.2, rshunt_multiplier=0.3)
    x, y = (
        axis("current_rp_mmhg_min_l", 0.25, 1, 3, "log"),
        axis("current_rshunt_nominal_mmhg_min_l", 1, 16, 5, "log"),
    )
    obj = dict(
        schema_version="parallel-o2-ui-state-v1",
        view="explore",
        provider="resistance",
        settings=dict(
            preset="R4",
            request=r,
            x=x,
            y=y,
            selected=dict(x=0.5, y=4),
            metrics=["delivery_index_l_min", "relative_delivery_index_l_min_change"],
            scales=[[0, 2], [-20, 20]],
            policy="local_response",
        ),
    )
    validated = validate_ui_state(json.dumps(obj))
    s = validated["settings"]
    assert s["local_rp_multiplier"] == 0.55
    assert (
        s["request"]["perturbation"]["rp_multiplier"]
        == s["request"]["perturbation"]["rshunt_multiplier"]
        == 1
    )
    assert obj["settings"]["request"]["perturbation"]["rp_multiplier"] == 0.2
    grid = evaluate_resistance_grid(s["request"], x, y, s["metrics"], s["policy"])
    assert grid["shape"] == [5, 3]
    assert grid["x"]["coordinates"][1] == 0.5
    np.testing.assert_allclose(grid["x"]["plot_coordinates"], np.log10([0.25, 0.5, 1]))
    for invalid in [-1, float("inf"), True]:
        bad = deepcopy(validated)
        bad["settings"]["local_rp_multiplier"] = invalid
        with pytest.raises((InputError, ValueError)):
            validate_ui_state(json.dumps(bad))
