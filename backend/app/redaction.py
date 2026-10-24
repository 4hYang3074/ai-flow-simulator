"""Replace personal data with placeholders before text reaches a model.

Modelled on a production service's redaction vault: each value found is swapped for a
numbered placeholder such as `[PHONE_1]`, the vault remembers the original,
and the answer can be restored for display afterwards. Patterns are simple on
purpose; a real service uses a dedicated PII detector.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("EMAIL", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")),
    ("ID", re.compile(r"(?<!\d)\d{17}[\dXx](?!\d)")),
    ("CARD", re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")),
    ("PHONE", re.compile(r"(?<![\d+])(?:\+?\d{1,3}[ -]?)?1[3-9]\d{9}(?!\d)|(?<![\d+])\+\d{8,15}(?!\d)")),
]


@dataclass(slots=True)
class Vault:
    originals: dict[str, str] = field(default_factory=dict)

    def redact(self, text: str) -> tuple[str, dict[str, int]]:
        counts: dict[str, int] = {}
        for kind, pattern in PATTERNS:
            def swap(m: re.Match[str], kind: str = kind) -> str:
                counts[kind] = counts.get(kind, 0) + 1
                placeholder = f"[{kind}_{counts[kind]}]"
                self.originals[placeholder] = m.group(0)
                return placeholder

            text = pattern.sub(swap, text)
        return text, counts

    def restore(self, text: str) -> str:
        for placeholder, original in self.originals.items():
            text = text.replace(placeholder, original)
        return text
