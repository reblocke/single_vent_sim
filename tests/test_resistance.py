"""Independent resistance fixtures, pressure-root oracle and R01-R23 properties."""

import copy
import importlib.util
import json
import random
from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest

from parallel_o2.flow_providers import solve_resistance_state
from parallel_o2.hemodynamics import resolve_resistance_reference
from parallel_o2.inputs import InputError
from parallel_o2.resistance_experiments import (
    compare_resistance_states,
    evaluate_resistance_grid,
    mechanism_ablation,
)

ROOT = Path(__file__).resolve().parents[1]
CASES = json.loads((ROOT / "verification/savorgnan_golden_cases.json").read_text())["cases"]
SOURCE = json.loads((ROOT / "verification/savorgnan_source_claims.json").read_text())
PROFILES = json.loads((ROOT / "config/resistance_profiles.json").read_text())["profiles"]
# Test-only loading; production cannot import any verification module.
SPEC = importlib.util.spec_from_file_location(
    "pressure_oracle", ROOT / "verification/resistance_oracle.py"
)
ORACLE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ORACLE)


def baseline():
    return copy.deepcopy(CASES[0]["scenario"])


def physical():
    r = baseline()
    r["oxygen"] = dict(
        mode="physical", spv_fraction=0.99, hb_g_dl=12, kappa_ml_o2_g_hb=1.34, vo2_ml_min=30.552
    )
    return r


def close(actual, expected, tolerance=1e-10):
    if expected is None:
        assert actual is None
    else:
        assert actual == pytest.approx(expected, rel=tolerance, abs=tolerance)


def profile_request(profile, advanced=True, scope="native_rp"):
    r = baseline()
    r["response"].update(alpha=0.35 if advanced else 0, nonlinear_fraction=0.5 if advanced else 0)
    r["perturbation"].update(
        scope=scope,
        rs_multiplier=1 + profile["delta_rs_fraction"],
        rp_multiplier=1 + profile["delta_native_rp_fraction"],
    )
    return r


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["id"])
def test_40_independent_decimal_fixtures(case):
    result = solve_resistance_state(case["scenario"])
    assert result["status"] == case["expected_status"]
    assert result["hemodynamic_status"] == "solved"
    for key, value in case["expected"].items():
        close(result["audit"]["algebraic_metrics"][key], value)
    for name, value in result["residuals"].items():
        assert abs(value) < 1e-9, (name, value)
    if case["scenario"]["oxygen"]["mode"] == "normalized_source":
        assert result["metrics"]["do2_ml_min"] is None
        assert result["undefined_reasons"]["do2_ml_min"] == "requires_declared_capacity"


def test_native_and_whole_pathway_semantics_and_table_discrepancies():
    native = profile_request(PROFILES[3], advanced=False)
    a = solve_resistance_state(native)
    close(a["metrics"]["rp_mmhg_min_l"], 6.6)
    close(a["metrics"]["rshunt_nominal_mmhg_min_l"], 28)
    close(a["metrics"]["r"], 40 / 34.6)
    audit = copy.deepcopy(native)
    audit["perturbation"]["scope"] = "whole_pathway_audit"
    b = solve_resistance_state(audit)
    close(b["metrics"]["r"], 1 / 0.55)
    audit["response"]["alpha"] = 0.35
    with pytest.raises(InputError):
        solve_resistance_state(audit)
    discrepancies = []
    for profile in PROFILES:
        table1 = next(row for row in SOURCE["table1"] if row["profile_id"] == profile["id"])
        result = solve_resistance_state(profile_request(profile, False, "whole_pathway_audit"))[
            "metrics"
        ]
        assert abs(result["r"] - table1["r"]) <= 0.005
        assert (
            abs(100 * (result["delivery_index_l_min"] / 0.8 - 1) - table1["delta_delivery_percent"])
            <= 0.05
        )
        discrepancies.append(abs(result["sa_fraction"] - table1["sa_fraction"]) > 0.0005)
        table3 = next(row for row in SOURCE["table3"] if row["profile_id"] == profile["id"])
        advanced = solve_resistance_state(profile_request(profile))["metrics"]
        for key in ("qt_l_min", "qs_l_min", "qp_l_min", "r"):
            assert abs(advanced[key] - table3[key]) <= 0.0005
        assert (
            abs(
                100 * (advanced["delivery_index_l_min"] / 0.8 - 1)
                - table3["delta_delivery_percent"]
            )
            <= 0.05
        )
    assert all(
        discrepancies[:3]
    )  # Neither agreeing ratios nor Table3 erase Table1 saturation differences.


