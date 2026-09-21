"""One bounded, token-guarded ensemble session per shared Python runtime."""

import csv
import hashlib
import io
from importlib.resources import files
from typing import Any

from .ensemble import DRAW_KEYS, EnsembleJob, validate_draws
from .inputs import InputError, _object

_token = 0
_job: EnsembleJob | None = None
_replay: list[dict[str, Any]] | None = None
_expected = 0
_ids: set[int] = set()


def engine_hash() -> str:
    digest = hashlib.sha256()
    for path in sorted(files("parallel_o2").iterdir(), key=lambda p: p.name):
        if path.name.endswith(".py"):
            digest.update(path.name.encode())
            digest.update(path.read_bytes())
    for path in sorted(files("parallel_o2").joinpath("data").iterdir(), key=lambda p: p.name):
        if path.name.endswith(".json"):
            digest.update(path.name.encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()


def ensemble_command(args: dict[str, Any]) -> dict[str, Any]:
    global _token, _job, _replay, _expected, _ids
    action = args.get("action")
    if action == "start":
        _object(args, "action", "n seed")
        job = EnsembleJob(args.get("n", 20000), args.get("seed", 2026091804))
        _token += 1
        _job = job
        _replay = None
        _ids = set()
        return dict(token=_token, n_requested=job.n, completed=0, ready=True)
    if action == "replay_start":
        _object(args, "action n")
        n = args["n"]
        if type(n) is not int or not 1 <= n <= 100000:
            raise InputError("Replay requires 1–100000 rows")
        _token += 1
        _job = None
        _replay = []
        _expected = n
        _ids = set()
        return dict(token=_token, n_requested=n, loaded=0, ready=False)
    if type(args.get("token")) is not int or args["token"] != _token:
        raise InputError("Stale or invalid ensemble token")
    if action == "cancel":
        _object(args, "action token")
        _job = None
        _replay = None
        _ids = set()
        return dict(token=_token, cancelled=True)
    if action == "replay_append":
        _object(args, "action token start text")
        if _replay is None or type(args["start"]) is not int or args["start"] != len(_replay):
            raise InputError("Replay cursor does not match loaded rows")
        if not isinstance(args["text"], str) or len(args["text"].encode()) > 500000:
            raise InputError("Replay chunk exceeds 500000 bytes")
        reader = csv.DictReader(io.StringIO(args["text"]))
        if reader.fieldnames != list(DRAW_KEYS):
            raise InputError("Replay CSV requires the exact exported column header")
        rows: list[dict[str, Any]] = []
        try:
            for r in reader:
                if None in r or any(v is None for v in r.values()):
                    raise ValueError("Malformed CSV row")
                rows.append({k: int(r[k]) if k == "draw_id" else float(r[k]) for k in DRAW_KEYS})
                if len(rows) > 1000:
                    raise ValueError("At most 1000 rows per replay chunk")
        except (ValueError, TypeError) as exc:
            raise InputError("Malformed bounded replay CSV") from exc
        validate_draws(rows)
        if len(_replay) + len(rows) > _expected or any(r["draw_id"] in _ids for r in rows):
            raise InputError("Replay contains extra rows or repeated draw IDs")
        _replay.extend(rows)
        _ids.update(r["draw_id"] for r in rows)
        loaded = len(_replay)
        if loaded == _expected:
            _job = EnsembleJob(rows=_replay)
            _replay = None
            _ids = set()
        return dict(token=_token, n_requested=_expected, loaded=loaded, ready=loaded == _expected)
    if _job is None:
        raise InputError("No ready ensemble job")
    if action == "step":
        _object(args, "action token start", "count")
        if type(args["start"]) is not int or args["start"] != _job.completed:
            raise InputError("Step cursor does not match completed draws")
        return dict(token=_token, **_job.step(args.get("count", 1000)))
    if action == "report":
        _object(args, "action token")
        return dict(token=_token, engine_sha256=engine_hash(), **_job.report())
    if action == "export":
        _object(args, "action token start", "count")
        return dict(token=_token, **_job.export_chunk(args["start"], args.get("count", 1000)))
    raise InputError("Unsupported ensemble action")
