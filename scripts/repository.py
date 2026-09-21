"""Repository integrity, source recovery, wheel preparation and environment receipts."""

import argparse
import hashlib
import json
import platform
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "provenance/parallel_circulation_oxygen_spec_pack_v1_2.zip"
PREFIX = "parallel_o2_spec_pack_v1_2/"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def integrity() -> None:
    records = json.loads((ROOT / "provenance/inputs.json").read_text())["inputs"]
    if digest(ARCHIVE) != records[0]["sha256"]:
        raise ValueError("Original specification ZIP changed")
    if digest(ROOT / "provenance/project-introduction.md") != records[2]["sha256"]:
        raise ValueError("Historical project introduction changed")
    with zipfile.ZipFile(ARCHIVE) as source:
        manifest = json.loads(source.read(PREFIX + "MANIFEST.json"))
        if manifest != json.loads((ROOT / "provenance/source-archive-manifest.json").read_text()):
            raise ValueError("Source archive manifest changed")
        expected = {PREFIX + name for name in manifest["files"]} | {PREFIX + "MANIFEST.json"}
        actual = {item.filename for item in source.infolist() if not item.is_dir()}
        if expected != actual:
            raise ValueError("Source ZIP inventory differs from manifest")
        for name, sha in manifest["files"].items():
            if hashlib.sha256(source.read(PREFIX + name)).hexdigest() != sha:
                raise ValueError(f"Original payload hash failed: {name}")
    immutable = json.loads((ROOT / "provenance/immutable-files.json").read_text())
    expected_immutable = {
        name: sha
        for name, sha in manifest["files"].items()
        if name.startswith(("verification/", "config/"))
    }
    if immutable != expected_immutable:
        raise ValueError("Immutable file inventory differs from the original archive")
    for name, sha in immutable.items():
        if digest(ROOT / name) != sha:
            raise ValueError(f"Immutable working fixture changed: {name}")
    print(f"Archive and {len(immutable)} immutable working files verified.")


def restore(output: Path) -> None:
    integrity()
    output = output.resolve()
    if not output.is_relative_to(ROOT / "reports"):
        raise ValueError("Restore destination must be inside ignored reports/")
    if output.exists() and any(output.iterdir()):
        raise ValueError("Restore destination must be new or empty")
    with zipfile.ZipFile(ARCHIVE) as source:
        for item in source.infolist():
            if item.is_dir():
                continue
            name = Path(item.filename.removeprefix(PREFIX))
            if name.is_absolute() or ".." in name.parts:
                raise ValueError("Unsafe archive path")
            target = output / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(source.read(item))
    print(f"Complete original source pack recovered at {output}")


def build_assets() -> None:
    wheels = sorted((ROOT / "dist").glob("parallel_o2-*.whl"))
    if len(wheels) != 1:
        raise ValueError("Expected exactly one current project wheel in dist/")
    wheel = wheels[0]
    destination = ROOT / "web/public/model"
    destination.mkdir(parents=True, exist_ok=True)
    for old in destination.glob("*.whl"):
        if old.name != wheel.name:
            old.unlink()
    shutil.copyfile(wheel, destination / wheel.name)
    with zipfile.ZipFile(wheel) as built:
        for source in (ROOT / "src/parallel_o2").glob("*.py"):
            if built.read("parallel_o2/" + source.name) != source.read_bytes():
                raise ValueError(f"Wheel differs from production source: {source.name}")
    subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys; sys.path.insert(0, sys.argv[1]); import parallel_o2; "
            "assert parallel_o2.__file__.startswith(sys.argv[1]); "
            "print(parallel_o2.runtime_info())",
            str(wheel),
        ],
        check=True,
    )
    commit = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True)
    status = subprocess.run(
        ["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True
    )
    code = commit.stdout.strip() if commit.returncode == 0 and not status.stdout else "uncommitted"
    manifest = {
        "stage": "T02R",
        "code_commit": code,
        "wheel": wheel.name,
        "wheel_sha256": digest(wheel),
        "runtime_manifest_sha256": digest(ROOT / "config/runtime-lock.json"),
    }
    (ROOT / "web/public/build-info.json").write_text(json.dumps(manifest, indent=2) + "\n")
    shutil.copyfile(ROOT / "THIRD_PARTY_NOTICES.md", ROOT / "web/public/THIRD_PARTY_NOTICES.md")
    shutil.copyfile(ROOT / "LICENSE", ROOT / "web/public/LICENSE.txt")
    shutil.copytree(ROOT / "third_party", ROOT / "web/public/third_party", dirs_exist_ok=True)
    print("Shared wheel and build manifest prepared.")


def doctor() -> None:
    from parallel_o2 import runtime_info

    manifest = json.loads((ROOT / "config/runtime-lock.json").read_text())
    info: dict[str, Any] = runtime_info()
    info["node"] = subprocess.check_output(["node", "--version"], text=True).strip()
    info["npm"] = subprocess.check_output(["npm", "--version"], text=True).strip()
    info["platform"] = platform.platform()
    if info["python"] != manifest["python_version"] or info["numpy"] != manifest["numpy_version"]:
        raise ValueError("Python/NumPy do not match the selected browser runtime")
    if info["node"] != "v" + manifest["node_version"] or info["npm"] != manifest["npm_version"]:
        raise ValueError("Node/npm version differs from the repository pins")
    for name, item in manifest["assets"].items():
        if digest(ROOT / "web/public/runtime" / name) != item["sha256"]:
            raise ValueError(f"Runtime asset mismatch: {name}")
    package = json.loads((ROOT / "web/package.json").read_text())
    locked = json.loads((ROOT / "web/package-lock.json").read_text())["packages"][""]
    for key in ("name", "version", "dependencies", "devDependencies", "engines"):
        if package.get(key) != locked.get(key):
            raise ValueError(f"JavaScript lock is stale: {key}")
    subprocess.run(["uv", "lock", "--check"], cwd=ROOT, check=True)
    print(json.dumps(info, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["integrity", "restore", "build-assets", "doctor"])
    parser.add_argument("--output", type=Path, default=ROOT / "reports/source-pack-v1.2")
    args = parser.parse_args()
    if args.command == "integrity":
        integrity()
    elif args.command == "restore":
        restore(args.output)
    elif args.command == "build-assets":
        build_assets()
    else:
        doctor()


if __name__ == "__main__":
    main()
