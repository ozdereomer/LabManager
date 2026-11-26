def test_register_validation_does_not_expose_password(auth_client):
    password = "abc123"

    response = auth_client.post(
        "/register",
        json={
            "email": "security@example.com",
            "password": password
        }
    )

    assert response.status_code == 422
    assert password not in response.text

    for error in response.json()["detail"]:
        assert "input" not in error
        assert "ctx" not in error
        assert error["msg"] == "Invalid input"


def test_password_update_validation_does_not_expose_password(auth_client):
    email = "validation-test@example.com"
    current_password = "TestPassword123!"
    new_password = "abc123"

    register_response = auth_client.post(
        "/register",
        json={
            "email": email,
            "password": current_password
        }
    )

    assert register_response.status_code == 201

    login_response = auth_client.post(
        "/login",
        data={
            "username": email,
            "password": current_password
        }
    )

    assert login_response.status_code == 200

    token = login_response.json()["access_token"]

    response = auth_client.put(
        "/users/me/password",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "current_password": current_password,
            "new_password": new_password
        }
    )

    assert response.status_code == 422
    assert current_password not in response.text
    assert new_password not in response.text

    for error in response.json()["detail"]:
        assert "input" not in error
        assert "ctx" not in error
        assert error["msg"] == "Invalid input"


def test_invalid_email_is_not_exposed(auth_client):
    invalid_email = "invalid-private-email"

    response = auth_client.post(
        "/register",
        json={
            "email": invalid_email,
            "password": "TestPassword123!"
        }
    )

    assert response.status_code == 422
    assert invalid_email not in response.text

    for error in response.json()["detail"]:
        assert "input" not in error
        assert "ctx" not in error
        assert error["msg"] == "Invalid input"
