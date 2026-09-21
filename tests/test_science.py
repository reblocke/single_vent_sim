"""Independent fixture and rational-oracle checks for S01-S22 and A01-A17.

No expectation is generated from production outputs. Browser gates are separate.
"""

import copy
import csv
import io
import json
import math
import random
from fractions import Fraction
from pathlib import Path

import pytest

from parallel_o2.criteria import assess_criteria, criterion_boundary, criterion_ratio_interval
from parallel_o2.derived import conditional_optimum, inverse_ratio
from parallel_o2.experiments import evaluate_grid, evaluate_slice, grid_csv
from parallel_o2.indexing import convert_indexing, flow_mode, migrate_scenario
from parallel_o2.inputs import InputError
from parallel_o2.model import solve_state
from parallel_o2.sensitivity import hb_sensitivity
from parallel_o2.serialization import dumps

ROOT = Path(__file__).resolve().parents[1]
GOLDEN = json.loads((ROOT / "verification/golden_cases.json").read_text())["cases"]
AHMED = json.loads((ROOT / "verification/ahmed_golden_cases.json").read_text())["cases"]
CRITERIA = json.loads((ROOT / "config/ahmed_criteria.json").read_text())
BOUNDARIES = json.loads((ROOT / "verification/ahmed_boundary_checkpoints.json").read_text())


def baseline():
    return copy.deepcopy(GOLDEN[0]["scenario"])


def area(hb=13):
    result = copy.deepcopy(AHMED[0]["scenario"])
    result["capacity"]["hb_g_dl"] = hb
    return result


def close(actual, expected, rel=1e-10, abs_tol=1e-10):
    if expected is None:
        assert actual is None
    else:
        assert actual == pytest.approx(expected, rel=rel, abs=abs_tol)


@pytest.mark.parametrize("case", GOLDEN + AHMED, ids=lambda c: c["id"])
def test_supplied_independent_fixtures(case):
    state = solve_state(case["scenario"])
    assert state["status"] == case["expected_status"]
    for metric, expected in case["expected_algebraic_metrics"].items():
        close(state["audit"]["algebraic_metrics"][metric], expected)
    if case.get("main_physiologic_metrics_must_be_masked"):
        assert state["metrics"]["sa_fraction"] is None
        assert state["metrics"]["sv_fraction"] is None
    if "expected_criterion_above" in case:
        c = assess_criteria(state, CRITERIA)
        for component, expected in case["expected_criterion_above"].items():
            assert (c[component] == "above") == expected
    assert json.loads(dumps(state)) == state


def test_flow_capacity_indexing_migration_and_scaling():
    s = baseline()
    state = solve_state(s)
    for converted in (flow_mode(s, "total_ratio"), migrate_scenario(s)):
        assert solve_state(converted)["metrics"] == pytest.approx(state["metrics"])
    direct = copy.deepcopy(s)
    direct["capacity"] = {"mode": "direct_capacity", "capacity_ml_dl": 13.4}
    assert solve_state(direct)["metrics"] == pytest.approx(state["metrics"])
    indexed = convert_indexing(s, mass_kg=4, bsa_m2=0.25)
    values = solve_state(indexed)["metrics"]
    for key, expected in state["metrics"].items():
        if key.endswith("_ml_kg_min"):
            flow = key.startswith(("qp_", "qs_", "qt_"))
            new = key.replace("ml_kg_min", "l_min_m2" if flow else "ml_min_m2")
            close(values[new], expected * 16 / (1000 if flow else 1))
        else:
            close(values[key], expected)
    reverted = convert_indexing(indexed, 4, 0.25)
    assert solve_state(reverted)["metrics"] == pytest.approx(state["metrics"])
    for bad in (None, 0, -1, float("nan"), True):
        with pytest.raises(InputError):
            convert_indexing(s, bad, 0.25)
    scaled = copy.deepcopy(s)
    for key in ("qp_ml_kg_min", "qs_ml_kg_min"):
        scaled["flow"][key] *= 3.7
    scaled["vo2_target_ml_kg_min"] *= 3.7
    for key, value in solve_state(scaled)["metrics"].items():
        close(value, state["metrics"][key] * (3.7 if key.endswith("ml_kg_min") else 1))


