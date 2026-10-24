"""The one place that talks to the models, behind a small interface.

Tests pass a fake with the same methods, so the pipeline runs without Ollama.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol

from ollama import AsyncClient


@dataclass(frozen=True, slots=True)
class Chunk:
    text: str
    done: bool = False
    # Filled on the last chunk only.
    prompt_tokens: int | None = None
    output_tokens: int | None = None
    generate_ns: int | None = None


class LLM(Protocol):
    def stream_chat(self, model: str, messages: list[dict[str, str]]) -> AsyncIterator[Chunk]: ...

    async def embed(self, model: str, texts: list[str]) -> list[list[float]]: ...

    async def complete_json(self, model: str, messages: list[dict[str, str]], schema: dict) -> str: ...


class LLMUnavailable(Exception):
    """The model could not be reached or failed mid-answer."""


class OllamaLLM:
    def __init__(self, host: str) -> None:
        self._client = AsyncClient(host=host)

    async def stream_chat(self, model: str, messages: list[dict[str, str]]) -> AsyncIterator[Chunk]:
        try:
            stream = await self._client.chat(model=model, messages=messages, stream=True)
            async for part in stream:
                yield Chunk(
                    text=part.message.content or "",
                    done=bool(part.done),
                    prompt_tokens=part.prompt_eval_count,
                    output_tokens=part.eval_count,
                    generate_ns=part.eval_duration,
                )
        except Exception as exc:
            raise LLMUnavailable(str(exc)) from exc

    async def embed(self, model: str, texts: list[str]) -> list[list[float]]:
        try:
            response = await self._client.embed(model=model, input=texts)
        except Exception as exc:
            raise LLMUnavailable(str(exc)) from exc
        return [list(v) for v in response.embeddings]

    async def complete_json(self, model: str, messages: list[dict[str, str]], schema: dict) -> str:
        """One non-streamed answer constrained to a JSON schema (Ollama's
        structured outputs). Returns the raw text; the caller validates it,
        because a small model can still return something unusable."""

        try:
            response = await self._client.chat(
                model=model, messages=messages, format=schema, stream=False, options={"temperature": 0}
            )
        except Exception as exc:
            raise LLMUnavailable(str(exc)) from exc
        return response.message.content or ""
