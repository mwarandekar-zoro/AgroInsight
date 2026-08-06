"""
AgroInsight AI — Groq LLM fallback

Only called when chatbot/query_handler.py can't match a known intent
(no crop/state + recognized verb in the message). Known intents still go
straight through chatbot/insights.py's DB queries — those are cheap,
instant, and can't hallucinate numbers, so there's no reason to route
them through an LLM.

This module is the "open-ended" escape hatch: general farming questions,
follow-ups, phrasing the rule-based matcher doesn't recognize, etc.
It's given the real list of crops/states in the dataset so it can point
people back at things AgroInsight actually has data on, but it is NOT
given row-level stats — it should never state a yield/rainfall/pH number
as if it came from the dataset, since it didn't run a query for it.
"""
import logging

from flask import current_app
from groq import Groq

logger = logging.getLogger(__name__)

SYSTEM_PROMPT_TEMPLATE = """You are the AI Assistant inside AgroInsight AI, a smart agriculture \
analytics platform. Answer the user's farming/agriculture question helpfully and concisely \
(2-4 sentences unless more detail is clearly needed).

The AgroInsight dataset itself only covers these crops: {crops}
across these states: {states}.

If the user asks something the dataset could answer directly (e.g. "best crop for X", \
"compare A and B", "yield of X in Y"), tell them to rephrase it that way so the app can \
pull the real number for them, since you don't have direct database access and must not \
invent statistics (yields, rainfall, pH, etc.) yourself.

For general agriculture knowledge questions outside the dataset's scope, answer normally \
from your own knowledge, but keep it about farming/agriculture — this is a domain-specific \
assistant, not a general-purpose chatbot."""


def get_llm_reply(message: str, crops: list, states: list) -> str | None:
    """Return a Groq-generated reply, or None if Groq isn't configured/available.

    Returning None lets the caller (chatbot/chatbot.py) fall back to the
    old canned FALLBACK_REPLY, so a missing key or a Groq outage degrades
    gracefully instead of breaking the assistant.
    """
    api_key = current_app.config.get("GROQ_API_KEY")
    if not api_key:
        logger.info("GROQ_API_KEY not set — skipping LLM fallback.")
        return None

    system_prompt = SYSTEM_PROMPT_TEMPLATE.format(
        crops=", ".join(sorted(crops)) or "none",
        states=", ".join(sorted(states)) or "none",
    )

    try:
        client = Groq(api_key=api_key)
        completion = client.chat.completions.create(
            model=current_app.config.get("GROQ_MODEL", "llama-3.3-70b-versatile"),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": message},
            ],
            temperature=0.4,
            max_tokens=300,
        )
        return completion.choices[0].message.content.strip()
    except Exception:
        # Network hiccup, bad key, rate limit, model deprecated, etc. —
        # never let an LLM outage 500 the whole /api/chat endpoint.
        logger.exception("Groq API call failed; falling back to canned reply.")
        return None
