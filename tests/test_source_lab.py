"""Source UI never substitutes preserved expected values for production calculations."""

import json
import re
from pathlib import Path

import pytest

from parallel_o2.commands import dispatch
from parallel_o2.inputs import InputError
from parallel_o2.source_lab import metadata, source_report

ROOT = Path(__file__).resolve().parents[1]


def test_packaged_metadata_is_exact_source_subset():
    for name, path in [
        ("ahmed", "verification/ahmed_source_claims.json"),
        ("savorgnan", "verification/savorgnan_source_claims.json"),
        ("profiles", "config/resistance_profiles.json"),
    ]:
        assert metadata(name) == json.loads((ROOT / path).read_text())
    original = json.loads((ROOT / "verification/paper_landmarks.json").read_text())
    original["landmarks"] = [
        {
            k: v
            for k, v in r.items()
            if k in ("source", "qt_ml_kg_min", "sa_fraction", "sv_fraction")
            or k.startswith("reported_")
        }
        for r in original["landmarks"]
    ]
    assert metadata("barnea") == original
    assert "computed_" not in json.dumps(metadata("barnea"))
    text = (ROOT / "docs/10_SAVORGNAN_SOURCE_AUDIT.md").read_text()
    for entry in metadata("discrepancies"):
        match = re.search(r"### " + entry["id"] + r".*?(?=\n### |\n## |\Z)", text, re.S)
        assert match and match[0].split("\n", 1)[1].strip() == entry["text"]
    assert len(metadata("discrepancies")) == 9
    text = (ROOT / "docs/05_PAPER_RECONSTRUCTION.md").read_text()
    for entry in metadata("barnea_discrepancies"):
        match = re.search(r"### " + entry["id"] + r".*?(?=\n### |\n## |\Z)", text, re.S)
        assert match and match[0].split("\n", 1)[1].strip() == entry["text"]
    assert len(metadata("barnea_discrepancies")) == 6


def test_source_table3_rounding_and_table1_mismatches_preserved():
    report = source_report("savorgnan")
    nominal = [r for r in report["tables"]["table3"] if r["closure"] == "nominal_parallel"]
    assert len(nominal) == 25
    assert all(r["comparison_status"] == "within_reported_rounding" for r in nominal)
    sats = [
        r
        for r in report["tables"]["table1"]
        if r["scope"] == "whole_pathway_audit" and r["quantity"] == "sa_fraction"
    ]
    assert any(r["comparison_status"] == "discrepant_under_declared_assumptions" for r in sats)
    assert len(report["ablations"]) == 10
    for a in report["ablations"]:
        cells = a["result"]["cells"]
        assert len(cells) == 4
        assert {(c["alpha"], c["nonlinear_fraction"]) for c in cells} == {
            (0, 0),
            (0.35, 0),
            (0, 0.5),
            (0.35, 0.5),
        }


def test_ahmed_assumptions_and_separate_criteria():
    report = source_report("ahmed")
    assert report["source_status"] == "blocked_source_unavailable"
    hb13 = report["examples"][1]["state"]
    assert hb13["metrics"]["sa_fraction"] < 0.7
    assert hb13["metrics"]["sv_fraction"] > 0.4
    assert report["claims"]["app_assumptions"] == dict(
        kappa=1.34, spv=0.98, r_representative_exact=1
    )


@pytest.mark.parametrize("convention", ["P-stated-capacity", "P-formula-capacity"])
def test_barnea_source_dispatch(convention):
    report = dispatch(
        dict(
            schema_version="engine-command-v1",
            operation="source_report",
            arguments=dict(source="barnea", convention=convention),
        )
    )
    assert report["rows"][-2]["reported_value"] == 22
    assert report["rows"][-2]["computed_value"] == pytest.approx(20.7)
    assert report["rows"][-1]["comparison_status"] == "not_uniquely_specified"
    assert any(
        r["comparison_status"] == "discrepant_under_declared_assumptions" for r in report["rows"]
    )


def test_source_names_bounded():
    with pytest.raises(InputError):
        source_report("../../fixture")


def test_inverse_map_preserves_denominator_order_and_invalid_mask():
    from parallel_o2.derived import inverse_ratio
    from parallel_o2.paper import inverse_error_map

    result = inverse_error_map(n=21)
    for yi, sa in enumerate(result["y"]):
        for xi, assumed in enumerate(result["x"]):
            if result["status"][yi][xi] != "finite":
                assert result["metrics"]["relative_error_vs_true"][yi][xi] is None
                continue
            expected = inverse_ratio(sa, 0.45, 0.96, assumed)
            for key in result["metrics"]:
                assert result["metrics"][key][yi][xi] == expected[key]
    assert result["masked_count"] > 0
    for args in [dict(sv=0.97), dict(n=True), dict(n=202), dict(spv_true=float("nan"))]:
        with pytest.raises(InputError):
            inverse_error_map(**args)


def test_source_reporting_return_values_cannot_mutate_future_reports():
    a = source_report("ahmed")
    a["claims"]["app_assumptions"]["spv"] = 0.4
    assert source_report("ahmed")["claims"]["app_assumptions"]["spv"] == 0.98