def test_invariances_zero_demand_boundary_and_extremes():
    s = baseline()
    original = solve_state(s)["metrics"]
    s["flow"]["qs_ml_kg_min"] = 100
    v = solve_state(s)["metrics"]
    close(v["sa_fraction"], original["sa_fraction"])
    close(v["do2_ml_kg_min"], original["do2_ml_kg_min"] / 2)
    s = baseline()
    s["vo2_target_ml_kg_min"] = 9
    increased = solve_state(s)["metrics"]
    assert increased["do2_ml_kg_min"] < original["do2_ml_kg_min"]
    close(increased["pulmonary_net_add_ml_kg_min"], 9)
    s["vo2_target_ml_kg_min"] = 0
    zero = solve_state(s)
    assert zero["status"] == "admissible"
    assert zero["metrics"]["omega"] is zero["metrics"]["r_fick"] is None
    assert zero["metrics"]["oer_fraction"] == 0
    close(zero["metrics"]["sa_fraction"], 0.98)
    s["spv_fraction"] = 0
    degenerate = solve_state(s)
    assert degenerate["status"] == "degenerate_zero_oxygen"
    assert degenerate["metrics"]["oer_fraction"] is None
    s["vo2_target_ml_kg_min"] = 6
    assert solve_state(s)["status"] == "infeasible_requested_consumption"
    s = baseline()
    limit = original["zero_venous_vo2_limit_ml_kg_min"]
    for factor, status in [
        (1 - 1e-8, "admissible"),
        (1, "zero_venous_boundary"),
        (1 + 1e-8, "infeasible_requested_consumption"),
    ]:
        s["vo2_target_ml_kg_min"] = limit * factor
        assert solve_state(s)["status"] == status
    for key, value in [("hb_g_dl", 1e308), ("kappa_ml_o2_g_hb", 1e308)]:
        s = baseline()
        s["capacity"][key] = value
        out = solve_state(s)
        assert out["status"] == "numerical_failure"
        assert "NaN" not in dumps(out) and "Infinity" not in dumps(out)
    s = baseline()
    s["spv_fraction"] = float("nan")
    with pytest.raises(InputError):
        solve_state(s)


def scalar_oracle(p, s, b, spv, demand):
    """Eliminate mixing and systemic balance using exact rational arithmetic."""
    p, s, b, spv, demand = map(lambda x: Fraction(str(x)), (p, s, b, spv, demand))
    cpv = b * spv
    # Ca = (p*Cpv+s*Cv)/(p+s), Ca-Cv=100M/s; solve for Cv first.
    cv = cpv - 100 * demand * (p + s) / (p * s)
    ca = (p * cpv + s * cv) / (p + s)
    delivery = s * ca / 100
    return dict(
        cpv_ml_dl=float(cpv),
        ca_ml_dl=float(ca),
        cv_ml_dl=float(cv),
        sa_fraction=float(ca / b),
        sv_fraction=float(cv / b),
        do2_ml_kg_min=float(delivery),
    )


