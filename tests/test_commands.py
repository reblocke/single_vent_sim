"""The public worker dispatcher is bounded data input, never user code."""

import json
from pathlib import Path

import pytest

from parallel_o2.commands import dispatch_json
from parallel_o2.exchange import export_result, import_result
from parallel_o2.inputs import InputError
from parallel_o2.model import solve_state

BASE = json.loads(Path("config/examples/baseline.json").read_text())


def command(operation, **args):
    return dict(schema_version="engine-command-v1", operation=operation, arguments=args)


def run(value):
    return json.loads(dispatch_json(json.dumps(value)))


def test_scalar_and_batch_use_same_public_model():
    c = command("solve_state", scenario=BASE)
    expected = solve_state(BASE)
    assert run(c) == {"result": expected}
    assert run(command("batch", commands=[c] * 200)) == {"result": [expected] * 200}
    assert "error" in run(command("batch", commands=[c] * 201))


@pytest.mark.parametrize("value", [None, [], True, "text", 4])
@pytest.mark.parametrize(
    "operation,field",
    [
        ("solve_state", "scenario"),
        ("grid", "base"),
        ("slice", "base"),
        ("resistance_grid", "request"),
        ("resistance_compare", "a"),
    ],
)
def test_malformed_nested_inputs_have_useful_errors(value, operation, field):
    response = run(command(operation, **{field: value}))
    assert response["error_type"] == "input_validation"
    assert "object" in response["error"]


@pytest.mark.parametrize(
    "value",
    [
        {},
        [],
        None,
        command("eval", expression="1+1"),
        command("solve_state", scenario=BASE, hidden=1),
        command("batch", commands=[]),
        command("batch", commands=[command("batch", commands=[])]),
        command("batch", commands=[command("grid", base=BASE)]),
        command("batch", commands=[command([], scenario=BASE)]),
        command("paper", figure="2", n=10000000),
        command("solve_state", scenario={**BASE, "spv_fraction": True}),
    ],
)
def test_rejects_unknown_operations_fields_and_resource_abuse(value):
    assert run(value)["error_type"] == "input_validation"


@pytest.mark.parametrize(
    "text", ['{"a":1,"a":2}', '{"a":NaN}', '"' + "x" * 1048576 + '"', "[" * 2000]
)
def test_raw_parser_bounds(text):
    assert json.loads(dispatch_json(text))["error_type"] == "input_validation"


@pytest.mark.parametrize("format", ["json", "csv"])
def test_exchange_preserves_precision_null_types_and_provenance(format):
    result = solve_state({**BASE, "vo2_target_ml_kg_min": 0})
    result["typed_values"] = [None, False, 0, "", [], {}, -1.2345678901234567, "=1+1"]
    provenance = {"source_status": "unavailable", "commit": "test", "basis": "per_kg"}
    text = export_result(result, provenance, format)
    restored = import_result(text, format)
    assert restored["result"] == result
    assert restored["provenance"] == provenance
    assert run(command("import_result", text=text, format=format)) == {"result": restored}


@pytest.mark.parametrize(
    "text",
    [
        "path_json,type,value_json\n[],object,\n[],object,\n",
        "path_json,type,value_json\n[],object,\n[0],scalar,1\n",
        "path_json,type,value_json\n[1],scalar,1\n",
        "path_json,type,value_json\n[],scalar,NaN\n",
    ],
)
def test_exchange_rejects_malformed_csv(text):
    with pytest.raises(InputError):
        import_result(text, "csv")


def test_exchange_rejects_overflowing_json_numbers():
    for value in ("NaN", "Infinity", "1e999"):
        with pytest.raises(InputError):
            import_result(
                '{"schema_version":"parallel-o2-result-v1","provenance":{},"result":' + value + "}"
            )


def test_vectorized_finite_serialization_preserves_typed_cells():
    import numpy as np

    from parallel_o2.serialization import dumps, finite_json

    values = {
        "float": np.array([[0, -1.2345678901234567, np.nan], [np.inf, -np.inf, 1e300]]),
        "int": np.array([0, -3, 400]),
        "bool": np.array([True, False]),
        "str": np.array(["admissible", "masked"]),
        "object": np.array([None, {"nested": np.float64(1.5)}], dtype=object),
    }
    expected = {
        "float": [[0.0, -1.2345678901234567, None], [None, None, 1e300]],
        "int": [0, -3, 400],
        "bool": [True, False],
        "str": ["admissible", "masked"],
        "object": [None, {"nested": 1.5}],
    }
    assert finite_json(values) == expected
    assert json.loads(dumps(values)) == expected
