from unittest.mock import call

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models import User


def test_login_rate_limit_policy(
    auth_client, mock_endpoint_rate_limiter
):
    response = auth_client.post(
        "/login",
        data={
            "username": "TEST@example.com",
            "password": "test-password"
        }
    )

    assert response.status_code == 401

    assert mock_endpoint_rate_limiter.call_args_list == [
        call("login-global", "global", 100, 60),
        call("login", "test@example.com", 5, 60)
    ]


def test_register_rate_limit_policy(
    auth_client, mock_endpoint_rate_limiter
):
    response = auth_client.post(
        "/register",
        json={
            "email": "TEST@example.com",
            "password": "test-password"
        }
    )

    assert response.status_code == 201

    assert mock_endpoint_rate_limiter.call_args_list == [
        call("register-global", "global", 30, 60),
        call("register", "test@example.com", 3, 60)
    ]


@pytest.mark.parametrize(
    "endpoint,scope,payload",
    [
        (
            "/users/me/email",
            "update-email",
            {
                "new_email": "new@example.com",
                "current_password": "test-password"
            }
        ),
        (
            "/users/me/password",
            "update-password",
            {
                "current_password": "test-password",
                "new_password": "new-test-password"
            }
        )
    ]
)
def test_user_settings_rate_limit_policy(
    client, mock_endpoint_rate_limiter,
    endpoint, scope, payload
):
    mock_endpoint_rate_limiter.side_effect = HTTPException(
        status_code=429,
        detail="Too many requests",
        headers={"Retry-After": "45"}
    )

    response = client.put(endpoint, json=payload)

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "45"

    mock_endpoint_rate_limiter.assert_called_once_with(
        scope, "1", 5, 60
    )


@pytest.mark.parametrize(
    "endpoint",
    ["/login", "/register"]
)
def test_global_limit_blocks_request(
    auth_client, mock_endpoint_rate_limiter, endpoint
):
    mock_endpoint_rate_limiter.side_effect = HTTPException(
        status_code=429,
        detail="Too many requests",
        headers={"Retry-After": "30"}
    )

    if endpoint == "/login":
        response = auth_client.post(
            endpoint,
            data={
                "username": "test@example.com",
                "password": "test-password"
            }
        )
    else:
        response = auth_client.post(
            endpoint,
            json={
                "email": "test@example.com",
                "password": "test-password"
            }
        )

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "30"
    assert mock_endpoint_rate_limiter.call_count == 1


def test_login_account_limit_blocks_request(
    auth_client, mock_endpoint_rate_limiter
):
    mock_endpoint_rate_limiter.side_effect = [
        None,
        HTTPException(
            status_code=429,
            detail="Too many requests",
            headers={"Retry-After": "25"}
        )
    ]

    response = auth_client.post(
        "/login",
        data={
            "username": "test@example.com",
            "password": "test-password"
        }
    )

    assert response.status_code == 429
    assert response.headers["Retry-After"] == "25"
    assert mock_endpoint_rate_limiter.call_count == 2


def test_blocked_registration_does_not_create_user(
    auth_client, test_engine, mock_endpoint_rate_limiter
):
    mock_endpoint_rate_limiter.side_effect = [
        None,
        HTTPException(
            status_code=429,
            detail="Too many requests",
            headers={"Retry-After": "60"}
        )
    ]

    response = auth_client.post(
        "/register",
        json={
            "email": "blocked@example.com",
            "password": "test-password"
        }
    )

    assert response.status_code == 429

    with Session(test_engine) as db:
        assert db.query(User).count() == 0


@pytest.mark.parametrize(
    "endpoint,method,payload",
    [
        (
            "/login",
            "POST",
            {
                "username": "test@example.com",
                "password": "test-password"
            }
        ),
        (
            "/register",
            "POST",
            {
                "email": "test@example.com",
                "password": "test-password"
            }
        ),
        (
            "/users/me/email",
            "PUT",
            {
                "new_email": "new@example.com",
                "current_password": "test-password"
            }
        ),
        (
            "/users/me/password",
            "PUT",
            {
                "current_password": "test-password",
                "new_password": "new-test-password"
            }
        )
    ]
)
def test_redis_outage_returns_503(
    client, mock_endpoint_rate_limiter,
    endpoint, method, payload
):
    mock_endpoint_rate_limiter.side_effect = HTTPException(
        status_code=503,
        detail="Authentication service temporarily unavailable"
    )

    if endpoint == "/login":
        response = client.request(
            method, endpoint, data=payload
        )
    else:
        response = client.request(
            method, endpoint, json=payload
        )

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Authentication service temporarily unavailable"
    )


@pytest.mark.parametrize(
    "endpoint",
    ["/", "/health", "/laboratories", "/equipment"]
)
def test_other_endpoints_are_not_rate_limited(
    client, mock_endpoint_rate_limiter, endpoint
):
    mock_endpoint_rate_limiter.side_effect = HTTPException(
        status_code=503,
        detail="Redis unavailable"
    )

    response = client.get(endpoint)

    assert response.status_code == 200
    mock_endpoint_rate_limiter.assert_not_called()
