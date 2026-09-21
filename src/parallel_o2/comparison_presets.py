"""Declared C1–C12 teaching comparisons, using the shared production engines."""

from copy import deepcopy
from typing import Any

from .comparison import _flatten, compare_states
from .criteria import assess_criteria
from .hemodynamics import validated_resistance
from .inputs import MODEL_VERSION, InputError, _criteria
from .paper import paper_scenario
from .resistance_experiments import compare_resistance_states, mechanism_ablation
from .resistance_inspector import inspect_resistance_point

CRITERIA = dict(
    schema_version="criteria-v1",
    id="ahmed-abstract-70-40",
    sa_lower_fraction=0.7,
    sv_lower_fraction=0.4,
    comparison="strict_greater_than",
    origin="source_reported_abstract",
    source_id="P2",
)

TITLES = {
    "C1": "More Hb, unchanged net lung uptake",
    "C2": "Same saturation, different delivery",
    "C3": "Higher saturation from redistribution",
    "C4": "More uptake is not more delivery",
    "C5": "Hb 9 to 14 at total CI 6",
    "C6": "Total CI 6 to 9 at Hb 9",
    "C7": "Synthetic demand 150 to 200",
    "C8": "Native versus whole-pathway semantics audit",
    "C9": "Same-scope mechanism ablation",
    "C10": "Structural closure comparison",
    "C11": "Physical Hb 12 to 14, fixed circuit",
    "C12": "Local native-Rp response, original anchor",
}


def baseline(area: bool = False) -> dict[str, Any]:
    return dict(
        schema_version="scenario-v2",
        model_version=MODEL_VERSION,
        indexing_basis="per_m2" if area else "per_kg",
        flow=dict(mode="total_ratio", qt_l_min_m2=6, r=1)
        if area
        else dict(mode="independent_flows", qp_ml_kg_min=200, qs_ml_kg_min=200),
        capacity=dict(mode="hb_linear", hb_g_dl=14 if area else 10, kappa_ml_o2_g_hb=1.34),
        spv_fraction=0.98,
        **({"vo2_target_ml_min_m2": 150} if area else {"vo2_target_ml_kg_min": 6}),
        source_context="ahmed-inspired-abstract-supported" if area else "synthetic",
    )


def resistance_baseline() -> dict[str, Any]:
    return dict(
        schema_version="resistance-experiment-v1",
        flow_model_version="resistance-parallel-steady-v1",
        reference=dict(
            rs_mmhg_min_l=40,
            rp_mmhg_min_l=12,
            rshunt_nominal_mmhg_min_l=28,
            qt_l_min=2,
            common_downstream_pressure_mmhg=0,
        ),
        response=dict(closure="nominal_parallel", alpha=0.35, nonlinear_fraction=0.5),
        perturbation=dict(scope="native_rp", rs_multiplier=1, rp_multiplier=1, rshunt_multiplier=1),
        oxygen=dict(mode="normalized_source", spv_fraction=0.99, normalized_consumption_l_min=0.19),
    )


