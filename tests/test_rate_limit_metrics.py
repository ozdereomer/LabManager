from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from redis.exceptions import RedisError

from app.metrics import ApplicationMetrics
from app.rate_limiter import enforce_rate_limit


@pytest.fixture
def metric_environment(monkeypatch):
    metrics = ApplicationMetrics()
    redis = Mock()

    monkeypatch.setattr("app.rate_limiter.metrics", metrics)
    monkeypatch.setattr(
        "app.rate_limiter.get_redis_client",
        lambda: redis,
    )

    return metrics.registry, redis


def test_allowed_request_not_counted_as_rejection(
    metric_environment,
):
    registry, redis = metric_environment
    redis.eval.return_value = [1, 0]

    enforce_rate_limit("login", "test-user", 5, 60)

    assert registry.get_sample_value(
        "labmanager_rate_limit_rejections_total",
        {"scope": "login"},
    ) is None


def test_rejected_request_increments_counter(
    metric_environment,
):
    registry, redis = metric_environment
    redis.eval.return_value = [0, 30]

    for _ in range(2):
        with pytest.raises(HTTPException) as exc:
            enforce_rate_limit("login", "test-user", 5, 60)

        assert exc.value.status_code == 429

    assert registry.get_sample_value(
        "labmanager_rate_limit_rejections_total",
        {"scope": "login"},
    ) == 2


def test_redis_error_increments_counter(
    metric_environment,
):
    registry, redis = metric_environment
    redis.eval.side_effect = RedisError("Test error")

    with pytest.raises(HTTPException) as exc:
        enforce_rate_limit("register", "test-user", 3, 60)

    assert exc.value.status_code == 503

    assert registry.get_sample_value(
        "labmanager_rate_limit_errors_total",
        {"scope": "register"},
    ) == 1


def test_unknown_scope_is_grouped(metric_environment):
    registry, redis = metric_environment
    redis.eval.return_value = [0, 30]

    with pytest.raises(HTTPException):
        enforce_rate_limit(
            "unknown-private-scope", "test-user", 5, 60
        )

    assert registry.get_sample_value(
        "labmanager_rate_limit_rejections_total",
        {"scope": "other"},
    ) == 1


def test_sensitive_values_not_exposed(metric_environment):
    registry, redis = metric_environment
    redis.eval.return_value = [0, 30]

    with pytest.raises(HTTPException):
        enforce_rate_limit(
            "login", "private-user@example.com", 5, 60
        )

    from prometheus_client import generate_latest

    output = generate_latest(registry).decode()

    assert "private-user@example.com" not in output
