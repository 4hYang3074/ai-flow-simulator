import asyncio
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.config import Settings
from app.events import STREAM_PROTOCOL, Emitter
from app.pipeline.context import TurnContext
from app.pipeline.runner import run_turn
from app.store import Store
from tests.conftest import FakeLLM

SETTINGS = Settings("http://127.0.0.1:11434", "qwen3:4b-instruct", "qwen3-embedding:0.6b", Path("unused.db"))
CONV = "conversation-0001"
_turns = iter(range(1, 10_000))


def run(message: str, llm: FakeLLM, store: Store, active: set[str] | None = None) -> list[dict]:
    turn = f"turn-{next(_turns):04d}"
    events: list[dict] = []
    ctx = TurnContext(
        turn_id=turn,
        conversation_id=CONV,
        message=message,
        settings=SETTINGS,
        store=store,
        llm=llm,
        emit=Emitter(turn, events.append),
        active=active if active is not None else set(),
    )
    asyncio.run(run_turn(ctx))
    return events


def shape(events: list[dict]) -> list[str]:
    """Events as `type`, `type:stage` or `route:<route>`, for comparing order."""

    out = []
    for e in events:
        if e["type"] == "route":
            out.append(f"route:{e['route']}")
        elif e["type"] == "token":
            if not out or out[-1] != "token":
                out.append("token")
        else:
            out.append(f"{e['type']}:{e['stage']}" if e.get("stage") else e["type"])
    return out


def summary(events: list[dict], stage: str) -> dict:
    return next(e["summary"] for e in events if e["type"] == "stage_end" and e["stage"] == stage)


def routes(events: list[dict]) -> list[str]:
    return [e["route"] for e in events if e["type"] == "route"]


PREFIX = ["route:pending", "stage_start:receive", "stage_end:receive", "stage_start:redact", "stage_end:redact",
          "stage_start:route", "stage_end:route"]
ANSWER = ["stage_start:memory_recall", "stage_end:memory_recall", "stage_start:context", "stage_end:context",
          "stage_start:evidence", "stage_end:evidence", "stage_start:generate", "token", "stage_end:generate",
          "stage_start:validate", "stage_end:validate", "stage_start:persist", "stage_end:persist",
          "stage_start:memorize", "stage_end:memorize", "final"]


# --- the basic route -------------------------------------------------------

def test_basic_turn_reports_every_stage_in_order(store):
    events = run("什么是 embedding？", FakeLLM(), store)
    assert shape(events) == [*PREFIX, "route:basic", *ANSWER]
    assert [e["seq"] for e in events] == list(range(1, len(events) + 1))
    assert all(e["protocol"] == STREAM_PROTOCOL for e in events)
    assert summary(events, "route")["decided_by"] == "default"


def test_route_events_list_the_full_stage_order(store):
    events = run("什么是 embedding？", FakeLLM(), store)
    route_events = [e for e in events if e["type"] == "route"]
    assert route_events[0]["stages"] == ["receive", "redact", "route"]
    assert route_events[1]["stages"] == ["receive", "redact", "route", "memory_recall", "context", "evidence",
                                         "generate", "validate", "persist", "memorize"]


def test_final_reply_is_the_streamed_tokens_joined(store):
    events = run("hi there, how are you today", FakeLLM(["Hello", " ", "there"]), store)
    tokens = "".join(e["text"] for e in events if e["type"] == "token")
    final = events[-1]
    assert final["reply"] == tokens == "Hello there"
    assert final["usage"] == {"prompt_tokens": 12, "output_tokens": 3, "tokens_per_second": 2.0}


def test_recent_pairs_are_replayed_word_for_word(store):
    llm = FakeLLM(["A1"])
    run("Question one here", llm, store)
    run("Question two here", llm, store)
    roles = [(m["role"], m["content"]) for m in llm.calls[1]]
    assert roles[1:] == [("user", "Question one here"), ("assistant", "A1"), ("user", "Question two here")]


