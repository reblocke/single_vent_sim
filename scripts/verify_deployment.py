"""Compare every hosted byte against the manifest inside the tested Pages artifact."""

import argparse
import hashlib
import json
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path, PurePosixPath
from typing import Any

URL = "https://reblocke.github.io/single_vent_sim/"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--accepted-manifest", required=True, type=Path)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    expected = json.loads(args.accepted_manifest.read_text())
    if expected["schema_version"] != "static-assets-v1":
        raise ValueError("Unsupported static asset manifest")

    def fetch(name: str) -> tuple[bytes, str]:
        path = PurePosixPath(name)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("Asset must remain under the application URL")
        request = urllib.request.Request(URL + name, headers={"Cache-Control": "no-cache"})
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.read(), response.headers.get("Content-Type", "")

    hosted_manifest, _ = fetch("asset-manifest.json")
    if json.loads(hosted_manifest) != expected:
        raise ValueError("Hosted manifest differs from the tested Pages artifact")
    build_bytes, _ = fetch("build-info.json")
    build = json.loads(build_bytes)
    if build["code_commit"] != args.commit:
        raise ValueError("Hosted build is not the accepted commit")

    def verify(item: tuple[str, dict[str, Any]]) -> tuple[str, dict[str, Any]]:
        name, record = item
        data, content_type = fetch(name)
        actual = {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
        if actual != record:
            raise ValueError(f"Hosted asset differs from the tested bytes: {name}")
        return name, {**actual, "content_type": content_type}

    with ThreadPoolExecutor(max_workers=4) as pool:
        files = dict(pool.map(verify, expected["files"].items()))
    receipt = {
        "status": "passed",
        "deployment_url": URL,
        "accepted_commit": args.commit,
        "build": build,
        "asset_manifest_sha256": hashlib.sha256(hosted_manifest).hexdigest(),
        "verified_files": files,
        "browser_initialization": "separately_verified_by_web/live/deployment.spec.ts",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(receipt, indent=2) + "\n")
    print(f"Verified {len(files)} hosted assets against accepted commit {args.commit}")


if __name__ == "__main__":
    main()
