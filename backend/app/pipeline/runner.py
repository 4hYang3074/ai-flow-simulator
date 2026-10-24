"""Run a turn's stages in order and report each one as it happens.

A turn starts on the "pending" route. When a stage sets `ctx.route_change`
(the route stage always does; the reference stage may switch to "clarify"),
the runner announces the new route and carries on with the stages that come
after the current one on that route.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Awaitable, Callable
from typing import Any

from app.events import ROUTES, StageId
from app.pipeline import (
    build_context,
    correction,
    evidence,
    generate,
    memorize,
    memory_recall,
    persist,
    quick_reply,
    receive,
    redact,
    reference,
    route,
    validate,
)
from app.pipeline.context import StageError, TurnContext

logger = logging.getLogger("flow_sim.pipeline")

Stage = Callable[[TurnContext], Awaitable[dict[str, Any]]]

STAGES: dict[StageId, Stage] = {
    "receive": receive.run,
    "redact": redact.run,
    "route": route.run,
    "quick_reply": quick_reply.run,
    "correction": correction.run,
    "reference": reference.run,
    "memory_recall": memory_recall.run,
    "context": build_context.run,
    "evidence": evidence.run,
    "generate": generate.run,
    "validate": validate.run,
    "persist": persist.run,
    "memorize": memorize.run,
}


async def run_turn(ctx: TurnContext) -> None:
    """Every outcome ends in exactly one `final` or `error` event."""

    started = time.perf_counter()
    if ctx.conversation_id in ctx.active:
        ctx.emit.error(None, "busy")
        return
    ctx.active.add(ctx.conversation_id)
    try:
        stages = ROUTES[ctx.route]
        ctx.emit.route(ctx.route, stages)
        i = 0
        while i < len(stages):
            stage = stages[i]
            ctx.emit.stage_start(stage)
            stage_started = time.perf_counter()
            elapsed = lambda: (time.perf_counter() - stage_started) * 1000  # noqa: E731
            try:
                summary = await STAGES[stage](ctx)
            except StageError as exc:
                ctx.emit.stage_end(stage, elapsed(), exc.summary, status="failed")
                ctx.emit.error(stage, exc.code)
                return
            except Exception:
                logger.exception("stage %s failed", stage)
                ctx.emit.stage_end(stage, elapsed(), {}, status="failed")
                ctx.emit.error(stage, "internal")
                return
            ctx.emit.stage_end(stage, elapsed(), summary)

            if ctx.route_change and ctx.route_change != ctx.route:
                ctx.route, ctx.route_change = ctx.route_change, None
                stages = ROUTES[ctx.route]
                ctx.emit.route(ctx.route, stages)
                i = stages.index(stage)
            ctx.route_change = None
            i += 1
        ctx.emit.final(
            ctx.display_reply or ctx.reply,
            ctx.assistant_message_id,
            (time.perf_counter() - started) * 1000,
            ctx.usage,
        )
    finally:
        ctx.active.discard(ctx.conversation_id)
