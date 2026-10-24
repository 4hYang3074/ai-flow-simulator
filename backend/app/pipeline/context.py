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
    recent: list[Pair] = field(default_factory=list)
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
