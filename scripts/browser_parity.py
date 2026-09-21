"""CPython transport expectations; independent scientific oracles remain in pytest.

These generated files are parity evidence only and never replace immutable fixtures.
"""

import copy
import json
import random
from pathlib import Path
from typing import Any

from parallel_o2.commands import dispatch
from parallel_o2.indexing import flow_mode
from parallel_o2.model import solve_state
from parallel_o2.serialization import dumps

ROOT = Path(__file__).resolve().parents[1]


def load(path: str) -> Any:
    return json.loads((ROOT / path).read_text())


def generate() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []

    def add(label: str, operation: str, **args: Any) -> None:
        command = dict(schema_version="engine-command-v1", operation=operation, arguments=args)
        cases.append(dict(id=label, command=command, expected=dispatch(command)))

    for source in ("barnea", "ahmed", "savorgnan"):
        add("source-report-" + source, "source_report", source=source)
    add("inverse-error-map", "inverse_map", n=21)
    criteria = load("config/ahmed_criteria.json")
    for file, op, field in [
        ("golden_cases.json", "solve_state", "scenario"),
        ("ahmed_golden_cases.json", "solve_state", "scenario"),
        ("savorgnan_golden_cases.json", "resistance_state", "request"),
    ]:
        for case in load("verification/" + file)["cases"]:
            add(case["id"], op, **{field: case["scenario"]}, criteria=criteria)
    baseline = load("config/examples/baseline.json")
    indexed = load("config/examples/ahmed_inspired_hb14_ci6.json")
    resistance = load("config/resistance/normalized_reference.json")
    rng = random.Random(20260920)
    for i in range(120):
        s = copy.deepcopy(baseline if i % 2 else indexed)
        flow = s["flow"]
        for name in flow.keys() - {"mode"}:
            flow[name] *= rng.uniform(0.2, 3)
        s["capacity"]["hb_g_dl"] = rng.uniform(2, 25)
        s["spv_fraction"] = rng.uniform(0.4, 1)
        add(f"random-o2-{i}", "solve_state", scenario=s, criteria=criteria)
        r = copy.deepcopy(resistance)
        r["response"].update(
            closure="nominal_parallel" if i % 2 else "circuit_secant",
            alpha=rng.random(),
            nonlinear_fraction=rng.random(),
        )
        r["perturbation"].update(rs_multiplier=rng.uniform(0.1, 3), rp_multiplier=rng.uniform(0, 3))
        if i % 3 == 0:
            r["oxygen"] = dict(
                mode="physical",
                hb_g_dl=rng.uniform(2, 25),
                kappa_ml_o2_g_hb=1.34,
                vo2_ml_min=rng.uniform(0, 150),
                spv_fraction=0.99,
            )
        add(f"random-resistance-{i}", "resistance_state", request=r, criteria=criteria)
    for label, original in [("kg", baseline), ("m2", indexed)]:
        s = flow_mode(original, "total_ratio")
        add(label + "-mode", "flow_mode", scenario=s, mode="independent_flows")
        add(label + "-indexing", "convert_indexing", scenario=s, mass_kg=4, bsa_m2=0.25)
        for demand in (0, 6, 200):
            d = copy.deepcopy(s)
            d["vo2_target_ml_kg_min" if label == "kg" else "vo2_target_ml_min_m2"] = demand
            for operation, args in [
                ("ratio_interval", dict(criteria=criteria)),
                ("ratio_interval", dict(criteria=criteria, r_bounds=[0.2, 4])),
                ("conditional_optimum", {}),
                ("conditional_optimum", dict(r_bounds=[0.1, 4])),
                ("hb_sensitivity", dict(delta_hb_g_dl=1)),
                ("criteria", dict(criteria=criteria)),
            ]:
                add(f"{label}-{demand}-{operation}-{len(cases)}", operation, scenario=d, **args)
            for solve_for in ("hb", "total_flow", "vo2"):
                add(
                    f"{label}-{demand}-{solve_for}",
                    "criterion_boundary",
                    scenario=d,
                    criteria=criteria,
                    solve_for=solve_for,
                    display_range=[0, 20],
                )
        limit = solve_state(s)["metrics"][
            "zero_venous_vo2_limit_ml_kg_min"
            if label == "kg"
            else "zero_venous_vo2_limit_ml_min_m2"
        ]
        for factor in (1 - 1e-8, 1, 1 + 1e-8):
            d = copy.deepcopy(s)
            d["vo2_target_ml_kg_min" if label == "kg" else "vo2_target_ml_min_m2"] = limit * factor
            add(f"{label}-boundary-{factor}", "solve_state", scenario=d, criteria=criteria)
        x = dict(parameter="flow.r", min=0.1, max=10, n=9, scale="log")
        y = dict(parameter="capacity.hb_g_dl", min=2, max=20, n=7, scale="linear")
        metrics = [
            "sa_fraction",
            "sv_fraction",
            "omega",
            "oer_fraction",
            "do2_ml_kg_min" if label == "kg" else "do2_ml_min_m2",
        ]
        add(
            label + "-grid",
            "grid",
            base=s,
            x=x,
            y=y,
            metrics=metrics,
            **({"criteria": criteria} if label == "m2" else {}),
        )
        add(label + "-slice", "slice", base=s, axis=x, metrics=metrics, criteria=criteria)
        b = copy.deepcopy(s)
        b["capacity"]["hb_g_dl"] += 1
        add(label + "-compare", "compare", a=s, b=b)
    for sa, sv, spv in [(0.8, 0.4, 0.99), (0.9, 0.5, 0.99), (0.6, 0.3, 0.8), (0.989, 0.5, 0.99)]:
        add(f"inverse-{sa}", "inverse", sa=sa, sv=sv, spv_true=spv, spv_assumed=1)
    for closure in ("nominal_parallel", "circuit_secant"):
        r = copy.deepcopy(resistance)
        r["response"]["closure"] = closure
        r["perturbation"]["rp_multiplier"] = 0.55
        add(closure + "-compare", "resistance_compare", a=resistance, b=r)
        add(closure + "-ablation", "ablation", request=r)
        for policy, xp, yp in [
            ("frozen_reference", "perturbation.rp_multiplier", "response.alpha"),
            (
                "matched_reference_family",
                "reference_native_fraction",
                "response.nonlinear_fraction",
            ),
            ("local_response", "current_rp_mmhg_min_l", "current_rshunt_nominal_mmhg_min_l"),
        ]:
            add(
                closure + "-point-" + policy,
                "resistance_point",
                request=r,
                x=dict(parameter=xp, min=0.1, max=0.9, n=7, scale="linear"),
                y=dict(parameter=yp, min=0.1, max=0.9, n=5, scale="linear"),
                x_value=0.4,
                y_value=0.7,
                baseline_policy=policy,
            )
            add(
                closure + "-" + policy,
                "resistance_grid",
                request=r,
                x=dict(parameter=xp, min=0.1, max=0.9, n=7, scale="linear"),
                y=dict(parameter=yp, min=0.1, max=0.9, n=5, scale="linear"),
                metrics=[
                    "qp_l_min",
                    "qs_l_min",
                    "sa_fraction",
                    "sv_fraction",
                    "relative_delivery_index_l_min_change",
                ],
                baseline_policy=policy,
            )
    for kind, xp, yp in [
        ("hb_boundary", "flow.r", "flow.qt_l_min_m2"),
        ("hb_gain", "capacity.hb_g_dl", "delta_hb_g_dl"),
    ]:
        add(
            kind,
            "analysis_grid",
            kind=kind,
            base=indexed,
            x=dict(
                parameter=xp,
                min=0.2 if kind == "hb_boundary" else 6,
                max=4 if kind == "hb_boundary" else 20,
                n=7,
                scale="linear",
            ),
            y=dict(
                parameter=yp,
                min=2 if kind == "hb_boundary" else 0.1,
                max=12 if kind == "hb_boundary" else 4,
                n=5,
                scale="linear",
            ),
            criteria=criteria,
        )
    add("selected-state-inspection", "inspect_state", scenario=indexed, criteria=criteria)
    for figure in ("2", "3", "4", "5A", "6", "7"):
        add(figure, "paper", figure=figure, n=31)
    add("inverse-demo", "inverse_demo")
    for i in range(1, 13):
        add(f"C{i}-comparison", "comparison_preset", preset=f"C{i}")
    return cases


if __name__ == "__main__":
    target = ROOT / "artifacts/browser-parity.json"
    target.parent.mkdir(exist_ok=True)
    cases = generate()
    target.write_text(dumps(dict(tolerance=dict(atol=1e-10, rtol=1e-10), cases=cases)))
    print(f"{len(cases)} CPython parity cases written to {target.relative_to(ROOT)}")
