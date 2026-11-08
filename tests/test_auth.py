from app.main import app
from app.auth import get_current_user
from app.models import User
from datetime import datetime, timedelta, timezone
from app.auth import SECRET_KEY, ALGORITHM
import jwt

def test_access_protected_endpoint_without_token(client):
    app.dependency_overrides.pop(get_current_user, None)

    response = client.get("/laboratories")

    assert response.status_code == 401


def test_access_protected_endpoint_with_invalid_token(client):
    app.dependency_overrides.pop(get_current_user, None)

    response = client.get(
        "/laboratories",
        headers={
            "Authorization": "Bearer invalid-token"
        }
    )

    assert response.status_code == 401
def test_register_password_is_hashed(client):
    from app.database import get_db
    from app.security import verify_password

    response = client.post(
        "/register",
        json={
            "email": "security@example.com",
            "password": "Test12345!"
        }
    )

    assert response.status_code == 201

    db = next(app.dependency_overrides[get_db]())

    try:
        user = db.query(User).filter(
            User.email == "security@example.com"
        ).first()

        assert user is not None
        assert user.hashed_password != "Test12345!"
        assert verify_password(
            "Test12345!",
            user.hashed_password
        )
    finally:
        db.close()
def test_login_with_correct_password(client):
    response = client.post(
        "/register",
        json={
            "email": "login@example.com",
            "password": "Test12345!"
        }
    )

    assert response.status_code == 201

    response = client.post(
        "/login",
        data={
            "username": "login@example.com",
            "password": "Test12345!"
        }
    )

    assert response.status_code == 200

    data = response.json()

    assert "access_token" in data
    assert data["token_type"] == "bearer"
def test_login_with_wrong_password(client):
    client.post(
        "/register",
        json={
            "email": "wrongpass@example.com",
            "password": "Test12345!"
        }
    )

    response = client.post(
        "/login",
        data={
            "username": "wrongpass@example.com",
            "password": "WrongPassword123!"
        }
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Incorrect email or password"
def test_access_protected_endpoint_with_expired_token(client):
    app.dependency_overrides.pop(get_current_user, None)

    expired_token = jwt.encode(
        {
            "sub": "test@example.com",
            "exp": datetime.now(timezone.utc) - timedelta(minutes=1)
        },
        SECRET_KEY,
        algorithm=ALGORITHM
    )

    response = client.get(
        "/laboratories",
        headers={
            "Authorization": f"Bearer {expired_token}"
        }
    )

    assert response.status_code == 401
def test_inactive_user_cannot_login(client):
    from app.database import get_db

    client.post(
        "/register",
        json={
            "email": "inactive@example.com",
            "password": "Test12345!"
        }
    )

    db = next(app.dependency_overrides[get_db]())

    try:
        user = db.query(User).filter(
            User.email == "inactive@example.com"
        ).first()

        user.is_active = False
        db.commit()
    finally:
        db.close()

    response = client.post(
        "/login",
        data={
            "username": "inactive@example.com",
            "password": "Test12345!"
        }
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Inactive user"