def test_calibration_limits_pressure_gauge_and_nonlinear_derivative():
    for closure in ("nominal_parallel", "circuit_secant"):
        for alpha in (0, 0.35, 1):
            for f in (0, 0.5, 1):
                s = baseline()
                s["reference"].update(rs_mmhg_min_l=30, rp_mmhg_min_l=17, qt_l_min=1.7)
                s["response"].update(closure=closure, alpha=alpha, nonlinear_fraction=f)
                ref = resolve_resistance_reference(s)
                with pytest.raises(FrozenInstanceError):
                    ref.qt_l_min = 4
                result = solve_resistance_state(s)["metrics"]
                close(result["qp_l_min"], ref.calibration_qp_l_min)
                close(result["qs_l_min"], ref.qs_l_min)
                close(result["driving_pressure_mmhg"], ref.driving_pressure_mmhg)
                shifted = copy.deepcopy(s)
                shifted["reference"]["common_downstream_pressure_mmhg"] = 12
                v = solve_resistance_state(shifted)["metrics"]
                close(v["qp_l_min"], result["qp_l_min"])
                close(v["sa_fraction"], result["sa_fraction"])
                close(v["arterial_pressure_mmhg"], result["arterial_pressure_mmhg"] + 12)
    result = solve_resistance_state(baseline())["metrics"]
    close(result["shunt_secant_resistance_mmhg_min_l"], 28)
    close(result["shunt_incremental_resistance_mmhg_min_l"], 42)
    step = 1e-5

    def pressure(q):
        return 14 * q + 14 * q * q

    close((pressure(1 + step) - pressure(1 - step)) / (2 * step), 42, tolerance=1e-9)


def test_output_closure_limits_and_2000_seeded_states_with_80_decimal_oracles():
    rng = random.Random(9202026)
    maximum_residual = 0
    for i in range(2000):
        request = baseline()
        request["reference"].update(
            rs_mmhg_min_l=rng.uniform(5, 100),
            rp_mmhg_min_l=rng.uniform(0, 60),
            rshunt_nominal_mmhg_min_l=rng.uniform(0.1, 60),
            qt_l_min=rng.uniform(0.3, 5),
        )
        request["response"].update(
            closure="nominal_parallel" if i % 2 else "circuit_secant",
            alpha=rng.random(),
            nonlinear_fraction=rng.random(),
        )
        request["perturbation"].update(
            rs_multiplier=rng.uniform(0.2, 2),
            rp_multiplier=rng.uniform(0, 2),
            rshunt_multiplier=rng.uniform(0, 2),
        )
        request["oxygen"]["normalized_consumption_l_min"] = rng.uniform(0, 0.8)
        out = solve_resistance_state(request)
        assert out["hemodynamic_status"] == "solved"
        values = out["audit"]["algebraic_metrics"]
        qp, qs, p = values["qp_l_min"], values["qs_l_min"], values["driving_pressure_mmhg"]
        close(qp + qs, values["qt_l_min"])
        close(values["rs_mmhg_min_l"] * qs, p)
        close(
            (values["rp_mmhg_min_l"] + values["k1_mmhg_min_l"]) * qp
            + values["k2_mmhg_min2_l2"] * qp * qp,
            p,
        )
        close(
            values["normalized_pulmonary_net_l_min"],
            request["oxygen"]["normalized_consumption_l_min"],
        )
        close(
            values["normalized_systemic_net_l_min"],
            request["oxygen"]["normalized_consumption_l_min"],
        )
        maximum_residual = max(maximum_residual, abs(out["residuals"]["log_output_law"]))
        if i < 80:
            expected, status = ORACLE.oracle(request)
            assert out["oxygen_status"] == status
            for key, value in expected.items():
                close(values[key], value)
    assert maximum_residual <= 1e-10
    for alpha in (0, 0.1, 0.35, 0.9, 1):
        outputs = []
        for closure in ("nominal_parallel", "circuit_secant"):
            request = profile_request(PROFILES[3])
            request["response"].update(alpha=alpha, nonlinear_fraction=0, closure=closure)
            outputs.append(solve_resistance_state(request)["metrics"])
        for key in outputs[0]:
            close(outputs[0][key], outputs[1][key])
    for closure in ("nominal_parallel", "circuit_secant"):
        for alpha in (0, 1):
            request = profile_request(PROFILES[3])
            request["response"].update(alpha=alpha, closure=closure)
            out = solve_resistance_state(request)["metrics"]
            if alpha == 0:
                close(out["qt_l_min"], 2)
            elif closure == "circuit_secant":
                close(out["driving_pressure_mmhg"], 40)
            else:
                assert abs(out["driving_pressure_mmhg"] - 40) > 0.1


