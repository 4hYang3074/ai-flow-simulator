"""Deterministic routing rules. No model, no I/O.

The patterns follow the two production services this demo borrows from:

- small talk, answered from a template with no model call;
- corrections like "不对 / 我是说 / I meant" at the start of a message;
- references back to earlier context, "那个 / 刚才 / 第二个 / previous",
  unless the person explicitly changes topic.

When no rule fires, the route stage may ask the model; the rules always go
first because they are instant, free and predictable.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

SmallTalkKind = Literal["greeting", "thanks", "goodbye", "ack"]

_SMALL_TALK: list[tuple[SmallTalkKind, re.Pattern[str]]] = [
    ("greeting", re.compile(r"^(?:你好|您好|嗨|哈喽|早上好|早安|下午好|晚上好|hi|hello|hey|good (?:morning|afternoon|evening))[\s!！。.~～,，]*$", re.I)),
    ("thanks", re.compile(r"^(?:谢谢|多谢|谢啦|感谢|thanks|thank you|thx)(?:你|您)?[\s!！。.~～,，]*$", re.I)),
    ("goodbye", re.compile(r"^(?:再见|拜拜|晚安|bye|goodbye|see you|good night)[\s!！。.~～,，]*$", re.I)),
    ("ack", re.compile(r"^(?:好的|好|嗯|嗯嗯|ok|okay|知道了|明白了|收到)[\s!！。.~～,，]*$", re.I)),
]

CORRECTION_CUE = re.compile(
    r"^\s*(?:不对|不是这个|不是这样|不是的|我是说|我的意思是|说错了|更正|纠正|我刚才说错"
    r"|no[,，.\s]|not that\b|that'?s not (?:what|it|right)\b|i meant\b|i mean\b"
    r"|actually[,\s]|correction[:,\s]|wrong[,.\s])",
    re.I,
)

_ORDINAL_ZH = "一二三四五六七八九十"
ORDINAL_CUE = re.compile(
    rf"第\s*([{_ORDINAL_ZH}]|\d+)\s*(?:个|条|点|项|种|本|步|部分)?"
    r"|\b(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th)\s+(?:one|item|point|option)\b",
    re.I,
)

# Kept narrow on purpose (as production anaphor patterns are): a false positive
# rewrites a question the person did specify. English "it" is left out; it
# appears in too many self-contained questions.
REFERENCE_CUE = re.compile(
    r"那个|这个|那些|这些|這個|那個|刚才|剛才|上面|前面|之前|它|它们|上一个|上一条|你说的"
    r"|\b(?:previous|prior|earlier|above|last one|that one|this one|the same)\b",
    re.I,
)

# Words that always point back, wherever they appear.
_BACK_POINTER = re.compile(
    r"刚才|剛才|上面|前面|之前|上一个|上一条|你说的|\b(?:previous|prior|earlier|above|last one)\b", re.I
)
# Pronouns point back only when they open the message ("那它和…有什么区别").
# Later in the message they usually refer to something said in the same
# message: in "我的猫叫小白，它三岁了", 它 is 小白.
_PRONOUN = re.compile(r"那个|这个|那些|这些|這個|那個|它们|它|\b(?:that one|this one|the same)\b", re.I)
_FIRST_CLAUSE = re.compile(r"^[^，,。.！!？?；;\n]*")


def reference_cue(message: str) -> re.Match[str] | None:
    """The word that makes this message point back to earlier context, if any."""

    first = _FIRST_CLAUSE.match(message.strip())
    return _BACK_POINTER.search(message) or (_PRONOUN.search(first.group(0)) if first else None)

TOPIC_SHIFT = re.compile(r"新话题|换个话题|换个主题|另一个问题|\bnew (?:topic|subject)\b|\bswitch(?:ing)? (?:the )?(?:topic|subject)\b", re.I)

_EN_ORDINALS = {"first": 1, "1st": 1, "second": 2, "2nd": 2, "third": 3, "3rd": 3, "fourth": 4, "4th": 4, "fifth": 5, "5th": 5}

RouteChoice = Literal["quick", "correction", "reference", "basic"]


@dataclass(frozen=True, slots=True)
class RuleDecision:
    route: RouteChoice | None  # None: no rule decided
    rule: str | None
    matched: str | None
    small_talk: SmallTalkKind | None = None


def small_talk_kind(message: str) -> SmallTalkKind | None:
    text = message.strip()
    for kind, pattern in _SMALL_TALK:
        if pattern.match(text):
            return kind
    return None


def ordinal_index(message: str) -> int | None:
    """1-based list position the message points at, if any ("第二个" = 2)."""

    m = ORDINAL_CUE.search(message)
    if not m:
        return None
    if m.group(1):
        token = m.group(1)
        return int(token) if token.isdigit() else _ORDINAL_ZH.index(token) + 1
    return _EN_ORDINALS[m.group(2).lower()]


def decide(message: str, has_history: bool) -> RuleDecision:
    kind = small_talk_kind(message)
    if kind:
        return RuleDecision("quick", "small_talk", message.strip(), kind)
    if TOPIC_SHIFT.search(message):
        m = TOPIC_SHIFT.search(message)
        return RuleDecision("basic", "topic_shift", m.group(0) if m else None)
    if m := CORRECTION_CUE.search(message):
        if has_history:
            return RuleDecision("correction", "correction_cue", m.group(0).strip())
    if m := ORDINAL_CUE.search(message):
        # A list position is a reference even with no history: then it cannot
        # be resolved, and the reference stage will ask instead of guessing.
        return RuleDecision("reference", "ordinal_cue", m.group(0))
    if m := reference_cue(message):
        # "这个" in a first message ("这个世界上最高的山…") points at nothing
        # earlier; with no history it is an ordinary question.
        if has_history:
            return RuleDecision("reference", "reference_cue", m.group(0))
    return RuleDecision(None, None, None)


_LIST_ITEM = re.compile(r"^\s*(?:(\d+)[.、)）]|[-*•])\s+(.+)$")


def list_items(text: str) -> list[str]:
    """Numbered or bulleted items in an answer, in order, Markdown stripped."""

    items: list[str] = []
    for line in text.splitlines():
        m = _LIST_ITEM.match(line)
        if m:
            items.append(re.sub(r"[*_`#]", "", m.group(2)).strip())
    return items


CJK = re.compile(r"[一-鿿]")


def is_chinese(text: str) -> bool:
    return bool(CJK.search(text))
