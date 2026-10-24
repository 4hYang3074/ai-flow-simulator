"""上下文充分性检查 Context Check: is there enough to understand the message?

The rule, applied to every message that depends on earlier conversation:

1. Judge with the last 3 exchanges (plus recalled memories and long-term
   facts).
2. Not enough? Widen to the last 5 exchanges and judge again.
3. Still not enough? Ask the person what they mean. Never guess.

Some messages need no check: the first message of a conversation, a list
position already found by the reference rule, a correction (it targets the
previous answer by definition), and a question that is complete on its own
("什么是向量数据库？"). For everything else the model names each phrase that
points back ("那两个") and quotes what it refers to; the quote must appear in
the context word for word. No such phrase, or every quote found: enough.
"""

from __future__ import annotations

import json
import re
import time
from typing import Any

from app.llm import LLMUnavailable
from app.memory import EXPANDED_PAIRS, RECENT_PAIRS, clip
from app.pipeline.context import TurnContext
from app.pipeline.reference import clarify
from app.routing import REFERENCE_CUE

# Each side of a pair is shortened for the check; it only has to see what
# was talked about, and a short prompt keeps the check fast.
CHECK_CHARS = 800

# Complete questions that point at nothing earlier: a question word followed
# by its own subject, with no pronoun anywhere.
_STANDALONE = re.compile(
    r"^\s*(?:什么是|什么叫|何为|如何|怎么样?才|怎样|为什么\S{4,}|请问|介绍一下|解释一下|推荐|帮我写|写一|翻译"
    r"|what (?:is|are)\b|how (?:do|does|to|can)\b|why (?:do|does|is|are)\b|explain\b|recommend\b|write\b|translate\b)",
    re.I,
)
MIN_STANDALONE_CHARS = 8

CHECK_SCHEMA = {
    "type": "object",
    "properties": {
        "refers_to_earlier": {"type": "boolean"},
        "references": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"phrase": {"type": "string"}, "quote": {"type": "string"}},
                "required": ["phrase", "quote"],
            },
        },
    },
    "required": ["refers_to_earlier", "references"],
}

# The model is not asked "is this enough?" (a 4B model answers that badly):
# it is asked to point at what the message refers to and quote it, and the
# quote is checked against the context word for word, like long-term facts.
CHECK_PROMPT = (
    "Find the words in the NEW MESSAGE that point to something said earlier: pronouns (it, that, 它, 那个), "
    "phrases like 'the two', 'that plan', '那两个', '这个方案', or a missing subject that only earlier talk can fill "
    "('why?', 'more simply', '为什么', '再简单点').\n"
    "If the message is complete on its own, reply {\"refers_to_earlier\": false, \"references\": []}.\n"
    "Otherwise list each such phrase, and for each copy from the CONTEXT the exact short text it refers to "
    "(word for word). If the CONTEXT does not contain it, use an empty quote.\n"
    'Reply with JSON {"refers_to_earlier": true, "references": [{"phrase": "...", "quote": "..."}]}.'
)

MAX_PHRASE_CHARS = 20
# A quote must carry at least this many letters or characters to count: "为什么"
# turns up in almost any earlier answer and proves nothing.
MIN_QUOTE_CHARS = 4
WORDS_FOUND_SHARE = 0.7

_NOT_WORD = re.compile(r"[^0-9a-z一-鿿]+")


def _squash(text: str) -> str:
    """Letters, digits and Chinese characters only, so a quote still matches
    after the model drops Markdown (** ###) or changes punctuation."""

    return _NOT_WORD.sub("", text.lower())


def _standalone(message: str) -> bool:
    text = message.strip()
    return len(text) >= MIN_STANDALONE_CHARS and bool(_STANDALONE.match(text)) and not REFERENCE_CUE.search(text)


def _context_text(ctx: TurnContext, size: int) -> str:
    lines = [f"[{m.label}] ({m.kind}) {clip(m.text)[:CHECK_CHARS]}" for m in ctx.materials]
    for p in ctx.history[-size:]:
        lines.append(f"User: {p.question[:CHECK_CHARS]}\nAssistant: {p.answer[:CHECK_CHARS]}")
    return "\n\n".join(lines) or "(no earlier conversation)"


