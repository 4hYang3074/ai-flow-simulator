"""S2 意图路由 Intent Routing: decide which route the rest of the turn takes.

Rules first; the model only when the rules have nothing and the message is
short enough to be a follow-up ("为什么？", "然后呢", "具体一点"). The model
answers in a fixed JSON shape; anything else falls back to the basic route,
never a guess (production routers are fail-closed in the same way).
"""

from __future__ import annotations

import json
import time
from typing import Any

from app.llm import LLMUnavailable
from app.pipeline.context import TurnContext
from app.routing import decide

# Rules decide most messages. A short message they cannot place is the case
# where a model's judgement is worth one extra call.
MODEL_MAX_CHARS = 12

ROUTE_SCHEMA = {
    "type": "object",
    "properties": {
        "route": {"type": "string", "enum": ["basic", "reference", "correction"]},
        "reason": {"type": "string"},
    },
    "required": ["route", "reason"],
}

ROUTER_PROMPT = (
    "Classify the user's new message in a chat.\n"
    "- reference: it continues or points back to the previous exchange and makes no sense alone "
    "(e.g. 'why?', 'and then?', 'more details', '为什么', '然后呢').\n"
    "- correction: it says the previous answer was wrong or misunderstood.\n"
    "- basic: a self-contained new question or statement.\n"
    'Reply with JSON: {"route": ..., "reason": "<one short sentence>"}.'
)


async def run(ctx: TurnContext) -> dict[str, Any]:
    has_history = bool(ctx.store.pairs(ctx.conversation_id))
    rule = decide(ctx.message, has_history)
    summary: dict[str, Any] = {
        "decided_by": "rule",
        "rule": rule.rule,
        "matched": rule.matched,
        "has_history": has_history,
    }
    route = rule.route
    ctx.small_talk = rule.small_talk

    if route is None and has_history and len(ctx.message) <= MODEL_MAX_CHARS:
        summary["decided_by"] = "model"
        started = time.perf_counter()
        try:
            raw = await ctx.llm.complete_json(
                ctx.settings.chat_model,
                [{"role": "system", "content": ROUTER_PROMPT}, {"role": "user", "content": ctx.message}],
                ROUTE_SCHEMA,
            )
            parsed = json.loads(raw)
            if parsed.get("route") in ("basic", "reference", "correction"):
                route = parsed["route"]
                summary["model_reason"] = str(parsed.get("reason", ""))[:200]
            else:
                summary["model_invalid"] = True
        except (LLMUnavailable, json.JSONDecodeError, AttributeError):
            summary["model_invalid"] = True
        summary["model_ms"] = round((time.perf_counter() - started) * 1000, 1)

    if route is None:
        route = "basic"
        if summary["decided_by"] == "rule":
            summary["decided_by"] = "default"
    summary["route"] = route
    ctx.route_change = route
    return summary
