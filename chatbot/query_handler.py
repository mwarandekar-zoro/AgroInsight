"""
AgriInsight AI — chatbot query understanding

Rule-based on purpose: fast, free, and fully deterministic, so answers are
always grounded in what's actually in crop_data — no hallucination risk.
If you later want more open-ended Q&A, this is the seam to swap in an LLM
call (e.g. via the Anthropic API) while keeping the DB-lookup functions in
chatbot/insights.py as the "ground truth" the model is allowed to cite.
"""
import re

GREETING_WORDS = {"hi", "hello", "hey", "yo", "hola", "sup"}
HELP_WORDS = {"help", "what can you do", "examples", "commands"}


def parse_message(message: str, crops: list, states: list) -> dict:
    text = message.lower().strip()

    found_crops = [c for c in crops if re.search(rf"\b{re.escape(c)}\b", text)]
    found_crops.sort(key=lambda c: text.index(c))
    # states can be multi-word ("Andhra Pradesh") — plain substring match is fine here
    found_states = [s for s in states if s.lower() in text]
    found_states.sort(key=lambda s: text.index(s.lower()))

    intent = "fallback"

    if len(found_crops) >= 2 and any(k in text for k in ["compare", " vs ", " versus "]):
        intent = "compare_crops"
    elif found_states and any(k in text for k in ["best crop", "recommend", "which crop", "what crop", "suggest"]):
        intent = "best_crop_for_state"
    elif found_crops and any(k in text for k in ["top state", "best state", "which state"]):
        intent = "top_states_for_crop"
    elif found_crops and any(k in text for k in ["show", "filter", "go to", "open"]):
        intent = "show_crop_data"
    elif found_crops and any(k in text for k in ["yield", "average", "how much", "how many", "rainfall", "temperature", "climate"]):
        intent = "yield_stats"
    elif text in GREETING_WORDS or (len(text.split()) <= 3 and any(w in text for w in GREETING_WORDS)):
        intent = "greeting"
    elif any(k in text for k in HELP_WORDS):
        intent = "help"
    elif found_crops and found_states:
        # entities present but no clear verb — default to a yield lookup
        intent = "yield_stats"
    elif found_crops:
        intent = "yield_stats"
    elif found_states:
        intent = "best_crop_for_state"

    return {"intent": intent, "crops": found_crops, "states": found_states}
