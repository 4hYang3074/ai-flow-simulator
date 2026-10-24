"""S0 接收与校验 Receive: is this a message we can take right now?

Real services also authenticate the caller and rate-limit per user here.
"""

from __future__ import annotations

from typing import Any

from app.pipeline.context import StageError, TurnContext

MAX_MESSAGE_CHARS = 2000


async def run(ctx: TurnContext) -> dict[str, Any]:
    text = ctx.message.strip()
    summary = {"chars": len(text), "limit": MAX_MESSAGE_CHARS}
    if not text or len(text) > MAX_MESSAGE_CHARS:
        raise StageError("invalid_message", summary)
    ctx.message = text
    return summary