def test_only_three_recent_pairs_are_replayed(store):
    llm = FakeLLM(["ok"])
    for i in range(5):
        run(f"Question number {i}", llm, store)
    events = run("Question number 5", llm, store)
    users = [m["content"] for m in llm.calls[-1] if m["role"] == "user"]
    assert users == ["Question number 2", "Question number 3", "Question number 4", "Question number 5"]
    assert summary(events, "memory_recall")["older_pairs"] == 2


# --- memory ------------------------------------------------------------------

def test_an_old_pair_is_recalled_by_similarity(store):
    """Turn 5 asks about turn 1, which is outside the three recent pairs."""

    llm = FakeLLM(["noted"])
    run("my cat name is Tom", llm, store)
    run("recommend a python book", llm, store)
    run("will it rain, weather please", llm, store)
    run("pizza is my favourite food", llm, store)
    events = run("what is my cat name", llm, store)

    recall = summary(events, "memory_recall")
    assert recall["older_pairs"] == 1
    assert recall["candidates"][0]["question"] == "my cat name is Tom"
    assert recall["candidates"][0]["picked"] is True
    assert recall["candidates"][0]["score"] >= recall["threshold"]

    prompt = llm.calls[-1]
    assert prompt[1]["role"] == "system" and "[M1] (memory)" in prompt[1]["content"]
    assert "my cat name is Tom" in prompt[1]["content"]
    sources = [m["source"] for m in summary(events, "context")["messages"]]
    assert sources == ["system", "materials", *["recent"] * 6, "current"]
    assert [m["label"] for m in summary(events, "evidence")["manifest"]] == ["M1"]


def test_unrelated_pairs_stay_below_the_threshold(store):
    llm = FakeLLM(["ok"])
    for q in ["my cat name is Tom", "python book please", "rain weather today", "pizza food is great"]:
        run(q, llm, store)
    events = run("hello there friend", llm, store)
    recall = summary(events, "memory_recall")
    assert recall["candidates"] and not any(c["picked"] for c in recall["candidates"])
    assert [m["source"] for m in summary(events, "context")["messages"]][1] == "recent"


def test_turn_still_answers_when_embeddings_fail(store):
    llm = FakeLLM(["ok"])
    for i in range(4):
        run(f"Question number {i}", llm, store)
    llm.embed_fails = True
    events = run("cat food question", llm, store)
    assert events[-1]["type"] == "final"
    assert summary(events, "memory_recall")["note"] == "embed_unavailable"
    assert summary(events, "persist")["embedded"] is False


def test_each_saved_pair_is_embedded(store):
    llm = FakeLLM(["Tom is a nice name"])
    events = run("my cat name is Tom", llm, store)
    persisted = summary(events, "persist")
    assert persisted["embedded"] is True
    assert llm.embedded[-1] == "Q: my cat name is Tom\nA: Tom is a nice name"


def test_clear_starts_a_new_epoch(store):
    llm = FakeLLM(["ok"])
    run("my cat name is Tom", llm, store)
    assert store.clear(CONV) == 1
    assert store.pairs(CONV) == []
    run("what is my cat name", llm, store)
    assert [m["role"] for m in llm.calls[-1]] == ["system", "user"]


def test_memory_survives_a_restart(tmp_path):
    path = tmp_path / "keep.db"
    run("remember me please", FakeLLM(["sure"]), Store(path))
    assert [p.question for p in Store(path).pairs(CONV)] == ["remember me please"]


# --- long-term memory ---------------------------------------------------------

CAT_FACTS = (
    '{"facts": [{"field": "猫的名字", "value": "小白", "quote": "我的猫叫小白"},'
    ' {"field": "猫的年龄", "value": "三岁", "quote": "它今年五岁"}]}'
)


def test_facts_are_kept_only_when_their_quote_is_in_the_message(store):
    events = run("我的猫叫小白，它三岁了", FakeLLM(["好可爱"], facts_reply=CAT_FACTS), store)
    memo = summary(events, "memorize")
    assert [(f["field"], f["value"], f["quote"]) for f in memo["saved"]] == [("猫的名字", "小白", "我的猫叫小白")]
    assert memo["rejected"][0]["reason"] == "quote_not_in_message"
    assert [f.value for f in store.facts(CONV)] == ["小白"]
    assert store.facts(CONV)[0].source_message_id == summary(events, "persist")["user_message_id"]