def test_2000_seeded_conservation_and_feasibility_states():
    rng = random.Random(20260920)
    admissible = masked = 0
    for _ in range(2000):
        p, s = (rng.uniform(10, 1000) for _ in range(2))
        b, spv, m = rng.uniform(5, 35), rng.uniform(0, 1), rng.uniform(0, 25)
        scenario = baseline()
        scenario.update(
            flow=dict(mode="independent_flows", qp_ml_kg_min=p, qs_ml_kg_min=s),
            capacity=dict(mode="direct_capacity", capacity_ml_dl=b),
            spv_fraction=spv,
            vo2_target_ml_kg_min=m,
        )
        expected = scalar_oracle(p, s, b, spv, m)
        result = solve_state(scenario)
        raw = result["audit"]["algebraic_metrics"]
        for metric, value in expected.items():
            close(raw[metric], value)
        assert (result["status"] == "admissible") == (expected["cv_ml_dl"] > 0)
        for key, residual in result["residuals"].items():
            assert abs(residual) <= 1e-10 * max(1, abs(raw["do2_ml_kg_min"]), m), key
        if expected["cv_ml_dl"] > 0:
            admissible += 1
            close(raw["r_fick"], p / s)
            close(raw["systemic_net_use_ml_kg_min"], m)
            close(raw["pulmonary_net_add_ml_kg_min"], m)
            close(raw["do2_ml_kg_min"], m + raw["systemic_out_ml_kg_min"])
            close(raw["oer_fraction"] * raw["omega"], 1)
        else:
            masked += 1
            assert result["metrics"]["sa_fraction"] is None
    assert admissible > 500 and masked > 500


def golden_search(function, lo, hi):
    """Independent bounded scalar maximization, no production derivative or grid."""
    phi = (math.sqrt(5) - 1) / 2
    for _ in range(100):
        left, right = hi - phi * (hi - lo), lo + phi * (hi - lo)
        if function(left) < function(right):
            lo = left
        else:
            hi = right
    return (lo + hi) / 2


def test_optima_existence_objectives_and_independent_search():
    scenario = flow_mode(baseline(), "total_ratio")
    for m, status in [
        (14, "no_admissible_ratio"),
        (13.132, "sole_zero_venous_boundary"),
        (6, "finite"),
        (0, "zero_demand_no_interior_maximum"),
    ]:
        scenario["vo2_target_ml_kg_min"] = m
        out = conditional_optimum(scenario)
        assert out["status"] == status
        if status == "finite":
            lo, hi = out["admissible_interval"]
            close(lo * hi, 1)
            independent = golden_search(lambda r, m=m: 52.528 / (1 + r) - m / r, lo, hi)
            close(out["do2_maximum"]["r"], independent, rel=0, abs_tol=1e-6)
            close(out["sv_maximum"]["r"], 1)
            assert out["do2_maximum"]["r"] < 1
    scenario["vo2_target_ml_kg_min"] = 6
    bounded = conditional_optimum(scenario, (1.1, 1.5))
    assert bounded["do2_maximum"]["r"] == 1.1
    assert bounded["do2_maximum"]["analytic_optimum_outside_plot"]
    assert (
        conditional_optimum(scenario, (100, 200))["status"] == "no_admissible_ratio_within_bounds"
    )
    with pytest.raises(InputError):
        conditional_optimum(scenario, (2, 1))


def test_inverse_exact_and_distinct_error_denominators():
    result = inverse_ratio(0.8, 0.5, 0.96, 1.0)
    close(result["r_true"], 1.875)
    close(result["r_est"], 1.5)
    close(result["relative_error_vs_true"], -0.2)
    close(result["true_excess_over_est"], 0.25)
    close(result["psi"], -6)
    close(result["local_relative_error"], -0.25)
    close(result["spv_error_percentage_points"], 4)
    for inputs in [
        (0.8, 0.8, 0.96, 1),
        (0.8, 0.5, 0.8, 1),
        (0.8, 0.5, 0.96, 0.7),
        (0.8, -0.1, 0.96, 1),
    ]:
        with pytest.raises(InputError):
            inverse_ratio(*inputs)


