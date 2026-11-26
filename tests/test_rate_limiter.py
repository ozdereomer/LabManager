from unittest.mock import patch

import pytest
from fastapi import HTTPException
from redis.exceptions import ConnectionError, TimeoutError

from app.rate_limiter import (
    RATE_LIMIT_SCRIPT,
    build_rate_limit_key,
    enforce_rate_limit
)


def test_rate_limit_key_is_deterministic():
    first = build_rate_limit_key("login", "test@example.com")
    second = build_rate_limit_key("login", "test@example.com")

    assert first == second


def test_rate_limit_key_hides_identifier():
    identifier = "test@example.com"
    key = build_rate_limit_key("login", identifier)

    assert identifier not in key
    assert key.startswith("labmanager:ratelimit:login:")
    assert len(key.split(":")[-1]) == 64


def test_different_identifiers_generate_different_keys():
    first = build_rate_limit_key("login", "first@example.com")
    second = build_rate_limit_key("login", "second@example.com")

    assert first != second


def test_different_scopes_generate_different_keys():
    first = build_rate_limit_key("login", "test@example.com")
    second = build_rate_limit_key("register", "test@example.com")

    assert first != second


@pytest.mark.parametrize(
    "limit,window",
    [(0, 60), (-1, 60), (5, 0), (5, -1)]
)
def test_invalid_rate_limit_settings(limit, window):
    with pytest.raises(
        ValueError,
        match="Rate limit settings must be positive"
    ):
        enforce_rate_limit("login", "test", limit, window)


def test_allowed_request():
    with patch("app.rate_limiter.get_redis_client") as mock_client:
        mock_client.return_value.eval.return_value = [1, 0]

        result = enforce_rate_limit("login", "test", 5, 60)

        assert result is None

        mock_client.return_value.eval.assert_called_once_with(
            RATE_LIMIT_SCRIPT,
            1,
            build_rate_limit_key("login", "test"),
            5,
            60
        )


def test_blocked_request():
    with patch("app.rate_limiter.get_redis_client") as mock_client:
        mock_client.return_value.eval.return_value = [0, 42]

        with pytest.raises(HTTPException) as exc:
            enforce_rate_limit("login", "test", 5, 60)

        assert exc.value.status_code == 429
        assert exc.value.headers["Retry-After"] == "42"
        assert exc.value.detail == (
            "Too many requests. Please try again later."
        )


@pytest.mark.parametrize(
    "error",
    [
        ConnectionError("Connection failed"),
        TimeoutError("Redis timeout")
    ]
)
def test_redis_failure_returns_503(error):
    with patch("app.rate_limiter.get_redis_client") as mock_client:
        mock_client.return_value.eval.side_effect = error

        with pytest.raises(HTTPException) as exc:
            enforce_rate_limit("login", "test", 5, 60)

        assert exc.value.status_code == 503
        assert exc.value.detail == (
            "Authentication service temporarily unavailable"
        )


def test_missing_redis_configuration_returns_503():
    with patch("app.rate_limiter.get_redis_client") as mock_client:
        mock_client.side_effect = RuntimeError("Missing configuration")

        with pytest.raises(HTTPException) as exc:
            enforce_rate_limit("login", "test", 5, 60)

        assert exc.value.status_code == 503


def test_redis_failure_does_not_log_sensitive_data(caplog):
    identifier = "private@example.com"
    sensitive_error = "secret-password"

    with patch("app.rate_limiter.get_redis_client") as mock_client:
        mock_client.return_value.eval.side_effect = ConnectionError(
            sensitive_error
        )

        with pytest.raises(HTTPException):
            enforce_rate_limit("login", identifier, 5, 60)

    assert "Rate limiting service unavailable" in caplog.text
    assert identifier not in caplog.text
    assert sensitive_error not in caplog.text