def test_physical_bridge_hb_fixed_demand_decomposition_and_separate_statuses():
    a, b = physical(), physical()
    b["oxygen"]["hb_g_dl"] = 14
    comparison = compare_resistance_states(a, b)
    first, second = comparison["a"], comparison["b"]
    close(first["metrics"]["normalized_consumption_l_min"], 0.19)
    close(first["metrics"]["do2_ml_min"], 10 * 12 * 1.34 * 0.8)
    for name in ("qp_l_min", "qs_l_min", "driving_pressure_mmhg"):
        close(first["metrics"][name], second["metrics"][name])
    for endpoint in (first, second):
        close(endpoint["metrics"]["vo2_ml_min"], 30.552)
        close(endpoint["metrics"]["pulmonary_net_add_ml_min"], 30.552)
    assert (
        comparison["deltas"]["do2_ml_min"]["relative"]
        != comparison["deltas"]["delivery_index_l_min"]["relative"]
    )
    close(comparison["decomposition"]["log_residual"], 0)
    b["oxygen"]["vo2_ml_min"] = 500
    result = solve_resistance_state(
        b, json.loads((ROOT / "config/ahmed_criteria.json").read_text())
    )
    assert result["hemodynamic_status"] == "solved"
    assert result["oxygen_status"] == "infeasible_requested_consumption"
    assert result["criterion_result"]["status"] == "not_evaluable"
    assert result["metrics"]["qs_l_min"] > 0 and result["metrics"]["sa_fraction"] is None
    assert compare_resistance_states(a, b)["decomposition"] is None


