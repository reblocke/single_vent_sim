"""Import contracts preserve units/criteria and reject unsafe or ambiguous settings."""

import json
from copy import deepcopy

import pytest

from parallel_o2.comparison_presets import CRITERIA, baseline, resistance_baseline
from parallel_o2.inputs import InputError
from parallel_o2.ui_state import validate_ui_state


def state():
    return {
        "schema_version": "parallel-o2-ui-state-v1",
        "view": "explore",
        "provider": "prescribed",
        "settings": {
            "preset": "E1",
            "kind": None,
            "display_modes": ["continuous", "continuous"],
            "base": {**baseline(), "flow": {"mode": "total_ratio", "qt_ml_kg_min": 400, "r": 1}},
            "x": {
                "parameter": "capacity.hb_g_dl",
                "min": 6,
                "max": 20,
                "n": 201,
                "scale": "linear",
            },
            "y": {"parameter": "flow.r", "min": 0.2, "max": 4, "n": 201, "scale": "log"},
            "metrics": ["sa_fraction", "do2_ml_kg_min"],
            "selected": {"x": 12.3456789012345, "y": 1.23},
            "scales": [[0, 100], [0, 50]],
            "criteria": deepcopy(CRITERIA),
            "contour": "criteria",
            "overlays": ["ratio_1"],
            "slice_visible": False,
            "slice_axis": "x",
            "slice_objectives": False,
            "mass_kg": None,
            "bsa_m2": None,
            "pins": {},
        },
    }


def test_roundtrip_and_selected_configuration():
    value = state()
    # Input remains untouched, including full precision, log coordinates and source criteria.
    assert validate_ui_state(json.dumps(value), True)["settings"] == value["settings"]
    assert validate_ui_state(json.dumps(value))["presentation"] == {
        "question": "hemoglobin",
        "mode": "map",
    }
    legacy = deepcopy(value)
    legacy["settings"].pop("display_modes")
    assert validate_ui_state(json.dumps(legacy))["settings"] == value["settings"]
    returned = validate_ui_state(json.dumps(value))
    returned["settings"]["base"]["capacity"]["hb_g_dl"] = 99
    assert value["settings"]["base"]["capacity"]["hb_g_dl"] != 99


@pytest.mark.parametrize(
    "path,value",
    [
        (("x", "n"), 402),
        (("x", "n"), True),
        (("x", "min"), -1),
        (("y", "parameter"), "flow.qt_l_min_m2"),
        (("selected", "x"), 0),
        (("selected", "y"), -1),
        (("criteria", "origin"), "source_verified"),
        (("criteria", "sa_lower_fraction"), 0.8),
    ],
)
def test_invalid_nested_fields(path, value):
    obj = state()
    obj["settings"][path[0]][path[1]] = value
    with pytest.raises((InputError, ValueError)):
        validate_ui_state(json.dumps(obj))


@pytest.mark.parametrize(
    "field,value",
    [
        ("kind", "hb_gain"),
        ("preset", "H99"),
        ("overlays", [{}]),
        ("overlays", ["ratio_1", "ratio_1"]),
        ("scales", [[100, 0], [0, 1]]),
        ("mass_kg", 0),
        ("metrics", ["sa_fraction", "do2_ml_min_m2"]),
        ("contour", "<script>"),
        ("slice_objectives", 1),
    ],
)
def test_invalid_controls(field, value):
    obj = state()
    obj["settings"][field] = value
    with pytest.raises((InputError, ValueError)):
        validate_ui_state(json.dumps(obj))


def test_malformed_size_nonfinite_duplicates_and_prose():
    for text in [
        "[]",
        '{"schema_version":1,"schema_version":2}',
        json.dumps(state()).replace("12.3456789012345", "NaN"),
        " " * 1048577,
    ]:
        with pytest.raises((InputError, ValueError)):
            validate_ui_state(text)
    with pytest.raises(InputError):
        validate_ui_state(" " * 16385, True)
    obj = state()
    obj["settings"]["notes"] = "private prose"
    with pytest.raises(InputError):
        validate_ui_state(json.dumps(obj))
    obj["settings"] = []
    with pytest.raises(InputError):
        validate_ui_state(json.dumps(obj))


