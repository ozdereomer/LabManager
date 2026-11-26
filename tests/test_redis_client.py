from unittest.mock import ANY, patch

import pytest

from app.redis_client import get_redis_client


@pytest.fixture(autouse=True)
def clear_redis_cache():
    get_redis_client.cache_clear()
    yield
    get_redis_client.cache_clear()


def test_missing_redis_password(monkeypatch):
    monkeypatch.delenv("REDIS_PASSWORD", raising=False)

    with pytest.raises(
        RuntimeError,
        match="REDIS_PASSWORD environment variable is missing"
    ):
        get_redis_client()


def test_empty_redis_password(monkeypatch):
    monkeypatch.setenv("REDIS_PASSWORD", "")

    with pytest.raises(RuntimeError):
        get_redis_client()


def test_redis_client_configuration(monkeypatch):
    monkeypatch.setenv("REDIS_PASSWORD", "test-password")
    monkeypatch.delenv("REDIS_HOST", raising=False)

    with patch("app.redis_client.Redis") as mock_redis:
        client = get_redis_client()

        mock_redis.assert_called_once_with(
            host="redis",
            port=6379,
            username="labmanager",
            password="test-password",
            db=0,
            socket_connect_timeout=2,
            socket_timeout=2,
            decode_responses=True,
            protocol=2,
            driver_info=None,
            retry=ANY
        )

        retry = mock_redis.call_args.kwargs['retry']
        assert retry.get_retries() == 0

        assert client is mock_redis.return_value


def test_custom_redis_host(monkeypatch):
    monkeypatch.setenv("REDIS_PASSWORD", "test-password")
    monkeypatch.setenv("REDIS_HOST", "custom-redis")

    with patch("app.redis_client.Redis") as mock_redis:
        get_redis_client()

        assert mock_redis.call_args.kwargs["host"] == "custom-redis"


def test_redis_client_is_cached(monkeypatch):
    monkeypatch.setenv("REDIS_PASSWORD", "test-password")

    with patch("app.redis_client.Redis") as mock_redis:
        first_client = get_redis_client()
        second_client = get_redis_client()

        assert first_client is second_client
        mock_redis.assert_called_once()
