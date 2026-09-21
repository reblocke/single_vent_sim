"""Bounded JSON commands shared by the module worker and CPython parity tests."""

import gc
import json
from typing import Any

from .analysis_grids import evaluate_analysis_grid
from .comparison import compare_states
from .comparison_presets import comparison_custom, comparison_preset
from .criteria import assess_criteria, criterion_boundary, criterion_ratio_interval
from .derived import conditional_optimum, inverse_ratio
from .exchange import export_result, import_result
from .experiments import evaluate_grid, evaluate_slice
from .flow_providers import solve_resistance_state
from .indexing import convert_indexing, flow_mode, migrate_scenario
from .inputs import MAX_IMPORT_BYTES, InputError, _object, _pairs, _reject_constant
from .model import solve_state
from .paper import inverse_error_demo, inverse_error_map, paper_curves
from .resistance_experiments import (
    compare_resistance_states,
    evaluate_resistance_grid,
    mechanism_ablation,
)
from .resistance_inspector import inspect_resistance_point
from .sensitivity import hb_sensitivity
from .serialization import dumps
from .source_lab import source_report

SCALAR_OPERATIONS = {
    "solve_state",
    "criteria",
    "criterion_boundary",
    "ratio_interval",
    "hb_sensitivity",
    "conditional_optimum",
    "inverse",
    "resistance_state",
    "compare",
    "resistance_compare",
    "convert_indexing",
    "flow_mode",
    "migrate",
}


