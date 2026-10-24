"""FastAPI entry point. The page talks to it through Vite's `/api` proxy."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import FastAPI, HTTPException, Path
from fastapi.sse import EventSourceResponse
from pydantic import BaseModel, Field

from app.config import load_settings
from app.events import Emitter
from app.health import HealthReport, check_health
from app.llm import LLM, OllamaLLM
from app.memory import RECALL_MIN_SCORE, RECENT_PAIRS, split_recent
from app.pipeline.context import TurnContext
from app.pipeline.runner import run_turn
from app.store import Store

ID_PATTERN = r"^[A-Za-z0-9_-]{8,64}$"
ConversationId = Annotated[str, Path(pattern=ID_PATTERN)]

app = FastAPI(title="AI Flow Simulator")
settings = load_settings()
store = Store(settings.db_path)
llm: LLM = OllamaLLM(settings.ollama_host)
active: set[str] = set()

# Turns run in their own task, so a page that disconnects mid-answer does not
# cancel the turn; it still finishes and is saved (as real chat services do). Holding a
# reference keeps the task from being garbage-collected while it runs.
_running: set[asyncio.Task[None]] = set()


class ChatRequest(BaseModel):
    conversation_id: str = Field(pattern=ID_PATTERN)
    turn_id: str = Field(pattern=ID_PATTERN)
    # A generous transport cap; the receive stage applies the real limit so
    # the page can show that check happening.
    message: str = Field(max_length=10_000)


class MemoryPair(BaseModel):
    user_message_id: str
    question: str
    answer: str
    embedded: bool
    in_recent: bool


class MemoryFact(BaseModel):
    id: str
    field: str
    value: str
    quote: str
    revision: int


class MemoryView(BaseModel):
    conversation_id: str
    epoch: int
    recent_limit: int
    threshold: float
    embed_model: str
    facts: list[MemoryFact]
    pairs: list[MemoryPair]


@app.get("/api/health", response_model=HealthReport)
async def health() -> HealthReport:
    return await check_health(settings)


@app.post("/api/chat/stream", response_class=EventSourceResponse)
async def chat_stream(request: ChatRequest) -> AsyncIterator[dict[str, Any]]:
    queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()
    ctx = TurnContext(
        turn_id=request.turn_id,
        conversation_id=request.conversation_id,
        message=request.message,
        settings=settings,
        store=store,
        llm=llm,
        emit=Emitter(request.turn_id, queue.put_nowait),
        active=active,
    )

    async def run() -> None:
        try:
            await run_turn(ctx)
        finally:
            queue.put_nowait(None)

    task = asyncio.create_task(run())
    _running.add(task)
    task.add_done_callback(_running.discard)

    while (event := await queue.get()) is not None:
        yield event


@app.get("/api/conversations/{conversation_id}/memory", response_model=MemoryView)
async def memory(conversation_id: ConversationId) -> MemoryView:
    """What this conversation remembers right now, for the memory panel."""

    pairs = store.pairs(conversation_id)
    _, recent = split_recent(pairs)
    recent_ids = {p.user_id for p in recent}
    embedded = store.embeddings([p.user_id for p in pairs], settings.embed_model)
    return MemoryView(
        conversation_id=conversation_id,
        epoch=store.epoch(conversation_id),
        recent_limit=RECENT_PAIRS,
        threshold=RECALL_MIN_SCORE,
        embed_model=settings.embed_model,
        facts=[
            MemoryFact(id=f.id, field=f.field, value=f.value, quote=f.quote, revision=f.revision)
            for f in store.facts(conversation_id)
        ],
        pairs=[
            MemoryPair(
                user_message_id=p.user_id,
                question=p.question,
                answer=p.answer,
                embedded=p.user_id in embedded,
                in_recent=p.user_id in recent_ids,
            )
            for p in pairs
        ],
    )


@app.post("/api/conversations/{conversation_id}/clear")
async def clear(conversation_id: ConversationId) -> dict[str, int]:
    """Forget everything said so far by starting a new history epoch."""

    if conversation_id in active:
        raise HTTPException(status_code=409, detail="busy")
    return {"epoch": store.clear(conversation_id)}
