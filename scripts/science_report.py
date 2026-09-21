#!/usr/bin/env python3
"""Reproduce production calculations and optionally execute their independent tests."""

import argparse
import hashlib
import json
import platform
import subprocess
import sys
import textwrap
import time
import xml.etree.ElementTree as ET
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np

from parallel_o2.criteria import criterion_boundary, criterion_ratio_interval
from parallel_o2.derived import conditional_optimum
from parallel_o2.flow_providers import solve_resistance_state
from parallel_o2.model import solve_state
from parallel_o2.paper import (
    CAPACITY_CONVENTIONS,
    FIGURES,
    inverse_error_demo,
    paper_curves,
    paper_scenario,
    source_landmarks,
)
from parallel_o2.resistance_experiments import compare_resistance_states, mechanism_ablation
from parallel_o2.serialization import csv_rows, dumps

ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> Any:
    return json.loads((ROOT / relative).read_text())


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(dumps(value) + "\n")


def safe_output(requested: str | None, prefix: str) -> Path:
    base = "artifacts" if prefix == "validate" else "reports"
    relative = requested or f"{base}/{prefix}-{datetime.now(UTC).strftime('%Y%m%dT%H%M%S%fZ')}"
    path = (ROOT / relative).resolve()
    if not any(path.is_relative_to(ROOT / allowed) for allowed in ("reports", "artifacts")):
        raise ValueError("Production reports must be written under reports/ or artifacts/")
    if path.exists() and any(path.iterdir()):
        raise ValueError("Output must be new or empty; previous reports are preserved")
    path.mkdir(parents=True, exist_ok=True)
    return path


