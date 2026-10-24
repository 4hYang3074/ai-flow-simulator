"""S5 引用话题 Reference Resolution: work out what "那个 / 第二个" points at.

The rule: look in the last 3 exchanges first, then the last 5, and if the
target is still not there, ask the person instead of guessing.

- A list position ("第二个", "the second one") is looked up in the numbered or
  bulleted lists of recent answers, newest first: within 3 exchanges, then
  within 5. Found, it is pinned down for certain and needs no further check.
- Any other pointer ("它", "刚才那个") most likely means the latest exchange
  (whichever topic came last), so that exchange is offered as a hint, but
  whether it really answers "what is 'it'?" is left to the context check,
  which applies the same 3, then 5, then ask rule.
"""

from __future__ import annotations

from typing import Any

from app.memory import EXPANDED_PAIRS, RECENT_PAIRS, clip
from app.pipeline.context import TurnContext
from app.routing import ORDINAL_CUE, is_chinese, list_items, ordinal_index, reference_cue
from app.store import Pair

PREVIEW_CHARS = 100


def clarify(ctx: TurnContext, question_zh: str, question_en: str) -> None:
    """End the turn with a question to the person; no model call."""

    ctx.reply = question_zh if is_chinese(ctx.message) else question_en
    ctx.emit.token(ctx.reply)
    ctx.route_change = "clarify"


def _find_list_item(pairs: list[Pair], index: int) -> tuple[Pair, list[str]] | None:
    """The newest answer whose list has an item at `index` (1-based)."""

    for pair in reversed(pairs):
        items = list_items(pair.answer)
        if len(items) >= index:
            return pair, items
    return None


async def run(ctx: TurnContext) -> dict[str, Any]:
    pairs = ctx.store.pairs(ctx.conversation_id)
    ordinal = ORDINAL_CUE.search(ctx.message)
    pointer = reference_cue(ctx.message)
    cue = ordinal.group(0) if ordinal else (pointer.group(0) if pointer else None)
    shown = f"「{cue}」" if cue else "这个"

    if ordinal:
        index = ordinal_index(ctx.message) or 0
        for window in (RECENT_PAIRS, EXPANDED_PAIRS):
            found = _find_list_item(pairs[-window:], index)
            if found:
                answer, items = found
                ctx.window = window
                ctx.needs_check = False
                target = items[index - 1]
                material = ctx.add_material(
                    "reference",
                    f'In the new message, "{cue}" means item {index} of this earlier answer\'s list: {clip(target)}',
                    answer.answer_id,
                )
                return {
                    "resolved": True,
                    "cue": cue,
                    "target": "list_item",
                    "index": index,
                    "list_size": len(items),
                    "searched_pairs": window,
                    "resolved_text": target[:PREVIEW_CHARS],
                    "label": material.label,
                }
        has_list = any(list_items(p.answer) for p in pairs[-EXPANDED_PAIRS:])
        reason = "no_history" if not pairs else ("out_of_range" if has_list else "no_list")
        clarify(
            ctx,
            f"你说的{shown}是指哪一个？我在最近 5 轮对话里没找到对应的内容，能说得具体一点吗？",
            f'Which one do you mean by "{cue}"? I could not find it in our last 5 exchanges. Could you be more specific?',
        )
        return {"resolved": False, "cue": cue, "reason": reason, "searched_pairs": EXPANDED_PAIRS, "model_calls": 0}

    if not pairs:
        clarify(
            ctx,
            f"你说的{shown}是指什么？我们还没有聊过别的内容，能说得具体一点吗？",
            f'What do you mean by "{cue or "that"}"? We have not talked about anything yet. Could you be more specific?',
        )
        return {"resolved": False, "cue": cue, "reason": "no_history", "model_calls": 0}

    # A pointer or a bare follow-up ("为什么？"): offer the latest exchange as
    # the most likely target; the context check confirms it or asks.
    previous = pairs[-1]
    material = ctx.add_material(
        "reference",
        f'In the new message, "{cue or "it"}" most likely refers to the previous exchange:\n'
        f"Q: {clip(previous.question)}\nA: {clip(previous.answer)}",
        previous.user_id,
    )
    return {
        "resolved": True,
        "cue": cue,
        "target": "previous_turn",
        "resolved_text": previous.question[:PREVIEW_CHARS],
        "label": material.label,
        "needs_check": True,
    }
