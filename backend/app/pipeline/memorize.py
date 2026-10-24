"""S12 长期记忆 Long-term Memory: keep what is worth remembering for good.

After the pair is saved, the model reads the user's message once more and
proposes lasting facts ("猫的名字: 小白"). Each fact must quote the message
word for word, or it is rejected. Kept facts go into the memory notebook and
are given to the model as a summary in every later turn.

A failure here never fails the turn: the answer is already complete and
saved, and long-term memory is an extra.
"""

from __future__ import annotations

import time
from typing import Any

from app.llm import LLMUnavailable
from app.pipeline.context import TurnContext
from app.summary import EXTRACT_PROMPT, FACT_SCHEMA, field_key, validate_extraction


async def run(ctx: TurnContext) -> dict[str, Any]:
    summary: dict[str, Any] = {"saved": [], "superseded": [], "rejected": [], "note": None}
    started = time.perf_counter()
    try:
        raw = await ctx.llm.complete_json(
            ctx.settings.chat_model,
            [{"role": "system", "content": EXTRACT_PROMPT}, {"role": "user", "content": f"USER MESSAGE:\n{ctx.message}"}],
            FACT_SCHEMA,
        )
    except LLMUnavailable:
        summary["note"] = "model_unavailable"
        return summary
    summary["model_ms"] = round((time.perf_counter() - started) * 1000, 1)

    accepted, rejected = validate_extraction(raw, ctx.message)
    summary["rejected"] = rejected
    for fact in accepted:
        new, replaced = ctx.store.save_fact(
            ctx.conversation_id, fact.field, field_key(fact.field), fact.value, fact.quote, ctx.user_message_id
        )
        summary["saved"].append(
            {"id": new.id, "field": new.field, "value": new.value, "quote": new.quote, "revision": new.revision}
        )
        if replaced:
            summary["superseded"].append({"field": replaced.field, "old_value": replaced.value, "new_value": new.value})
    summary["total_facts"] = len(ctx.store.facts(ctx.conversation_id))
    if not accepted and not rejected:
        summary["note"] = "nothing_lasting"
    return summary
