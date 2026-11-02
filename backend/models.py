"""Bounded, opt-in Meta Chat Completions adapter; no response cache or retries.

Protocol checked against https://dev.meta.ai/docs/cookbook/tool-function-calling
and https://dev.meta.ai/docs/api-reference/chat-completions/create-chat-completion
on 2026-10-30. Model/account access still requires a real account-side check.
"""
import os
import math
import time
from uuid import uuid4

import httpx

from .jsonutil import clone, digest, now


class ModelFailure(RuntimeError):
    pass


def request_identity(base_url: str, payload: dict) -> str:
    return digest({"endpoint": base_url.rstrip("/") + "/chat/completions", "request": payload})


def bounded_integer(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
        return max(minimum, min(maximum, value))
    except ValueError:
        return default


def meta_status() -> dict:
    key_present = bool(os.getenv("MODEL_API_KEY") or os.getenv("META_API_KEY"))
    model = os.getenv("META_MODEL", "")
    allowance = bounded_integer("ATM_LIVE_MAX_CALLS", 0, 0, 12)
    blockers = []
    if not key_present:
        blockers.append("Set MODEL_API_KEY in the server environment.")
    if not model:
        blockers.append("Set META_MODEL to a model your Meta account can access.")
    if not allowance:
        blockers.append("Set ATM_LIVE_MAX_CALLS to a bounded allowance (1-12) to enable paid requests.")
    return {"available": not blockers, "blockers": blockers, "model": model or None,
            "base_url": os.getenv("META_BASE_URL", "https://api.meta.ai/v1"),
            "max_calls": allowance,
            "max_output_tokens": bounded_integer("ATM_LIVE_MAX_OUTPUT_TOKENS", 700, 64, 2048),
            "account_access": "not_verified", "price_status": "configured" if
            os.getenv("META_INPUT_USD_PER_MILLION") and os.getenv("META_OUTPUT_USD_PER_MILLION") else "unknown"}


def price(usage: dict | None) -> float | None:
    if not usage:
        return None
    try:
        input_rate = float(os.environ["META_INPUT_USD_PER_MILLION"])
        output_rate = float(os.environ["META_OUTPUT_USD_PER_MILLION"])
        if not all(math.isfinite(rate) and rate >= 0 for rate in (input_rate, output_rate)):
            return None
        return (usage["prompt_tokens"] * input_rate + usage["completion_tokens"] * output_rate) / 1_000_000
    except (KeyError, ValueError, TypeError):
        return None


class MetaClient:
    def __init__(self, store):
        self.store = store
        self.status = meta_status()

    def complete(self, messages: list, tools: list, run_id: str, purpose: str,
                 spent_calls: int, proposal_id: str | None = None, json_output: bool = False) -> tuple[dict, dict]:
        if not self.status["available"]:
            raise ModelFailure("Live Meta is unavailable. " + " ".join(self.status["blockers"]))
        if spent_calls >= self.status["max_calls"]:
            raise ModelFailure("Live call allowance exhausted. Run is incomplete; increase the explicit allowance for a new run.")
        base_url = self.status["base_url"]
        # Credentials are only sent to the official Meta API. Add another
        # provider as a separate adapter rather than silently redirecting a key.
        if base_url.rstrip("/") != "https://api.meta.ai/v1":
            raise ModelFailure("This adapter supports only https://api.meta.ai/v1. Correct META_BASE_URL.")
        payload = {"model": self.status["model"], "messages": clone(messages),
                   "max_completion_tokens": self.status["max_output_tokens"]}
        if tools:
            payload.update({"tools": clone(tools), "parallel_tool_calls": False})
        if json_output:
            payload["response_format"] = {"type": "json_object"}
        if len(str(payload)) > 80_000:
            raise ModelFailure("Input exceeds the local 80,000-character request allowance; use a shorter run.")
        record = {"id": "call_" + uuid4().hex, "run_id": run_id, "proposal_id": proposal_id,
                  "purpose": purpose, "model": self.status["model"], "created_at": now(),
                  "request_hash": request_identity(base_url, payload), "request": payload,
                  "usage": None, "cost_usd": None, "latency_ms": 0, "retries": 0,
                  "status": "failed", "error": None, "response": None}
        started = time.perf_counter()
        try:
            key = os.getenv("MODEL_API_KEY") or os.environ["META_API_KEY"]
            timeout = bounded_integer("ATM_LIVE_TIMEOUT_SECONDS", 30, 1, 60)
            with httpx.Client(timeout=timeout, follow_redirects=False, trust_env=False) as client:
                response = client.post(base_url.rstrip("/") + "/chat/completions",
                                       headers={"Authorization": "Bearer " + key}, json=payload)
            if response.status_code != 200:
                raise ModelFailure(f"Meta API returned HTTP {response.status_code}. No retries were made.")
            body = response.json()
            usage = body.get("usage")
            if isinstance(usage, dict) and all(type(usage.get(k)) is int and usage[k] >= 0
                                               for k in ("prompt_tokens", "completion_tokens")):
                record["usage"] = {k: usage[k] for k in ("prompt_tokens", "completion_tokens")}
                record["usage"]["total_tokens"] = sum(record["usage"].values())
                record["cost_usd"] = price(record["usage"])
            choices = body.get("choices") or []
            if not choices:
                raise ModelFailure("Meta response has no choices; run is incomplete.")
            if choices[0].get("finish_reason") not in ("stop", "tool_calls"):
                raise ModelFailure("Meta response was truncated or did not complete; run is incomplete.")
            raw = choices[0]["message"]
            # Record externally observable output only, never reasoning fields.
            message = {"role": "assistant", "content": raw.get("content")}
            if raw.get("tool_calls"):
                message["tool_calls"] = raw["tool_calls"]
            if message["content"] is not None and not isinstance(message["content"], str):
                raise ModelFailure("Unsupported Meta content format.")
            record["response"] = clone(message)
            record["status"] = "completed"
            return message, record
        except Exception as error:
            record["error"] = str(error) if isinstance(error, ModelFailure) else "Meta request failed: " + type(error).__name__
            raise ModelFailure(record["error"]) from error
        finally:
            record["latency_ms"] = round((time.perf_counter() - started) * 1000, 2)
            self.store.log_model_call(record)


def aggregate_usage(calls: list[dict]) -> dict:
    if not calls:
        return {"calls": 0, "known_tokens": 0, "total_tokens": 0, "cost_usd": None,
                "cost_status": "not_applicable", "latency_ms": 0, "unknown_usage_calls": 0, "retries": 0}
    known_tokens = sum(c["usage"]["total_tokens"] for c in calls if c.get("usage"))
    unknown = sum(c.get("usage") is None for c in calls)
    costs_known = all(c.get("cost_usd") is not None for c in calls)
    return {"calls": len(calls), "known_tokens": known_tokens,
            "total_tokens": None if unknown else known_tokens, "unknown_usage_calls": unknown,
            "cost_usd": sum(c["cost_usd"] for c in calls) if costs_known else None,
            "cost_status": "configured_rates" if costs_known else "unknown",
            "latency_ms": round(sum(c["latency_ms"] for c in calls), 2),
            "retries": sum(c["retries"] for c in calls)}