def test_criteria_boundaries_and_hb13_not_rounded_into_passing():
    state = solve_state(area())
    c = assess_criteria(state, CRITERIA)
    assert c["status"] == "venous_only_above"
    assert c["arterial_margin_percentage_points"] < 0
    hb = criterion_boundary(area(), CRITERIA, "hb")
    close(hb["arterial"]["value"], BOUNDARIES["hb_sa"])
    close(hb["venous"]["value"], BOUNDARIES["hb_sv"])
    assert hb["binding_criterion"] == "arterial"
    assert hb["equality_criteria"]["status"] == "on_selected_boundary"
    assert not hb["equality_criteria"]["meets_both_strict_criteria"]
    assert "hb_g_dl" not in hb["fixed_inputs"]["capacity"]
    ci = criterion_boundary(area(9), CRITERIA, "total_flow")
    close(ci["joint_value"], BOUNDARIES["ci_joint_at_hb9"])
    assert ci["boundary_parameter"] == "flow.qt_l_min_m2"
    assert (
        criterion_boundary(area(), CRITERIA, "hb", (1, 10))["joint_status"]
        == "outside_display_range"
    )
    vo2 = criterion_boundary(area(14), CRITERIA, "vo2")
    assert vo2["joint_value"] < vo2["zero_venous_mathematical_limit"]
    close(vo2["prescribed_demand_margin"], vo2["joint_value"] - 150)
    for solve, out in [("hb", hb), ("total_flow", ci), ("vo2", vo2)]:
        eq = out["equality_state"]["requested"]
        path = out["boundary_parameter"].split(".")
        for multiplier in (0.999, 1.001):
            trial = copy.deepcopy(eq)
            target = trial if len(path) == 1 else trial[path[0]]
            target[path[-1]] *= multiplier
            passes = assess_criteria(solve_state(trial), CRITERIA)["meets_both_strict_criteria"]
            assert passes == (multiplier < 1 if solve == "vo2" else multiplier > 1)


def test_boundary_special_cases_and_ratio_intervals():
    s = area()
    interval = criterion_ratio_interval(s, CRITERIA)
    close(interval["interval"]["lower"], BOUNDARIES["hb13_ratio_lower"])
    close(interval["interval"]["upper"], BOUNDARIES["hb13_ratio_upper"])
    close(math.prod(interval["venous_roots"]), 1)
    assert not interval["interval"]["lower_included"]
    bounded = criterion_ratio_interval(s, CRITERIA, (1.1, 1.2))["interval"]
    assert bounded["lower_included"] and bounded["upper_included"]
    assert criterion_ratio_interval(s, CRITERIA, (2, 3))["interval"] is None
    s["spv_fraction"] = 0.7
    for solve in ("hb", "total_flow", "vo2"):
        out = criterion_boundary(s, CRITERIA, solve)
        assert out["joint_status"] == "no_finite_solution"
        assert out["joint_value"] is None
        assert "Infinity" not in dumps(out)
    s["vo2_target_ml_min_m2"] = 0
    assert criterion_boundary(s, CRITERIA)["joint_status"] == "no_solution_at_endpoint"
    assert criterion_ratio_interval(s, CRITERIA)["interval"] is None
    s["spv_fraction"] = 0.98
    assert criterion_boundary(s, CRITERIA)["joint_status"] == "no_positive_lower_bound"
    assert criterion_ratio_interval(s, CRITERIA)["interval"]["upper"] is None
    assert criterion_boundary(s, CRITERIA, "vo2")["joint_status"] == "finite"
    s["capacity"] = dict(mode="direct_capacity", capacity_ml_dl=20)
    with pytest.raises(InputError):
        criterion_boundary(s, CRITERIA, "hb")
    with pytest.raises(InputError):
        hb_sensitivity(s, 1)
    assert (
        criterion_boundary(s, CRITERIA, "total_flow")["joint_status"] == "no_positive_lower_bound"
    )


