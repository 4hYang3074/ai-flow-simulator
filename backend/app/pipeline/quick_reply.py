"""S3 快速通道 Fast Path: answer small talk from a template, no model call.

"你好" does not need a 4-billion-parameter model. Production chat services
answer small talk like this with zero model calls; it is instant and costs nothing.
"""

from __future__ import annotations

from typing import Any

from app.pipeline.context import TurnContext
from app.routing import is_chinese

TEMPLATES = {
    "greeting": (
        "你好！我是在你电脑上运行的 Qwen3 4B 教学助手。随便问我点什么，右边会显示我处理这条消息的每一步。",
        "Hi! I'm a teaching assistant running Qwen3 4B on your computer. Ask me anything and watch every step on the right.",
    ),
    "thanks": ("不客气！还有什么想问的吗？", "You're welcome! Anything else you'd like to ask?"),
    "goodbye": ("再见！下次见～", "Bye! See you next time."),
    "ack": ("好的～有其他问题随时问我。", "Got it. Ask me anything whenever you like."),
}


async def run(ctx: TurnContext) -> dict[str, Any]:
    kind = ctx.small_talk or "ack"
    zh, en = TEMPLATES[kind]
    ctx.reply = zh if is_chinese(ctx.message) else en
    ctx.emit.token(ctx.reply)
    return {"kind": kind, "model_calls": 0, "reply_chars": len(ctx.reply)}
