"""Long-term memory: extract lasting facts and check every one against the text.

Follows a production mentor service's compacted memory: the model proposes facts ("assertions")
as `field`, `value` and a `quote`, and a fact is kept only if its quote appears
word for word in the user's message. That proves where the fact came from; it
does not prove the model understood it, which is why the page shows the quote
next to every fact.

Facts quoted from a question, or whose value is "unknown", are rejected too:
a question is not a statement about the user.

A newer fact for the same field replaces the older one (a new revision); the
old row stays, marked as superseded, so the history of a fact is visible.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass

MAX_FACTS = 5
MAX_FIELD_CHARS = 30
MAX_VALUE_CHARS = 80

FACT_SCHEMA = {
    "type": "object",
    "properties": {
        "facts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "field": {"type": "string"},
                    "value": {"type": "string"},
                    "quote": {"type": "string"},
                },
                "required": ["field", "value", "quote"],
            },
        }
    },
    "required": ["facts"],
}

EXTRACT_PROMPT = (
    "From the USER MESSAGE only, extract lasting facts about the user that would help in "
    "future conversations: their name, family, pets, preferences, plans, constraints, "
    "background. Ignore questions, requests, small talk, and anything about the assistant.\n"
    "Each fact has:\n"
    "- field: a short label in the user's language (e.g. 猫的名字, favourite food)\n"
    "- value: the fact itself, short\n"
    "- quote: the shortest part of the user message that states it, copied exactly\n"
    'Reply with JSON {"facts": [...]}. Reply {"facts": []} when there is nothing lasting.'
)


# A small model sometimes "extracts" facts from a question: asked "我的猫叫
# 什么名字？", it proposed "猫的名字: 未知", which would have replaced the real
# name. The prompt already says to ignore questions; these checks make sure.
# Clauses, not sentences: "我叫阿明，你能推荐一本书吗？" states a fact in its
# first clause and asks in its second.
_SENTENCES = re.compile(r"[^。！？!?.\n，,；;]+[。！？!?.，,；;]?")
_QUESTION = re.compile(
    r"[?？]\s*$|吗\s*$|呢\s*$|什么|几[个岁年号点天]|多少|哪|谁|怎么|是否|有没有"
    r"|^\s*(?:what|how|which|who|where|when|why|do|does|did|is|are|can|could|should)\b",
    re.I,
)
_UNKNOWN = {"未知", "不知道", "不清楚", "无", "没有", "unknown", "n/a", "none", "null", "?", "？"}


def _from_question(quote: str, user_text: str) -> bool:
    """True when the quoted words sit in a question sentence."""

    for sentence in _SENTENCES.findall(user_text):
        if quote in sentence or sentence.strip() in quote:
            if _QUESTION.search(sentence.strip()):
                return True
    return bool(_QUESTION.search(quote))


@dataclass(frozen=True, slots=True)
class Proposed:
    field: str
    value: str
    quote: str


def validate_extraction(raw: str, user_text: str) -> tuple[list[Proposed], list[dict[str, str]]]:
    """(accepted, rejected-with-reason). Never raises on bad model output."""

    try:
        data = json.loads(raw)
        items = data.get("facts", []) if isinstance(data, dict) else []
    except json.JSONDecodeError:
        return [], [{"reason": "invalid_json"}]
    if not isinstance(items, list):
        return [], [{"reason": "invalid_json"}]

    accepted: list[Proposed] = []
    rejected: list[dict[str, str]] = []
    seen_fields: set[str] = set()
    for item in items[: MAX_FACTS * 2]:
        if not isinstance(item, dict):
            continue
        field = str(item.get("field", "")).strip()
        value = str(item.get("value", "")).strip()
        quote = str(item.get("quote", "")).strip()
        shown = {"field": field[:MAX_FIELD_CHARS], "value": value[:MAX_VALUE_CHARS], "quote": quote[:MAX_VALUE_CHARS]}
        if not field or not value or not quote:
            rejected.append({**shown, "reason": "missing_part"})
        elif len(field) > MAX_FIELD_CHARS or len(value) > MAX_VALUE_CHARS:
            rejected.append({**shown, "reason": "too_long"})
        elif quote not in user_text:
            rejected.append({**shown, "reason": "quote_not_in_message"})
        elif value.lower() in _UNKNOWN:
            rejected.append({**shown, "reason": "unknown_value"})
        elif _from_question(quote, user_text):
            rejected.append({**shown, "reason": "from_question"})
        elif field_key(field) in seen_fields:
            rejected.append({**shown, "reason": "duplicate_field"})
        elif len(accepted) >= MAX_FACTS:
            rejected.append({**shown, "reason": "too_many"})
        else:
            seen_fields.add(field_key(field))
            accepted.append(Proposed(field, value, quote))
    return accepted, rejected


def field_key(field: str) -> str:
    """Fields match regardless of case and surrounding spaces."""

    return " ".join(field.lower().split())
