"""Conversation storage in SQLite: the source of truth for memory.

Shape follows a production mentor service's memory:

- Messages are stored flat, but an assistant row records `in_reply_to`, the
  user message it answers, so pairs are built from that link and never from
  position or text.
- Each conversation has a `history_epoch`. "Clear memory" raises it; rows from
  an older epoch stay in the file but are never read again, so a clear takes
  effect at once and cannot be undone by a late write.
- An embedding is stored per pair (keyed by the user message), and is derived
  data: it can always be rebuilt from the messages.
- Long-term facts point at the message they quote. A newer fact for the same
  field supersedes the older row instead of overwriting it.

The database is one file under the project's `data/` folder, so the whole
project can be copied to another computer as it is.
"""

from __future__ import annotations

import sqlite3
import time
import uuid
from array import array
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS conversations (
    id             TEXT PRIMARY KEY,
    history_epoch  INTEGER NOT NULL DEFAULT 0,
    created_at     REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
    seq             INTEGER PRIMARY KEY AUTOINCREMENT,
    id              TEXT NOT NULL UNIQUE,
    conversation_id TEXT NOT NULL REFERENCES conversations(id),
    epoch           INTEGER NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content         TEXT NOT NULL,
    in_reply_to     TEXT REFERENCES messages(id),
    created_at      REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_by_conversation ON messages (conversation_id, epoch, seq);
CREATE TABLE IF NOT EXISTS pair_embeddings (
    user_message_id TEXT PRIMARY KEY REFERENCES messages(id),
    model           TEXT NOT NULL,
    vector          BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS facts (
    id                TEXT PRIMARY KEY,
    conversation_id   TEXT NOT NULL REFERENCES conversations(id),
    epoch             INTEGER NOT NULL,
    field             TEXT NOT NULL,
    field_key         TEXT NOT NULL,
    value             TEXT NOT NULL,
    quote             TEXT NOT NULL,
    source_message_id TEXT NOT NULL REFERENCES messages(id),
    revision          INTEGER NOT NULL,
    superseded_by     TEXT REFERENCES facts(id),
    created_at        REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS facts_by_conversation ON facts (conversation_id, epoch, field_key);
"""


@dataclass(frozen=True, slots=True)
class Fact:
    id: str
    field: str
    value: str
    quote: str
    source_message_id: str
    revision: int
    created_at: float


@dataclass(frozen=True, slots=True)
class Pair:
    """One question and the answer that replied to it."""

    user_id: str
    question: str
    answer_id: str
    answer: str
    created_at: float


class Store:
    def __init__(self, path: Path) -> None:
        self._path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as db, db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript(SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self._path)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        return db

    def epoch(self, conversation_id: str) -> int:
        with closing(self._connect()) as db:
            row = db.execute("SELECT history_epoch FROM conversations WHERE id = ?", (conversation_id,)).fetchone()
        return int(row["history_epoch"]) if row else 0

    def pairs(self, conversation_id: str) -> list[Pair]:
        """Every complete pair in the current epoch, oldest first."""

        with closing(self._connect()) as db:
            rows = db.execute(
                """
                SELECT u.id AS user_id, u.content AS question, a.id AS answer_id,
                       a.content AS answer, u.created_at AS created_at
                FROM messages u
                JOIN messages a ON a.in_reply_to = u.id AND a.role = 'assistant'
                JOIN conversations c ON c.id = u.conversation_id
                WHERE u.conversation_id = ? AND u.role = 'user' AND u.epoch = c.history_epoch
                ORDER BY u.seq
                """,
                (conversation_id,),
            ).fetchall()
        return [Pair(r["user_id"], r["question"], r["answer_id"], r["answer"], r["created_at"]) for r in rows]

    def append_pair(self, conversation_id: str, question: str, answer: str) -> Pair:
        now = time.time()
        user_id, answer_id = uuid.uuid4().hex, uuid.uuid4().hex
        with closing(self._connect()) as db, db:
            db.execute(
                "INSERT OR IGNORE INTO conversations (id, history_epoch, created_at) VALUES (?, 0, ?)",
                (conversation_id, now),
            )
            epoch = db.execute(
                "SELECT history_epoch FROM conversations WHERE id = ?", (conversation_id,)
            ).fetchone()[0]
            db.execute(
                "INSERT INTO messages (id, conversation_id, epoch, role, content, in_reply_to, created_at)"
                " VALUES (?, ?, ?, 'user', ?, NULL, ?)",
                (user_id, conversation_id, epoch, question, now),
            )
            db.execute(
                "INSERT INTO messages (id, conversation_id, epoch, role, content, in_reply_to, created_at)"
                " VALUES (?, ?, ?, 'assistant', ?, ?, ?)",
                (answer_id, conversation_id, epoch, answer, user_id, now),
            )
        return Pair(user_id, question, answer_id, answer, now)

    def clear(self, conversation_id: str) -> int:
        """Start a new history epoch. Returns the new epoch."""

        with closing(self._connect()) as db, db:
            db.execute(
                "INSERT OR IGNORE INTO conversations (id, history_epoch, created_at) VALUES (?, 0, ?)",
                (conversation_id, time.time()),
            )
            db.execute("UPDATE conversations SET history_epoch = history_epoch + 1 WHERE id = ?", (conversation_id,))
            return int(
                db.execute("SELECT history_epoch FROM conversations WHERE id = ?", (conversation_id,)).fetchone()[0]
            )

    def save_embedding(self, user_message_id: str, model: str, vector: list[float]) -> None:
        with closing(self._connect()) as db, db:
            db.execute(
                "INSERT OR REPLACE INTO pair_embeddings (user_message_id, model, vector) VALUES (?, ?, ?)",
                (user_message_id, model, array("f", vector).tobytes()),
            )

    def facts(self, conversation_id: str) -> list[Fact]:
        """Current facts (latest revision of each field) in this epoch, oldest first."""

        with closing(self._connect()) as db:
            rows = db.execute(
                """
                SELECT f.* FROM facts f JOIN conversations c ON c.id = f.conversation_id
                WHERE f.conversation_id = ? AND f.epoch = c.history_epoch AND f.superseded_by IS NULL
                ORDER BY f.created_at, f.rowid
                """,
                (conversation_id,),
            ).fetchall()
        return [
            Fact(r["id"], r["field"], r["value"], r["quote"], r["source_message_id"], r["revision"], r["created_at"])
            for r in rows
        ]

    def save_fact(
        self, conversation_id: str, field: str, field_key: str, value: str, quote: str, source_message_id: str
    ) -> tuple[Fact, Fact | None]:
        """Store a fact; an existing one for the same field becomes superseded.
        Returns (new fact, the one it replaced or None)."""

        now = time.time()
        fact_id = uuid.uuid4().hex
        with closing(self._connect()) as db, db:
            epoch = db.execute(
                "SELECT history_epoch FROM conversations WHERE id = ?", (conversation_id,)
            ).fetchone()[0]
            old = db.execute(
                "SELECT * FROM facts WHERE conversation_id = ? AND epoch = ? AND field_key = ? AND superseded_by IS NULL",
                (conversation_id, epoch, field_key),
            ).fetchone()
            revision = old["revision"] + 1 if old else 1
            db.execute(
                "INSERT INTO facts (id, conversation_id, epoch, field, field_key, value, quote, source_message_id,"
                " revision, superseded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)",
                (fact_id, conversation_id, epoch, field, field_key, value, quote, source_message_id, revision, now),
            )
            if old:
                db.execute("UPDATE facts SET superseded_by = ? WHERE id = ?", (fact_id, old["id"]))
        new = Fact(fact_id, field, value, quote, source_message_id, revision, now)
        replaced = (
            Fact(old["id"], old["field"], old["value"], old["quote"], old["source_message_id"], old["revision"],
                 old["created_at"])
            if old
            else None
        )
        return new, replaced

    def embeddings(self, user_message_ids: list[str], model: str) -> dict[str, list[float]]:
        """Stored vectors for these pairs, made by this model only."""

        if not user_message_ids:
            return {}
        marks = ",".join("?" * len(user_message_ids))
        with closing(self._connect()) as db:
            rows = db.execute(
                f"SELECT user_message_id, vector FROM pair_embeddings WHERE model = ? AND user_message_id IN ({marks})",
                (model, *user_message_ids),
            ).fetchall()
        out: dict[str, list[float]] = {}
        for r in rows:
            vec = array("f")
            vec.frombytes(r["vector"])
            out[r["user_message_id"]] = vec.tolist()
        return out
