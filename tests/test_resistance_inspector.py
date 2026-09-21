"""Cross-check displayed selected points against grid policy and scalar budgets."""

import json
from pathlib import Path

import pytest

from parallel_o2.inputs import InputError
from parallel_o2.resistance_experiments import evaluate_resistance_grid
from parallel_o2.resistance_inspector import inspect_resistance_point

ROOT = Path(__file__).resolve().parents[1]


def axis(parameter, low, high):
    return dict(parameter=parameter, min=low, max=high, n=3, scale="linear")


@pytest.mark.parametrize(
    "policy,x,y",
    [
        (
            "frozen_reference",
            axis("perturbation.rs_multiplier", 0.5, 1.25),
            axis("perturbation.rp_multiplier", 0.1, 1.5),
        ),
        (
            "matched_reference_family",
            axis("reference_native_fraction", 0, 1),
            axis("perturbation.rp_multiplier", 0.1, 1.5),
        ),
        (
            "local_response",
            axis("current_rp_mmhg_min_l", 1, 40),
            axis("current_rshunt_nominal_mmhg_min_l", 1, 60),
        ),
        (
            "frozen_reference",
            axis("response.alpha", 0, 1),
            axis("response.nonlinear_fraction", 0, 1),
        ),
        (
            "frozen_reference",
            axis("oxygen.hb_g_dl", 6, 20),
            axis("perturbation.rs_multiplier", 0.5, 1.25),
        ),
    ],
)
def test_selected_points_match_grid_and_preserve_anchor(policy, x, y):
    filename = (
        "physical_hb12_fixed_m.json"
        if x["parameter"] == "oxygen.hb_g_dl"
        else "normalized_reference.json"
    )
    request = json.loads((ROOT / "config/resistance" / filename).read_text())
    request["perturbation"]["rp_multiplier"] = 1 if policy == "local_response" else 0.55
    names = [
        "sa_fraction",
        "driving_pressure_mmhg",
        "relative_delivery_index_l_min_change",
        "closure_nominal_relative_change",
        "closure_secant_relative_change",
        "closure_difference_percentage_points",
    ]
    grid = evaluate_resistance_grid(request, x, y, names, baseline_policy=policy)
    for j, yv in enumerate(grid["y"]["coordinates"]):
        for i, xv in enumerate(grid["x"]["coordinates"]):
            p = inspect_resistance_point(request, x, y, xv, yv, policy)
            assert p["comparison"]["same_frozen_reference"]
            for key in ("sa_fraction", "driving_pressure_mmhg"):
                assert p["displayed_state"]["metrics"][key] == pytest.approx(
                    grid["metrics"][key][j][i]
                )
            a = p["comparison"]["deltas"]["delivery_index_l_min"]["relative"]
            assert a == pytest.approx(grid["metrics"]["relative_delivery_index_l_min_change"][j][i])
            nominal = p["closure_comparisons"]["nominal_parallel"]["deltas"][
                "delivery_index_l_min"
            ]["relative"]
            secant = p["closure_comparisons"]["circuit_secant"]["deltas"]["delivery_index_l_min"][
                "relative"
            ]
            assert nominal == pytest.approx(
                grid["metrics"]["closure_nominal_relative_change"][j][i]
            )
            assert secant == pytest.approx(grid["metrics"]["closure_secant_relative_change"][j][i])
            if nominal is not None and secant is not None:
                assert 100 * (secant - nominal) == pytest.approx(
                    grid["metrics"]["closure_difference_percentage_points"][j][i]
                )
            if policy == "local_response":
                assert p["comparison"]["a"]["reference"]["rp_mmhg_min_l"] == 12
                assert p["comparison"]["b"]["reference"]["calibration_qp_l_min"] == 1
            for state in (p["comparison"]["a"], p["comparison"]["b"]):
                m = state["metrics"]
                if m["driving_pressure_mmhg"] is not None:
                    assert m["linear_shunt_pressure_drop_mmhg"] == pytest.approx(
                        m["k1_mmhg_min_l"] * m["qp_l_min"]
                    )
                    assert m["quadratic_shunt_pressure_drop_mmhg"] == pytest.approx(
                        m["k2_mmhg_min2_l2"] * m["qp_l_min"] ** 2
                    )
                    assert sum(
                        m[k]
                        for k in (
                            "native_pulmonary_pressure_drop_mmhg",
                            "linear_shunt_pressure_drop_mmhg",
                            "quadratic_shunt_pressure_drop_mmhg",
                        )
                    ) == pytest.approx(m["systemic_pressure_drop_mmhg"])


@pytest.mark.parametrize("value", [float("nan"), float("inf"), -0.1, 2])
def test_point_rejects_outside_bounds(value):
    request = json.loads((ROOT / "config/resistance/normalized_reference.json").read_text())
    with pytest.raises(InputError):
        inspect_resistance_point(
            request,
            axis("response.alpha", 0, 1),
            axis("response.nonlinear_fraction", 0, 1),
            value,
            0.5,
        )
