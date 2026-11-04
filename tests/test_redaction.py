"""Credential scrubbing preserves evidence entries, including filename keys."""

import json

from backend.redaction import redact_credentials


def test_nested_filename_keys_and_values_are_scrubbed_without_mutating_input(monkeypatch):
    secret = "redaction-only-test-key"
    monkeypatch.setenv("MODEL_API_KEY", secret)
    monkeypatch.delenv("META_API_KEY", raising=False)
    source = {"files": {f"notes/{secret}.txt": f"An accidental value containing {secret}"},
              "calls": [{secret: {"message": secret}}]}
    before = json.dumps(source)
    safe = redact_credentials(source)
    assert secret not in json.dumps(safe)
    assert safe["files"]["notes/[REDACTED].txt"] == "An accidental value containing [REDACTED]"
    assert safe["calls"] == [{"[REDACTED]": {"message": "[REDACTED]"}}]
    assert json.dumps(source) == before


def test_overlapping_credentials_use_longest_match_for_keys_and_values(monkeypatch):
    short = "overlap-only-test-key"
    long = short + "-extended"
    monkeypatch.setenv("MODEL_API_KEY", short)
    monkeypatch.setenv("META_API_KEY", long)
    safe = redact_credentials({f"{long}.txt": [long, short, f"{short} / {long}"]})
    assert safe == {"[REDACTED].txt": ["[REDACTED]", "[REDACTED]", "[REDACTED] / [REDACTED]"]}
    assert short not in json.dumps(safe) and long not in json.dumps(safe)


def test_redacted_key_collisions_and_literal_suffixes_preserve_every_entry(monkeypatch):
    short = "collision-only-key"
    long = short + "-extended"
    monkeypatch.setenv("MODEL_API_KEY", short)
    monkeypatch.setenv("META_API_KEY", long)
    source = {"files": {
        short: {"entry": "first", "value": short},
        long: {"entry": "second", "value": long},
        "[REDACTED]": {"entry": "literal placeholder"},
        "[REDACTED] [2]": {"entry": "literal suffix"},
        "ordinary.txt": {"entry": "ordinary"},
    }}
    safe = redact_credentials(source)
    files = safe["files"]
    assert len(files) == len(source["files"]) == 5
    assert len(set(files)) == 5
    assert [entry["entry"] for entry in files.values()] == [
        "first", "second", "literal placeholder", "literal suffix", "ordinary"]
    assert files["[REDACTED]"]["value"] == "[REDACTED]"
    assert files["[REDACTED] [2]"]["value"] == "[REDACTED]"
    assert files["ordinary.txt"] == {"entry": "ordinary"}
    assert short not in json.dumps(safe) and long not in json.dumps(safe)
    assert redact_credentials(source) == safe  # Stable input order gives stable evidence output.


def test_without_configured_credentials_keys_and_values_are_unchanged(monkeypatch):
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    monkeypatch.delenv("META_API_KEY", raising=False)
    source = {"files": {"[REDACTED]": "literal", "[REDACTED] [2]": "literal suffix"},
              "events": [{"message": "Keep the complete evidence"}], "count": 3, "cost": None}
    assert redact_credentials(source) == source