def dispatch(command: dict[str, Any], *, in_batch: bool = False) -> Any:
    _object(command, "schema_version operation arguments")
    if command["schema_version"] != "engine-command-v1":
        raise InputError("Unknown engine command version")
    operation, args = command["operation"], command["arguments"]
    if not isinstance(operation, str):
        raise InputError("Operation must be a supported name")
    if not isinstance(args, dict):
        raise InputError("Arguments must be an object")
    for name in ("scenario", "base", "request", "a", "b", "x", "y", "axis"):
        if name in args and not isinstance(args[name], dict):
            raise InputError(f"{name} must be an object")
    if in_batch and operation not in SCALAR_OPERATIONS:
        raise InputError("Batch commands allow bounded scalar operations only")
    if operation == "solve_state":
        _object(args, "scenario", "criteria")
        return solve_state(args["scenario"], args.get("criteria"))
    if operation == "inspect_state":
        _object(args, "scenario criteria")
        scenario, criteria = args["scenario"], args["criteria"]
        state = solve_state(scenario, criteria)
        state["selected_analysis"] = {
            "boundaries": {
                name: criterion_boundary(scenario, criteria, name)
                for name in (
                    ("hb", "total_flow", "vo2")
                    if scenario["capacity"]["mode"] == "hb_linear"
                    else ("total_flow", "vo2")
                )
            },
            "ratio_interval": criterion_ratio_interval(scenario, criteria),
            "conditional_objectives": conditional_optimum(scenario),
        }
        return state
    if operation == "analysis_grid":
        _object(args, "kind base x y criteria")
        return evaluate_analysis_grid(**args)
    if operation == "grid":
        _object(args, "base x y metrics", "criteria")
        return evaluate_grid(**args)
    if operation == "slice":
        _object(args, "base axis", "metrics criteria")
        return evaluate_slice(**args)
    if operation == "compare":
        _object(args, "a b")
        return compare_states(**args)
    if operation == "comparison_preset":
        _object(args, "preset")
        return comparison_preset(**args)
    if operation == "comparison_custom":
        _object(args, "a b", "resistance criteria_a criteria_b")
        return comparison_custom(**args)
    if operation == "criteria":
        _object(args, "scenario criteria")
        return assess_criteria(solve_state(args["scenario"]), args["criteria"])
    if operation == "criterion_boundary":
        _object(args, "scenario criteria", "solve_for display_range")
        return criterion_boundary(**args)
    if operation == "ratio_interval":
        _object(args, "scenario criteria", "r_bounds")
        return criterion_ratio_interval(**args)
    if operation == "hb_sensitivity":
        _object(args, "scenario delta_hb_g_dl")
        return hb_sensitivity(**args)
    if operation == "conditional_optimum":
        _object(args, "scenario", "r_bounds")
        return conditional_optimum(**args)
    if operation == "inverse":
        _object(args, "sa sv spv_true spv_assumed")
        return inverse_ratio(**args)
    if operation == "resistance_state":
        _object(args, "request", "criteria")
        return solve_resistance_state(**args)
    if operation == "resistance_grid":
        _object(args, "request x y metrics", "baseline_policy local_rp_multiplier")
        return evaluate_resistance_grid(**args)
    if operation == "resistance_point":
        _object(args, "request x y x_value y_value", "baseline_policy local_rp_multiplier")
        return inspect_resistance_point(**args)
    if operation == "resistance_compare":
        _object(args, "a b")
        return compare_resistance_states(**args)
    if operation == "ablation":
        _object(args, "request", "alpha_values nonlinear_values")
        return mechanism_ablation(**args)
    if operation == "source_report":
        _object(args, "source", "convention")
        return source_report(**args)
    if operation == "paper":
        _object(args, "figure", "convention n raw_audit")
        return paper_curves(**args)
    if operation == "inverse_map":
        _object(args, "", "sv spv_true n")
        return inverse_error_map(**args)
    if operation == "inverse_demo":
        _object(args, "")
        return inverse_error_demo()
    if operation == "convert_indexing":
        _object(args, "scenario mass_kg bsa_m2")
        return convert_indexing(**args)
    if operation == "flow_mode":
        _object(args, "scenario mode")
        return flow_mode(**args)
    if operation == "migrate":
        _object(args, "scenario")
        return migrate_scenario(**args)
    if operation == "export_result":
        _object(args, "result provenance", "format")
        return export_result(**args)
    if operation == "import_result":
        _object(args, "text", "format")
        return import_result(**args)
    if operation == "batch":
        _object(args, "commands")
        commands = args["commands"]
        if not isinstance(commands, list) or not 1 <= len(commands) <= 200:
            raise InputError("Batch requires 1–200 scalar commands")
        # Validate all envelopes and operation restrictions before evaluating any result.
        for item in commands:
            _object(item, "schema_version operation arguments")
            if not isinstance(item["operation"], str) or item["operation"] not in SCALAR_OPERATIONS:
                raise InputError("Batch permits scalar operations only")
        return [dispatch(item, in_batch=True) for item in commands]
    if operation == "diagnostics":
        _object(args, "")
        gc.collect()
        return {
            "tracked_python_objects": len(gc.get_objects()),
            "transport": "JSON primitives; no returned PyProxy",
        }
    raise InputError("Unsupported engine operation")


def dispatch_json(text: str) -> str:
    """No eval/exec, expressions, file paths or module names enter from commands."""
    try:
        if not isinstance(text, str) or len(text.encode("utf-8")) > MAX_IMPORT_BYTES:
            raise InputError("Engine command exceeds 1 MiB")
        command = json.loads(text, object_pairs_hook=_pairs, parse_constant=_reject_constant)
        result = dispatch(command)
        # Public operations already return finite JSON values. Rewalking a
        # multi-megabyte grid here duplicates conversion; enforce strict JSON
        # directly, so an accidental nonfinite output fails instead of leaking.
        return json.dumps(
            {"result": result}, allow_nan=False, sort_keys=True, separators=(",", ":")
        )
    except (
        InputError,
        json.JSONDecodeError,
        RecursionError,
        UnicodeError,
        OverflowError,
        TypeError,
        KeyError,
        ValueError,
    ) as exc:
        return dumps({"error": str(exc), "error_type": "input_validation"})
