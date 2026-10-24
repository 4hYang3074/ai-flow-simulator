"""S1 隐私脱敏 Redact: swap personal data for placeholders before anything else.

From here on, every stage (and the stored history) sees `[PHONE_1]` instead
of the number. The original is kept only in this turn's vault, to put the
real value back into the answer shown on screen.
"""

from __future__ import annotations

from typing import Any

from app.pipeline.context import TurnContext

PREVIEW_CHARS = 120


async def run(ctx: TurnContext) -> dict[str, Any]:
    redacted, counts = ctx.vault.redact(ctx.message)
    ctx.message = redacted
    return {
        "found": counts,
        "total": sum(counts.values()),
        "redacted_preview": redacted[:PREVIEW_CHARS],
    }
