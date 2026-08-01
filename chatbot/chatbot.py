from chatbot import insights
from chatbot.query_handler import parse_message

EXAMPLE_PROMPTS = [
    "Best crop for Punjab",
    "Compare rice and cotton",
    "Top states for maize",
    "Show cotton data",
    "Yield of chickpea in Bihar",
]

HELP_REPLY = "I can help with things like:\n" + "\n".join(f"• {e}" for e in EXAMPLE_PROMPTS)
GREETING_REPLY = (
    "Hey! I can answer questions about crops, states and yields in the dataset — "
    "try asking something like 'best crop for Punjab'."
)
FALLBACK_REPLY = (
    "I didn't quite catch that. Try naming a crop or state, or ask me to "
    "'compare rice and cotton'."
)


def handle_message(db, message: str) -> dict:
    crops = [r["crop"] for r in db.execute("SELECT DISTINCT crop FROM crop_data").fetchall()]
    states = [r["state_name"] for r in db.execute("SELECT DISTINCT state_name FROM crop_data").fetchall()]

    parsed = parse_message(message, crops, states)
    intent = parsed["intent"]
    found_crops = parsed["crops"]
    found_states = parsed["states"]

    reply, redirect = FALLBACK_REPLY, None

    if intent == "compare_crops":
        reply, redirect = insights.compare_crops(db, found_crops[0], found_crops[1])
    elif intent == "best_crop_for_state":
        reply, redirect = insights.best_crop_for_state(db, found_states[0])
    elif intent == "top_states_for_crop":
        reply, redirect = insights.top_states_for_crop(db, found_crops[0])
    elif intent == "show_crop_data":
        reply, redirect = insights.show_crop_data(db, found_crops[0], found_states[0] if found_states else None)
    elif intent == "yield_stats":
        reply, redirect = insights.yield_stats(db, found_crops[0], found_states[0] if found_states else None)
    elif intent == "greeting":
        reply, redirect = GREETING_REPLY, None
    elif intent == "help":
        reply, redirect = HELP_REPLY, None

    show_examples = intent in ("fallback", "greeting", "help")

    return {
        "reply": reply,
        "redirect_url": redirect,
        "examples": EXAMPLE_PROMPTS if show_examples else None,
    }
