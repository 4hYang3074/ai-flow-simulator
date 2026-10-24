"""S4 纠正检测 Correction: the person says the last answer missed.

The previous question and answer are pulled out and handed to the model as
the thing being corrected. A rule from a production
mentor service: a correction is never cut to fit a
budget, because dropping it is how the same mistake gets repeated.
"""

from __future__ import annotations

from typing import Any

from app.memory import clip
from app.pipeline.context import TurnContext
from app.routing import CORRECTION_CUE

PREVIEW_CHARS = 80


async def run(ctx: TurnContext) -> dict[str, Any]:
    pairs = ctx.store.pairs(ctx.conversation_id)
    previous = pairs[-1]
    material = ctx.add_material(
        "correction",
        f"Your previous answer, which the user is now correcting:\nQ: {clip(previous.question)}\nA: {clip(previous.answer)}",
        previous.user_id,
    )
    cue = CORRECTION_CUE.search(ctx.message)
    return {
        "cue": cue.group(0).strip() if cue else None,
        "label": material.label,
        "previous_question": previous.question[:PREVIEW_CHARS],
        "previous_answer": previous.answer[:PREVIEW_CHARS],
    }
