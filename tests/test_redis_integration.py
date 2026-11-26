import os
import time
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi import HTTPException
from app.redis_client import get_redis_client

from app.rate_limiter import (
    build_rate_limit_key,
    enforce_rate_limit
)


pytestmark = pytest.mark.skipif(
    os.getenv("RUN_REDIS_INTEGRATION") != "1",
    reason="Requires isolated Redis integration environment"
)


@pytest.fixture
def redis_client():
    get_redis_client.cache_clear()
    client = get_redis_client()

    try:
        assert client.ping()
        yield client
    finally:
        client.close()
        get_redis_client.cache_clear()


@pytest.fixture
def identifier():
    return uuid4().hex


def test_real_redis_request_limit(redis_client, identifier):
    for _ in range(5):
        enforce_rate_limit("login", identifier, 5, 60)

    with pytest.raises(HTTPException) as exc:
        enforce_rate_limit("login", identifier, 5, 60)

    assert exc.value.status_code == 429
    assert 1 <= int(exc.value.headers["Retry-After"]) <= 60

    key = build_rate_limit_key("login", identifier)

    assert redis_client.get(key) == "5"


def test_blocked_requests_do_not_increment(
    redis_client, identifier
):
    enforce_rate_limit("login", identifier, 1, 60)

    for _ in range(10):
        with pytest.raises(HTTPException) as exc:
            enforce_rate_limit("login", identifier, 1, 60)

        assert exc.value.status_code == 429

    key = build_rate_limit_key("login", identifier)

    assert redis_client.get(key) == "1"


def test_rate_limit_expires(redis_client, identifier):
    enforce_rate_limit("login", identifier, 1, 2)

    key = build_rate_limit_key("login", identifier)

    assert 0 <= redis_client.ttl(key) <= 2

    with pytest.raises(HTTPException) as exc:
        enforce_rate_limit("login", identifier, 1, 2)

    assert exc.value.status_code == 429

    deadline = time.monotonic() + 5

    while redis_client.get(key) is not None:
        assert time.monotonic() < deadline
        time.sleep(0.1)

    enforce_rate_limit("login", identifier, 1, 2)

    assert redis_client.get(key) == "1"


def test_independent_identifiers(redis_client, identifier):
    first = identifier + "-first"
    second = identifier + "-second"

    enforce_rate_limit("login", first, 1, 60)

    with pytest.raises(HTTPException) as exc:
        enforce_rate_limit("login", first, 1, 60)

    assert exc.value.status_code == 429

    enforce_rate_limit("login", second, 1, 60)

    assert redis_client.get(
        build_rate_limit_key("login", second)
    ) == "1"


def test_independent_scopes(redis_client, identifier):
    enforce_rate_limit("login", identifier, 1, 60)
    enforce_rate_limit("register", identifier, 1, 60)

    assert redis_client.get(
        build_rate_limit_key("login", identifier)
    ) == "1"

    assert redis_client.get(
        build_rate_limit_key("register", identifier)
    ) == "1"


def test_concurrent_requests(redis_client, identifier):
    def send_request(_):
        try:
            enforce_rate_limit("login", identifier, 5, 60)
            return 200
        except HTTPException as exc:
            return exc.status_code

    with ThreadPoolExecutor(max_workers=15) as executor:
        results = list(executor.map(send_request, range(30)))

    assert results.count(200) == 5
    assert results.count(429) == 25

    key = build_rate_limit_key("login", identifier)

    assert redis_client.get(key) == "5"


def test_missing_expiration_on_blocked_counter(
    redis_client, identifier
):
    key = build_rate_limit_key("login", identifier)

    redis_client.set(key, 5)

    assert redis_client.pttl(key) == -1

    with pytest.raises(HTTPException) as exc:
        enforce_rate_limit("login", identifier, 5, 60)

    assert exc.value.status_code == 429
    assert exc.value.headers["Retry-After"] == "60"
    assert redis_client.get(key) == "5"
    assert 0 < redis_client.pttl(key) <= 60000


def test_missing_expiration_on_allowed_counter(
    redis_client, identifier
):
    key = build_rate_limit_key("login", identifier)

    redis_client.set(key, 2)

    assert redis_client.pttl(key) == -1

    enforce_rate_limit("login", identifier, 5, 60)

    assert redis_client.get(key) == "3"
    assert 0 < redis_client.pttl(key) <= 60000


def test_retry_after_rounds_up(
    redis_client, identifier
):
    key = build_rate_limit_key("login", identifier)

    redis_client.set(key, 5, px=59400)

    before = redis_client.pttl(key)

    with pytest.raises(HTTPException) as exc:
        enforce_rate_limit("login", identifier, 5, 60)

    after = redis_client.pttl(key)

    assert exc.value.status_code == 429

    retry_after = int(exc.value.headers["Retry-After"])

    assert (after + 999) // 1000 <= retry_after
    assert retry_after <= (before + 999) // 1000
    assert redis_client.get(key) == "5"