def test_custom_comparison_rejects_cross_basis_and_false_source_origin():
    a, b = baseline(), baseline(True)
    obj = {
        "schema_version": "parallel-o2-ui-state-v1",
        "view": "compare",
        "settings": {
            "mode": "pinned",
            "a": a,
            "b": b,
            "criteria_a": deepcopy(CRITERIA),
            "criteria_b": deepcopy(CRITERIA),
        },
    }
    with pytest.raises(InputError):
        validate_ui_state(json.dumps(obj))
    obj["settings"]["b"] = deepcopy(a)
    assert validate_ui_state(json.dumps(obj))["settings"] == obj["settings"]


def test_resistance_reference_and_policy_roundtrip():
    obj = state()
    obj["provider"] = "resistance"
    obj["settings"] = {
        "preset": "R1",
        "request": resistance_baseline(),
        "x": {
            "parameter": "perturbation.rs_multiplier",
            "min": 0.5,
            "max": 1.25,
            "n": 201,
            "scale": "linear",
        },
        "y": {
            "parameter": "perturbation.rp_multiplier",
            "min": 0.1,
            "max": 1.5,
            "n": 201,
            "scale": "linear",
        },
        "selected": {"x": 1, "y": 0.55},
        "metrics": ["sa_fraction", "relative_delivery_index_l_min_change"],
        "scales": [[0, 100], [-50, 50]],
        "policy": "frozen_reference",
        "local_rp_multiplier": 0.55,
    }
    assert validate_ui_state(json.dumps(obj))["settings"] == obj["settings"]
    obj["settings"]["policy"] = "local_response"
    with pytest.raises(InputError):
        validate_ui_state(json.dumps(obj))


def test_presentation_v2_one_change_and_legacy_migration():
    original = state()
    migrated = validate_ui_state(json.dumps(original))
    assert migrated["schema_version"] == "parallel-o2-ui-state-v2"
    assert migrated["settings"] == original["settings"]
    assert validate_ui_state(json.dumps(migrated)) == migrated
    migrated["presentation"] = {
        "question": "hemoglobin",
        "mode": "one_change",
        "one_change": {
            "a": baseline(),
            "parameter": "capacity.hb_g_dl",
            "target": 14,
            "axis": original["settings"]["x"],
            "criteria": deepcopy(CRITERIA),
        },
    }
    migrated["drafts"] = {"prescribed": original["settings"]}
    assert validate_ui_state(json.dumps(migrated), True) == migrated
    for key, value in [("question", "free text"), ("mode", "unknown")]:
        invalid = deepcopy(migrated)
        invalid["presentation"][key] = value
        with pytest.raises(InputError):
            validate_ui_state(json.dumps(invalid))
    for key, value in [
        ("axis", []),
        ("target", float("inf")),
        ("parameter", "flow.not_independent"),
    ]:
        invalid = deepcopy(migrated)
        invalid["presentation"]["one_change"][key] = value
        with pytest.raises((InputError, ValueError)):
            validate_ui_state(json.dumps(invalid))


def test_route_manifest_is_complete_and_unique():
    from importlib.resources import files

    registry = json.loads(files("parallel_o2").joinpath("data/presentation.json").read_text())
    variants = [v for q in registry["questions"] for v in q["variants"]]
    expected = [
        f"{p}{i}" for p, n in [("E", 5), ("H", 4), ("R", 6), ("C", 12)] for i in range(1, n + 1)
    ]
    assert sorted(variants) == sorted(expected)
    assert sorted(registry["laboratory_routes"]) == ["ahmed", "barnea", "inverse", "savorgnan"]


def test_issue_teaching_values_are_independent_expectations():
    from pathlib import Path

    from parallel_o2.model import solve_state

    fixture = json.loads((Path(__file__).parent / "data/ui_teaching.json").read_text())
    for expected in fixture["states"]:
        scenario = baseline()
        scenario["capacity"]["hb_g_dl"] = expected["hb"]
        scenario["flow"].update(qp_ml_kg_min=expected["qp"], qs_ml_kg_min=expected["qs"])
        scenario["vo2_target_ml_kg_min"] = expected["m"]
        metrics = solve_state(scenario)["metrics"]
        assert metrics["sa_fraction"] * 100 == pytest.approx(expected["sa_percent"], abs=1e-10)
        assert metrics["ca_ml_dl"] == pytest.approx(expected["ca"], abs=1e-12)
        assert metrics["do2_ml_kg_min"] == pytest.approx(expected["do2"], abs=1e-12)
        assert metrics["pulmonary_net_add_ml_kg_min"] == pytest.approx(expected["m"], abs=1e-12)