def test_a_newer_fact_supersedes_the_old_one(store):
    llm = FakeLLM(["ok"], facts_reply='{"facts": [{"field": "最喜欢的食物", "value": "披萨", "quote": "我最喜欢吃披萨"}]}')
    run("我最喜欢吃披萨", llm, store)
    llm.facts_reply = '{"facts": [{"field": "最喜欢的食物 ", "value": "火锅", "quote": "现在最喜欢火锅"}]}'
    events = run("我现在最喜欢火锅了", llm, store)
    memo = summary(events, "memorize")
    assert memo["superseded"] == [{"field": "最喜欢的食物", "old_value": "披萨", "new_value": "火锅"}]
    assert memo["saved"][0]["revision"] == 2
    assert [f.value for f in store.facts(CONV)] == ["火锅"]


def test_facts_reach_the_next_prompt_as_a_summary(store):
    llm = FakeLLM(["好可爱"], facts_reply=CAT_FACTS)
    run("我的猫叫小白，它三岁了", llm, store)
    llm.facts_reply = '{"facts": []}'
    events = run("帮我想个周末计划", llm, store)
    assert "Known facts about the user: 猫的名字: 小白" in llm.calls[-1][1]["content"]
    assert summary(events, "memory_recall")["facts"] == [{"field": "猫的名字", "value": "小白"}]
    assert [m["kind"] for m in summary(events, "evidence")["manifest"]] == ["summary"]


def test_a_failed_extraction_does_not_fail_the_turn(store):
    events = run("我的猫叫小白", FakeLLM(["ok"], facts_fail=True), store)
    assert events[-1]["type"] == "final"
    assert summary(events, "memorize")["note"] == "model_unavailable"
    assert store.pairs(CONV)


def test_clearing_memory_forgets_facts_too(store):
    run("我的猫叫小白，它三岁了", FakeLLM(["好"], facts_reply=CAT_FACTS), store)
    store.clear(CONV)
    assert store.facts(CONV) == []


# --- routing -----------------------------------------------------------------

def test_small_talk_takes_the_fast_path_with_no_model_call(store):
    llm = FakeLLM()
    events = run("你好", llm, store)
    assert shape(events) == [*PREFIX, "route:quick", "stage_start:quick_reply", "token", "stage_end:quick_reply",
                             "stage_start:persist", "stage_end:persist", "final"]
    assert llm.calls == [] and llm.json_calls == []
    assert summary(events, "persist")["skipped"] == "not_indexed_route"
    assert events[-1]["reply"].startswith("你好！")


def test_english_small_talk_gets_an_english_template(store):
    events = run("thanks!", FakeLLM(), store)
    assert events[-1]["reply"].startswith("You're welcome")


def test_a_list_position_is_resolved_from_the_last_answer(store):
    llm = FakeLLM(["两个选择：\n1. Redis\n2. PostgreSQL"])
    run("推荐两个数据库", llm, store)
    events = run("第二个有什么优点？", llm, store)
    assert routes(events) == ["pending", "reference"]
    ref = summary(events, "reference")
    assert ref == {**ref, "resolved": True, "target": "list_item", "index": 2, "resolved_text": "PostgreSQL"}
    assert "item 2 of your previous answer: PostgreSQL" in llm.calls[-1][1]["content"]


def test_a_pointer_refers_to_the_previous_exchange(store):
    llm = FakeLLM(["向量数据库存的是向量"])
    run("什么是向量数据库", llm, store)
    events = run("那它和传统数据库有什么区别？", llm, store)
    ref = summary(events, "reference")
    assert ref["target"] == "previous_turn" and ref["resolved_text"] == "什么是向量数据库"