def test_2000_seeded_indexed_boundary_derivative_and_interval_properties():
    rng = random.Random(7092026)
    for _ in range(2000):
        hb, qt, r = rng.uniform(5, 25), rng.uniform(2, 15), rng.uniform(0.2, 4)
        spv, m = rng.uniform(0.72, 1), rng.uniform(30, 250)
        s = area(hb)
        s.update(
            flow=dict(mode="total_ratio", qt_l_min_m2=qt, r=r),
            spv_fraction=spv,
            vo2_target_ml_min_m2=m,
        )
        p, q = qt * r / (1 + r), qt / (1 + r)
        expected = scalar_oracle(p * 1000, q * 1000, hb * 1.34, spv, m)
        out = solve_state(s)
        close(out["audit"]["algebraic_metrics"]["sa_fraction"], expected["sa_fraction"])
        close(out["audit"]["algebraic_metrics"]["do2_ml_min_m2"], expected["do2_ml_kg_min"])
        boundary = criterion_boundary(s, CRITERIA)
        # A separate rearrangement from desired content deficits, rational arithmetic.
        fp, fq, fm, fk = map(lambda v: Fraction(str(v)), (p, q, m, 1.34))
        fa, fv = Fraction(str(spv)) - Fraction("0.7"), Fraction(str(spv)) - Fraction("0.4")
        target = max(fm / (10 * fp * fk * fa), fm * (fp + fq) / (10 * fp * fq * fk * fv))
        close(boundary["joint_value"], float(target))
        # Independently verify the analytic interval by testing the requested r.
        interval = criterion_ratio_interval(s, CRITERIA)["interval"]
        contains = interval is not None and interval["lower"] < r < interval["upper"]
        assert contains == (expected["sa_fraction"] > 0.7 and expected["sv_fraction"] > 0.4)
        h = max(hb, float(target) * 1.1)
        s["capacity"]["hb_g_dl"] = h
        sensitivity = hb_sensitivity(s, 0.2)
        d = sensitivity["derivatives"]
        step = h * 1e-4

        def independently_at(value, p=p, q=q, spv=spv, m=m):
            return scalar_oracle(p * 1000, q * 1000, value * 1.34, spv, m)

        left, center, right = (independently_at(v) for v in (h - step, h, h + step))
        for metric, d1, d2 in [
            ("sa_fraction", "dsa_dhb", "d2sa_dhb2"),
            ("sv_fraction", "dsv_dhb", "d2sv_dhb2"),
        ]:
            close(d[d1], (right[metric] - left[metric]) / (2 * step), rel=1e-5)
            close(d[d2], (right[metric] - 2 * center[metric] + left[metric]) / step**2, rel=1e-5)
            assert d[d2] < 0
        close(d["dsv_dhb"], (1 + r) * d["dsa_dhb"])
        close(d["ddo2_dhb"], 10 * q * 1.34 * spv)
        endpoint = independently_at(h + 0.2)
        close(
            sensitivity["increments"]["sa_fraction"],
            endpoint["sa_fraction"] - center["sa_fraction"],
        )
        close(
            sensitivity["increments"]["do2_ml_min_m2"],
            endpoint["do2_ml_kg_min"] - center["do2_ml_kg_min"],
        )
        converted = convert_indexing(s, 4, 0.24)
        close(solve_state(converted)["metrics"]["sa_fraction"], center["sa_fraction"])


def test_no_hb_breakpoint_zero_sensitivities_and_infeasible_endpoint():
    for h in (11.999, 12, 12.001, 12.999, 13, 13.001, 14):
        result = hb_sensitivity(area(h), 1)
        assert result["derivatives"]["d2sa_dhb2"] < 0
        close(result["derivatives"]["ddo2_dhb"], 39.396)
        for endpoint in result["endpoints"]:
            close(endpoint["metrics"]["pulmonary_net_add_ml_min_m2"], 150)
    s = area()
    s["vo2_target_ml_min_m2"] = 0
    result = hb_sensitivity(s, 1)
    assert result["derivatives"]["dsa_dhb"] == result["derivatives"]["dsv_dhb"] == 0
    s["vo2_target_ml_min_m2"] = 1000
    result = hb_sensitivity(s, 1)
    assert result["status"] == "masked_endpoint"
    assert all(value is None for value in result["increments"].values())
    assert result["audit"]["algebraic_increments"]["sa_fraction"] > 0


