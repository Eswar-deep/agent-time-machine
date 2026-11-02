"""An explicitly deterministic demo policy, not an LLM or recovery benchmark.

Only its next action is computed. Observations and final messages are generated
again after a fork; no saved trajectory suffix is used as a continuation.
"""
from .scenarios import CARD, DELIVERED, EMAIL, GIFT, NEW_ADDRESS, PROTECTED, TARGET
from .jsonutil import clone


def tool_value(messages: list, name: str):
    calls = {}
    result = None
    for message in messages:
        for call in message.get("tool_calls", []):
            calls[call["id"]] = call["function"]["name"]
        if message["role"] == "tool" and calls.get(message["tool_call_id"]) == name:
            import json
            observed = json.loads(message["content"])
            if observed.get("ok"):
                result = observed["value"]
    return result


def next_demo_action(scenario_id: str, state: dict, messages: list) -> dict | None:
    cursor = state["cursor"]
    if cursor == 0:
        return {"tool": "find_user_id_by_email", "arguments": {"email": EMAIL}}
    if cursor == 1:
        user_id = tool_value(messages, "find_user_id_by_email")
        return {"tool": "get_user_details", "arguments": {"user_id": user_id}}
    if cursor == 2:
        target = DELIVERED if scenario_id == "return-refund" else TARGET
        return {"tool": "get_order_details", "arguments": {"order_id": target}}
    if cursor == 3:
        return {"tool": "get_order_details", "arguments": {"order_id": PROTECTED}}
    if cursor == 4:
        if scenario_id == "cancel-order":
            action = {"tool": "cancel_pending_order", "arguments": {"order_id": TARGET, "reason": "no longer needed"}}
        elif scenario_id == "shipping-address":
            action = {"tool": "modify_pending_order_address", "arguments": {"order_id": TARGET, **NEW_ADDRESS}}
        else:
            action = {"tool": "return_delivered_order_items", "arguments": {
                "order_id": DELIVERED, "item_ids": ["3003001"], "payment_method_id": CARD}}
        if state["inject_failure"] and not state["injection_consumed"]:
            if scenario_id == "cancel-order":
                action["arguments"]["order_id"] = PROTECTED
            elif scenario_id == "shipping-address":
                action["arguments"]["zip"] = "75080"
            else:
                action["arguments"]["payment_method_id"] = GIFT
            state["injection_consumed"] = True
        return clone(action)
    return None


def demo_final(messages: list) -> str:
    last = next((m for m in reversed(messages) if m["role"] == "tool"), None)
    if not last:
        return "No tool result is available; the request has not been completed."
    import json
    result = json.loads(last["content"])
    if not result.get("ok"):
        return "I could not complete the request: " + result["error"]["message"]
    value = result["value"]
    if not isinstance(value, dict) or "order_id" not in value:
        return "The last tool returned information, but I have not completed a change."
    order_id = value["order_id"]
    if value["status"] == "cancelled":
        refunds = [p for p in value["payment_history"] if p["transaction_type"] == "refund"]
        amount = sum(p["amount"] for p in refunds)
        method = refunds[-1]["payment_method_id"] if refunds else "unknown"
        timing = "immediately" if method.startswith("gift_card") else "in 5-7 business days"
        return f"Order {order_id} is cancelled. The refund is ${amount:.2f} to {method}, processed {timing}."
    if value["status"] == "return requested":
        return (f"A return is requested for order {order_id}, items {', '.join(value['return_items'] or [])}. "
                f"The selected refund method is {value['return_payment_method_id']}. "
                "Return instructions would follow by email in a real store; this simulator sends no email.")
    address = value["address"]
    complete = ", ".join(str(address[k]) for k in ("address1", "address2", "city", "state", "zip", "country") if address[k])
    return f"Order {order_id} currently ships to {complete}. Its status is {value['status']}."

