"""Paired ensemble independence, accounting, replay and bounded session checks."""

import copy
import importlib.util
from pathlib import Path

import numpy as np
import pytest

from parallel_o2.ensemble import (
    EnsembleJob,
    draw_csv,
    evaluate_pairs,
    generate_draws,
    summarize,
    validate_draws,
)
from parallel_o2.ensemble_session import ensemble_command
from parallel_o2.inputs import InputError
from parallel_o2.source_lab import metadata

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "ensemble_oracle", ROOT / "verification/resistance_reference.py"
)
ORACLE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ORACLE)


def test_vectorized_pairs_against_independent_scalar_reference():
    draws = generate_draws(37, 92422)
    actual = evaluate_pairs(validate_draws(draws))["results"]
    for i, row in enumerate(draws):
        for j, p in enumerate(metadata("profiles")["profiles"]):
            for k, v in enumerate(metadata("ensemble")["variants"]):
                c = ORACLE.example()
                rho = row["native_reference_share"]
                c["reference"].update(
                    qt_l_min=row["qt0_l_min"],
                    rp_mmhg_min_l=40 * rho,
                    rshunt_nominal_mmhg_min_l=40 * (1 - rho),
                )
                c["response"].update(alpha=v["alpha"], nonlinear_fraction=v["f"])
                c["perturbation"].update(
                    rs_multiplier=1 + p["delta_rs_fraction"] * row["systemic_effect_multiplier"],
                    rp_multiplier=1
                    + p["delta_native_rp_fraction"] * row["pulmonary_effect_multiplier"],
                )
                expected = ORACLE.compare(c)
                got = actual[j * 4 + k]
                assert (got["status"][i] == 0) == expected["eligible_pair"]
                assert got["delta_delivery_percent"][i] == pytest.approx(
                    expected["delta_percent"], abs=2e-10
                )
                assert got["baseline_sa"][i] == pytest.approx(
                    expected["baseline"]["oxygen"]["metrics"]["sa_fraction"], abs=2e-12
                )
    assert np.ptp(actual[0]["baseline_sa"]) > 0.01


def test_default_full_ensemble_replay_and_counts():
    first = EnsembleJob()
    while first.completed < first.n:
        first.step()
    assert first.report()["paired_evaluations"] == 400000
    rows = [
        dict(
            zip(
                (
                    "draw_id",
                    "qt0_l_min",
                    "native_reference_share",
                    "systemic_effect_multiplier",
                    "pulmonary_effect_multiplier",
                ),
                [int(row[0]), *row[1:]],
                strict=True,
            )
        )
        for row in first.values.tolist()
    ]
    replay = EnsembleJob(rows=rows)
    while replay.completed < replay.n:
        replay.step(733)
    assert first.report()["summaries"] == replay.report()["summaries"]
    assert first.draw_sha256 == replay.draw_sha256
    assert np.array_equal(first.status, replay.status)
    np.testing.assert_array_equal(first.delta, replay.delta)
    assert replay.report()["seed"] is None and replay.report()["replay"]
    for summary in first.report()["summaries"]:
        assert (
            sum(
                summary[k]
                for k in (
                    "n_eligible",
                    "n_oxygen_infeasible",
                    "n_invalid_input",
                    "n_numerical_failure",
                )
            )
            == 20000
        )
        assert (
            summary["quantiles_delta_percent"]["p025"]
            <= summary["quantiles_delta_percent"]["p50"]
            <= summary["quantiles_delta_percent"]["p975"]
        )


