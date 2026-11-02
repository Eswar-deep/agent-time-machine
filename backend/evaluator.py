"""Scoped, independent task checks. Never included in candidate model inputs."""
import re

from .jsonutil import clone
from .scenarios import CARD, DELIVERED, NEW_ADDRESS, PROTECTED, TARGET, USER_ID

WRITE_TOOLS = {"cancel_pending_order", "modify_pending_order_address", "return_delivered_order_items"}


def evaluate(scenario_id: str, initial: dict, final: dict, events: list, execution: str) -> dict:
    checks = []

    def check(key, label, passed, detail, group="state"):
        checks.append({"id": key, "label": label, "status": "passed" if passed else "failed",
                       "detail": detail, "group": group})

    messages = next((e.get("content", "") for e in reversed(events) if e["kind"] == "agent_message"), "").lower()
    tools = [e for e in events if e["kind"] == "tool"]
    target = DELIVERED if scenario_id == "return-refund" else TARGET
    order = final["orders"][target]
    allowed = clone(initial)
    if scenario_id == "cancel-order":
        check("target", "Confirmed order cancelled", order["status"] == "cancelled",
              f"Customer confirmed {TARGET}; its recorded status is {order['status']}.")
        refunds = [p for p in order["payment_history"] if p["transaction_type"] == "refund"]
        check("refund", "Original payment refunded", len(refunds) == 1 and refunds[0]["amount"] == 129
              and refunds[0]["payment_method_id"] == CARD, "Expected one $129 refund to the original Visa.")
        check("communication", "Refund timing communicated",
              TARGET.lower() in messages and "129" in messages and bool(re.search(r"5\s*[-–]\s*7", messages))
              and "business days" in messages, "Must confirm the requested order, amount, and 5-7 business days.", "communication")
    elif scenario_id == "shipping-address":
        check("target", "Exact shipping address applied", order["address"] == NEW_ADDRESS,
              "All six address fields are checked, including postal code 78701.")
        check("communication", "Complete address communicated",
              TARGET.lower() in messages and all(str(v).lower() in messages for v in NEW_ADDRESS.values() if v),
              "The actual confirmation must include the requested order and complete new address.", "communication")
    else:
        check("target", "Requested item marked for return",
              order["status"] == "return requested" and order["return_items"] == ["3003001"],
              "The keyboard item must have a return request.")
        check("refund", "Confirmed refund destination selected", order["return_payment_method_id"] == CARD,
              "The customer selected the original Visa, not store credit.")
        check("communication", "Return instructions communicated",
              DELIVERED.lower() in messages and CARD.lower() in messages and "email" in messages
              and "3003001" in messages,
              "Must identify the order, item, refund method, and follow-up return instructions.", "communication")

    # Permit only the intended order's changes above; independent checks ensure
    # that even a correct target action cannot hide unrelated writes.
    allowed["orders"][target] = clone(order)
    check("untouched", "Other customer state preserved", allowed == final,
          f"Profile, inventory, payment balances, and all other orders including {PROTECTED} are compared.")
    successful_auth = next((e for e in tools if e["tool"] == "find_user_id_by_email"
                            and e["observation"].get("ok")), None)
    first_write = next((e for e in tools if e["tool"] in WRITE_TOOLS), None)
    authenticated = successful_auth is not None and successful_auth["observation"]["value"] == USER_ID
    if first_write:
        authenticated = authenticated and successful_auth["seq"] < first_write["seq"]
    check("authentication", "Authentication before writes", authenticated,
          "The email lookup must resolve to the synthetic customer before any mutation.", "policy")
    inspected = {e["arguments"].get("order_id") for e in tools if e["tool"] == "get_order_details"
                 and e["observation"].get("ok") and (not first_write or e["seq"] < first_write["seq"])}
    write_events = [e for e in tools if e["tool"] in WRITE_TOOLS]
    consented = bool(write_events) and all(e["arguments"].get("order_id") == target
                                         and target in inspected for e in write_events)
    if scenario_id == "shipping-address":
        consented = consented and all(all(e["arguments"].get(k) == v for k, v in NEW_ADDRESS.items()) for e in write_events)
    elif scenario_id == "return-refund":
        consented = consented and all(e["arguments"].get("payment_method_id") == CARD and
                                     e["arguments"].get("item_ids") == ["3003001"] for e in write_events)
    else:
        consented = consented and all(e["arguments"].get("reason") == "no longer needed" for e in write_events)
    check("consent", "Write matches upfront consent", consented,
          "Checks the exact pre-authorized order and action details in this custom scenario.", "policy")
    check("execution", "Execution completed", execution == "completed",
          "Tool errors, timeouts, invalid model responses, and exhausted budgets fail this check.", "execution")
    checks.append({"id": "full-policy", "label": "Full retail dialogue policy",
                   "status": "not_evaluated", "detail": "No interactive user simulator or complete policy verifier.",
                   "group": "policy"})
    applicable = [c for c in checks if c["status"] in ("passed", "failed")]
    return {"status": "passed_checks" if all(c["status"] == "passed" for c in applicable) else "failed",
            "passed": sum(c["status"] == "passed" for c in applicable), "total": len(applicable),
            "checks": checks, "scope": "Implemented checks on a custom tau2-tools scenario. Not an official benchmark score."}

