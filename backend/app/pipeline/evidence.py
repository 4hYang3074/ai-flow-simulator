"""S8 证据快照 Evidence Snapshot: record exactly what the model is about to see.

A production mentor service freezes an evidence manifest before generation, so a later save or
clear cannot change what the model was shown, and the answer's citations can
be checked against it afterwards. Here the manifest is the list of labelled
materials plus a SHA-256 fingerprint of the full prompt.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from app.pipeline.context import TurnContext

PREVIEW_CHARS = 80


async def run(ctx: TurnContext) -> dict[str, Any]:
    canonical = json.dumps(ctx.prompt, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    ctx.prompt_sha256 = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return {
        "manifest": [
            {
                "label": m.label,
                "kind": m.kind,
                "source_id": m.source_id,
                "chars": len(m.text),
                "preview": m.text[:PREVIEW_CHARS],
            }
            for m in ctx.materials
        ],
        "prompt_messages": len(ctx.prompt),
        "prompt_sha256": ctx.prompt_sha256,
    }
