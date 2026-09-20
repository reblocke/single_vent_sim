"""Run the independent reference pipeline twice and verify deterministic replay."""

import argparse
import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--full", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.output is None:
        (ROOT / "artifacts").mkdir(exist_ok=True)
        output = Path(tempfile.mkdtemp(prefix="reference-", dir=ROOT / "artifacts"))
    else:
        output = args.output.resolve()
        if output.exists() and any(output.iterdir()):
            raise ValueError("Output must be new or empty")
        if not output.is_relative_to(ROOT / "artifacts"):
            raise ValueError("Replay outputs belong inside artifacts/")
        output.mkdir(parents=True, exist_ok=True)
    command = [sys.executable, str(ROOT / "scripts/run_reference_pipeline.py")]
    first, replay = output / "run", output / "replay"
    subprocess.run(
        command + ([] if args.full else ["--quick"]) + ["--output", str(first)], check=True
    )
    subprocess.run(
        command
        + [
            "--grid-n",
            "201" if args.full else "41",
            "--replay-draws",
            str(first / "ensemble/draws.csv"),
            "--output",
            str(replay),
        ],
        check=True,
    )
    compared = {}
    for rel in ("ensemble/draws.csv", "ensemble/paired_results.csv", "ensemble/summary.csv"):
        a, b = (first / rel).read_bytes(), (replay / rel).read_bytes()
        if a != b:
            raise ValueError(f"Nonidentical replay: {rel}")
        compared[rel] = hashlib.sha256(a).hexdigest()
    receipt = {
        "full": args.full,
        "status": "passed",
        "byte_identical": compared,
        "run_report": json.loads((first / "pipeline_report.json").read_text()),
    }
    (output / "replay-receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(f"Reference replay verified: {output / 'replay-receipt.json'}")


if __name__ == "__main__":
    main()
