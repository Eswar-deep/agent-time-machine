"""Synthetic development fixtures. These are not official tau2-bench tasks."""
from .jsonutil import clone

USER_ID = "maya_chen_demo"
EMAIL = "maya.chen@example.com"
TARGET = "#W1048201"
PROTECTED = "#W1048202"
DELIVERED = "#W1048203"
CARD = "credit_card_demo"
GIFT = "gift_card_demo"
NEW_ADDRESS = {"address1": "420 Congress Avenue", "address2": "Apt 12",
               "city": "Austin", "state": "TX", "country": "USA", "zip": "78701"}
SCENARIOS = {
    "cancel-order": {
        "id": "cancel-order", "title": "The wrong order", "category": "Order cancellation",
        "description": "Two pending orders. One cancellation. A small decision with a very different outcome.",
        "request": f"My email is {EMAIL}. Cancel order {TARGET}, the $129 headphones, because they are no longer needed. "
                   f"Keep my gift order {PROTECTED} unchanged. Yes, I explicitly confirm cancelling only {TARGET} "
                   "and refunding its $129 payment to my original Visa. Please confirm the refund timing.",
        "injected_failure": "The deterministic demo substitutes the gift order ID in the cancellation call.",
        "hint": "Compare the order ID in the pending call with the customer's confirmed order ID.",
        "initials": "MC", "customer": "Maya Chen",
    },
    "shipping-address": {
        "id": "shipping-address", "title": "A digit off", "category": "Shipping address",
        "description": "The street and city look right. The postal code tells a different story.",
        "request": f"My email is {EMAIL}. Change the shipping address for pending order {TARGET} to "
                   "420 Congress Avenue, Apt 12, Austin, TX 78701, USA. "
                   f"Do not change my profile or gift order {PROTECTED}. "
                   "Yes, I explicitly confirm this exact shipping-address change. Please confirm the complete address.",
        "injected_failure": "The deterministic demo substitutes 75080 for the requested postal code 78701.",
        "hint": "Compare every address field with the customer's request, including the postal code.",
        "initials": "MC", "customer": "Maya Chen",
    },
    "return-refund": {
        "id": "return-refund", "title": "The refund detour", "category": "Return request",
        "description": "A valid tool call can still miss the customer's instruction.",
        "request": f"My email is {EMAIL}. Request a return of keyboard item 3003001 in delivered order {DELIVERED}. "
                   f"Use my original Visa payment method {CARD}, not store credit. "
                   f"Keep gift order {PROTECTED} and my other orders unchanged. "
                   "Yes, I explicitly confirm this item, order, and refund method. Please explain how I return the item.",
        "injected_failure": "The deterministic demo requests store credit instead of the confirmed original Visa.",
        "hint": "A gift card is supported by the tool, but the customer explicitly requested the original card.",
        "initials": "MC", "customer": "Maya Chen",
    },
}


def scenario(scenario_id: str) -> dict:
    if scenario_id not in SCENARIOS:
        raise ValueError("Unknown scenario. Choose one of the available custom retail tasks.")
    return clone(SCENARIOS[scenario_id])


def initial_state() -> dict:
    address = {"address1": "800 W Campbell Road", "address2": "",
               "city": "Richardson", "state": "TX", "country": "USA", "zip": "75080"}
    items = [
        ("Headphones", "1001000", "1001001", 129.0),
        ("Ceramic mug", "2002000", "2002001", 36.0),
        ("Mechanical keyboard", "3003000", "3003001", 89.0),
    ]
    products = {product_id: {"name": name, "product_id": product_id, "variants": {
        item_id: {"item_id": item_id, "options": {"color": "black"},
                  "available": True, "price": price}}}
        for name, product_id, item_id, price in items}
    orders = {}
    for order_id, (name, product_id, item_id, price) in zip([TARGET, PROTECTED, DELIVERED], items):
        orders[order_id] = {
            "order_id": order_id, "user_id": USER_ID, "address": clone(address),
            "items": [{"name": name, "product_id": product_id, "item_id": item_id,
                       "price": price, "options": {"color": "black"}}],
            "status": "delivered" if order_id == DELIVERED else "pending",
            "fulfillments": [], "payment_history": [
                {"transaction_type": "payment", "amount": price, "payment_method_id": CARD}],
        }
    return {"products": products, "orders": orders, "users": {USER_ID: {
        "user_id": USER_ID, "name": {"first_name": "Maya", "last_name": "Chen"},
        "address": address, "email": EMAIL, "orders": [TARGET, PROTECTED, DELIVERED],
        "payment_methods": {
            CARD: {"source": "credit_card", "id": CARD, "brand": "visa", "last_four": "4242"},
            GIFT: {"source": "gift_card", "id": GIFT, "balance": 25.0},
        },
    }}}

