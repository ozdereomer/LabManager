def test_home_endpoint(client):
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {
        "message": "LabManager API is running!",
        "version": "0.1.0",
    }


def test_health_endpoint(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy"
    }


def test_register_duplicate_email(client):
    data = {
        "email": "duplicate@example.com",
        "password": "TestPassword123!",
    }

    first_response = client.post("/register", json=data)

    assert first_response.status_code == 201

    second_response = client.post("/register", json=data)

    assert second_response.status_code == 409
    assert second_response.json()["detail"] == (
        "Email already registered"
    )


def test_register_integrity_error_rollback(client, monkeypatch):
    from unittest.mock import Mock
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import Session

    commit_mock = Mock(
        side_effect=IntegrityError(
            "INSERT",
            {},
            Exception("Duplicate email"),
        )
    )

    rollback_mock = Mock()

    monkeypatch.setattr(Session, "commit", commit_mock)
    monkeypatch.setattr(Session, "rollback", rollback_mock)

    response = client.post(
        "/register",
        json={
            "email": "integrity@example.com",
            "password": "TestPassword123!",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Email already registered"

    commit_mock.assert_called_once()
    rollback_mock.assert_called_once()


def test_update_email_integrity_error_rollback(
    auth_client, monkeypatch
):
    from unittest.mock import Mock
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import Session

    response = auth_client.post(
        "/register",
        json={
            "email": "email-integrity@example.com",
            "password": "TestPassword123!",
        },
    )

    assert response.status_code == 201

    response = auth_client.post(
        "/login",
        data={
            "username": "email-integrity@example.com",
            "password": "TestPassword123!",
        },
    )

    assert response.status_code == 200

    token = response.json()["access_token"]

    commit_mock = Mock(
        side_effect=IntegrityError(
            "UPDATE",
            {},
            Exception("Duplicate email"),
        )
    )

    rollback_mock = Mock()

    monkeypatch.setattr(Session, "commit", commit_mock)
    monkeypatch.setattr(Session, "rollback", rollback_mock)

    response = auth_client.put(
        "/users/me/email",
        headers={
            "Authorization": f"Bearer {token}"
        },
        json={
            "new_email": "new-integrity@example.com",
            "current_password": "TestPassword123!",
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Email already registered"

    commit_mock.assert_called_once()
    rollback_mock.assert_called_once()


import pytest


@pytest.mark.parametrize(
    "endpoint, payload",
    [
        (
            "/users/me/email",
            {
                "new_email": "updated@example.com",
                "current_password": "TestPassword123!",
            },
        ),
        (
            "/users/me/password",
            {
                "current_password": "TestPassword123!",
                "new_password": "NewPassword456!",
            },
        ),
    ],
)
@pytest.mark.parametrize(
    "session_state",
    ["missing", "inactive", "version_changed"],
)
def test_account_update_invalid_session(
    client, test_engine, endpoint, payload, session_state
):
    from sqlalchemy.orm import Session
    from app.main import app
    from app.auth import get_current_user
    from app.models import User

    authenticated_user = User(
        id=42,
        email="session@example.com",
        hashed_password="test",
        is_active=True,
        token_version=0,
    )

    if session_state != "missing":
        with Session(test_engine) as db:
            db.add(
                User(
                    id=42,
                    email="session@example.com",
                    hashed_password="test",
                    is_active=session_state != "inactive",
                    token_version=(
                        1 if session_state == "version_changed"
                        else 0
                    ),
                )
            )
            db.commit()

    app.dependency_overrides[get_current_user] = (
        lambda: authenticated_user
    )

    response = client.put(endpoint, json=payload)

    assert response.status_code == 401
    assert response.json()["detail"] == (
        "Invalid or expired session"
    )


def test_update_equipment_integrity_error_rollback(
    client, monkeypatch
):
    from unittest.mock import Mock
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import Session

    laboratory = client.post(
        "/laboratories",
        json={
            "name": "Integrity Test Lab",
            "location": "Test Room",
        },
    )

    assert laboratory.status_code == 201

    laboratory_id = laboratory.json()["id"]

    equipment = client.post(
        "/equipment",
        json={
            "name": "Test Equipment",
            "serial_number": "TEST-001",
            "status": "available",
            "laboratory_id": laboratory_id,
        },
    )

    assert equipment.status_code == 201

    equipment_id = equipment.json()["id"]

    commit_mock = Mock(
        side_effect=IntegrityError(
            "UPDATE",
            {},
            Exception("Duplicate serial number"),
        )
    )

    rollback_mock = Mock()

    monkeypatch.setattr(Session, "commit", commit_mock)
    monkeypatch.setattr(Session, "rollback", rollback_mock)

    response = client.put(
        f"/equipment/{equipment_id}",
        json={
            "name": "Updated Equipment",
            "serial_number": "TEST-002",
            "status": "maintenance",
            "laboratory_id": laboratory_id,
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "This serial number already exists"
    )

    commit_mock.assert_called_once()
    rollback_mock.assert_called_once()


@pytest.mark.parametrize(
    "target",
    ["nonexistent", "other_user"],
)
def test_update_maintenance_invalid_equipment(
    multi_user_client, target
):
    client, current_user = multi_user_client

    current_user["id"] = 1

    response = client.post(
        "/laboratories",
        json={
            "name": "User 1 Laboratory",
            "location": "Room 1",
        },
    )

    assert response.status_code == 201
    laboratory_id = response.json()["id"]

    response = client.post(
        "/equipment",
        json={
            "name": "User 1 Equipment",
            "serial_number": "USER1-001",
            "status": "available",
            "laboratory_id": laboratory_id,
        },
    )

    assert response.status_code == 201
    equipment_id = response.json()["id"]

    response = client.post(
        "/maintenance",
        json={
            "equipment_id": equipment_id,
            "maintenance_date": "2026-11-26",
            "description": "Original maintenance",
            "technician": "Test Technician",
            "cost": 100,
        },
    )

    assert response.status_code == 201
    maintenance_id = response.json()["id"]

    target_equipment_id = 999999

    if target == "other_user":
        current_user["id"] = 2

        response = client.post(
            "/laboratories",
            json={
                "name": "User 2 Laboratory",
                "location": "Room 2",
            },
        )

        assert response.status_code == 201

        response = client.post(
            "/equipment",
            json={
                "name": "User 2 Equipment",
                "serial_number": "USER2-001",
                "status": "available",
                "laboratory_id": response.json()["id"],
            },
        )

        assert response.status_code == 201
        target_equipment_id = response.json()["id"]

    current_user["id"] = 1

    response = client.put(
        f"/maintenance/{maintenance_id}",
        json={
            "equipment_id": target_equipment_id,
            "maintenance_date": "2026-11-26",
            "description": "Unauthorized update",
            "technician": "Test Technician",
            "cost": 200,
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Equipment not found"

    response = client.get("/maintenance")

    assert response.status_code == 200

    records = response.json()
    assert len(records) == 1
    assert records[0]["id"] == maintenance_id
    assert records[0]["equipment_id"] == equipment_id
    assert records[0]["description"] == "Original maintenance"
    assert float(records[0]["cost"]) == 100
