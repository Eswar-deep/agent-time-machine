"""Remove configured credentials from observable logs and evidence exports."""
import os


def redact_credentials(value):
    secrets = sorted({os.getenv(name) for name in ("MODEL_API_KEY", "META_API_KEY")
                      if os.getenv(name)}, key=len, reverse=True)

    def redact(item):
        if isinstance(item, str):
            for secret in secrets:
                item = item.replace(secret, "[REDACTED]")
            return item
        if isinstance(item, dict):
            result = {}
            for key, child in item.items():
                safe_key = redact(key) if isinstance(key, str) else key
                unique_key = safe_key
                suffix = 2
                # Distinct filenames may collapse to the same redacted name.
                # Keep every entry, including literal placeholder/suffix keys,
                # without using the sensitive original name to disambiguate.
                while unique_key in result:
                    unique_key = f"{safe_key} [{suffix}]"
                    suffix += 1
                result[unique_key] = redact(child)
            return result
        if isinstance(item, list):
            return [redact(child) for child in item]
        return item

    return redact(value)
