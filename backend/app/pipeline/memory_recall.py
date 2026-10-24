"""S6 记忆提取 Memory Recall: find what this conversation already said.

Three layers:

1. Short-term: the newest 3 question-answer pairs, replayed as is (5 when the
   context check finds 3 are not enough).
2. Long-term: the facts kept in the memory notebook, given as a summary.
3. Semantic: the older pairs are compared with the new message by embedding
   similarity, and the closest ones above the threshold are brought back.

If the embedding model is unavailable the turn goes on with short-term memory
only: recall is a help, not a requirement.
"""

from __future__ import annotations

import time
from typing import Any

from app.llm import LLMUnavailable
from app.memory import (
    RECALL_MIN_SCORE,
    RECALL_TOP_K,
    clip,
    normalize,
    query_text,
    rank,
    split_recent,
)
from app.pipeline.context import TurnContext

PREVIEW_CHARS = 60
SHOWN_CANDIDATES = 5


def _preview(text: str) -> str:
    return text if len(text) <= PREVIEW_CHARS else text[:PREVIEW_CHARS] + "…"


async def run(ctx: TurnContext) -> dict[str, Any]:
    model = ctx.settings.embed_model
    ctx.history = ctx.store.pairs(ctx.conversation_id)
    older, recent = split_recent(ctx.history, ctx.window)
    ctx.recent = recent
    facts = ctx.store.facts(ctx.conversation_id)
    if facts:
        ctx.add_material("summary", "Known facts about the user: " + "; ".join(f"{f.field}: {f.value}" for f in facts))
    summary: dict[str, Any] = {
        "recent_pairs": [{"question": _preview(p.question), "user_message_id": p.user_id} for p in recent],
        "facts": [{"field": f.field, "value": f.value} for f in facts],
        "recent_limit": ctx.window,
        "older_pairs": len(older),
        "embed_model": model,
        "threshold": RECALL_MIN_SCORE,
        "top_k": RECALL_TOP_K,
        "candidates": [],
        "note": None,
    }
    if not older:
        summary["note"] = "no_older_pairs"
        return summary

    vectors = ctx.store.embeddings([p.user_id for p in older], model)
    summary["unembedded_pairs"] = len(older) - len(vectors)
    started = time.perf_counter()
    try:
        [query] = await ctx.llm.embed(model, [query_text(ctx.message)])
    except LLMUnavailable:
        summary["note"] = "embed_unavailable"
        return summary
    summary["embed_ms"] = round((time.perf_counter() - started) * 1000, 1)

    ranked = rank(normalize(query), older, vectors)
    ctx.recalled = [s for s in ranked if s.picked]
    for s in ctx.recalled:
        ctx.add_material("memory", f"Q: {clip(s.pair.question)}\nA: {clip(s.pair.answer)}", s.pair.user_id)
    summary["candidates"] = [
        {
            "question": _preview(s.pair.question),
            "user_message_id": s.pair.user_id,
            "score": round(s.score, 3),
            "picked": s.picked,
        }
        for s in ranked[:SHOWN_CANDIDATES]
    ]
    return summary
