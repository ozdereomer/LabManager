import runpy
from unittest.mock import Mock

import pytest

from app import database


def test_missing_database_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(
        RuntimeError,
        match="DATABASE_URL environment variable is missing",
    ):
        runpy.run_path(
            "app/database.py",
            run_name="database_config_test",
        )


def test_get_db_creates_session(monkeypatch):
    session = Mock()
    factory = Mock(return_value=session)

    monkeypatch.setattr(database, "SessionLocal", factory)

    generator = database.get_db()

    try:
        assert next(generator) is session

        factory.assert_called_once_with()
        session.close.assert_not_called()
    finally:
        generator.close()

    session.close.assert_called_once_with()


def test_get_db_closes_session_after_completion(monkeypatch):
    session = Mock()

    monkeypatch.setattr(
        database,
        "SessionLocal",
        Mock(return_value=session),
    )

    generator = database.get_db()

    assert next(generator) is session

    with pytest.raises(StopIteration):
        next(generator)

    session.close.assert_called_once_with()


def test_get_db_closes_session_on_exception(monkeypatch):
    session = Mock()

    monkeypatch.setattr(
        database,
        "SessionLocal",
        Mock(return_value=session),
    )

    generator = database.get_db()

    assert next(generator) is session

    with pytest.raises(RuntimeError, match="Database test error"):
        generator.throw(
            RuntimeError("Database test error")
        )

    session.close.assert_called_once_with()
