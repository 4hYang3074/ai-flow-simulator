"""S11 保存 Persist: store the pair, then index it for later recall.

Saving happens only after the answer is complete, so a failed turn never
leaves half an exchange in the history the next turn will read. What is saved
is the redacted text: placeholders, never the personal values.

The embedding is written after the messages: if it fails, the pair is still
saved and simply cannot be found by similarity until it is embedded. Small
talk and clarifying questions are not indexed; "你好" is never a useful memory.
"""

from __future__ import annotations

import time
from typing import Any

from app.llm import LLMUnavailable
from app.memory import normalize, pair_text
from app.pipeline.context import TurnContext

NOT_INDEXED_ROUTES = {"quick", "clarify"}


async def run(ctx: TurnContext) -> dict[str, Any]:
    pair = ctx.store.append_pair(ctx.conversation_id, ctx.message, ctx.reply)
    ctx.user_message_id = pair.user_id
    ctx.assistant_message_id = pair.answer_id
    summary: dict[str, Any] = {
        "user_message_id": pair.user_id,
        "assistant_message_id": pair.answer_id,
        "stored_pairs": len(ctx.store.pairs(ctx.conversation_id)),
        "embedded": False,
    }
    if ctx.route in NOT_INDEXED_ROUTES:
        summary["skipped"] = "not_indexed_route"
        return summary
    model = ctx.settings.embed_model
    started = time.perf_counter()
    try:
        [vector] = await ctx.llm.embed(model, [pair_text(pair)])
    except LLMUnavailable:
        return summary
    ctx.store.save_embedding(pair.user_id, model, normalize(vector))
    summary.update(embedded=True, embed_ms=round((time.perf_counter() - started) * 1000, 1), dimensions=len(vector))
    return summary
