"""A narrow adapter over unchanged, pinned tau2 retail behavior.

The candidate receives only the explicitly allowed tool schemas. No file access,
benchmark evaluator, gold trajectory, or user simulator is exposed.
"""
import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ValidationError

from .jsonutil import clone, digest

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendor" / "tau2"
os.environ.setdefault("TAU2_DATA_DIR", str(VENDOR / "data"))
sys.path.insert(0, str(VENDOR / "src"))

from tau2.domains.retail.data_model import RetailDB  # noqa: E402
from tau2.domains.retail.tools import RetailTools  # noqa: E402

COMMIT = "122e2432b82d740e8f313f46f0a071729c404f39"
ALLOWED_TOOLS = (
    "find_user_id_by_email", "get_user_details", "get_order_details",
    "get_product_details", "get_item_details", "cancel_pending_order",
    "modify_pending_order_address", "return_delivered_order_items",
)
POLICY = """You are a retail agent in a local, synthetic, pre-authorized scenario.
Authenticate using the user's email even if they provide an ID. Use only the
provided tools. Inspect the user profile and order before any write. Only act on
this authenticated user's orders. The request contains explicit, specific
consent: do exactly that action, with those details; no additional writes.
Make one tool call at a time. Report actual results and errors faithfully.
For a cancellation explain refund amount and timing: original gift-card refunds
are immediate; other original payment methods take 5-7 business days.
For a shipping change confirm the actual complete address.
For a return confirm the actual items and refund method and explain that return
instructions would follow by email in a real store. This simulator sends no email.
This is a custom upfront-consent contract, not the complete tau2 dialogue policy.
Never claim an order is refunded immediately when only a return was requested.
Do not request further user turns; finish with what you can do under this consent.
"""


class InvalidAction(ValueError):
    pass


class RetailEnvironment:
    def __init__(self, state: dict):
        self.toolkit = RetailTools(RetailDB.model_validate(clone(state)))
        self.tools = self.toolkit.get_tools(include=list(ALLOWED_TOOLS))

    def snapshot(self) -> dict:
        return self.toolkit.db.model_dump(mode="json")

    def schemas(self) -> list[dict]:
        schemas = clone([self.tools[name].openai_schema for name in sorted(self.tools)])
        for schema in schemas:
            schema["function"]["parameters"]["additionalProperties"] = False
        return schemas

    def validate(self, action: dict) -> dict:
        if not isinstance(action, dict) or set(action) != {"tool", "arguments"}:
            raise InvalidAction("An action must contain exactly 'tool' and 'arguments'.")
        name, arguments = action["tool"], action["arguments"]
        if not isinstance(name, str) or name not in self.tools:
            raise InvalidAction("Unsupported tool. Choose a tool from this checkpoint's schema.")
        if not isinstance(arguments, dict):
            raise InvalidAction("Tool arguments must be a JSON object.")
        parameters = self.tools[name].params
        extra = arguments.keys() - parameters.model_fields.keys()
        if extra:
            raise InvalidAction("Unknown argument(s): " + ", ".join(sorted(extra)))
        try:
            validated = parameters.model_validate(arguments, strict=True)
        except ValidationError as error:
            details = "; ".join(".".join(map(str, e["loc"])) + ": " + e["msg"]
                                for e in error.errors(include_input=False, include_url=False))
            raise InvalidAction("Invalid tool arguments: " + details) from error
        return {"tool": name, "arguments": validated.model_dump(mode="json")}

    def execute(self, action: dict) -> dict:
        """Execute on private state. Roll back partial writes if a tool raises."""
        action = self.validate(action)
        before = self.snapshot()
        try:
            result = self.tools[action["tool"]](**action["arguments"])
            if isinstance(result, BaseModel):
                result = result.model_dump(mode="json")
            return {"ok": True, "value": clone(result)}
        except Exception as error:
            self.__init__(before)
            return {"ok": False, "error": {"type": type(error).__name__, "message": str(error)}}


def compatibility() -> dict:
    manifest = json.loads((VENDOR / "PROVENANCE.json").read_text())
    observed = {}
    for relative, expected in manifest["files"].items():
        actual = hashlib.sha256((VENDOR / relative).read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError("Vendored simulator file changed: " + relative + ". Restore the pinned source.")
        observed[relative] = actual
    code = {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted((ROOT / "backend").glob("*.py"))}
    return {
        "simulator": "tau2-retail-subset", "commit": COMMIT,
        "source_hash": digest(observed), "application_hash": digest(code),
        "policy_hash": digest(POLICY), "python": sys.version.split()[0],
    }

