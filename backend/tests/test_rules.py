import pytest

from app.redaction import Vault
from app.routing import decide, list_items, ordinal_index
from app.summary import validate_extraction


def test_extraction_rejects_bad_output_without_raising():
    assert validate_extraction("not json", "x") == ([], [{"reason": "invalid_json"}])
    accepted, rejected = validate_extraction(
        '{"facts": [{"field": "", "value": "a", "quote": "a"}, {"field": "pet", "value": "cat", "quote": "my cat"},'
        ' {"field": "Pet", "value": "dog", "quote": "my cat"}]}',
        "I have my cat",
    )
    assert [a.value for a in accepted] == ["cat"]
    assert [r["reason"] for r in rejected] == ["missing_part", "duplicate_field"]


def test_facts_from_a_question_are_rejected():
    """Seen with the real model: a question turned into "猫的名字: 未知"."""

    accepted, rejected = validate_extraction(
        '{"facts": [{"field": "猫的名字", "value": "未知", "quote": "我的猫叫什么名字？"},'
        ' {"field": "猫的年龄", "value": "三岁", "quote": "几岁了？"}]}',
        "我的猫叫什么名字？几岁了？",
    )
    assert accepted == []
    assert [r["reason"] for r in rejected] == ["unknown_value", "from_question"]


def test_a_statement_next_to_a_question_is_kept():
    accepted, rejected = validate_extraction(
        '{"facts": [{"field": "名字", "value": "阿明", "quote": "我叫阿明"}]}',
        "我叫阿明，你能推荐一本书吗？",
    )
    assert [a.value for a in accepted] == ["阿明"]


def test_a_statement_sentence_after_a_question_is_kept():
    accepted, _ = validate_extraction(
        '{"facts": [{"field": "pet", "value": "Tom", "quote": "My cat is Tom."}]}',
        "What should I cook? My cat is Tom.",
    )
    assert [a.value for a in accepted] == ["Tom"]


@pytest.mark.parametrize(
    ("message", "history", "route", "rule"),
    [
        ("你好", False, "quick", "small_talk"),
        ("Thanks!", True, "quick", "small_talk"),
        ("好的", True, "quick", "small_talk"),
        ("不对，我是说 Redis", True, "correction", "correction_cue"),
        ("I meant the other one", True, "correction", "correction_cue"),
        ("不对，我是说 Redis", False, None, None),
        ("第二个呢？", False, "reference", "ordinal_cue"),
        ("the second one please", True, "reference", "ordinal_cue"),
        ("那它和传统数据库有什么区别？", True, "reference", "reference_cue"),
        ("这个世界上最高的山是什么", False, None, None),
        ("换个话题，推荐一部电影", True, "basic", "topic_shift"),
        ("什么是向量数据库？", True, None, None),
        ("Is it possible to learn Python in a month?", True, None, None),
    ],
)
def test_rules(message, history, route, rule):
    decision = decide(message, history)
    assert (decision.route, decision.rule) == (route, rule)


def test_small_talk_kind_is_reported():
    assert decide("再见！", True).small_talk == "goodbye"
    assert decide("你好呀，帮我写首诗", True).route is None


@pytest.mark.parametrize(("message", "index"), [("第二个呢", 2), ("第3点展开说说", 3), ("the first one", 1), ("没有序号", None)])
def test_ordinal_index(message, index):
    assert ordinal_index(message) == index


def test_list_items_reads_numbered_and_bulleted_lines():
    answer = "可以看这些：\n1. **向量表示**：把文字变数字\n2. 语义相似\n- 广泛应用\n结尾"
    assert list_items(answer) == ["向量表示：把文字变数字", "语义相似", "广泛应用"]


def test_vault_redacts_and_restores():
    vault = Vault()
    text, counts = vault.redact("我的手机是 13812345678，邮箱 amy@example.com，再打 13900001111")
    assert counts == {"EMAIL": 1, "PHONE": 2}
    assert "[PHONE_1]" in text and "[PHONE_2]" in text and "[EMAIL_1]" in text
    assert "13812345678" not in text
    assert vault.restore("打 [PHONE_1] 或写信到 [EMAIL_1]") == "打 13812345678 或写信到 amy@example.com"


def test_vault_leaves_ordinary_numbers_alone():
    text, counts = Vault().redact("2024 年有 365 天，价格 199 元")
    assert counts == {} and text == "2024 年有 365 天，价格 199 元"
