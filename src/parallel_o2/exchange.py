"""Lossless result exchange with explicit types, paths, units and provenance.

CSV is a long-form numeric table: paths identify each scalar and explicit container
rows preserve empty arrays/objects. Null, false, zero and empty strings stay distinct.
Imported results are records, never executable commands or trusted scientific evidence.
"""

import csv
import io
import json
import math
from typing import Any

from .inputs import MAX_IMPORT_BYTES, InputError, _object, _pairs, _reject_constant
from .serialization import dumps, finite_json

VERSION = "parallel-o2-result-v1"


def _envelope(value: Any) -> dict[str, Any]:
    result = _object(value, "schema_version result provenance")
    if result["schema_version"] != VERSION or not isinstance(result["provenance"], dict):
        raise InputError("Invalid result envelope")
    return result


def export_result(result: Any, provenance: dict[str, Any], format: str = "json") -> str:
    envelope = _envelope(
        dict(schema_version=VERSION, result=finite_json(result), provenance=provenance)
    )
    if format == "json":
        return dumps(envelope)
    if format != "csv":
        raise InputError("Result format must be json or csv")
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["path_json", "type", "value_json"])

    def visit(value: Any, path: list[str | int]) -> None:
        kind = (
            "object"
            if isinstance(value, dict)
            else "array"
            if isinstance(value, list)
            else "scalar"
        )
        writer.writerow([dumps(path), kind, "" if kind != "scalar" else dumps(value)])
        if isinstance(value, dict):
            for key, item in sorted(value.items()):
                visit(item, [*path, key])
        elif isinstance(value, list):
            for index, item in enumerate(value):
                visit(item, [*path, index])

    visit(finite_json(envelope), [])
    return output.getvalue()


def import_result(text: str, format: str = "json") -> dict[str, Any]:
    if not isinstance(text, str) or len(text.encode("utf-8")) > MAX_IMPORT_BYTES:
        raise InputError("Result import exceeds 1 MiB")

    def number(value: str) -> float:
        parsed = float(value)
        if not math.isfinite(parsed):
            raise InputError("Result contains a nonfinite number")
        return parsed

    def read(value: str) -> Any:
        return json.loads(
            value, object_pairs_hook=_pairs, parse_constant=_reject_constant, parse_float=number
        )

    try:
        if format == "json":
            return _envelope(read(text))
        if format != "csv":
            raise InputError("Result format must be json or csv")
        reader = csv.reader(io.StringIO(text, newline=""), strict=True)
        if next(reader, None) != ["path_json", "type", "value_json"]:
            raise InputError("Invalid result CSV header")
        nodes: dict[tuple[str | int, ...], Any] = {}
        for row in reader:
            if len(row) != 3:
                raise InputError("Result CSV needs exactly three columns")
            path, kind, raw = read(row[0]), row[1], row[2]
            if (
                not isinstance(path, list)
                or len(path) > 64
                or any(type(key) not in (str, int) for key in path)
            ):
                raise InputError("Invalid result path")
            key = tuple(path)
            if key in nodes:
                raise InputError("Duplicate result path")
            if kind in ("object", "array"):
                if raw:
                    raise InputError("Container row cannot have a scalar value")
                value: Any = {} if kind == "object" else []
            elif kind == "scalar":
                value = read(raw)
                if isinstance(value, (dict, list)):
                    raise InputError("Scalar row cannot hold a container")
            else:
                raise InputError("Unknown result type")
            if key:
                if key[:-1] not in nodes:
                    raise InputError("Missing result parent")
                parent = nodes[key[:-1]]
                last = key[-1]
                if isinstance(parent, dict) and isinstance(last, str):
                    parent[last] = value
                elif isinstance(parent, list) and type(last) is int and last == len(parent):
                    parent.append(value)
                else:
                    raise InputError("Invalid result container index")
            elif nodes:
                raise InputError("Root must be first")
            nodes[key] = value
        return _envelope(nodes.get(()))
    except (csv.Error, json.JSONDecodeError, RecursionError, UnicodeError) as exc:
        raise InputError("Malformed result file") from exc
