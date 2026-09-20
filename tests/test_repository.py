"""Preservation, generated-document freshness and release-gate regression checks."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_original_archive_and_working_fixtures():
    subprocess.run([sys.executable, str(ROOT / "scripts/repository.py"), "integrity"], check=True)


def test_generated_contracts_are_fresh(tmp_path):
    shutil.copytree(ROOT / "docs", tmp_path / "docs")
    (tmp_path / "scripts").mkdir()
    shutil.copyfile(
        ROOT / "scripts/compile_specification.py", tmp_path / "scripts/compile_specification.py"
    )
    shutil.copyfile(
        ROOT / "MASTER_IMPLEMENTATION_PROMPT.md", tmp_path / "MASTER_IMPLEMENTATION_PROMPT.md"
    )
    subprocess.run([sys.executable, str(tmp_path / "scripts/compile_specification.py")], check=True)
    for name in [
        "FULL_SPECIFICATION.md",
        "IMPLEMENTATION_TICKET.md",
        "AHMED_EXTENSION_TICKET.md",
        "SAVORGNAN_EXTENSION_TICKET.md",
    ]:
        assert (tmp_path / name).read_bytes() == (ROOT / name).read_bytes()


def test_acceptance_inventory_and_pending_release_guard(tmp_path):
    matrix = json.loads((ROOT / "docs/implementation/acceptance-matrix.json").read_text())
    expected = {
        f"{prefix}{i:02}"
        for prefix, count in [("S", 25), ("V", 16), ("A", 20), ("AV", 10), ("R", 25), ("RV", 12)]
        for i in range(1, count + 1)
    }
    assert len(matrix["gates"]) == 108
    assert {g["id"] for g in matrix["gates"]} == expected
    (tmp_path / "scripts").mkdir()
    (tmp_path / "docs/implementation").mkdir(parents=True)
    shutil.copyfile(ROOT / "scripts/release_gate.py", tmp_path / "scripts/release_gate.py")
    # Test failure modes independently of later real implementation progress.
    for gates in [
        [],
        [{**g, "status": "pending"} for g in matrix["gates"]],
        [{**g, "status": "passed", "evidence": []} for g in matrix["gates"]],
    ]:
        (tmp_path / "docs/implementation/acceptance-matrix.json").write_text(
            json.dumps({"gates": gates})
        )
        result = subprocess.run(
            [sys.executable, str(tmp_path / "scripts/release_gate.py")],
            capture_output=True,
            text=True,
        )
        assert result.returncode != 0
        assert "Deployment blocked" in result.stderr


def test_immutable_inventory_cannot_drop_a_source_fixture(tmp_path):
    shutil.copytree(ROOT / "provenance", tmp_path / "provenance")
    (tmp_path / "scripts").mkdir()
    shutil.copyfile(ROOT / "scripts/repository.py", tmp_path / "scripts/repository.py")
    inventory_path = tmp_path / "provenance/immutable-files.json"
    inventory = json.loads(inventory_path.read_text())
    inventory.pop("verification/golden_cases.json")
    inventory_path.write_text(json.dumps(inventory))
    result = subprocess.run(
        [sys.executable, str(tmp_path / "scripts/repository.py"), "integrity"],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "Immutable file inventory differs from the original archive" in result.stderr