def test_unclassified_counts_bounds_boundary_and_no_imputed_effects():
    status = np.asarray([0, 0, 1, 2, 3, 4], dtype=np.uint8)
    delta = np.asarray([-2.0, 1.0, np.nan, np.nan, np.nan, np.nan])
    s = summarize(status, delta)
    assert s["n_requested"] == 6 and s["n_eligible"] == 2
    assert s["n_oxygen_infeasible"] == 2 and s["n_boundary"] == 1
    assert s["negative_fraction_lower_all_requested"] == 1 / 6
    assert s["negative_fraction_upper_unclassified"] == 5 / 6
    assert s["fraction_negative_among_eligible"] == 0.5
    assert s["monte_carlo_se_fraction"] == pytest.approx((0.25 / 2) ** 0.5)
    for code in (1, 2, 3, 4):
        s = summarize(np.array([code], dtype=np.uint8), np.array([np.nan]))
        assert s["quantiles_delta_percent"] is None and s["monte_carlo_se_fraction"] is None
    rows = generate_draws(2)
    rows[0]["qt0_l_min"] = 0.1
    rows[1]["systemic_effect_multiplier"] = 10
    p = evaluate_pairs(validate_draws(rows))["results"][0]
    assert p["status"].tolist() == [1, 2]
    assert np.isnan(p["delta_delivery_percent"]).all()


@pytest.mark.parametrize(
    "kwargs", [{"n": 0}, {"n": 100001}, {"n": True}, {"seed": -1}, {"seed": True}]
)
def test_bounds(kwargs):
    with pytest.raises(InputError):
        generate_draws(**kwargs)


def test_token_cursor_cancel_replay_and_duplicate_rejection():
    start = ensemble_command(dict(action="start", n=11, seed=4))
    token = start["token"]
    with pytest.raises(InputError):
        ensemble_command(dict(action="report", token=token))
    with pytest.raises(InputError):
        ensemble_command(dict(action="step", token=token, start=1))
    result = ensemble_command(dict(action="step", token=token, start=0))
    assert result["finished"]
    report = ensemble_command(dict(action="report", token=token))
    exported = ensemble_command(dict(action="export", token=token, start=0))
    assert len(exported["paired_results_csv"].splitlines()) == 221
    replay = ensemble_command(dict(action="replay_start", n=11))
    new = replay["token"]
    with pytest.raises(InputError):
        ensemble_command(dict(action="step", token=token, start=0))
    ensemble_command(dict(action="replay_append", token=new, start=0, text=exported["draws_csv"]))
    ensemble_command(dict(action="step", token=new, start=0))
    rereport = ensemble_command(dict(action="report", token=new))
    assert rereport["draw_sha256"] == report["draw_sha256"]
    assert rereport["summaries"] == report["summaries"]
    ensemble_command(dict(action="cancel", token=new))
    with pytest.raises(InputError):
        ensemble_command(dict(action="step", token=new, start=0))
    replay = ensemble_command(dict(action="replay_start", n=2))
    new = replay["token"]
    rows = generate_draws(1)
    text = draw_csv(validate_draws(rows))
    ensemble_command(dict(action="replay_append", token=new, start=0, text=text))
    with pytest.raises(InputError):
        ensemble_command(dict(action="replay_append", token=new, start=1, text=text))
    duplicate = [rows[0], copy.deepcopy(rows[0])]
    with pytest.raises(InputError):
        validate_draws(duplicate)


def test_extreme_replay_remains_finite_serializable_and_does_not_impute():
    from parallel_o2.serialization import dumps

    rows = generate_draws(2)
    for row in rows:
        row["qt0_l_min"] = 1e300
    job = EnsembleJob(rows=rows)
    job.step()
    report = job.report()
    assert "NaN" not in dumps(report)
    assert report["baseline_saturation_range"]["sa"] is None
    for s in report["summaries"]:
        assert s["n_eligible"] == 0 and s["n_numerical_failure"] == 2


def test_ensemble_preview_is_bounded_and_export_provenance_is_explicit():
    from parallel_o2.commands import dispatch

    command = dict(
        schema_version="engine-command-v1",
        operation="ensemble_preview",
        arguments=dict(n=3, seed=4),
    )
    report = dispatch(command)["report"]
    assert report["oxygen_mode"] == "normalized_source"
    assert report["perturbation_scope"] == "native_rp"
    assert len(report["profile_definitions"]["profiles"]) == 5
    assert report["sampling_assumption_record"]["version"] == "declared-demonstration-v1"
    for n in (201, True, 0):
        command["arguments"]["n"] = n
        with pytest.raises(InputError):
            dispatch(command)
