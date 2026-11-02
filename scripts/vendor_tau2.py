"""Extract a small, auditable retail subset from the exact pinned upstream ZIP.

No benchmark tasks, expected answers, or archived research results are imported.
Run from the repository root: python scripts/vendor_tau2.py tau2-upstream.zip
"""
import hashlib
import json
import sys
import zipfile
from pathlib import Path

COMMIT = "122e2432b82d740e8f313f46f0a071729c404f39"
ROOT = Path(__file__).resolve().parents[1]
FILES = [
    "src/tau2/domains/retail/data_model.py",
    "src/tau2/domains/retail/tools.py",
    "src/tau2/domains/retail/utils.py",
    "src/tau2/environment/db.py",
    "src/tau2/environment/tool.py",
    "src/tau2/environment/toolkit.py",
    "src/tau2/environment/regional.py",
    "src/tau2/utils/__init__.py",
    "src/tau2/utils/io_utils.py",
    "src/tau2/utils/pydantic_utils.py",
    "src/tau2/utils/utils.py",
    "src/tau2/utils/text_match.py",
    "data/tau2/domains/retail/policy.md",
    "LICENSE",
]


def main():
    archive = Path(sys.argv[1])
    destination = ROOT / "vendor" / "tau2"
    hashes = {}
    with zipfile.ZipFile(archive) as source:
        prefix = source.namelist()[0]
        if prefix != f"tau2-bench-{COMMIT}/":
            raise SystemExit("Wrong upstream revision: expected " + COMMIT)
        for relative in FILES:
            content = source.read(prefix + relative)
            path = destination / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)
            hashes[relative] = hashlib.sha256(content).hexdigest()
    # Bypass the full benchmark's eager runner/voice/LLM imports. These four
    # package entry points are app glue, not copies of upstream initializers.
    for package in ("tau2", "tau2/domains", "tau2/domains/retail", "tau2/environment"):
        path = destination / "src" / package / "__init__.py"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('"""Minimal package entry point for the vendored retail subset."""\n')
    manifest = {
        "repository": "https://github.com/sierra-research/tau2-bench",
        "commit": COMMIT,
        "archive_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
        "files": hashes,
        "modified_entry_points": [
            "src/" + p + "/__init__.py"
            for p in ("tau2", "tau2/domains", "tau2/domains/retail", "tau2/environment")
        ],
    }
    (destination / "PROVENANCE.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Vendored {len(hashes)} unchanged upstream files at {COMMIT}.")


if __name__ == "__main__":
    main()