def test_grid_orientation_physical_log_coordinates_slices_and_csv():
    s = area()
    x = dict(parameter="flow.r", min=0.2, max=4, n=7, scale="log")
    y = dict(parameter="capacity.hb_g_dl", min=6, max=20, n=5, scale="linear")
    metrics = ["sa_fraction", "sv_fraction", "do2_ml_min_m2", "omega"]
    grid = evaluate_grid(s, x, y, metrics, CRITERIA)
    assert grid["shape"] == [5, 7]
    assert grid["actual_resolution"] == grid["requested_resolution"]
    for yi, h in enumerate(grid["y"]["coordinates"]):
        for xi, r in enumerate(grid["x"]["coordinates"]):
            s["flow"]["r"] = r
            s["capacity"]["hb_g_dl"] = h
            scalar = solve_state(s)
            assert grid["status"][yi][xi] == scalar["status"]
            assert (
                grid["criteria_result"]["status"][yi][xi]
                == assess_criteria(scalar, CRITERIA)["status"]
            )
            for metric in metrics:
                close(grid["metrics"][metric][yi][xi], scalar["metrics"][metric])
    rows = list(csv.DictReader(io.StringIO(grid_csv(grid))))
    assert len(rows) == 35
    for row in rows:
        yi, xi = int(row["y_index"]), int(row["x_index"])
        for metric in metrics:
            close(
                None if row[metric] == "" else float(row[metric]), grid["metrics"][metric][yi][xi]
            )
    assert json.loads(rows[0]["metadata_json"])["requested"] == grid["requested"]
    assert json.loads(dumps(grid)) == grid
    sliced = evaluate_slice(area(), x, metrics, CRITERIA)
    assert len(sliced["status"]) == x["n"]
    for i, r in enumerate(sliced["axis"]["coordinates"]):
        s = area()
        s["flow"]["r"] = r
        close(sliced["metrics"]["sa_fraction"][i], solve_state(s)["metrics"]["sa_fraction"])
    s["vo2_target_ml_min_m2"] = 1e5
    impossible = evaluate_grid(s, x, y, metrics, CRITERIA)
    assert impossible["masked_count"] == 35
    assert all(value is None for row in impossible["metrics"]["sa_fraction"] for value in row)


def test_state_and_grid_output_schemas_reject_wrong_units_and_nonfinite():
    import jsonschema

    for case in GOLDEN + AHMED:
        state = solve_state(case["scenario"], CRITERIA)
        schema = json.loads(
            (ROOT / "schemas" / (state["schema_version"] + ".schema.json")).read_text()
        )
        jsonschema.Draft202012Validator.check_schema(schema)
        jsonschema.validate(state, schema)
        wrong = copy.deepcopy(state)
        wrong["units"]["ca_ml_dl"] = "g/dL"
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(wrong, schema)
    for scenario in [baseline(), area()]:
        x = dict(parameter="capacity.hb_g_dl", min=5, max=20, n=3, scale="linear")
        y = dict(parameter="spv_fraction", min=0, max=1, n=4, scale="linear")
        grid = evaluate_grid(scenario, x, y, ["sa_fraction"])
        schema = json.loads(
            (ROOT / "schemas" / (grid["schema_version"] + ".schema.json")).read_text()
        )
        jsonschema.validate(grid, schema)
        wrong = copy.deepcopy(grid)
        wrong["orientation"] = "x,y"
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(wrong, schema)
        wrong = copy.deepcopy(grid)
        wrong["metrics"][
            "do2_ml_min_m2" if scenario["schema_version"] == "scenario-v1" else "do2_ml_kg_min"
        ] = [[1] * 3] * 4
        with pytest.raises(jsonschema.ValidationError):
            jsonschema.validate(wrong, schema)


