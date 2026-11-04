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
            return {key: redact(child) for key, child in item.items()}
        if isinstance(item, list):
            return [redact(child) for child in item]
        return item

    return redact(value)
