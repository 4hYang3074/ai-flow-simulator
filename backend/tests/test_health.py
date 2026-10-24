from pathlib import Path
from types import SimpleNamespace

from app.config import Settings
from app.health import build_report, installed_names

SETTINGS = Settings(
    ollama_host="http://127.0.0.1:11434",
    chat_model="qwen3:4b-instruct",
    embed_model="qwen3-embedding:0.6b",
    db_path=Path("unused.db"),
)


def listing(*names: str) -> SimpleNamespace:
    return SimpleNamespace(models=[SimpleNamespace(model=n) for n in names])


def test_ready_when_both_models_installed():
    report = build_report(
        SETTINGS, installed_names(listing("qwen3:4b-instruct", "qwen3-embedding:0.6b"))
    )
    assert report.ready
    assert report.problem is None


def test_names_without_tag_match_latest():
    settings = Settings(SETTINGS.ollama_host, "llama3", SETTINGS.embed_model, SETTINGS.db_path)
    report = build_report(
        settings, installed_names(listing("llama3:latest", "qwen3-embedding:0.6b"))
    )
    assert report.ready


def test_missing_model_is_named():
    report = build_report(SETTINGS, installed_names(listing("qwen3:4b-instruct")))
    assert not report.ready
    assert report.problem == "model_missing"
    assert [m.available for m in report.models] == [True, False]


def test_unreachable_ollama():
    report = build_report(SETTINGS, None)
    assert not report.ollama_reachable
    assert report.problem == "ollama_unreachable"
    assert not any(m.available for m in report.models)