async def _judge(ctx: TurnContext, size: int) -> dict[str, Any]:
    """One judgement with the last `size` pairs. Every reference must quote
    the context exactly; unusable output counts as "not enough", because the
    rule is to ask rather than guess."""

    context = _context_text(ctx, size)
    started = time.perf_counter()
    attempt: dict[str, Any] = {"pairs": min(size, len(ctx.history)), "sufficient": False, "references": []}
    try:
        raw = await ctx.llm.complete_json(
            ctx.settings.chat_model,
            [
                {"role": "system", "content": CHECK_PROMPT},
                {"role": "user", "content": f"CONTEXT:\n{context}\n\nNEW MESSAGE:\n{ctx.message}"},
            ],
            CHECK_SCHEMA,
        )
        parsed = json.loads(raw)
        refs = parsed.get("references") if isinstance(parsed, dict) else None
        if not isinstance(parsed, dict) or not isinstance(parsed.get("refers_to_earlier"), bool) or not isinstance(refs, list):
            attempt["invalid"] = True
        else:
            squashed = _squash(context)
            for ref in refs[:5]:
                if not isinstance(ref, dict):
                    continue
                phrase = str(ref.get("phrase") or "").strip()[:MAX_PHRASE_CHARS]
                quote = str(ref.get("quote") or "").strip()
                key = _squash(quote)
                # Word for word, or (for a quote of several words, such as
                # "Go 和 Rust" for "Rust 还是 Go") most of its words of two or
                # more characters appear in the context: a small model often
                # changes the order or drops a word when it copies.
                words = [w for w in _NOT_WORD.split(quote.lower()) if len(w) >= 2]
                hits = sum(1 for w in words if w in squashed)
                found = len(key) >= MIN_QUOTE_CHARS and (
                    key in squashed or (len(words) >= 2 and hits / len(words) >= WORDS_FOUND_SHARE)
                )
                attempt["references"].append({"phrase": phrase, "quote": quote[:80], "found": found})
            attempt["sufficient"] = all(r["found"] for r in attempt["references"])
            missing = list(dict.fromkeys(r["phrase"] for r in attempt["references"] if not r["found"] and r["phrase"]))
            attempt["missing"] = "、".join(f"「{m}」" for m in missing)
    except (json.JSONDecodeError, AttributeError):
        attempt["invalid"] = True
    attempt["ms"] = round((time.perf_counter() - started) * 1000, 1)
    return attempt


async def run(ctx: TurnContext) -> dict[str, Any]:
    summary: dict[str, Any] = {"checked_by": "skipped", "attempts": [], "window": ctx.window}
    skip = None
    if not ctx.history:
        skip = "no_history"
    elif not ctx.needs_check:
        skip = "resolved_by_rule"
    elif ctx.route == "correction":
        skip = "correction"
    elif ctx.route == "basic" and _standalone(ctx.message):
        skip = "standalone"
    if skip:
        summary["skip_reason"] = skip
        summary["outcome"] = "sufficient"
        return summary

    summary["checked_by"] = "model"
    try:
        sizes = [RECENT_PAIRS] + ([EXPANDED_PAIRS] if len(ctx.history) > RECENT_PAIRS else [])
        for size in sizes:
            attempt = await _judge(ctx, size)
            summary["attempts"].append(attempt)
            if attempt["sufficient"]:
                if size > ctx.window:
                    ctx.window = size
                    ctx.recent = ctx.history[-size:]
                    ctx.drop_memories_in_window()
                # Hand what was found to the answer, so it does not have to
                # work out "那两个" again on its own (and guess).
                for ref in attempt["references"]:
                    ctx.resolved.append((ref["phrase"], ref["quote"]))
                    ctx.add_material(
                        "reference",
                        f'In the new message, "{ref["phrase"]}" refers to what this earlier text is about: {ref["quote"]}',
                    )
                summary["window"] = ctx.window
                summary["outcome"] = "sufficient" if size == RECENT_PAIRS else "expanded"
                return summary
    except LLMUnavailable:
        # The answer step uses the same model and will report the failure.
        summary["note"] = "model_unavailable"
        summary["outcome"] = "unchecked"
        return summary

    missing = summary["attempts"][-1].get("missing") or ""
    searched = summary["attempts"][-1]["pairs"]
    clarify(
        ctx,
        f"我不太确定{missing or '你说的'}指的是什么。我看了最近 {searched} 轮对话还是没法确定，能说得具体一点吗？",
        f"I am not sure what {missing or 'you'} refers to. "
        f"I looked at our last {searched} exchanges and still could not tell. Could you be more specific?",
    )
    summary["outcome"] = "clarify"
    return summary
