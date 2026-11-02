"""Create a deliberately incompatible copy for the rejection walkthrough."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.jsonutil import digest

if len(sys.argv) != 3:
    raise SystemExit("Usage: python scripts/make_incompatible_checkpoint.py checkpoint.json incompatible.json")
source, destination = map(Path, sys.argv[1:])
if source.resolve() == destination.resolve():
    raise SystemExit("Choose a separate output file; the original checkpoint is preserved.")
checkpoint = json.loads(source.read_text(encoding="utf-8"))
if checkpoint.get("format") == "agent-time-machine-export-v1":
    checkpoint = checkpoint["checkpoints"][0]
checkpoint["payload"]["format_version"] = 999
checkpoint["sha256"] = digest(checkpoint["payload"])
destination.write_text(json.dumps(checkpoint, indent=2), encoding="utf-8")
print("Created an intentionally unsupported-format copy. The source was not changed.")