def test_an_unresolvable_reference_asks_instead_of_guessing(store):
    llm = FakeLLM()
    events = run("第二个呢？", llm, store)
    assert routes(events) == ["pending", "reference", "clarify"]
    assert shape(events)[-6:] == ["token", "stage_end:reference", "route:clarify", "stage_start:persist",
                                  "stage_end:persist", "final"]
    assert summary(events, "reference")["reason"] == "no_history"
    assert llm.calls == []
    assert "第二个" in events[-1]["reply"]


def test_a_list_position_past_the_end_asks(store):
    llm = FakeLLM(["1. Redis\n2. PostgreSQL"])
    run("推荐两个数据库", llm, store)
    events = run("第五个呢", llm, store)
    assert routes(events)[-1] == "clarify"
    assert summary(events, "reference")["reason"] == "out_of_range"


def test_a_correction_brings_back_the_previous_answer(store):
    llm = FakeLLM(["MySQL 是关系型数据库"])
    run("介绍一下 MySQL", llm, store)
    events = run("不对，我是说 Redis", llm, store)
    assert routes(events) == ["pending", "correction"]
    corr = summary(events, "correction")
    assert corr["cue"] == "不对" and corr["previous_question"] == "介绍一下 MySQL"
    assert "which the user is now correcting" in llm.calls[-1][1]["content"]


def test_a_short_follow_up_is_routed_by_the_model(store):
    llm = FakeLLM(["向量是一串数字"], json_reply='{"route": "reference", "reason": "continues the last answer"}')
    run("什么是向量", llm, store)
    events = run("为什么？", llm, store)
    decision = summary(events, "route")
    assert decision["decided_by"] == "model" and decision["route"] == "reference"
    assert routes(events) == ["pending", "reference"]


def test_an_invalid_model_answer_falls_back_to_basic(store):
    llm = FakeLLM(["ok"], json_reply="not json")
    run("什么是向量", llm, store)
    events = run("然后呢", llm, store)
    decision = summary(events, "route")
    assert decision["model_invalid"] is True and decision["route"] == "basic"


# --- privacy and validation -------------------------------------------------

def test_personal_data_never_reaches_the_model_or_the_store(store):
    llm = FakeLLM(["好的，已记下 [PHONE_1]"])
    events = run("我的手机号是 13812345678，帮我记一下", llm, store)
    assert summary(events, "redact")["found"] == {"PHONE": 1}
    assert "13812345678" not in json.dumps(llm.calls)
    assert "13812345678" not in store.pairs(CONV)[0].question + store.pairs(CONV)[0].answer
    # The answer shown on screen gets the real value back.
    assert events[-1]["reply"] == "好的，已记下 13812345678"
    assert summary(events, "validate")["placeholders_restored"] == 1


def test_an_empty_answer_is_retried_without_history(store):
    llm = FakeLLM(replies=[["first"], [], ["second try"]])
    run("Question one here", llm, store)
    events = run("Question two here", llm, store)
    assert summary(events, "validate")["retried_without_history"] is True
    assert [m["role"] for m in llm.calls[-1]] == ["system", "user"]
    assert events[-1]["reply"] == "second try"


def test_an_answer_empty_twice_is_an_error(store):
    events = run("hello world question", FakeLLM(replies=[[], []]), store)
    assert events[-1] == {**events[-1], "type": "error", "stage": "validate", "code": "empty_reply"}
    assert store.pairs(CONV) == []


def test_citations_are_checked_against_what_the_model_saw(store):
    llm = FakeLLM(["1. Redis\n2. PostgreSQL"])
    run("推荐两个数据库", llm, store)
    llm.pieces = ["根据 [M1]，它支持事务 [M9]"]
    events = run("第二个有什么优点？", llm, store)
    check = summary(events, "validate")
    assert check["citations_valid"] == ["M1"] and check["citations_invalid"] == ["M9"]
    assert len(summary(events, "evidence")["prompt_sha256"]) == 64


