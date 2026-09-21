"""Finite JSON and precision-preserving CSV; undefined values never become zero."""

import csv
import io
import json
import math
from typing import Any

import numpy as np


def finite_json(value: Any) -> Any:
    if isinstance(value, np.ndarray):
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
