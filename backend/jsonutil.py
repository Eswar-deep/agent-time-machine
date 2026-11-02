import hashlib
import json
from datetime import datetime, timezone
from typing import Any


def canonical(value: Any) -> str:
    # JSON has one number type. Browser export turns 129.0 into 129; normalize
    # integral floats so supported snapshots survive a JS serialization roundtrip.
    def normalize(item):
        if isinstance(item, dict):
            return {key: normalize(child) for key, child in item.items()}
        if isinstance(item, list):
            return [normalize(child) for child in item]
        if isinstance(item, float) and item.is_integer():
            return int(item)
        return item
    return json.dumps(normalize(value), sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def clone(value: Any) -> Any:
    return json.loads(canonical(value))


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def state_diff(before: Any, after: Any, path: str = "") -> list[dict]:
    """Compare every leaf, including read-only observations and removed keys."""
    if isinstance(before, dict) and isinstance(after, dict):
        changes = []
        for key in sorted(before.keys() | after.keys()):
            child = path + "/" + str(key).replace("~", "~0").replace("/", "~1")
            if key not in before or key not in after:
                changes.append({"path": child, "before": before.get(key), "after": after.get(key),
                                "before_exists": key in before, "after_exists": key in after})
            else:
                changes.extend(state_diff(before[key], after[key], child))
        return changes
    if isinstance(before, list) and isinstance(after, list) and len(before) == len(after):
        return [change for index, (old, new) in enumerate(zip(before, after))
                for change in state_diff(old, new, path + "/" + str(index))]
    numeric_equal = (type(before) in (int, float) and type(after) in (int, float) and before == after)
    if not numeric_equal and (type(before) is not type(after) or before != after):
        return [{"path": path or "/", "before": before, "after": after,
                 "before_exists": True, "after_exists": True}]
    return []

