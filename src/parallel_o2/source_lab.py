"""Offline source metadata and equation reconstructions, never fixture expectations."""

import json
from importlib.resources import files
from typing import Any

from .comparison_presets import CRITERIA, baseline, resistance_baseline
from .criteria import criterion_boundary, criterion_ratio_interval
from .flow_providers import solve_resistance_state
from .inputs import _choice
from .model import solve_state
from .paper import CAPACITY_CONVENTIONS, source_landmarks
from .resistance_experiments import mechanism_ablation


def metadata(name: str) -> Any:
    return json.loads(files("parallel_o2").joinpath(f"data/{name}.json").read_text())


def source_report(source: str, convention: str = "P-stated-capacity") -> dict[str, Any]:
    _choice(source, ("barnea", "ahmed", "savorgnan"))
    _choice(convention, tuple(CAPACITY_CONVENTIONS))
    if source == "barnea":
        return dict(
            source=source,
            rows=source_landmarks(metadata(source), convention),
            source_status="equation_reconstruction_not_digitization",
            discrepancies=metadata("barnea_discrepancies"),
            convention=convention,
        )
    if source == "ahmed":
        examples = []
        for hb, ci, demand in [
            (9, 6, 150),
            (13, 6, 150),
            (14, 6, 150),
            (9, 9, 150),
            (12, 6, 150),
            (14, 6, 200),
        ]:
            s = baseline(True)
            s["capacity"]["hb_g_dl"] = hb
            s["flow"]["qt_l_min_m2"] = ci
            s["vo2_target_ml_min_m2"] = demand
            examples.append(
                dict(
                    hb=hb,
                    ci=ci,
                    demand=demand,
                    state=solve_state(s, CRITERIA),
                    hb_boundary=criterion_boundary(s, CRITERIA),
                    ratio_interval=criterion_ratio_interval(s, CRITERIA),
                )
            )
        return dict(
            source=source,
            source_status="blocked_source_unavailable",
            claims=metadata(source),
            examples=examples,
            criteria=CRITERIA.copy(),
        )
    claims = metadata("savorgnan")
    tables: dict[str, list[dict[str, Any]]] = {"table1": [], "table3": []}
    ablations = []
    for profile in metadata("profiles")["profiles"]:
        for table, scope, closure in [
            ("table1", "native_rp", "nominal_parallel"),
            ("table1", "whole_pathway_audit", "nominal_parallel"),
            ("table3", "native_rp", "nominal_parallel"),
            ("table3", "native_rp", "circuit_secant"),
        ]:
            request = resistance_baseline()
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
            state = solve_resistance_state(request)
            computed = {
                **state["metrics"],
                "delta_delivery_percent": 100
                * (state["metrics"]["delivery_index_l_min"] / 0.8 - 1),
            }
            reported = next(r for r in claims[table] if r["profile_id"] == profile["id"])
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
            request = resistance_baseline()
            request["response"]["closure"] = closure
            request["perturbation"].update(
                rs_multiplier=1 + profile["delta_rs_fraction"],
                rp_multiplier=1 + profile["delta_native_rp_fraction"],
            )
            ablations.append(
                dict(profile_id=profile["id"], closure=closure, result=mechanism_ablation(request))
            )
    return dict(
        source=source,
        source_status="source_text_reconstruction_current_access_unresolved",
        claims=claims,
        tables=tables,
        ablations=ablations,
        discrepancies=metadata("discrepancies"),
        profiles=metadata("profiles"),
    )
