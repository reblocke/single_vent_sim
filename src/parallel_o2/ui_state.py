"""Versioned, bounded UI configuration import; no executable expressions or prose."""

import json
from copy import deepcopy
from typing import Any

from .analysis_grids import evaluate_analysis_grid
from .comparison_presets import TITLES, comparison_custom
from .derived import inverse_ratio
from .experiments import evaluate_grid
from .hemodynamics import validated_resistance
from .inputs import (
    MAX_IMPORT_BYTES,
    InputError,
    _choice,
    _criteria,
    _number,
    _object,
    _pairs,
    _reject_constant,
)
from .model import validated_scenario
from .paper import CAPACITY_CONVENTIONS, FIGURES
from .resistance_experiments import ABSOLUTE_ALIASES, evaluate_resistance_grid
from .resistance_inspector import inspect_resistance_point
from .sensitivity import hb_sensitivity


def _ui_criteria(value: Any) -> None:
    _criteria(value)
    _choice(value["id"], ("ahmed-abstract-70-40", "user-selected"))


def _boolean(value: Any) -> None:
    if type(value) is not bool:
        raise InputError("Expected an explicit boolean")


def _axes(settings: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    for key in ("x", "y"):
        axis = _object(settings[key], "parameter min max n scale")
        if type(axis["n"]) is not int or not 3 <= axis["n"] <= 401:
            raise InputError("Axis n must be 3–401")
    if settings["x"]["parameter"] == settings["y"]["parameter"]:
        raise InputError("Distinct axes required")
    return ({**settings["x"], "n": 3}, {**settings["y"], "n": 3})


def _validate_legacy(text: str, shared: bool = False) -> dict[str, Any]:
    _boolean(shared)
    limit = 16384 if shared else MAX_IMPORT_BYTES
    if not isinstance(text, str) or len(text.encode("utf-8")) > limit:
        raise InputError(
            "UI state exceeds " + ("16 KiB share" if shared else "1 MiB import") + " limit"
        )
    obj = json.loads(text, object_pairs_hook=_pairs, parse_constant=_reject_constant)
    _object(obj, "schema_version view settings", "provider")
    _choice(obj["schema_version"], ("parallel-o2-ui-state-v1",))
    _choice(obj["view"], ("explore", "compare", "laboratory", "model"))
    s = obj["settings"]
    if not isinstance(s, dict):
        raise InputError("Settings must be an object")
    if obj["view"] == "explore":
        _choice(obj.get("provider"), ("prescribed", "resistance"))
        common = "preset x y metrics selected scales"
        if obj["provider"] == "prescribed":
            _object(
                s,
                common
                + " kind base criteria contour overlays slice_axis slice_objectives"
                + " mass_kg bsa_m2 pins slice_visible",
                "display_modes",
            )
            modes = s.setdefault("display_modes", ["continuous", "continuous"])
            if not isinstance(modes, list) or len(modes) != 2:
                raise InputError("Two panel display modes required")
            for mode in modes:
                _choice(mode, ("continuous", "joint_criteria"))
            if (s["kind"] is not None or s["preset"] in ("H3", "H4")) and "joint_criteria" in modes:
                raise InputError("Joint criteria display requires a forward-state scene")
            _choice(s["preset"], ("E1", "E2", "E3", "E4", "E5", "H1", "H2", "H3", "H4"))
            base = validated_scenario(s["base"])
            _ui_criteria(s["criteria"])
            if s["kind"] is not None:
                _choice(s["kind"], ("hb_boundary", "hb_gain"))
                if s["preset"] != ("H3" if s["kind"] == "hb_boundary" else "H4"):
                    raise InputError("Derived analysis must match its preset")
            _choice(s["contour"], ("none", "sa_fraction", "sv_fraction", "criteria"))
            _choice(s["slice_axis"], ("x", "y"))
            _boolean(s["slice_objectives"])
            _boolean(s["slice_visible"])
            if (
                not isinstance(s["overlays"], list)
                or len(s["overlays"]) > 5
                or any(not isinstance(v, str) for v in s["overlays"])
                or len(set(s["overlays"])) != len(s["overlays"])
            ):
                raise InputError("Expected distinct known overlay IDs")
            for overlay in s["overlays"]:
                _choice(overlay, ("ratio_1", "do2_peak", "sv_peak", "iso_ratio", "iso_total"))
            for key in ("mass_kg", "bsa_m2"):
                if s[key] is not None:
                    _number(s[key], positive=True)
            pins = _object(s["pins"], "", "a b criteria_a criteria_b")
            for key in ("a", "b"):
                if key in pins:
                    validated_scenario(pins[key])
                if "criteria_" + key in pins:
                    _ui_criteria(pins["criteria_" + key])
        else:
            _object(s, common + " request policy", "local_rp_multiplier reference_epoch")
            _number(s.setdefault("local_rp_multiplier", 0.55), 0)
            if "reference_epoch" in s and (
                type(s["reference_epoch"]) is not int or s["reference_epoch"] < 0
            ):
                raise InputError("Reference epoch must be a nonnegative integer")
            _choice(s["preset"], ("R1", "R2", "R3", "R4", "R5", "R6"))
            expected = (
                "matched_reference_family"
                if s["preset"] == "R2"
                else "local_response"
                if s["preset"] == "R4"
                else "frozen_reference"
            )
            if s["policy"] != expected:
                raise InputError("Reference policy does not match this resistance scene")
            validated_resistance(s["request"])
            # Old UI records contain held values that never reached the R4 solver.
            # Normalize only these aliases; the browser reports the normalization.
            for axis in (s["x"], s["y"]):
                _object(axis, "parameter min max n scale")
                if axis.get("parameter") in ABSOLUTE_ALIASES:
                    alias = ABSOLUTE_ALIASES[axis["parameter"]].split(".")[1]
                    s["request"]["perturbation"][alias] = 1
        _object(s["selected"], "x y")
        for v in s["selected"].values():
            _number(v)
        if (
            not isinstance(s["metrics"], list)
            or len(s["metrics"]) != 2
            or any(not isinstance(v, str) for v in s["metrics"])
        ):
            raise InputError("Two named output metrics required")
        if not isinstance(s["scales"], list) or len(s["scales"]) != 2:
            raise InputError("Two exact display scales required")
        for scale in s["scales"]:
            if not isinstance(scale, list) or len(scale) != 2:
                raise InputError("Scale requires two endpoints")
            for v in scale:
                _number(v)
            if scale[0] >= scale[1]:
                raise InputError("Scale endpoints must increase")
        x, y = _axes(s)
        # Validate through the existing engine at bounded small resolution. All original
        # resolution limits were checked before replacing n; do not allocate an imported grid.
        if obj["provider"] == "resistance":
            evaluate_resistance_grid(
                s["request"],
                x,
                y,
                list(dict.fromkeys(s["metrics"])),
                s["policy"],
                s["local_rp_multiplier"],
            )
            inspect_resistance_point(
                s["request"],
                s["x"],
                s["y"],
                s["selected"]["x"],
                s["selected"]["y"],
                s["policy"],
                s["local_rp_multiplier"],
            )
        elif s["kind"] is not None:
            kind = s["kind"]
            result = evaluate_analysis_grid(kind, base, x, y, s["criteria"])
            if any(m not in result["metrics"] for m in s["metrics"]):
                raise InputError("Metric does not belong to this derived analysis")
        else:
            evaluate_grid(base, x, y, list(dict.fromkeys(s["metrics"])), s["criteria"])
        if obj["provider"] == "prescribed":
            selected = deepcopy(base)
            for side in ("x", "y"):
                parameter = s[side]["parameter"]
                if parameter == "delta_hb_g_dl":
                    continue
                path = parameter.split(".")
                if len(path) == 2:
                    selected[path[0]][path[1]] = s["selected"][side]
                else:
                    selected[path[0]] = s["selected"][side]
            validated_scenario(selected)
            if s["kind"] == "hb_gain":
                hb_sensitivity(selected, s["selected"]["y"])
    elif obj["view"] == "compare":
        if "provider" in obj:
            raise InputError("Provider belongs to Explore only")
        if s.get("mode") == "preset":
            _object(s, "mode preset")
            _choice(s["preset"], tuple(TITLES))
        else:
            _object(
                s,
                "mode a b policy"
                if s.get("mode") == "resistance"
                else "mode a b criteria_a criteria_b",
            )
            _choice(s["mode"], ("pinned", "resistance"))
            if s["mode"] == "resistance":
                _choice(
                    s.get("policy"),
                    ("frozen_reference", "matched_reference_family", "local_response"),
                )
            elif "policy" in s:
                raise InputError("Reference policy belongs to resistance comparison only")
            if s["mode"] == "pinned":
                _ui_criteria(s["criteria_a"])
                _ui_criteria(s["criteria_b"])
            comparison_custom(
                s["a"], s["b"], s["mode"] == "resistance", s.get("criteria_a"), s.get("criteria_b")
            )
    elif obj["view"] == "laboratory":
        if "provider" in obj:
            raise InputError("Provider belongs to Explore only")
        _object(s, "source figure convention raw_audit inverse local_contours")
        _choice(s["source"], ("barnea", "inverse", "ahmed", "savorgnan"))
        _choice(s["figure"], tuple(FIGURES))
        _choice(s["convention"], tuple(CAPACITY_CONVENTIONS))
        _boolean(s["raw_audit"])
        _boolean(s["local_contours"])
        _object(s["inverse"], "sa sv spv_true spv_assumed")
        for v in s["inverse"].values():
            _number(v, 0, 1)
        if s["source"] == "inverse":
            inverse_ratio(**s["inverse"])
    else:
        if "provider" in obj:
            raise InputError("Provider belongs to Explore only")
        _object(s, "")
    return deepcopy(obj)


def validate_ui_state(text: str, shared: bool = False) -> dict[str, Any]:
    """Canonical presentation-v2 envelope; scientific scenario schemas are unchanged."""
    from importlib.resources import files

    from .experiments import evaluate_slice

    _boolean(shared)
    limit = 16384 if shared else MAX_IMPORT_BYTES
    if not isinstance(text, str) or len(text.encode("utf-8")) > limit:
        raise InputError(
            "UI state exceeds " + ("16 KiB share" if shared else "1 MiB import") + " limit"
        )
    value = json.loads(text, object_pairs_hook=_pairs, parse_constant=_reject_constant)
    _object(value, "schema_version view settings", "provider presentation drafts")
    _choice(value["schema_version"], ("parallel-o2-ui-state-v1", "parallel-o2-ui-state-v2"))
    legacy = value["schema_version"] == "parallel-o2-ui-state-v1"
    if legacy and ("presentation" in value or "drafts" in value):
        raise InputError("Presentation fields require UI-state-v2")
    core = {k: v for k, v in value.items() if k not in ("presentation", "drafts")}
    core["schema_version"] = "parallel-o2-ui-state-v1"
    result = _validate_legacy(json.dumps(core), shared=False)
    registry = json.loads(files("parallel_o2").joinpath("data/presentation.json").read_text())
    questions = registry["questions"]
    preset = result["settings"].get("preset", "E1")
    default_question = next((q["id"] for q in questions if preset in q["variants"]), "hemoglobin")
    presentation = value.get("presentation", {"question": default_question, "mode": "map"})
    _object(presentation, "question mode", "one_change")
    _choice(presentation["question"], tuple(q["id"] for q in questions))
    _choice(presentation["mode"], ("one_change", "map"))
    if presentation["mode"] == "one_change" and (
        result["view"] != "explore" or result.get("provider") != "prescribed"
    ):
        raise InputError("One change requires prescribed-flow Explore")
    if presentation["mode"] == "one_change" and "one_change" not in presentation:
        raise InputError("One-change settings are required")
    if "one_change" in presentation:
        one = _object(presentation["one_change"], "a parameter target axis criteria")
        a = validated_scenario(one["a"])
        _ui_criteria(one["criteria"])
        _number(one["target"])
        axis = _object(one["axis"], "parameter min max n scale")
        if (
            not isinstance(one["parameter"], str)
            or one["axis"].get("parameter") != one["parameter"]
        ):
            raise InputError("One-change parameter must match the slice axis")
        axis = _object(one["axis"], "parameter min max n scale")
        if type(axis["n"]) is not int or not 3 <= axis["n"] <= 401:
            raise InputError("Slice resolution must be 3–401")
        evaluate_slice(a, {**axis, "n": 3}, criteria=one["criteria"])
        b = deepcopy(a)
        pieces = one["parameter"].split(".")
        if len(pieces) == 1:
            b[pieces[0]] = one["target"]
        else:
            b[pieces[0]][pieces[1]] = one["target"]
        validated_scenario(b)
    drafts = value.get("drafts", {})
    _object(drafts, "", "prescribed resistance normalized_source physical")
    for key, settings in list(drafts.items()):
        provider = "prescribed" if key == "prescribed" else "resistance"
        envelope = dict(
            schema_version="parallel-o2-ui-state-v1",
            view="explore",
            provider=provider,
            settings=settings,
        )
        drafts[key] = _validate_legacy(json.dumps(envelope))["settings"]
        if (
            key in ("normalized_source", "physical")
            and drafts[key]["request"]["oxygen"]["mode"] != key
        ):
            raise InputError("Oxygen draft mode must match its label")
    return {
        **result,
        "schema_version": "parallel-o2-ui-state-v2",
        "presentation": presentation,
        "drafts": drafts,
    }
