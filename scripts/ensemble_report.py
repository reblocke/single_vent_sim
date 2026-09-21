"""Production default ensemble and authoritative exported-draw replay receipt."""

import argparse
import csv
import hashlib
import json
import tempfile
from pathlib import Path

from parallel_o2.ensemble import DRAW_KEYS, EnsembleJob
from parallel_o2.ensemble_session import engine_hash
from parallel_o2.serialization import dumps

ROOT = Path(__file__).resolve().parents[1]


def save(job: EnsembleJob, path: Path) -> dict[str, str]:
    path.mkdir()
    while job.completed < job.n:
        job.step()
    paths = {"draws_csv": path / "draws.csv", "paired_results_csv": path / "paired_results.csv"}
    handles = {k: p.open("w", newline="") for k, p in paths.items()}
    try:
        for start in range(0, job.n, 1000):
            chunk = job.export_chunk(start)
            for key, handle in handles.items():
                value = chunk[key]
                handle.write(value if start == 0 else value.split("\n", 1)[1])
    finally:
        for handle in handles.values():
            handle.close()
    (path / "summary.json").write_text(dumps(job.report()) + "\n")
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in paths.values()}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--n", type=int, default=20000)
    args = parser.parse_args()
    (ROOT / "artifacts").mkdir(exist_ok=True)
    out = Path(tempfile.mkdtemp(prefix="ensemble-", dir=ROOT / "artifacts"))
    first = EnsembleJob(n=args.n)
    hashes = save(first, out / "run")
    with (out / "run/draws.csv").open(newline="") as f:
        rows = [
            {k: int(r[k]) if k == "draw_id" else float(r[k]) for k in DRAW_KEYS}
            for r in csv.DictReader(f)
        ]
    replay = EnsembleJob(rows=rows)
    replay_hashes = save(replay, out / "replay")
    if hashes != replay_hashes or first.report()["summaries"] != replay.report()["summaries"]:
        raise ValueError("Exported-draw replay differed")
    receipt = dict(
        status="passed",
        n_requested=args.n,
        paired_evaluations=args.n * 20,
        byte_identical=hashes,
        engine_sha256=engine_hash(),
        source_replication="not_claimed",
    )
    (out / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(f"Production ensemble replay verified: {out / 'receipt.json'}")


if __name__ == "__main__":
    main()
