"""Fetch hash-pinned browser assets and optional local Node; never resolve versions."""

import argparse
import hashlib
import json
import platform
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]


def download(item: dict[str, Any], target: Path) -> None:
    if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == item["sha256"]:
        return
    target.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(item["url"], timeout=120) as response:
        content = response.read()
    if hashlib.sha256(content).hexdigest() != item["sha256"]:
        raise ValueError(f"Hash mismatch: {item['url']}")
    with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as handle:
        handle.write(content)
        temporary = Path(handle.name)
    temporary.replace(target)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--node", action="store_true")
    args = parser.parse_args()
    manifest = json.loads((ROOT / "config/runtime-lock.json").read_text())
    if args.node:
        expected = "v" + manifest["node_version"]
        executable = shutil.which("node")
        if (
            executable
            and subprocess.check_output([executable, "--version"], text=True).strip() == expected
        ):
            return
        target = ROOT / ".tools/node"
        if (target / "bin/node").exists():
            actual = subprocess.check_output(
                [str(target / "bin/node"), "--version"], text=True
            ).strip()
            if actual == expected:
                return
        systems = {"Darwin": "darwin", "Linux": "linux"}
        machines = {"arm64": "arm64", "aarch64": "arm64", "x86_64": "x64"}
        key = systems[platform.system()] + "-" + machines[platform.machine()]
        item = manifest["node_archives"][key]
        archive = ROOT / ".tools" / Path(item["url"]).name
        download(item, archive)
        with tempfile.TemporaryDirectory(dir=archive.parent) as temporary:
            with tarfile.open(archive) as tar:
                tar.extractall(temporary, filter="data")
            extracted = next(Path(temporary).iterdir())
            if target.exists():
                raise RuntimeError(
                    "Different local Node exists; move .tools/node before installing"
                )
            shutil.move(str(extracted), target)
        return
    for filename, item in manifest["assets"].items():
        download(item, ROOT / "web/public/runtime" / filename)
    print("Pinned runtime assets verified.")


if __name__ == "__main__":
    main()