def render_curve(data: dict[str, Any], folder: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    titles = {
        "2": "Arterial saturation does not uniquely determine delivery",
        "3": "One venous saturation can correspond to two delivery states",
        "4": "Saturation difference and delivery depend on flow allocation",
        "5A": "Delivery has a conditional maximum on a fixed-output slice",
        "6": "Delivery equals consumption × oxygen-excess factor",
        "7": "Changing consumption changes the delivery–excess relationship",
    }
    labels = {
        "2": "Arterial saturation, Sa (%)",
        "3": "Systemic venous saturation, Sv (%)",
        "4": "Sa − Sv (percentage points)",
        "5A": "Pulmonary/systemic flow ratio, Qp/Qs",
        "6": "Oxygen-excess factor, Ω (delivery/consumption)",
        "7": "Oxygen-excess factor, Ω (delivery/consumption)",
    }
    plt.rcParams.update(
        {
            "font.family": "DejaVu Sans",
            "font.size": 11,
            "axes.labelsize": 12,
            "axes.titlesize": 14,
            "svg.hashsalt": "parallel-o2-v1",
        }
    )
    fig, ax = plt.subplots(figsize=(9, 6.8))
    fig.subplots_adjust(left=0.12, right=0.97, bottom=0.26, top=0.80)
    for i, curve in enumerate(data["curves"]):
        color, style = (("#0072B2", "-"), ("#D55E00", "--"))[i]
        label = f"Qt {curve['qt_ml_kg_min']} mL/kg/min; M {curve['vo2_ml_kg_min']} mL O₂/kg/min"
        ax.plot(curve["x"], curve["y"], color=color, linestyle=style, linewidth=2.2, label=label)
        state = curve["exact_r1"]["metrics"]
        for marker, point in [
            ("o", state),
            ("D", curve["conditional_optimum"]["do2_maximum"]["state"]["metrics"]),
        ]:
            x = point[data["x_metric"]]
            if data["figure"] in ("2", "3", "4"):
                x *= 100
            ax.plot(
                x,
                point["do2_ml_kg_min"],
                marker=marker,
                color=color,
                markersize=6,
                markerfacecolor="white",
                markeredgewidth=1.5,
            )
    if data["figure"] == "5A":
        ax.set_xlim(0.2, 10)
        for i, curve in enumerate(data["curves"]):
            color = ("#0072B2", "#D55E00")[i]
            for edge in curve["conditional_optimum"]["admissible_interval"]:
                if 0.2 <= edge <= 10:
                    ax.axvline(edge, color=color, linestyle=":", alpha=0.6, linewidth=1)
    ax.set(xlabel=labels[data["figure"]], ylabel="Systemic oxygen delivery (mL O₂/kg/min)")
    ax.grid(alpha=0.2)
    ax.spines[["right", "top"]].set_visible(False)
    ax.legend(loc="lower left", bbox_to_anchor=(0, 1.01), frameon=False, fontsize=10)
    fig.suptitle(titles[data["figure"]], y=0.97, fontsize=15)
    caption = (
        f"Equation reconstruction of Barnea Figure {data['figure']}. "
        f"B={data['capacity_ml_dl']} mL O₂/dL ({data['capacity_convention']}); Spv=.96 assumed. "
        "Circles: exact r=1. Diamonds: conditional delivery maxima. "
        "Curves follow increasing r; segments requiring negative venous content are omitted. "
        "B is oxygen capacity; Spv is pulmonary venous saturation. "
        "Qt is total pulmonary + systemic blood flow; M is prescribed consumption."
    )
    if data["figure"] == "5A":
        caption += " Dotted lines: zero-venous-content limits within the displayed ratio range."
    fig.text(0.12, 0.025, textwrap.fill(caption, 111), fontsize=10, va="bottom")
    stem = f"barnea-figure-{data['figure']}"
    folder.mkdir(parents=True, exist_ok=True)
    fig.savefig(
        folder / f"{stem}.png",
        dpi=180,
        metadata={"Description": caption, "Software": "parallel_o2"},
    )
    fig.savefig(
        folder / f"{stem}.svg",
        metadata={"Date": None, "Creator": "parallel_o2", "Description": caption},
    )
    plt.close(fig)


def render_inverse(data: dict[str, Any], output: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    plt.rcParams["svg.hashsalt"] = "parallel-o2-v1"
    fig, axes = plt.subplots(1, 3, figsize=(12, 6.5), sharey=True)
    fig.subplots_adjust(left=0.09, right=0.97, bottom=0.26, top=0.78, wspace=0.15)
    for ax, curve in zip(axes, data["curves"], strict=True):
        values = curve["samples"]
        x = [row["spv_error_percentage_points"] for row in values]
        for key, label, color, style in [
            ("relative_error_vs_true", "Exact error relative to true", "#0072B2", "-"),
            ("local_relative_error", "Local sensitivity approximation", "#D55E00", "--"),
            ("true_excess_over_est", "True excess relative to estimate", "#555555", ":"),
        ]:
            ax.plot(
                x,
                [100 * row[key] for row in values],
                label=label,
                color=color,
                linestyle=style,
                linewidth=2,
            )
        ax.axhline(0, color="#888888", linewidth=0.7)
        ax.set_title(f"Arterial saturation {100 * curve['sa_fraction']:.0f}%", fontsize=12)
        ax.set_xlabel("Assumed − true Spv\n(percentage points)", fontsize=11)
        ax.grid(alpha=0.2)
        ax.spines[["right", "top"]].set_visible(False)
    axes[0].set_ylabel("Ratio error or excess (%)", fontsize=12)
    fig.suptitle(
        "Local sensitivity and finite ratio errors answer different questions", fontsize=15, y=0.98
    )
    fig.legend(
        *axes[0].get_legend_handles_labels(),
        loc="upper center",
        bbox_to_anchor=(0.5, 0.92),
        ncol=3,
        frameon=False,
        fontsize=10,
    )
    caption = (
        "Derived comparison accompanying Barnea Figure 5B. True pulmonary venous saturation "
        "(Spv)=.96 and systemic venous saturation=.45 are held fixed. Relative-error "
        "denominators differ; percentage points describe the endpoint input change. "
        "In the separate source example (Sa=.77, true Spv=.873, assumed Spv=.96), "
        "the estimate is 45.79% below the true ratio; the true ratio is 84.47% above the estimate."
    )
    fig.text(0.09, 0.025, textwrap.fill(caption, 151), fontsize=10, va="bottom")
    fig.savefig(
        output / "barnea-inverse-error.png",
        dpi=180,
        metadata={"Description": caption, "Software": "parallel_o2"},
    )
    fig.savefig(
        output / "barnea-inverse-error.svg",
        metadata={"Date": None, "Creator": "parallel_o2", "Description": caption},
    )
    plt.close(fig)


def savorgnan_tables(output: Path) -> dict[str, Any]:
    source = read("verification/savorgnan_source_claims.json")
    profiles = read("config/resistance_profiles.json")["profiles"]
    base = read("verification/savorgnan_golden_cases.json")["cases"][0]["scenario"]
    # Only source requests are used here; expected fixture values never drive calculations.
    tables: dict[str, list[dict[str, Any]]] = {"table1": [], "table3": []}
    ablations, effects = [], []
    for profile in profiles:
        for table, scope, closure in [
            ("table1", "native_rp", "nominal_parallel"),
            ("table1", "whole_pathway_audit", "nominal_parallel"),
            ("table3", "native_rp", "nominal_parallel"),
            ("table3", "native_rp", "circuit_secant"),
        ]:
            request = json.loads(dumps(base))
            request["response"].update(
                closure=closure,
                alpha=0 if table == "table1" else 0.35,
                nonlinear_fraction=0 if table == "table1" else 0.5,
            )
            request["perturbation"].update(
                scope=scope,
                rs_multiplier=1 + profile["delta_rs_fraction"],
                rp_multiplier=1 + profile["delta_native_rp_fraction"],
            )
            result = solve_resistance_state(request)
            computed = {
                **result["metrics"],
                "delta_delivery_percent": 100
                * (result["metrics"]["delivery_index_l_min"] / 0.8 - 1),
            }
            reported = next(row for row in source[table] if row["profile_id"] == profile["id"])
            for key, value in reported.items():
                if key == "profile_id" or key.startswith("delta_r") or value is None:
                    continue
                precision = (
                    0.1
                    if key == "delta_delivery_percent"
                    else 0.001
                    if table == "table3"
                    or key in ("sa_fraction", "sv_fraction", "delivery_index_l_min")
                    else 0.01
                )
                difference = computed[key] - value
                tables[table].append(
                    dict(
                        profile_id=profile["id"],
                        source_location=f"P3 {table}",
                        scope=scope,
                        closure=closure,
                        quantity=key,
                        reported_value=value,
                        computed_value=computed[key],
                        difference=difference,
                        reported_rounding_unit=precision,
                        comparison_status="within_reported_rounding"
                        if abs(difference) <= precision / 2
                        else "discrepant_under_declared_assumptions",
                    )
                )
        for closure in ("nominal_parallel", "circuit_secant"):
            request = json.loads(dumps(base))
            request["response"]["closure"] = closure
            request["perturbation"].update(
                rs_multiplier=1 + profile["delta_rs_fraction"],
                rp_multiplier=1 + profile["delta_native_rp_fraction"],
            )
            ablation = mechanism_ablation(request)
            write_json(output / f"tables/ablation-{profile['id']}-{closure}.json", ablation)
            for cell in ablation["cells"]:
                ablations.append(
                    dict(
                        profile_id=profile["id"],
                        closure=closure,
                        alpha=cell["alpha"],
                        nonlinear_fraction=cell["nonlinear_fraction"],
                        relative_index_change=cell["relative_index_change"],
                        interaction_relative_fraction=ablation["interaction_relative_fraction"],
                        scope="native_rp",
                    )
                )
            before = json.loads(dumps(request))
            before["perturbation"].update(rs_multiplier=1, rp_multiplier=1)
            for hundredths in range(126):
                effect = hundredths / 100
                after = json.loads(dumps(request))
                after["perturbation"].update(
                    rs_multiplier=1 + effect * profile["delta_rs_fraction"],
                    rp_multiplier=1 + effect * profile["delta_native_rp_fraction"],
                )
                paired = compare_resistance_states(before, after)
                effects.append(
                    dict(
                        profile_id=profile["id"],
                        closure=closure,
                        effect_multiplier=effect,
                        meaning="assumed effect multiplier; not dose or time",
                        scope="native_rp",
                        reference_sha256=paired["a"]["reference_sha256"],
                        relative_index_change=paired["deltas"]["delivery_index_l_min"]["relative"],
                        status=paired["status"],
                    )
                )
    for name, rows in {
        **tables,
        "mechanism_ablation": ablations,
        "effect_scale_curves": effects,
    }.items():
        (output / f"tables/{name}.csv").write_text(csv_rows(rows))
        write_json(output / f"tables/{name}.json", rows)
    return {
        "table1_saturation_discrepancies_preserved": sum(
            row["quantity"] == "sa_fraction"
            and row["scope"] == "whole_pathway_audit"
            and row["comparison_status"] != "within_reported_rounding"
            for row in tables["table1"]
        ),
        "table3_nominal_cells_within_rounding": sum(
            row["closure"] == "nominal_parallel"
            and row["comparison_status"] == "within_reported_rounding"
            for row in tables["table3"]
        ),
        "effect_curve_rows": len(effects),
        "ablation_cells": len(ablations),
    }


def reproduce(output: Path, plots: bool) -> dict[str, Any]:
    records = read("verification/paper_landmarks.json")
    curves = []
    for convention in CAPACITY_CONVENTIONS:
        folder = output / convention
        folder.mkdir(parents=True, exist_ok=True)
        for figure in FIGURES:
            data = paper_curves(figure, convention)
            write_json(folder / f"figure-{figure}.json", data)
            rows = []
            for curve in data["curves"]:
                for i, r in enumerate(curve["r"]):
                    rows.append(
                        dict(
                            qt_ml_kg_min=curve["qt_ml_kg_min"],
                            vo2_ml_kg_min=curve["vo2_ml_kg_min"],
                            parameter_index=i,
                            r=r,
                            x=curve["x"][i],
                            do2_ml_kg_min=curve["y"][i],
                            status=curve["status"][i],
                        )
                    )
                curves.append(
                    dict(
                        figure=figure,
                        convention=convention,
                        qt_ml_kg_min=curve["qt_ml_kg_min"],
                        vo2_ml_kg_min=curve["vo2_ml_kg_min"],
                        masked_count=curve["masked_count"],
                        admissible_ratio_interval=curve["conditional_optimum"][
                            "admissible_interval"
                        ],
                    )
                )
            (folder / f"figure-{figure}.csv").write_text(csv_rows(rows))
            if plots:
                render_curve(data, folder)
        rows = source_landmarks(records, convention)
        write_json(folder / "source_comparisons.json", rows)
        (folder / "source_comparisons.csv").write_text(csv_rows(rows))
    inverse = inverse_error_demo()
    write_json(output / "barnea-inverse-error.json", inverse)
    if plots:
        render_inverse(inverse, output)
    criteria = read("config/ahmed_criteria.json")
    ahmed = []
    for fixture in read("verification/ahmed_golden_cases.json")["cases"]:
        scenario = fixture["scenario"]
        state = solve_state(scenario, criteria)
        ahmed.append(
            dict(
                id=fixture["id"],
                source_status="abstract_scenario_consistency_only",
                app_assumptions=dict(kappa=1.34, spv=0.98),
                state=state,
                hb_boundary=criterion_boundary(scenario, criteria),
                flow_boundary=criterion_boundary(scenario, criteria, "total_flow"),
                demand_boundary=criterion_boundary(scenario, criteria, "vo2"),
                ratio_interval=criterion_ratio_interval(scenario, criteria),
            )
        )
    write_json(output / "ahmed-inspired.json", ahmed)
    source_status = read("docs/implementation/source-access-recheck.json")
    write_json(output / "source-status.json", source_status)
    tables = savorgnan_tables(output)
    return dict(
        barnea_curves=curves,
        savorgnan=tables,
        ahmed_examples=len(ahmed),
        figures_rendered=13 if plots else 0,
        source_scope=(
            "Equation reconstructions and assumption-labeled extensions; "
            "unresolved source statuses preserved"
        ),
    )


def validate_science(output: Path) -> dict[str, Any]:
    log = output / "pytest.log"
    with log.open("w") as handle:
        subprocess.run(
            [
                sys.executable,
                "-m",
                "pytest",
                str(ROOT / "tests"),
                f"--junitxml={output / 'pytest.xml'}",
            ],
            cwd=ROOT,
            stdout=handle,
            stderr=subprocess.STDOUT,
            check=True,
        )
    suites = ET.parse(output / "pytest.xml").getroot()
    counts = {
        key: sum(int(s.attrib.get(key, "0")) for s in suites.findall("testsuite"))
        for key in ("tests", "failures", "errors", "skipped")
    }
    tests = counts["tests"] - counts["failures"] - counts["errors"] - counts["skipped"]
    residuals: dict[str, float] = {}
    maximum = 0.0
    fixture_hashes = {}
    count = 0
    for path in (
        "verification/golden_cases.json",
        "verification/ahmed_golden_cases.json",
        "verification/savorgnan_golden_cases.json",
    ):
        fixture_hashes[path] = hashlib.sha256((ROOT / path).read_bytes()).hexdigest()
        for case in read(path)["cases"]:
            state = (
                solve_resistance_state(case["scenario"])
                if "resistance" in case["scenario"]["schema_version"]
                else solve_state(case["scenario"])
            )
            if state["status"] != case["expected_status"]:
                raise AssertionError(case["id"])
            for metric, expected in case.get(
                "expected", case.get("expected_algebraic_metrics", {})
            ).items():
                actual = state["audit"]["algebraic_metrics"][metric]
                if expected is None:
                    if actual is not None:
                        raise AssertionError((case["id"], metric))
                else:
                    error = abs(actual - expected) / max(1, abs(expected))
                    maximum = max(maximum, error)
                    if error > 1e-10:
                        raise AssertionError((case["id"], metric, error))
            for key, value in state["residuals"].items():
                residuals[key] = max(residuals.get(key, 0), abs(value))
            count += 1
    independent_optima = []
    for convention, capacity in CAPACITY_CONVENTIONS.items():
        for qt in (300, 450):
            lo, hi = 0.2, 10.0
            phi = (5**0.5 - 1) / 2

            def independent_delivery(r: float, qt: int = qt, capacity: float = capacity) -> float:
                qp = qt * r / (1 + r)
                qs = qt / (1 + r)
                return qs * (capacity * 0.96 - 900 / qp) / 100

            for _ in range(100):
                left, right = hi - phi * (hi - lo), lo + phi * (hi - lo)
                if independent_delivery(left) < independent_delivery(right):
                    lo = left
                else:
                    hi = right
            numerical = (lo + hi) / 2
            analytic = conditional_optimum(paper_scenario(qt=qt, convention=convention))[
                "do2_maximum"
            ]["r"]
            error = abs(analytic - numerical)
            if error > 1e-6:
                raise AssertionError(("optimum", convention, qt, error))
            independent_optima.append(
                dict(
                    convention=convention,
                    qt_ml_kg_min=qt,
                    analytic_r=analytic,
                    independent_search_r=numerical,
                    absolute_r_error=error,
                )
            )
    return dict(
        tests_passed=tests,
        pytest_counts=counts,
        independent_optima=independent_optima,
        fixture_cases=count,
        fixture_hashes=fixture_hashes,
        fixture_versions={
            path: read(path).get("fixture_version", read(path).get("schema_version"))
            for path in fixture_hashes
        },
        constants={
            "barnea_capacity_conventions": CAPACITY_CONVENTIONS,
            "barnea_spv_reconstruction_assumption": 0.96,
            "barnea_consumption_ml_kg_min": [9, 18],
            "barnea_total_flow_ml_kg_min": [300, 450],
            "barnea_ratio_range": [0.2, 10],
            "ahmed_app_assumptions": {"kappa": 1.34, "spv": 0.98},
            "selected_criteria": read("config/ahmed_criteria.json"),
            "resistance_reference": read("verification/savorgnan_source_claims.json")["baseline"],
            "resistance_reconstruction": read("verification/savorgnan_source_claims.json")[
                "inferred_reconstruction"
            ],
            "precision": "IEEE float64",
            "identity_relative_tolerance": 1e-10,
            "content_feasibility_tolerance_factor": 1e-12,
            "criterion_saturation_tolerance": 1e-10,
        },
        maximum_normalized_fixture_error=maximum,
        fixture_residual_maxima=residuals,
        scientific_gate_test_commands={
            g["id"]: g["verification_command"]
            for g in read("docs/implementation/acceptance-matrix.json")["gates"]
            if g["id"].startswith(("S", "A", "R")) and not g["id"].startswith(("AV", "RV"))
        },
        browser_and_visual_acceptance=(
            "Separate pending gates; Python tests do not establish browser or clinical validation"
        ),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["reproduce", "validate"])
    parser.add_argument("--output")
    parser.add_argument("--no-plots", action="store_true")
    args = parser.parse_args()
    output = safe_output(args.output, args.mode)
    started = time.perf_counter()
    validation = (
        validate_science(output)
        if args.mode == "validate"
        else dict(test_execution="not_run_use_validate_science")
    )
    summary = reproduce(output, plots=not args.no_plots)
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    dirty = bool(
        subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip()
    )
    report = dict(
        schema_version="production-science-report-v1",
        mode=args.mode,
        code_commit=commit,
        working_tree_dirty=dirty,
        python=platform.python_version(),
        numpy=np.__version__,
        validation=validation,
        reproduction=summary,
        timestamp_utc=datetime.now(UTC).isoformat(),
        elapsed_seconds=time.perf_counter() - started,
    )
    write_json(output / "science-report.json", report)
    payloads = {
        str(p.relative_to(output)): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(output.rglob("*"))
        if p.is_file()
    }
    write_json(
        output / "output-manifest.json",
        dict(
            sha256=payloads,
            deterministic_exclusions=["science-report.json", "pytest.xml", "pytest.log"],
        ),
    )
    print(json.dumps(dict(output=str(output), **report), indent=2))


if __name__ == "__main__":
    main()