def test_comparisons_masking_decomposition_and_explicit_conversion():
    from parallel_o2.comparison import compare_states

    a, b = baseline(), baseline()
    b["capacity"]["hb_g_dl"] = 14
    result = compare_states(a, b)
    close(result["deltas"]["do2_ml_kg_min"]["absolute"], 10.5056)
    close(result["deltas"]["pulmonary_net_add_ml_kg_min"]["absolute"], 0)
    close(result["decomposition"]["log_residual"], 0)
    assert result["changed_inputs"] == {"capacity.hb_g_dl": {"a": 10, "b": 14}}
    b["capacity"]["kappa_ml_o2_g_hb"] = 1.38
    out = compare_states(a, b)
    close(out["decomposition"]["log_residual"], 0)
    close(out["decomposition"]["multiplicative_factors"]["kappa"], 1.38 / 1.34)
    b["vo2_target_ml_kg_min"] = 50
    out = compare_states(a, b)
    assert out["status"] == "masked_endpoint"
    assert out["decomposition"] is None
    assert all(d["absolute"] is None for d in out["deltas"].values())
    with pytest.raises(InputError):
        compare_states(a, convert_indexing(a, 4, 0.25))


def test_slice_validation_and_no_source_verification_invention():
    for axis in [
        None,
        {},
        dict(parameter="flow.r", min=1, max=2, n=3, scale="linear"),
        dict(parameter="spv_fraction", min=0, max=1, n=100000000, scale="linear"),
    ]:
        with pytest.raises(InputError):
            evaluate_slice(baseline(), axis)
    claims = json.loads((ROOT / "verification/ahmed_source_claims.json").read_text())
    assert claims["evidence_access"] == "abstract_and_bibliography_only"
    assert claims["app_assumptions"] == dict(kappa=1.34, spv=0.98, r_representative_exact=1)
    assert "kappa" in claims["unverified_fields"] and "spv" in claims["unverified_fields"]
    assert "figure_inventory" in claims["unverified_fields"]
    assert claims["full_text_replication_status"] == "blocked_source_unavailable"
    assert "derived" in claims["note"]


def test_ratio_tangent_and_strict_tolerance_neighbors():
    custom = dict(
        schema_version="criteria-v1",
        id="test-50-25",
        sa_lower_fraction=0.5,
        sv_lower_fraction=0.25,
        comparison="strict_greater_than",
        origin="user_selected",
    )
    s = flow_mode(baseline(), "total_ratio")
    s.update(
        capacity=dict(mode="direct_capacity", capacity_ml_dl=16),
        spv_fraction=0.75,
        vo2_target_ml_kg_min=8,
    )
    tangent = criterion_ratio_interval(s, custom)
    assert tangent["empty_reason"] == "venous_tangent_only"
    s["vo2_target_ml_kg_min"] *= 1 - 1e-5
    assert criterion_ratio_interval(s, custom)["status"] == "finite"
    equality = criterion_boundary(area(), CRITERIA)["equality_state"]
    for offset, status in [(0, "on"), (0.5e-10, "on"), (2e-10, "above"), (-2e-10, "below")]:
        trial = copy.deepcopy(equality)
        trial["metrics"]["sa_fraction"] = 0.7 + offset
        assert assess_criteria(trial, CRITERIA)["arterial"] == status


def test_fixed_total_ratio_increasing_saturation_and_conditional_delivery():
    s = flow_mode(baseline(), "total_ratio")
    states = []
    for r in [0.4, 0.6, 1, 2, 4]:
        s["flow"]["r"] = r
        states.append(solve_state(s))
    assert all(st["status"] == "admissible" for st in states)
    sats = [st["metrics"]["sa_fraction"] for st in states]
    assert sats == sorted(sats)
    delivery = [st["metrics"]["do2_ml_kg_min"] for st in states]
    assert delivery[1] > delivery[0]
    assert delivery[1] > delivery[2] > delivery[3] > delivery[4]


def test_tiny_demand_lost_in_roundoff_is_diagnostic_failure():
    s = baseline()
    s["vo2_target_ml_kg_min"] = 1e-310
    out = solve_state(s)
    assert out["status"] == "numerical_failure"
    assert out["metrics"]["sa_fraction"] is None