def test_zero_limits_pure_quadratic_and_numerical_domain_failures():
    s = baseline()
    for m, spv, status in [
        (0, 0.99, "admissible"),
        (0, 0, "degenerate_zero_oxygen"),
        (0.495, 0.99, "zero_venous_boundary"),
        (0.2, 0, "infeasible_requested_consumption"),
    ]:
        s["oxygen"].update(normalized_consumption_l_min=m, spv_fraction=spv)
        assert solve_resistance_state(s)["status"] == status
    s = baseline()
    s["reference"]["rp_mmhg_min_l"] = 0
    s["response"]["nonlinear_fraction"] = 1
    out = solve_resistance_state(s)
    assert out["hemodynamic_status"] == "solved"
    assert out["metrics"]["k1_mmhg_min_l"] == 0
    expected, _ = ORACLE.oracle(s)
    close(out["metrics"]["qp_l_min"], expected["qp_l_min"])
    s["perturbation"]["rshunt_multiplier"] = 0
    assert solve_resistance_state(s)["hemodynamic_status"] == "invalid_hemodynamic_domain"
    s = baseline()
    s["reference"]["qt_l_min"] = 1e-320
    assert solve_resistance_state(s)["hemodynamic_status"] == "hemodynamic_numerical_failure"
    for key in ("rs_mmhg_min_l", "qt_l_min"):
        s = baseline()
        s["reference"][key] = 1e308
        result = solve_resistance_state(s)
        if key == "qt_l_min":
            assert result["hemodynamic_status"] == "hemodynamic_numerical_failure"
        else:
            # Huge Rs remains solvable: a tiny positive systemic flow is not a failure.
            assert result["hemodynamic_status"] == "solved"
            assert result["metrics"]["qs_l_min"] > 0
        assert "NaN" not in json.dumps(result, allow_nan=False)


def test_ablations_matched_families_local_responses_and_grid_orientation():
    request = profile_request(PROFILES[3])
    result = mechanism_ablation(request)
    expected = [-0.057515247989, -0.047666475846, -0.026925711305, -0.012780860846]
    for cell, target in zip(result["cells"], expected, strict=True):
        close(cell["relative_index_change"], target)
    close(
        result["interaction_relative_fraction"],
        expected[3] - expected[2] - expected[1] + expected[0],
    )
    x = dict(parameter="reference_native_fraction", min=0, max=1, n=5, scale="linear")
    y = dict(parameter="perturbation.rp_multiplier", min=0.1, max=1.5, n=7, scale="linear")
    grid = evaluate_resistance_grid(
        baseline(),
        x,
        y,
        ["relative_delivery_index_l_min_change", "qp_l_min"],
        "matched_reference_family",
    )
    for yi, mp in enumerate(grid["y"]["coordinates"]):
        close(grid["metrics"]["relative_delivery_index_l_min_change"][yi][0], 0)
        for xi, rho in enumerate(grid["x"]["coordinates"]):
            r = baseline()
            r["reference"].update(rp_mmhg_min_l=40 * rho, rshunt_nominal_mmhg_min_l=40 * (1 - rho))
            r["perturbation"]["rp_multiplier"] = mp
            scalar = solve_resistance_state(r)
            close(grid["metrics"]["qp_l_min"][yi][xi], scalar["metrics"]["qp_l_min"])
    x = dict(parameter="current_rp_mmhg_min_l", min=1, max=40, n=4, scale="linear")
    y = dict(parameter="current_rshunt_nominal_mmhg_min_l", min=1, max=60, n=3, scale="linear")
    grid = evaluate_resistance_grid(
        baseline(),
        x,
        y,
        ["delivery_index_l_min", "relative_delivery_index_l_min_change"],
        "local_response",
    )
    for yi, sh in enumerate(grid["y"]["coordinates"]):
        for xi, rp in enumerate(grid["x"]["coordinates"]):
            a, b = baseline(), baseline()
            for r in (a, b):
                r["perturbation"].update(rp_multiplier=rp / 12, rshunt_multiplier=sh / 28)
            b["perturbation"]["rp_multiplier"] *= 0.55
            scalar = compare_resistance_states(a, b)
            close(
                grid["metrics"]["delivery_index_l_min"][yi][xi],
                scalar["a"]["metrics"]["delivery_index_l_min"],
            )
            close(
                grid["metrics"]["relative_delivery_index_l_min_change"][yi][xi],
                scalar["deltas"]["delivery_index_l_min"]["relative"],
            )
            assert scalar["same_frozen_reference"]


