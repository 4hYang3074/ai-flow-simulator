import math
import re
from collections.abc import AsyncIterator

import pytest

from app.llm import Chunk, LLMUnavailable
from app.store import Store

# A tiny bag-of-words embedder: texts sharing words point the same way, so
# similarity behaves predictably in tests without a model.
VOCAB = ["cat", "name", "python", "book", "rain", "weather", "green", "colour", "pizza", "food"]


def fake_vector(text: str) -> list[float]:
    words = re.findall(r"[a-z]+", text.lower())
    vec = [float(words.count(w)) for w in VOCAB] + [0.01]
    norm = math.sqrt(sum(x * x for x in vec))
    return [x / norm for x in vec]


class FakeLLM:
    """Streams a fixed reply in pieces, or fails, without Ollama."""

    def __init__(
        self,
        pieces: list[str] | None = None,
        fail: bool = False,
        embed_fails: bool = False,
        json_reply: str = '{"route": "basic", "reason": "self-contained"}',
        replies: list[list[str]] | None = None,
        facts_reply: str = '{"facts": []}',
        facts_fail: bool = False,
        check_replies: list[str] | None = None,
    ) -> None:
        # Context-check answers in order; when they run out, "nothing refers back".
        self.check_replies = list(check_replies or [])
        self.check_calls: list[list[dict[str, str]]] = []
        self.facts_reply = facts_reply
        self.facts_fail = facts_fail
        self.pieces = pieces if pieces is not None else ["你好", "，", "世界"]
        # When set, each chat call takes the next reply in order (for retries).
        self.replies = replies
        self.fail = fail
        self.embed_fails = embed_fails
        self.json_reply = json_reply
        self.calls: list[list[dict[str, str]]] = []
        self.json_calls: list[list[dict[str, str]]] = []
        self.embedded: list[str] = []

    async def stream_chat(self, model: str, messages: list[dict[str, str]]) -> AsyncIterator[Chunk]:
        self.calls.append(messages)
        if self.fail:
            raise LLMUnavailable("connection refused")
        pieces = self.replies.pop(0) if self.replies else self.pieces
        for piece in pieces:
            yield Chunk(text=piece)
        yield Chunk(text="", done=True, prompt_tokens=12, output_tokens=3, generate_ns=1_500_000_000)

    async def complete_json(self, model: str, messages: list[dict[str, str]], schema: dict) -> str:
        self.json_calls.append(messages)
        if messages[-1]["content"].startswith("CONTEXT:"):
            self.check_calls.append(messages)
            if self.fail:
                raise LLMUnavailable("connection refused")
            return self.check_replies.pop(0) if self.check_replies else '{"refers_to_earlier": false, "references": []}'
        if messages[-1]["content"].startswith("USER MESSAGE"):
            if self.facts_fail:
                raise LLMUnavailable("connection refused")
            return self.facts_reply
        if self.fail:
            raise LLMUnavailable("connection refused")
        return self.json_reply

    async def embed(self, model: str, texts: list[str]) -> list[list[float]]:
        if self.embed_fails:
            raise LLMUnavailable("embedding model missing")
        self.embedded.extend(texts)
        return [fake_vector(t) for t in texts]


@pytest.fixture
def store(tmp_path) -> Store:
    return Store(tmp_path / "test.db")
