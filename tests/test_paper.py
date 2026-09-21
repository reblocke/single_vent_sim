"""Reconstructed source curves retain branches, masks and independent discrepancies."""

import json
from pathlib import Path

import numpy as np
import pytest

from parallel_o2.inputs import InputError
from parallel_o2.paper import (
    CAPACITY_CONVENTIONS,
    FIGURES,
    inverse_error_demo,
    paper_curves,
    source_landmarks,
)

ROOT = Path(__file__).resolve().parents[1]
LANDMARKS = json.loads((ROOT / "verification/paper_landmarks.json").read_text())


@pytest.mark.parametrize("figure", FIGURES)
@pytest.mark.parametrize("convention", CAPACITY_CONVENTIONS)
def test_paper_curves_preserve_parameter_order_masks_and_definition(figure, convention):
    data = paper_curves(figure, convention)
    assert data["n"] == 4001
    assert data["spv_assumption"] == 0.96
    assert data["raw_audit"] is False
    for curve in data["curves"]:
        assert len(curve["x"]) == len(curve["y"]) == 4001
        assert all(a < b for a, b in zip(curve["r"][:-1], curve["r"][1:], strict=True))
        assert curve["exact_r1"]["metrics"]["r"] == 1
        assert curve["conditional_optimum"]["do2_maximum"]["state"]["status"] == "admissible"
        assert curve["masked_count"] == sum(v is None for v in curve["y"])
        for x, y, status in zip(curve["x"], curve["y"], curve["status"], strict=True):
            if status == "infeasible_requested_consumption":
                assert y is None
            elif figure in ("6", "7"):
                assert y == pytest.approx(x * curve["vo2_ml_kg_min"], rel=1e-12)
        if figure == "3":
            valid = np.array([v for v in curve["x"] if v is not None])
            differences = np.diff(valid)
            assert np.any(differences > 0) and np.any(differences < 0)


def test_source_landmarks_computed_fields_are_independent_and_discrepancies_visible():
    rows = source_landmarks(LANDMARKS)
    computed = [row for row in rows if row["reported_quantity"] == "do2_ml_kg_min"]
    expected = [row["computed_do2_ml_kg_min"] for row in LANDMARKS["landmarks"]]
    assert len(computed) == len(expected)
    for row, target in zip(computed, expected, strict=True):
        assert row["computed_value"] == pytest.approx(target, rel=1e-10)
    capacity = next(row for row in rows if row["reported_quantity"] == "capacity_ml_dl")
    assert capacity["reported_value"] == 22
    assert capacity["computed_value"] == pytest.approx(20.7)
    assert capacity["comparison_status"] == "discrepant_under_declared_assumptions"
    high_peak = next(
        row
        for row in rows
        if row["reported_quantity"] == "sa_fraction" and row["reported_value"] == 0.64
    )
    assert high_peak["computed_value"] == pytest.approx(0.6645804216496014)
    assert high_peak["comparison_status"] == "discrepant_under_declared_assumptions"
    alternative = source_landmarks(LANDMARKS, "P-formula-capacity")
    assert alternative[0]["computed_value"] != rows[0]["computed_value"]
    modified = json.loads(json.dumps(LANDMARKS))
    for record in modified["landmarks"]:
        for key in list(record):
            if key.startswith("computed_"):
                record[key] = -999
    assert source_landmarks(modified) == rows  # supplied computed fields never drive production


def test_inverse_errors_keep_distinct_denominators_and_explicit_raw_audit():
    examples = inverse_error_demo()["examples"]
    assert examples[-1]["r_true"] == pytest.approx(3.1067961165048543)
    assert examples[-1]["r_est"] == pytest.approx(1.6842105263157894)
    assert examples[-1]["relative_error_vs_true"] == pytest.approx(-0.457894736842)
    assert examples[-1]["true_excess_over_est"] == pytest.approx(0.844660194175)
    raw = paper_curves("5A", n=31, raw_audit=True)
    assert raw["raw_warning"]
    c = raw["curves"][0]
    assert any(v < 0 for v in c["raw_algebraic_metrics"]["cv_ml_dl"])
    assert any(v is None for v in c["metrics"]["cv_ml_dl"])
    for n in (0, 4002, True):
        with pytest.raises(InputError):
            paper_curves("3", n=n)


def test_report_refuses_nonempty_and_authoritative_paths(tmp_path):
    import importlib.util

    spec = importlib.util.spec_from_file_location(
        "production_report", ROOT / "scripts/science_report.py"
    )
    report = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(report)
    report.ROOT = tmp_path
    (tmp_path / "reports/existing").mkdir(parents=True)
    (tmp_path / "reports/existing/evidence.json").write_text("{}")
    for path in (
        "docs/accidental",
        "src/accidental",
        "reports/existing",
        "reports/../verification",
    ):
        with pytest.raises(ValueError):
            report.safe_output(path, "reproduce")
    assert report.safe_output("reports/new", "reproduce").is_dir()
    assert (tmp_path / "reports/existing/evidence.json").read_text() == "{}"
