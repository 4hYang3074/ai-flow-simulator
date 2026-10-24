"""S9 LLM 生成 Generate: send the message list to Qwen and stream the answer.

Each piece of text is forwarded to the page the moment the model produces it,
which is why the reply appears word by word instead of all at once. Checking
the answer is the next stage's job.
"""

from __future__ import annotations

import time
from typing import Any

from app.llm import LLMUnavailable
from app.pipeline.context import StageError, TurnContext


async def stream_reply(ctx: TurnContext, messages: list[dict[str, str]]) -> dict[str, Any]:
    """Stream one answer into `ctx.reply`; return its timing and token counts."""

    model = ctx.settings.chat_model
    started = time.perf_counter()
    first_token_ms: float | None = None
    last = None
    try:
        async for chunk in ctx.llm.stream_chat(model, messages):
            if chunk.text:
                if first_token_ms is None:
                    first_token_ms = (time.perf_counter() - started) * 1000
                ctx.reply += chunk.text
                ctx.emit.token(chunk.text)
            if chunk.done:
                last = chunk
    except LLMUnavailable:
        raise StageError("llm_unavailable", {"model": model, "partial_chars": len(ctx.reply)})

    stats: dict[str, Any] = {
        "model": model,
        "first_token_ms": round(first_token_ms, 1) if first_token_ms is not None else None,
        "reply_chars": len(ctx.reply),
        "prompt_tokens": last.prompt_tokens if last else None,
        "output_tokens": last.output_tokens if last else None,
        "tokens_per_second": None,
    }
    if last and last.output_tokens and last.generate_ns:
        stats["tokens_per_second"] = round(last.output_tokens / (last.generate_ns / 1e9), 1)
    return stats


async def run(ctx: TurnContext) -> dict[str, Any]:
    stats = await stream_reply(ctx, ctx.prompt)
    ctx.usage = {k: stats[k] for k in ("prompt_tokens", "output_tokens", "tokens_per_second")}
    return stats
