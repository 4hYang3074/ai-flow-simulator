"""Short-term and semantic memory over stored pairs. No I/O here.

Short-term memory is the newest few pairs, replayed word for word (a production
mentor service starts with three pairs). Semantic recall looks only at the older pairs
outside that window: each pair has an embedding, the new message gets one too,
and pairs whose cosine similarity clears a threshold are brought back.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.store import Pair

RECENT_PAIRS = 3
# When three pairs are not enough to understand the new message, the window
# grows to five; if that is still not enough, the turn asks instead of guessing.
EXPANDED_PAIRS = 5
RECALL_TOP_K = 2
# Measured on qwen3-embedding:0.6b with the instruction below: related pairs
# scored 0.49-0.62, unrelated ones at most 0.42. A small sample, not a law;
# the page shows every score so the cut can be seen and questioned.
RECALL_MIN_SCORE = 0.45
# Each side of a pair is cut to this many characters before it is replayed.
MAX_TURN_CHARS = 2000

# Qwen3-Embedding is trained to take an instruction on the query side only;
# stored pairs are embedded as plain text.
QUERY_INSTRUCTION = (
    "Instruct: Given a user's new message, retrieve earlier conversation turns that help answer it\nQuery: "
)


def pair_text(pair: Pair) -> str:
    return f"Q: {pair.question}\nA: {pair.answer}"


def query_text(message: str) -> str:
    return QUERY_INSTRUCTION + message


def normalize(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in vector)) or 1.0
    return [x / norm for x in vector]


def cosine(a: list[float], b: list[float]) -> float:
    """Both vectors normalized, so cosine similarity is the dot product."""

    return sum(x * y for x, y in zip(a, b))


def split_recent(pairs: list[Pair], size: int = RECENT_PAIRS) -> tuple[list[Pair], list[Pair]]:
    """(older, recent): recent is the newest `size` pairs, oldest first."""

    cut = max(len(pairs) - size, 0)
    return pairs[:cut], pairs[cut:]


@dataclass(frozen=True, slots=True)
class Scored:
    pair: Pair
    score: float
    picked: bool


def rank(query: list[float], older: list[Pair], vectors: dict[str, list[float]]) -> list[Scored]:
    """Every older pair that has a vector, best first, marking the ones kept."""

    scored = sorted(
        ((p, cosine(query, vectors[p.user_id])) for p in older if p.user_id in vectors),
        key=lambda item: item[1],
        reverse=True,
    )
    return [
        Scored(pair, score, picked=i < RECALL_TOP_K and score >= RECALL_MIN_SCORE)
        for i, (pair, score) in enumerate(scored)
    ]


def clip(text: str) -> str:
    return text if len(text) <= MAX_TURN_CHARS else text[:MAX_TURN_CHARS] + "…"