def test_a_mangled_label_is_removed_from_the_shown_answer(store):
    llm = FakeLLM(["1. Redis\n2. PostgreSQL"])
    run("推荐两个数据库", llm, store)
    llm.pieces = ["[刘1] PostgreSQL 支持事务，电话 [PHONE_1] 不受影响"]
    events = run("第二个有什么优点？", llm, store)
    assert summary(events, "validate")["citations_malformed"] == ["[刘1]"]
    assert events[-1]["reply"] == " PostgreSQL 支持事务，电话 [PHONE_1] 不受影响"


def test_an_invented_tag_at_a_line_end_is_removed(store):
    llm = FakeLLM(["你的猫叫小白 [M1]\n要不要写个日记？\n[猫的信息]\n数组写法 a[0] 和 [链接] 在句中保留"])
    events = run("我的猫叫什么名字", llm, store)
    assert summary(events, "validate")["citations_malformed"] == ["[猫的信息]"]
    assert events[-1]["reply"] == "你的猫叫小白 [M1]\n要不要写个日记？\n\n数组写法 a[0] 和 [链接] 在句中保留"
    assert "[猫的信息]" not in store.pairs(CONV)[0].answer


# --- failures -----------------------------------------------------------------

@pytest.mark.parametrize("message", ["   ", "x" * 2001])
def test_invalid_message_stops_at_receive(store, message):
    llm = FakeLLM()
    events = run(message, llm, store)
    assert shape(events) == ["route:pending", "stage_start:receive", "stage_end:receive", "error:receive"]
    assert events[2]["status"] == "failed"
    assert events[-1]["code"] == "invalid_message"
    assert llm.calls == []


def test_model_failure_is_reported_and_nothing_is_saved(store):
    events = run("hello world question", FakeLLM(fail=True), store)
    assert events[-1] == {**events[-1], "type": "error", "stage": "generate", "code": "llm_unavailable"}
    assert store.pairs(CONV) == []


def test_second_turn_while_one_runs_is_busy(store):
    events = run("hello", FakeLLM(), store, active={CONV})
    assert shape(events) == ["error"]
    assert events[0]["code"] == "busy"


# --- HTTP ---------------------------------------------------------------------

@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "llm", FakeLLM(["流", "式"]))
    monkeypatch.setattr(main, "store", Store(tmp_path / "api.db"))
    monkeypatch.setattr(main, "active", set())
    return TestClient(main.app)


def stream(client: TestClient, message: str, turn: str) -> list[dict]:
    body = {"conversation_id": CONV, "turn_id": turn, "message": message}
    with client.stream("POST", "/api/chat/stream", json=body) as res:
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("text/event-stream")
        return [json.loads(line[5:]) for line in res.iter_lines() if line.startswith("data:")]


def test_stream_endpoint_sends_sse_events(client):
    events = stream(client, "什么是 SSE 协议", "turn-0009")
    assert events[0]["type"] == "route"
    assert events[-1]["type"] == "final"
    assert events[-1]["reply"] == "流式"


def test_stream_endpoint_rejects_bad_ids(client):
    res = client.post("/api/chat/stream", json={"conversation_id": "x", "turn_id": "turn-0001", "message": "hi"})
    assert res.status_code == 422


def test_memory_endpoint_and_clear(client):
    main.llm.facts_reply = '{"facts": [{"field": "name", "value": "Amy", "quote": "Question number 0"}]}'
    for i in range(4):
        stream(client, f"Question number {i}", f"turn-000{i}")
    view = client.get(f"/api/conversations/{CONV}/memory").json()
    assert view["epoch"] == 0 and view["recent_limit"] == 3
    assert [(f["field"], f["value"], f["revision"]) for f in view["facts"]] == [("name", "Amy", 1)]
    assert [p["in_recent"] for p in view["pairs"]] == [False, True, True, True]
    assert all(p["embedded"] for p in view["pairs"])

    assert client.post(f"/api/conversations/{CONV}/clear").json() == {"epoch": 1}
    view = client.get(f"/api/conversations/{CONV}/memory").json()
    assert view["epoch"] == 1 and view["pairs"] == []


def test_clear_is_refused_while_a_turn_runs(client):
    main.active.add(CONV)
    assert client.post(f"/api/conversations/{CONV}/clear").status_code == 409
