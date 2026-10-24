"""The stream a turn reports itself through.

Shape follows a production chat service's stream: every event
carries `protocol`, `turn_id` and an increasing `seq`, and a turn ends with
exactly one `final` or `error`. As in a production mentor service,
`token` events are a live preview only; `final.reply` is the authoritative
answer that gets saved.

Stage and route names are a closed list, as in that production service:
the page maps each one to a title and an explanation, so adding one is a
change on both sides, not a free string.
"""

from __future__ import annotations

import itertools
from collections.abc import Callable
from typing import Any, Literal

STREAM_PROTOCOL = "flow-sim-stream-v1"

StageId = Literal[
    "receive",
    "redact",
    "route",
    "quick_reply",
    "correction",
    "reference",
    "memory_recall",
    "context_check",
    "context",
    "evidence",
    "generate",
    "validate",
    "persist",
    "memorize",
]

RouteId = Literal["pending", "quick", "basic", "reference", "correction", "clarify"]

_PREFIX: tuple[StageId, ...] = ("receive", "redact", "route")
_ANSWER: tuple[StageId, ...] = (
    "memory_recall", "context_check", "context", "evidence", "generate", "validate", "persist", "memorize",
)

# Which stages each route runs, in order. Every turn starts as "pending": the
# route stage decides the rest. The reference stage or the context check may
# still switch to "clarify" when what the person means cannot be found in the
# last 3, then 5 exchanges: the turn then asks instead of answering. Each
# switch is announced with a new `route` event, so the page can add the stages.
ROUTES: dict[RouteId, tuple[StageId, ...]] = {
    "pending": _PREFIX,
    "quick": (*_PREFIX, "quick_reply", "persist"),
    "basic": (*_PREFIX, *_ANSWER),
    "reference": (*_PREFIX, "reference", *_ANSWER),
    "correction": (*_PREFIX, "correction", *_ANSWER),
    "clarify": (*_PREFIX, "persist"),
}

# What a turn still does after deciding to ask instead of answer.
CLARIFY_TAIL: tuple[StageId, ...] = ("persist",)

ErrorCode = Literal["invalid_message", "busy", "llm_unavailable", "empty_reply", "internal"]


class Emitter:
    """Stamps and hands events to whoever is streaming them to the page."""

    def __init__(self, turn_id: str, sink: Callable[[dict[str, Any]], None]) -> None:
        self._turn_id = turn_id
        self._sink = sink
        self._seq = itertools.count(1)

    def _emit(self, payload: dict[str, Any]) -> None:
        self._sink({"protocol": STREAM_PROTOCOL, "turn_id": self._turn_id, "seq": next(self._seq), **payload})

    def route(self, route: RouteId, stages: tuple[StageId, ...]) -> None:
        self._emit({"type": "route", "route": route, "stages": list(stages)})

    def stage_start(self, stage: StageId) -> None:
        self._emit({"type": "stage_start", "stage": stage})

    def stage_end(
        self,
        stage: StageId,
        ms: float,
        summary: dict[str, Any],
        status: Literal["done", "failed"] = "done",
    ) -> None:
        self._emit({"type": "stage_end", "stage": stage, "status": status, "ms": round(ms, 1), "summary": summary})

    def token(self, text: str) -> None:
        self._emit({"type": "token", "text": text})

    def final(self, reply: str, message_id: str, total_ms: float, usage: dict[str, Any]) -> None:
        self._emit({
            "type": "final",
            "reply": reply,
            "message_id": message_id,
            "total_ms": round(total_ms, 1),
            "usage": usage,
        })

    def error(self, stage: StageId | None, code: ErrorCode) -> None:
        self._emit({"type": "error", "stage": stage, "code": code})