def test_coherent_circuit_rescaling_quadratic_units_and_reference_hash():
    from dataclasses import replace

    from parallel_o2.hemodynamics import hemodynamics_arrays

    ref = resolve_resistance_reference(baseline())
    for scale in [0.25, 4, 1000]:
        converted = replace(
            ref,
            rs_mmhg_min_l=ref.rs_mmhg_min_l / scale,
            rp_mmhg_min_l=ref.rp_mmhg_min_l / scale,
            rshunt_nominal_mmhg_min_l=ref.rshunt_nominal_mmhg_min_l / scale,
            qt_l_min=ref.qt_l_min * scale,
            calibration_qp_l_min=ref.calibration_qp_l_min * scale,
            qs_l_min=ref.qs_l_min * scale,
            nominal_afterload_mmhg_min_l=ref.nominal_afterload_mmhg_min_l / scale,
            k1_mmhg_min_l=ref.k1_mmhg_min_l / scale,
            k2_mmhg_min2_l2=ref.k2_mmhg_min2_l2 / scale**2,
        )
        for closure in ("nominal_parallel", "circuit_secant"):
            a = hemodynamics_arrays(ref, 0.7, 0.55, 1, 0.35, 0.5, closure)
            b = hemodynamics_arrays(converted, 0.7, 0.55, 1, 0.35, 0.5, closure)
            for key in ("qp_l_min", "qs_l_min", "qt_l_min"):
                close(float(b.metrics[key]), float(a.metrics[key]) * scale)
            close(
                float(b.metrics["driving_pressure_mmhg"]), float(a.metrics["driving_pressure_mmhg"])
            )
            close(
                float(b.metrics["k2_mmhg_min2_l2"]), float(a.metrics["k2_mmhg_min2_l2"]) / scale**2
            )
        assert converted.sha256 != ref.sha256
    changed = baseline()
    changed["perturbation"]["rp_multiplier"] = 0.55
    assert resolve_resistance_reference(changed).sha256 == ref.sha256


def test_r1_r3_r5_r6_scalar_vectorized_and_statuses():
    x = dict(parameter="response.alpha", min=0, max=1, n=5, scale="linear")
    y = dict(parameter="response.nonlinear_fraction", min=0, max=1, n=3, scale="linear")
    request = profile_request(PROFILES[3])
    grid = evaluate_resistance_grid(
        request,
        x,
        y,
        [
            "closure_nominal_relative_change",
            "closure_secant_relative_change",
            "closure_difference_percentage_points",
        ],
    )
    for yi, f in enumerate(grid["y"]["coordinates"]):
        for xi, alpha in enumerate(grid["x"]["coordinates"]):
            changes = []
            for closure in ("nominal_parallel", "circuit_secant"):
                r = copy.deepcopy(request)
                r["response"].update(closure=closure, alpha=alpha, nonlinear_fraction=f)
                out = solve_resistance_state(r)
                changes.append(out["metrics"]["delivery_index_l_min"] / 0.8 - 1)
            close(grid["metrics"]["closure_nominal_relative_change"][yi][xi], changes[0])
            close(grid["metrics"]["closure_secant_relative_change"][yi][xi], changes[1])
            close(
                grid["metrics"]["closure_difference_percentage_points"][yi][xi],
                100 * (changes[1] - changes[0]),
            )
    x = dict(parameter="oxygen.hb_g_dl", min=6, max=20, n=5, scale="linear")
    y = dict(parameter="perturbation.rs_multiplier", min=0.5, max=1.25, n=3, scale="linear")
    grid = evaluate_resistance_grid(
        physical(), x, y, ["do2_ml_min", "qp_l_min", "pulmonary_net_add_ml_min"]
    )
    for yi, ms in enumerate(grid["y"]["coordinates"]):
        for xi, hb in enumerate(grid["x"]["coordinates"]):
            r = physical()
            r["oxygen"]["hb_g_dl"] = hb
            r["perturbation"]["rs_multiplier"] = ms
            out = solve_resistance_state(r)
            for key in grid["metrics"]:
                close(grid["metrics"][key][yi][xi], out["metrics"][key])
            close(grid["metrics"]["pulmonary_net_add_ml_min"][yi][xi], 30.552)
    x = dict(parameter="perturbation.rs_multiplier", min=0.5, max=1.25, n=3, scale="linear")
    y = dict(parameter="perturbation.rp_multiplier", min=0.1, max=1.5, n=4, scale="linear")
    grid = evaluate_resistance_grid(
        baseline(), x, y, ["sa_fraction", "relative_delivery_index_l_min_change"]
    )
    for yi, mp in enumerate(grid["y"]["coordinates"]):
        for xi, ms in enumerate(grid["x"]["coordinates"]):
            r = baseline()
            r["perturbation"].update(rs_multiplier=ms, rp_multiplier=mp)
            out = solve_resistance_state(r)
            assert grid["after_status"][yi][xi] == out["status"]
            close(grid["metrics"]["sa_fraction"][yi][xi], out["metrics"]["sa_fraction"])
            expected = (
                (out["metrics"]["delivery_index_l_min"] / 0.8 - 1)
                if out["has_nonnegative_content_solution"]
                else None
            )
            close(grid["metrics"]["relative_delivery_index_l_min_change"][yi][xi], expected)


