"""Published preset checkpoints and paired-ledger invariants, independent of rendering."""

import pytest

from parallel_o2.comparison_presets import comparison_preset
from parallel_o2.inputs import InputError


@pytest.mark.parametrize(
    "name,expected",
    [
        ("C1", (20.264, 30.7696, 6, 6)),
        ("C2", (10.132, 20.264, 6, 6)),
        ("C3", (34.2, 14.604545454545455, 9, 9)),
        ("C4", (20.264, 17.264, 6, 9)),
        ("C5", (204.564, 401.544, 150, 150)),
        ("C6", (204.564, 381.846, 150, 150)),
        ("C7", (401.544, 351.544, 150, 200)),
        ("C11", (128.64, 155.172, 30.552, 30.552)),
    ],
)
def test_declared_independent_checkpoints(name, expected):
    result = comparison_preset(name)
    a, b = (result["comparison"]["budgets"][k]["values"] for k in ("a", "b"))
    assert (a["delivery"], b["delivery"], a["net_uptake"], b["net_uptake"]) == pytest.approx(
        expected, abs=1e-9
    )


@pytest.mark.parametrize("name", ["C" + str(i) for i in range(1, 13)])
def test_all_presets_have_consistent_budgets_and_explicit_changes(name):
    result = comparison_preset(name)
    c = result["comparison"]
    assert c["changed_inputs"]
    assert c["unchanged_inputs"]
    assert c["budgets"]["a"]["unit"] == c["budgets"]["b"]["unit"]
    for budget in c["budgets"].values():
        v = budget["values"]
        assert budget["eligible"]
        assert v["delivery"] == pytest.approx(v["consumption"] + v["systemic_return"], abs=1e-9)
        assert v["pulmonary_out"] == pytest.approx(v["pulmonary_in"] + v["net_uptake"], abs=1e-9)
        assert v["net_uptake"] == pytest.approx(v["consumption"], abs=1e-9)
    if c["decomposition"]:
        assert abs(c["decomposition"]["log_residual"]) < 1e-12


def test_c8_c9_c10_c12_preserve_semantics():
    r = comparison_preset("C8")["comparison"]
    assert r["a"]["scope"] == "native_rp"
    assert r["b"]["scope"] == "whole_pathway_audit"
    assert r["a"]["reference_sha256"] == r["b"]["reference_sha256"]
    r = comparison_preset("C9")
    assert len(r["ablation"]["cells"]) == 4
    assert all(
        cell["comparison"]["a"]["scope"] == cell["comparison"]["b"]["scope"] == "native_rp"
        for cell in r["ablation"]["cells"]
    )
    r = comparison_preset("C10")["comparison"]
    assert r["a"]["closure"] == "nominal_parallel"
    assert r["b"]["closure"] == "circuit_secant"
    r = comparison_preset("C12")["comparison"]
    assert r["a"]["reference_sha256"] == r["b"]["reference_sha256"]
    assert r["a"]["reference"]["rp_mmhg_min_l"] == 12


def test_unknown_preset_rejected():
    with pytest.raises(InputError):
        comparison_preset("patient_target")


def test_custom_rejects_cross_basis_or_oxygen_mode_and_preserves_criteria():
    from copy import deepcopy

    from parallel_o2.comparison_presets import baseline, comparison_custom, resistance_baseline

    with pytest.raises(InputError, match="Cross-basis"):
        comparison_custom(baseline(), baseline(True))
    a = resistance_baseline()
    b = deepcopy(a)
    b["oxygen"] = dict(
        mode="physical", hb_g_dl=12, kappa_ml_o2_g_hb=1.34, vo2_ml_min=30.552, spv_fraction=0.99
    )
    with pytest.raises(InputError, match="same explicit oxygen mode"):
        comparison_custom(a, b, True)
    first = comparison_preset("C1")
    first["comparison"]["criteria"]["sa_lower_fraction"] = 0.9
    assert comparison_preset("C1")["comparison"]["criteria"]["sa_lower_fraction"] == 0.7


def test_masked_custom_budget_never_gets_improvement_deltas():
    from parallel_o2.comparison_presets import baseline, comparison_custom

    a = baseline()
    b = baseline()
    b["vo2_target_ml_kg_min"] = 100
    result = comparison_custom(a, b)
    assert result["status"] == "masked_endpoint"
    assert not result["budgets"]["b"]["eligible"]
    assert all(d["absolute"] is None for d in result["deltas"].values())
    assert result["b"]["criterion_result"]["status"] == "not_evaluable"


def test_custom_comparison_preserves_each_pins_selected_criteria():
    from copy import deepcopy

    from parallel_o2.comparison_presets import CRITERIA, baseline, comparison_custom

    a, b = baseline(), baseline()
    selected = deepcopy(CRITERIA)
    selected.update(sa_lower_fraction=0.9, origin="user_selected", id="user-selected")
    selected.pop("source_id")
    result = comparison_custom(a, b, criteria_a=selected, criteria_b=CRITERIA)
    assert result["a"]["criterion_result"]["arterial"] == "below"
    assert result["b"]["criterion_result"]["arterial"] == "above"
    assert result["criteria"] is None
    assert result["criteria_by_state"]["a"] == selected
    assert all(r["absolute"] == 0 for r in result["deltas"].values() if r["absolute"] is not None)
