"""Shared state of one turn, passed from stage to stage."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.config import Settings
from app.events import ErrorCode, Emitter, RouteId
from app.llm import LLM
from app.memory import Scored
from app.redaction import Vault
from app.routing import SmallTalkKind
from app.store import Pair, Store


class StageError(Exception):
    """A stage could not finish. The turn stops and the page shows why."""

    def __init__(self, code: ErrorCode, summary: dict[str, Any] | None = None) -> None:
        super().__init__(code)
        self.code: ErrorCode = code
        self.summary = summary or {}


@dataclass(frozen=True, slots=True)
class Material:
    """One labelled piece of earlier context given to the model, e.g. [M1]."""

    label: str
    kind: str  # "memory" | "reference" | "correction" | "summary"
    text: str
    source_id: str | None = None


@dataclass(slots=True)
class TurnContext:
    turn_id: str
    conversation_id: str
    message: str
    settings: Settings
    store: Store
    llm: LLM
    emit: Emitter
    # Conversations with a turn running right now; one at a time each.
    active: set[str]
    # Filled in by the stages as the turn runs.
    route: RouteId = "pending"
    # Set by a stage that decides the rest of the turn should take another route.
    route_change: RouteId | None = None
    vault: Vault = field(default_factory=Vault)
    small_talk: SmallTalkKind | None = None
    # Every stored pair of this conversation, oldest first (memory recall loads it).
    history: list[Pair] = field(default_factory=list)
    # How many recent pairs are replayed word for word: 3, or 5 when 3 were
    # not enough (see the context check).
    window: int = 3
    # Whether what the message refers to still needs the model's check, or a
    # rule has already pinned it down (a list item found by position).
    needs_check: bool = True
    recent: list[Pair] = field(default_factory=list)
    # What the context check found the message's pointers refer to, as
    # (phrase, quoted earlier text), repeated right before the message.
    resolved: list[tuple[str, str]] = field(default_factory=list)
    recalled: list[Scored] = field(default_factory=list)
    materials: list[Material] = field(default_factory=list)
    prompt: list[dict[str, str]] = field(default_factory=list)
    # A fingerprint of the exact prompt, frozen by the evidence stage.
    prompt_sha256: str = ""
    # The reply as the model wrote it (placeholders and all): what is stored.
    reply: str = ""
    # The reply as shown: placeholders put back. Empty means same as `reply`.
    display_reply: str = ""
    usage: dict[str, Any] = field(default_factory=dict)
    user_message_id: str = ""
    assistant_message_id: str = ""

    def add_material(self, kind: str, text: str, source_id: str | None = None) -> Material:
        material = Material(f"M{len(self.materials) + 1}", kind, text, source_id)
        self.materials.append(material)
        return material

    def drop_memories_in_window(self) -> None:
        """Recalled pairs that are now replayed in full would appear twice:
        drop them and renumber the labels."""

        shown = {p.user_id for p in self.recent}
        kept = [m for m in self.materials if not (m.kind == "memory" and m.source_id in shown)]
        self.materials = [Material(f"M{i}", m.kind, m.text, m.source_id) for i, m in enumerate(kept, 1)]
        self.recalled = [s for s in self.recalled if s.pair.user_id not in shown]
