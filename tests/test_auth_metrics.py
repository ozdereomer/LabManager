import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session
from prometheus_client import generate_latest

from app.metrics import ApplicationMetrics
from app.models import User


EMAIL = "metrics-user@example.com"
PASSWORD = "Test12345!"


@pytest.fixture
def auth_metrics(monkeypatch):
    metrics = ApplicationMetrics()
    monkeypatch.setattr("app.main.metrics", metrics)
    return metrics.registry


@pytest.fixture
def registered_user(auth_client):
    response = auth_client.post(
        "/register",
        json={
            "email": EMAIL,
            "password": PASSWORD,
        },
    )

    assert response.status_code == 201


def login(client, email=EMAIL, password=PASSWORD):
    return client.post(
        "/login",
        data={
            "username": email,
            "password": password,
        },
    )


def get_count(registry, outcome):
    return registry.get_sample_value(
        "labmanager_authentication_attempts_total",
        {"outcome": outcome},
    )


def test_successful_login_metric(
    auth_client, auth_metrics, registered_user
):
    assert login(auth_client).status_code == 200
    assert get_count(auth_metrics, "success") == 1


def test_wrong_password_metric(
    auth_client, auth_metrics, registered_user
):
    response = login(
        auth_client, password="WrongPassword123!"
    )

    assert response.status_code == 401
    assert get_count(
        auth_metrics, "invalid_credentials"
    ) == 1


def test_unknown_user_metric(auth_client, auth_metrics):
    response = login(
        auth_client, email="unknown@example.com"
    )

    assert response.status_code == 401
    assert get_count(
        auth_metrics, "invalid_credentials"
    ) == 1


def test_inactive_user_metric(
    auth_client, auth_metrics,
    registered_user, test_engine
):
    with Session(test_engine) as db:
        user = db.query(User).filter(
            User.email == EMAIL
        ).one()

        user.is_active = False
        db.commit()

    assert login(auth_client).status_code == 403
    assert get_count(
        auth_metrics, "inactive_user"
    ) == 1


@pytest.mark.parametrize("status_code", [429, 503])
def test_blocked_login_not_counted(
    auth_client,
    auth_metrics,
    mock_endpoint_rate_limiter,
    status_code,
):
    mock_endpoint_rate_limiter.side_effect = HTTPException(
        status_code=status_code,
        detail="Test error",
    )

    assert login(auth_client).status_code == status_code

    for outcome in (
        "success",
        "invalid_credentials",
        "inactive_user",
    ):
        assert get_count(auth_metrics, outcome) is None


def test_sensitive_auth_data_not_exposed(
    auth_client, auth_metrics, registered_user
):
    response = login(auth_client)

    assert response.status_code == 200

    token = response.json()["access_token"]

    output = generate_latest(auth_metrics).decode()

    assert EMAIL not in output
    assert PASSWORD not in output
    assert token not in output
