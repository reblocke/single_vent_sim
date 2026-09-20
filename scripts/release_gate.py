"""Fail closed until every application gate has recorded implementation evidence."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    f"{prefix}{i:02}"
    for prefix, count in [("S", 25), ("V", 16), ("A", 20), ("AV", 10), ("R", 25), ("RV", 12)]
    for i in range(1, count + 1)
}


def main() -> None:
    matrix = json.loads((ROOT / "docs/implementation/acceptance-matrix.json").read_text())
    gates = matrix["gates"]
    if len(gates) != len(EXPECTED) or {g["id"] for g in gates} != EXPECTED:
        raise SystemExit("Deployment blocked: incomplete or duplicate acceptance inventory")
    incomplete = [
        g["id"]
        for g in gates
        if g["status"] != "passed" or not g["evidence"] or not g["tested_commit"]
    ]
    if incomplete:
        raise SystemExit(
            "Deployment blocked; application evidence pending: " + ", ".join(incomplete)
        )
    print("All application gates have recorded evidence. Source statuses remain separate.")


if __name__ == "__main__":
    main()
