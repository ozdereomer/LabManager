import os
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.models import User
from app.rate_limiter import enforce_rate_limit
from app.redis_client import get_redis_client
from app.security import verify_password


pytestmark = pytest.mark.skipif(
    os.getenv("RUN_REDIS_INTEGRATION") != "1",
    reason="Requires isolated authenticated Redis"
)


@pytest.fixture(autouse=True)
def real_endpoint_rate_limiter(
    mock_endpoint_rate_limiter, monkeypatch
):
    get_redis_client.cache_clear()

    monkeypatch.setattr(
        "app.main.enforce_rate_limit",
        enforce_rate_limit
    )

    client = get_redis_client()

    try:
        assert client.ping()
        yield
    finally:
        client.close()
        get_redis_client.cache_clear()


@pytest.fixture
def email():
    return f"{uuid4().hex}@example.com"


@pytest.fixture
def registered_user(auth_client, email):
    response = auth_client.post(
        "/register",
        json={
            "email": email,
            "password": "test-password"
        }
    )

    assert response.status_code == 201

    return email


def test_real_login_rate_limit(
    auth_client, registered_user
):
    for _ in range(5):
        response = auth_client.post(
            "/login",
            data={
                "username": registered_user,
                "password": "wrong-password"
            }
        )

        assert response.status_code == 401

    response = auth_client.post(
        "/login",
        data={
            "username": registered_user.upper(),
            "password": "test-password"
        }
    )

    assert response.status_code == 429
    assert 1 <= int(response.headers["Retry-After"]) <= 60


def test_real_register_rate_limit(
    auth_client, test_engine, email
):
    for expected in [201, 409, 409, 429]:
        response = auth_client.post(
            "/register",
            json={
                "email": email,
                "password": "test-password"
            }
        )

        assert response.status_code == expected

    assert "Retry-After" in response.headers

    with Session(test_engine) as db:
        assert db.query(User).filter(
            User.email == email
        ).count() == 1


@pytest.mark.parametrize(
    "endpoint,payload",
    [
        (
            "/users/me/email",
            {"new_email": "changed@example.com"}
        ),
        (
            "/users/me/password",
            {"new_password": "changed-password"}
        )
    ]
)
def test_real_settings_rate_limit(
    auth_client, registered_user,
    test_engine, endpoint, payload
):
    login = auth_client.post(
        "/login",
        data={
            "username": registered_user,
            "password": "test-password"
        }
    )

    assert login.status_code == 200

    headers = {
        "Authorization": (
            "Bearer " + login.json()["access_token"]
        )
    }

    for _ in range(5):
        response = auth_client.put(
            endpoint,
            headers=headers,
            json={
                **payload,
                "current_password": "wrong-password"
            }
        )

        assert response.status_code == 400

    response = auth_client.put(
        endpoint,
        headers=headers,
        json={
            **payload,
            "current_password": "test-password"
        }
    )

    assert response.status_code == 429
    assert "Retry-After" in response.headers

    with Session(test_engine) as db:
        user = db.query(User).filter(
            User.email == registered_user
        ).one()

        assert user.token_version == 0

        assert verify_password(
            "test-password",
            user.hashed_password
        )


def test_real_redis_outage(
    auth_client, email, monkeypatch
):
    from redis import Redis

    unavailable_client = Redis(
        host="127.0.0.1",
        port=6379,
        socket_connect_timeout=1,
        socket_timeout=1
    )

    monkeypatch.setattr(
        "app.rate_limiter.get_redis_client",
        lambda: unavailable_client
    )

    try:
        response = auth_client.post(
            "/login",
            data={
                "username": email,
                "password": "test-password"
            }
        )

        assert response.status_code == 503
        assert auth_client.get("/health").status_code == 200
    finally:
        unavailable_client.close()


def test_real_global_login_rate_limit(auth_client):
    for i in range(100):
        response = auth_client.post(
            "/login",
            data={
                "username": f"global-login-{i}@example.com",
                "password": "test-password"
            }
        )

        assert response.status_code == 401

    response = auth_client.post(
        "/login",
        data={
            "username": "global-login-blocked@example.com",
            "password": "test-password"
        }
    )

    assert response.status_code == 429
    assert 1 <= int(response.headers["Retry-After"]) <= 60


def test_real_global_register_rate_limit(
    auth_client, test_engine
):
    for i in range(30):
        response = auth_client.post(
            "/register",
            json={
                "email": f"global-register-{i}@example.com",
                "password": "test-password"
            }
        )

        assert response.status_code == 201

    response = auth_client.post(
        "/register",
        json={
            "email": "global-register-blocked@example.com",
            "password": "test-password"
        }
    )

    assert response.status_code == 429
    assert 1 <= int(response.headers["Retry-After"]) <= 60

    with Session(test_engine) as db:
        assert db.query(User).count() == 30