def oxygen_budget(state: dict[str, Any]) -> dict[str, Any]:
    """Select existing shared-engine quantities; no recomputation of physiology."""
    m = state["metrics"]
    resistance = state["schema_version"] == "resistance-state-result-v1"
    normalized = resistance and state["oxygen_mode"] == "normalized_source"
    if resistance:
        mapping = (
            dict(
                delivery="delivery_index_l_min",
                consumption="normalized_systemic_net_l_min",
                systemic_return="normalized_systemic_out_l_min",
                pulmonary_in="normalized_pulmonary_in_l_min",
                pulmonary_out="normalized_pulmonary_out_l_min",
                net_uptake="normalized_pulmonary_net_l_min",
            )
            if normalized
            else dict(
                delivery="do2_ml_min",
                consumption="systemic_net_use_ml_min",
                systemic_return="systemic_out_ml_min",
                pulmonary_in="pulmonary_in_ml_min",
                pulmonary_out="pulmonary_out_ml_min",
                net_uptake="pulmonary_net_add_ml_min",
            )
        )
        qp, qs = "qp_l_min", "qs_l_min"
    else:
        area = state["indexing_basis"] == "per_m2"
        suffix = "ml_min_m2" if area else "ml_kg_min"
        mapping = {
            k: v + suffix
            for k, v in dict(
                delivery="do2_",
                consumption="systemic_net_use_",
                systemic_return="systemic_out_",
                pulmonary_in="pulmonary_in_",
                pulmonary_out="pulmonary_out_",
                net_uptake="pulmonary_net_add_",
            ).items()
        }
        qp, qs = ("qp_l_min_m2", "qs_l_min_m2") if area else ("qp_ml_kg_min", "qs_ml_kg_min")
    return dict(
        values={k: m[v] for k, v in mapping.items()},
        unit=state["units"][mapping["delivery"]],
        blood_flow_unit=state["units"][qp],
        qp=m[qp],
        qs=m[qs],
        contents={k: m.get(k) for k in ("ca_ml_dl", "cv_ml_dl", "cpv_ml_dl")},
        saturations={
            **{k: m[k] for k in ("sa_fraction", "sv_fraction")},
            "spv_fraction": state["requested"]["oxygen"]["spv_fraction"]
            if resistance
            else state["requested"]["spv_fraction"],
        },
        normalized=normalized,
        status=state["status"],
        eligible=state["has_nonnegative_content_solution"],
    )


def enrich_comparison(
    result: dict[str, Any],
    criteria_a: dict[str, Any] | None = None,
    criteria_b: dict[str, Any] | None = None,
) -> dict[str, Any]:
    result = deepcopy(result)
    result["budgets"] = {key: oxygen_budget(result[key]) for key in ("a", "b")}
    a, b = (_flatten(result[key]["requested"]) for key in ("a", "b"))
    result["changed_inputs"] = {
        k: dict(a=a.get(k), b=b.get(k)) for k in sorted(a.keys() | b.keys()) if a.get(k) != b.get(k)
    }
    result["unchanged_inputs"] = {
        k: a.get(k) for k in sorted(a.keys() | b.keys()) if a.get(k) == b.get(k)
    }
    selected = {
        "a": deepcopy(CRITERIA if criteria_a is None else criteria_a),
        "b": deepcopy(CRITERIA if criteria_b is None else criteria_b),
    }
    for key in ("a", "b"):
        _criteria(selected[key])
        result[key]["criterion_result"] = (
            assess_criteria(result[key], selected[key])
            if result[key]["metrics"]["sa_fraction"] is not None
            else dict(
                status="not_evaluable",
                arterial="not_evaluable",
                venous="not_evaluable",
                criteria=selected[key],
            )
        )
    result["criteria_by_state"] = selected
    result["criteria"] = selected["a"] if selected["a"] == selected["b"] else None
    return result


