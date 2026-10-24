"""S5 引用话题 Reference Resolution: work out what "那个 / 第二个" points at.

- A list position ("第二个", "the second one") is looked up in the latest
  answer's numbered or bulleted list.
- Any other pointer ("它", "刚才那个") means the latest exchange: whichever
  topic came last is what "that" refers to (production chat services scan
  backwards the same way).

If the target cannot be found, the turn does not guess: it switches to the
clarify route and asks, without calling the model.
"""

from __future__ import annotations

from typing import Any

from app.memory import clip
from app.pipeline.context import TurnContext
from app.routing import ORDINAL_CUE, REFERENCE_CUE, is_chinese, list_items, ordinal_index

PREVIEW_CHARS = 100


def _clarify(ctx: TurnContext, cue: str | None, reason: str) -> dict[str, Any]:
    pointer = f"「{cue}」" if cue else "这个"
    ctx.reply = (
        f"你说的{pointer}是指哪一个？我在前面的对话里没找到对应的内容，能说得具体一点吗？"
        if is_chinese(ctx.message)
        else f"Which one do you mean by \"{cue or 'that'}\"? I couldn't find it earlier in our chat. Could you be more specific?"
    )
    ctx.emit.token(ctx.reply)
    ctx.route_change = "clarify"
    return {"resolved": False, "cue": cue, "reason": reason, "model_calls": 0}


async def run(ctx: TurnContext) -> dict[str, Any]:
    pairs = ctx.store.pairs(ctx.conversation_id)
    ordinal = ORDINAL_CUE.search(ctx.message)
    cue = ordinal.group(0) if ordinal else (m.group(0) if (m := REFERENCE_CUE.search(ctx.message)) else None)

    if not pairs:
        return _clarify(ctx, cue, "no_history")
    previous = pairs[-1]

    if ordinal:
        index = ordinal_index(ctx.message) or 0
        items = list_items(previous.answer)
        if not items:
            return _clarify(ctx, cue, "no_list")
        if not 1 <= index <= len(items):
            return _clarify(ctx, cue, "out_of_range")
        target = items[index - 1]
        material = ctx.add_material(
            "reference",
            f'In the new message, "{cue}" means item {index} of your previous answer: {clip(target)}',
            previous.answer_id,
        )
        return {
            "resolved": True,
            "cue": cue,
            "target": "list_item",
            "index": index,
            "list_size": len(items),
            "resolved_text": target[:PREVIEW_CHARS],
            "label": material.label,
        }

    material = ctx.add_material(
        "reference",
        f'In the new message, "{cue or "it"}" refers to the previous exchange:\n'
        f"Q: {clip(previous.question)}\nA: {clip(previous.answer)}",
        previous.user_id,
    )
    return {
        "resolved": True,
        "cue": cue,
        "target": "previous_turn",
        "resolved_text": previous.question[:PREVIEW_CHARS],
        "label": material.label,
    }
