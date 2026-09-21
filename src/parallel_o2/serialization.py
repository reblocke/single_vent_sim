"""Finite JSON and precision-preserving CSV; undefined values never become zero."""

import csv
import io
import json
import math
from typing import Any

import numpy as np


def finite_json(value: Any) -> Any:
    if isinstance(value, np.ndarray):
        # The numerical engine uses float64. Convert finite arrays in NumPy,
        # avoiding a Python call per cell without changing JSON null semantics.
        if value.dtype.kind == "f" and value.dtype.itemsize <= 8:
            return np.where(np.isfinite(value), value, np.asarray(None, dtype=object)).tolist()
        if value.dtype.kind in "biuUS":
            return value.tolist()
        return finite_json(value.tolist())
    if isinstance(value, dict):
        return {str(key): finite_json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [finite_json(item) for item in value]
    if isinstance(value, (float, np.floating)):
        return float(value) if math.isfinite(value) else None
    if isinstance(value, np.integer):
        return int(value)
    if isinstance(value, np.bool_):
        return bool(value)
    return value


def dumps(value: Any) -> str:
    return json.dumps(finite_json(value), allow_nan=False, sort_keys=True, separators=(",", ":"))


def csv_rows(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return ""
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=list(rows[0]))
    writer.writeheader()
    for row in rows:
        writer.writerow(
            {
                key: ""
                if value is None
                else format(value, ".17g")
                if isinstance(value, float)
                else value
                for key, value in row.items()
            }
        )
    return output.getvalue()
