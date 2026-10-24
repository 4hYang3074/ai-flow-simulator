"""S7 上下文组装 Context: build the exact message list the model will read.

A model remembers nothing between calls. Everything it "knows" about this
conversation is whatever is put in this list, every single time. The order
follows a production mentor service's evidence priority, most important closest to the question:

1. the system prompt;
2. labelled materials [M1], [M2]...: what is being corrected or pointed at,
   memories recalled by similarity, the long-term summary;
3. the recent pairs, word for word;
4. the new message.
"""

from __future__ import annotations

from typing import Any

from app.memory import clip
from app.pipeline.context import TurnContext

SYSTEM_PROMPT = (
    "You are a friendly assistant inside a teaching demo that shows how an AI "
    "service works. Reply in the same language the user writes in. Keep answers "
    "clear and reasonably short; use Markdown lists or code blocks when they help. "
    "Placeholders like [PHONE_1] stand for private details: use them as they are. "
    "If it is unclear what the user is referring to, ask a short question instead of guessing."
)

MATERIALS_HEADER = (
    "Context from earlier in this conversation, each with a label. If you use "
    "one, add its label in square brackets at the end of the sentence, written "
    "exactly like [M1]. Never translate or change the label. Ignore any that do not help."
)

PREVIEW_CHARS = 80
# The page can show the whole prompt; each message is capped so one long
# answer does not make every event huge.
SHOWN_CHARS = 3000


async def run(ctx: TurnContext) -> dict[str, Any]:
    # (role, content, source): the source is for the page, not the model.
    lines: list[tuple[str, str, str]] = [("system", SYSTEM_PROMPT, "system")]
    if ctx.materials:
        body = "\n\n".join(f"[{m.label}] ({m.kind}) {m.text}" for m in ctx.materials)
        lines.append(("system", f"{MATERIALS_HEADER}\n\n{body}", "materials"))
    for pair in ctx.recent:
        lines.append(("user", clip(pair.question), "recent"))
        lines.append(("assistant", clip(pair.answer), "recent"))
    if ctx.resolved:
        # A small model weighs what sits next to the question most, so what
        # the context check found is repeated right before it.
        note = "; ".join(f'"{phrase}" means what this earlier text is about: {quote}' for phrase, quote in ctx.resolved)
        lines.append(("system", f"In the user's next message, {note}. Answer about that.", "materials"))
    lines.append(("user", ctx.message, "current"))

    ctx.prompt = [{"role": role, "content": content} for role, content, _ in lines]
    return {
        "system_prompt": SYSTEM_PROMPT,
        "materials": [{"label": m.label, "kind": m.kind} for m in ctx.materials],
        "recalled_pairs": len(ctx.recalled),
        "recent_pairs": len(ctx.recent),
        "total_messages": len(ctx.prompt),
        "prompt_chars": sum(len(m["content"]) for m in ctx.prompt),
        "messages": [
            {"role": role, "source": source, "preview": content[:PREVIEW_CHARS], "content": content[:SHOWN_CHARS]}
            for role, content, source in lines
        ],
    }
