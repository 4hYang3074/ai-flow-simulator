"""Settings read from the environment.

`npm run dev` loads the project's `.env` before starting this process, so
everything here is a plain environment variable with a default that matches
`.env.example`. Nothing machine-specific lives in code: the database path is
relative to the project folder unless DB_PATH says otherwise.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@dataclass(frozen=True, slots=True)
class Settings:
    ollama_host: str
    chat_model: str
    embed_model: str
    db_path: Path


def load_settings() -> Settings:
    return Settings(
        ollama_host=os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434"),
        chat_model=os.environ.get("CHAT_MODEL", "qwen3:4b-instruct"),
        embed_model=os.environ.get("EMBED_MODEL", "qwen3-embedding:0.6b"),
        db_path=PROJECT_ROOT / os.environ.get("DB_PATH", "data/flow-sim.db"),
    )
