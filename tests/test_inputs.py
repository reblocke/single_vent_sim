"""Input-domain tests, independent JSON Schema checks, and package isolation."""

import ast
import copy
import json
from pathlib import Path

import jsonschema
import pytest

from parallel_o2 import runtime_info
from parallel_o2.inputs import MAX_IMPORT_BYTES, MAX_SHARE_BYTES, InputError, parse_request

ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = (
    sorted((ROOT / "config/examples").glob("*.json"))
    + sorted((ROOT / "config/resistance").glob("*.json"))
    + [ROOT / "config/ahmed_criteria.json"]
)


@pytest.mark.parametrize("path", EXAMPLES, ids=lambda p: p.stem)
def test_supplied_examples_match_parser_and_schema(path):
    text = path.read_text()
    value = json.loads(text)
    assert parse_request(text) == value
    schema = json.loads((ROOT / "schemas" / (value["schema_version"] + ".schema.json")).read_text())
    jsonschema.Draft202012Validator.check_schema(schema)
    jsonschema.validate(value, schema)


def scenario():
    return json.loads((ROOT / "config/examples/baseline.json").read_text())


@pytest.mark.parametrize("value", [True, None, "10", -1, 0, float("nan"), float("inf"), 10**400])
def test_reject_invalid_capacity(value):
    obj = scenario()
    obj["capacity"]["hb_g_dl"] = value
    with pytest.raises(InputError):
        parse_request(json.dumps(obj))


@pytest.mark.parametrize(
    "text",
    [
        "{}",
        "[]",
        "null",
        "{",
        '{"schema_version":false}',
        "[" * 2000,
        '{"a":1,"a":2}',
        "NaN",
        "Infinity",
    ],
)
def test_malformed_requests(text):
    with pytest.raises(InputError):
        parse_request(text)


def test_size_bounds_and_utf8():
    for limit, shared in [(MAX_IMPORT_BYTES, False), (MAX_SHARE_BYTES, True)]:
        text = json.dumps(scenario())
        assert parse_request(text + " " * (limit - len(text)), shared=shared) == scenario()
        with pytest.raises(InputError):
            parse_request(text + " " * (limit - len(text) + 1), shared=shared)
    with pytest.raises(InputError):
        parse_request("é" * (MAX_SHARE_BYTES // 2 + 1), shared=True)


@pytest.mark.parametrize(
    "change",
    [
        lambda o: o.update(model_version="unknown"),
        lambda o: o.update(patient_name="not allowed"),
        lambda o: o["flow"].update(r=1),
        lambda o: o["capacity"].update(capacity_ml_dl=20),
        lambda o: o.update(indexing_basis="per_m2"),
        lambda o: o.update(spv_fraction=1.1),
    ],
)
def test_reject_incompatible_fields(change):
    obj = scenario()
    change(obj)
    with pytest.raises(InputError):
        parse_request(json.dumps(obj))


@pytest.mark.parametrize(
    "change",
    [
        lambda o: o["x"].update(n=402),
        lambda o: o["x"].update(n=2),
        lambda o: o["x"].update(n=3.0),
        lambda o: o["x"].update(n=True),
        lambda o: o["x"].update(min=20, max=6),
        lambda o: o["x"].update(scale="log", min=0),
        lambda o: o["x"].update(parameter="__import__('os')"),
        lambda o: o["x"].update(parameter="flow.qs_ml_kg_min"),
        lambda o: o["y"].update(parameter=o["x"]["parameter"]),
        lambda o: o.update(metrics=["sa_fraction", "sa_fraction"]),
        lambda o: o.update(metrics=["do2_ml_min_m2"]),
    ],
)
def test_grid_guards(change):
    obj = json.loads((ROOT / "config/examples/hb_ratio_grid.json").read_text())
    change(obj)
    with pytest.raises(InputError):
        parse_request(json.dumps(obj))


def test_maximum_grid_and_infeasible_input_are_not_clipped():
    obj = json.loads((ROOT / "config/examples/hb_ratio_grid.json").read_text())
    obj["x"]["n"] = obj["y"]["n"] = 401
    obj["base"]["vo2_target_ml_kg_min"] = 10000
    assert parse_request(json.dumps(obj)) == obj


@pytest.mark.parametrize(
    "change",
    [
        lambda o: o["reference"].update(rp_mmhg_min_l=0, rshunt_nominal_mmhg_min_l=0),
        lambda o: o["response"].update(alpha=1.1),
        lambda o: o["response"].update(closure="unknown"),
        lambda o: o["perturbation"].update(scope="whole_pathway_audit"),
        lambda o: o["oxygen"].update(hb_g_dl=14),
        lambda o: o.update(qp_l_min=1),
    ],
)
def test_resistance_cross_field_guards(change):
    obj = json.loads((ROOT / "config/resistance/normalized_reference.json").read_text())
    change(obj)
    with pytest.raises(InputError):
        parse_request(json.dumps(obj))


def test_criteria_contract():
    original = json.loads((ROOT / "config/ahmed_criteria.json").read_text())
    for patch in [
        {"sa_lower_fraction": 0.6},
        {"sv_lower_fraction": 0.8},
        {"origin": "user_selected"},
    ]:
        obj = copy.deepcopy(original)
        obj.update(patch)
        with pytest.raises(InputError):
            parse_request(json.dumps(obj))


def test_package_has_no_reference_or_ui_imports():
    for path in (ROOT / "src/parallel_o2").glob("*.py"):
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.Import):
                assert all(not n.name.startswith(("verification", "web")) for n in node.names)
            elif isinstance(node, ast.ImportFrom):
                assert not (node.module or "").startswith(("verification", "web"))


def test_actual_environment():
    assert runtime_info() == {
        "package": "0.1.0a0",
        "python": "3.14.2",
        "numpy": "2.4.6",
        "implementation_stage": "T02",
    }
