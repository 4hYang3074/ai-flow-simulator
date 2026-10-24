"""S10 输出校验 Output Validation: check the answer before it is final.

1. Empty answer: ask once more with only the system prompt and the new
   message. A production chat service found that an empty answer depends on the replayed
   history, and that the question alone gets answered.
2. Citations: every [M#] in the answer must be a label the model was given
   (as a production mentor service checks). A valid label proves the model cited something it saw, not
   that the citation supports the claim. Mangled labels are removed from the
   answer shown on screen.
3. Placeholders: put the real values back for the answer shown on screen.
"""

from __future__ import annotations

import re
from typing import Any

from app.pipeline.context import StageError, TurnContext
from app.pipeline.generate import stream_reply

CITATION = re.compile(r"\[(M\d+)\]")
# A label the model mangled, e.g. "[刘1]" for "[M1]" (seen with a 4B model).
# Short on purpose so placeholders like [PHONE_1] never match.
MALFORMED = re.compile(r"\[(?!M\d+\])[^\]\s\d]{1,3}\d+\]")
# A made-up tag imitating the label format at the end of a line, e.g.
# "[猫的信息]" (also seen with the 4B model). Only whole short tags at a line
# end, so ordinary bracketed text inside a sentence is left alone.
INVENTED_TAG = re.compile(r"[ \t]*\[(?!M\d+\])[一-鿿A-Za-z ]{2,8}\][ \t]*$", re.M)


async def run(ctx: TurnContext) -> dict[str, Any]:
    summary: dict[str, Any] = {"retried_without_history": False}
    if not ctx.reply.strip():
        summary["retried_without_history"] = True
        ctx.reply = ""
        retry = [m for m in ctx.prompt[:1]] + [ctx.prompt[-1]]
        stats = await stream_reply(ctx, retry)
        ctx.usage = {k: stats[k] for k in ("prompt_tokens", "output_tokens", "tokens_per_second")}
        if not ctx.reply.strip():
            raise StageError("empty_reply", summary)

    given = {m.label for m in ctx.materials}
    cited = list(dict.fromkeys(CITATION.findall(ctx.reply)))
    summary["citations_valid"] = [c for c in cited if c in given]
    summary["citations_invalid"] = [c for c in cited if c not in given]
    summary["materials_given"] = len(given)
    malformed = MALFORMED.findall(ctx.reply) + [t.strip() for t in INVENTED_TAG.findall(ctx.reply)]
    summary["citations_malformed"] = malformed

    if malformed:
        # The cleaned text is also what gets stored, so history and recall
        # never carry the junk tags.
        ctx.reply = INVENTED_TAG.sub("", MALFORMED.sub("", ctx.reply))
    ctx.display_reply = ctx.vault.restore(ctx.reply)
    summary["placeholders_restored"] = sum(1 for p in ctx.vault.originals if p in ctx.reply)
    summary["reply_chars"] = len(ctx.display_reply)
    return summary
