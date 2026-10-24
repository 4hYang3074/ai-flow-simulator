"""Is the local model runtime up, and are the two models this app needs there?

The page polls this to show "Model ready" or say exactly what is missing, so a
friend setting the project up sees the next step instead of a broken chat.
"""

from __future__ import annotations

from typing import Any, Literal

from ollama import AsyncClient
from pydantic import BaseModel

from app.config import Settings

ModelRole = Literal["chat", "embedding"]


class ModelStatus(BaseModel):
    name: str
    role: ModelRole
    available: bool


class HealthReport(BaseModel):
    ollama_host: str
    ollama_reachable: bool
    models: list[ModelStatus]
    ready: bool
    # A short machine-readable reason when not ready, for the page to explain.
    problem: Literal["ollama_unreachable", "model_missing"] | None = None


def _canonical(name: str) -> str:
    """Ollama lists `llama3` as `llama3:latest`; compare both forms alike."""

    return name if ":" in name else f"{name}:latest"


def installed_names(listing: Any) -> set[str]:
    """Model names from an Ollama `list()` response."""

    return {_canonical(m.model) for m in getattr(listing, "models", []) if m.model}


def build_report(settings: Settings, installed: set[str] | None) -> HealthReport:
    """`installed` is None when Ollama could not be reached at all."""

    wanted: list[tuple[str, ModelRole]] = [
        (settings.chat_model, "chat"),
        (settings.embed_model, "embedding"),
    ]
    reachable = installed is not None
    models = [
        ModelStatus(
            name=name,
            role=role,
            available=reachable and _canonical(name) in installed,
        )
        for name, role in wanted
    ]
    ready = reachable and all(m.available for m in models)
    problem = None
    if not reachable:
        problem = "ollama_unreachable"
    elif not ready:
        problem = "model_missing"
    return HealthReport(
        ollama_host=settings.ollama_host,
        ollama_reachable=reachable,
        models=models,
        ready=ready,
        problem=problem,
    )


async def check_health(settings: Settings) -> HealthReport:
    try:
        listing = await AsyncClient(host=settings.ollama_host, timeout=3).list()
    except Exception:
        return build_report(settings, None)
    return build_report(settings, installed_names(listing))