def test_grid_bounds_invalid_cells_and_oxygen_does_not_mask_pressure():
    x = dict(parameter="perturbation.rshunt_multiplier", min=0, max=1, n=3, scale="linear")
    y = dict(parameter="perturbation.rp_multiplier", min=0, max=1, n=3, scale="linear")
    r = physical()
    r["oxygen"]["vo2_ml_min"] = 500
    grid = evaluate_resistance_grid(r, x, y, ["driving_pressure_mmhg", "sa_fraction"])
    assert grid["hemodynamic_status"][0][0] == "invalid_hemodynamic_domain"
    assert grid["metrics"]["driving_pressure_mmhg"][0][0] is None
    assert grid["metrics"]["driving_pressure_mmhg"][1][1] > 0
    assert grid["metrics"]["sa_fraction"][1][1] is None
    for bad in ['__import__("os")', "oxygen.hb_g_dl", "flow.qt_l_min"]:
        axis = {**x, "parameter": bad}
        with pytest.raises(InputError):
            evaluate_resistance_grid(baseline(), axis, y, ["sa_fraction"])
    with pytest.raises(InputError):
        evaluate_resistance_grid(baseline(), {**x, "n": 402}, y, ["sa_fraction"])
    with pytest.raises(InputError):
        evaluate_resistance_grid(baseline(), x, y, ["do2_ml_kg_min"])


def test_circuit_rescaling_preserves_oxygen_with_consumption_scaled_and_kappa_log():
    from parallel_o2.model import oxygen_arrays

    for scale in (0.25, 4, 1000):
        original = oxygen_arrays(1300, 800, 16.08, 0.99, 30.552)
        transformed = oxygen_arrays(1300 * scale, 800 * scale, 16.08, 0.99, 30.552 * scale)
        for metric in ("ca", "cv", "sa", "sv", "oer", "omega"):
            close(float(transformed.algebraic[metric]), float(original.algebraic[metric]))
        for metric in ("do2", "systemic_net_use", "pulmonary_net_add"):
            close(float(transformed.algebraic[metric]), float(original.algebraic[metric]) * scale)
    a, b = physical(), physical()
    b["oxygen"].update(hb_g_dl=14, kappa_ml_o2_g_hb=1.38)
    comparison = compare_resistance_states(a, b)
    close(comparison["decomposition"]["multiplicative_factors"]["kappa"], 1.38 / 1.34)
    close(comparison["decomposition"]["log_residual"], 0)
    audit = baseline()
    audit["response"].update(alpha=0, nonlinear_fraction=0)
    audit["perturbation"]["scope"] = "whole_pathway_audit"
    with pytest.raises(InputError):
        mechanism_ablation(audit)