def comparison_preset(preset: str) -> dict[str, Any]:
    if preset not in TITLES:
        raise InputError("Unknown comparison preset")
    note = (
        "Prescribed change, fixed stated constraints; no inference about how the "
        "states were achieved."
    )
    ablation = None
    if preset in ("C1", "C2", "C3", "C4", "C5", "C6", "C7"):
        a = baseline(preset in ("C5", "C6", "C7"))
        b = deepcopy(a)
        if preset == "C1":
            b["capacity"]["hb_g_dl"] = 14
            note = (
                "Prescribed Hb change, fixed flows and demand — not a prediction of "
                "transfusion hemodynamics."
            )
        elif preset == "C2":
            a["flow"]["qs_ml_kg_min"] = 100
        elif preset == "C3":
            # Exact ratios implied by the declared B22/Spv.96/Qt450/M9 contract.
            a = paper_scenario(r=25 / 19)
            b = paper_scenario(r=100 / 21)
            note = (
                "Declared B = 22, Spv = .96 reconstruction. Computed DO2 34.2 and "
                "14.60454545 differ from the printed 34.1 and 14.6; printed values "
                "are not exact computed equalities."
            )
        elif preset == "C4":
            b["vo2_target_ml_kg_min"] = 9
        elif preset == "C5":
            a["capacity"]["hb_g_dl"] = 9
        elif preset == "C6":
            a["capacity"]["hb_g_dl"] = b["capacity"]["hb_g_dl"] = 9
            b["flow"]["qt_l_min_m2"] = 9
        elif preset == "C7":
            b["vo2_target_ml_min_m2"] = 200
            note = (
                "Demand 200 is a synthetic perturbation, not a verified Ahmed simulation setting."
            )
        result = compare_states(a, b)
    else:
        a = resistance_baseline()
        a["perturbation"]["rp_multiplier"] = 0.55
        b = deepcopy(a)
        if preset == "C8":
            a["response"].update(alpha=0, nonlinear_fraction=0)
            b = deepcopy(a)
            b["perturbation"]["scope"] = "whole_pathway_audit"
            note = (
                "A native-only versus B whole-pathway multiplier: implementation- "
                "semantics audit, not competing estimates of clinical drug effect. "
                "Source Table 1 discrepancy remains visible."
            )
        elif preset == "C9":
            a["response"].update(alpha=0, nonlinear_fraction=0)
            ablation = mechanism_ablation(b)
            note = (
                "A fixed/linear perturbed state; B both-mechanisms perturbed state. "
                "Each ablation cell separately compares its perturbation with its "
                "own unperturbed reference, using the same native-Rp scope."
            )
        elif preset == "C10":
            b["response"]["closure"] = "circuit_secant"
            note = (
                "Same perturbation and reference, two distinct output laws. "
                "Circuit-secant closure is a derived extension."
            )
        elif preset == "C11":
            a["perturbation"]["rp_multiplier"] = 1
            a["oxygen"] = dict(
                mode="physical",
                spv_fraction=0.99,
                hb_g_dl=12,
                kappa_ml_o2_g_hb=1.34,
                vo2_ml_min=30.552,
            )
            b = deepcopy(a)
            b["oxygen"]["hb_g_dl"] = 14
            note = (
                "Physical Hb 12 → 14, same circuit and fixed M = 30.552 mL O2/min. "
                "App-chosen scaling, no hidden Hb-to-flow feedback; NOT a "
                "transfusion-hemodynamics prediction."
            )
        elif preset == "C12":
            a = resistance_baseline()
            point = inspect_resistance_point(
                a,
                dict(parameter="current_rp_mmhg_min_l", min=1, max=40, n=3, scale="linear"),
                dict(
                    parameter="current_rshunt_nominal_mmhg_min_l",
                    min=1,
                    max=60,
                    n=3,
                    scale="linear",
                ),
                12,
                28,
                "local_response",
            )
            a = point["comparison"]["a"]["requested"]
            b = point["comparison"]["b"]["requested"]
            note = (
                "A chosen current native Rp12 / nominal Rsh28; B only that cell's "
                "native Rp × .55. Original global anchor and calibration retained. "
                "A high state index does not itself imply benefit."
            )
        result = compare_resistance_states(a, b)
    return dict(
        schema_version="comparison-preset-v1",
        preset=preset,
        title=TITLES[preset],
        contract=note,
        comparison=enrich_comparison(result),
        ablation=ablation,
        source_status=(
            "Educational comparison; Ahmed full-text settings and Savorgnan author- "
            "code/figure/sampling replication remain unavailable or unverified."
        ),
    )


def comparison_custom(
    a: dict[str, Any],
    b: dict[str, Any],
    resistance: bool = False,
    criteria_a: dict[str, Any] | None = None,
    criteria_b: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if type(resistance) is not bool:
        raise InputError("Resistance flag must be boolean")
    if resistance:
        a, b = validated_resistance(a), validated_resistance(b)
        if a["oxygen"]["mode"] != b["oxygen"]["mode"]:
            raise InputError(
                "Compare states in the same explicit oxygen mode; normalized "
                "and physical fluxes are distinct"
            )
        result = compare_resistance_states(a, b)
    else:
        result = compare_states(a, b)
    return enrich_comparison(result, criteria_a, criteria_b)
