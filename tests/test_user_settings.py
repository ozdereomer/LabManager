import pytest


EMAIL = "settings@example.com"
PASSWORD = "Test12345!"
NEW_EMAIL = "updated@example.com"
NEW_PASSWORD = "NewPassword123!"


def register(client, email=EMAIL, password=PASSWORD):
    response = client.post(
        "/register",
        json={
            "email": email,
            "password": password
        }
    )

    assert response.status_code == 201
    return response.json()


def login(client, email=EMAIL, password=PASSWORD):
    return client.post(
        "/login",
        data={
            "username": email,
            "password": password
        }
    )


def get_headers(client, email=EMAIL, password=PASSWORD):
    response = login(client, email, password)

    assert response.status_code == 200

    return {
        "Authorization": f"Bearer {response.json()['access_token']}"
    }


@pytest.fixture
def authenticated_user(auth_client):
    register(auth_client)
    headers = get_headers(auth_client)

    return auth_client, headers


def test_get_user_profile(authenticated_user):
    client, headers = authenticated_user

    response = client.get("/users/me", headers=headers)

    assert response.status_code == 200

    data = response.json()

    assert data["email"] == EMAIL
    assert data["is_active"] is True
    assert "id" in data
    assert "created_at" in data


def test_profile_does_not_expose_sensitive_data(
    authenticated_user
):
    client, headers = authenticated_user

    response = client.get("/users/me", headers=headers)

    assert response.status_code == 200

    data = response.json()

    assert "hashed_password" not in data
    assert "password" not in data
    assert "token_version" not in data


def test_profile_without_token(auth_client):
    response = auth_client.get("/users/me")

    assert response.status_code == 401


def test_update_email_success(authenticated_user):
    client, headers = authenticated_user

    response = client.put(
        "/users/me/email",
        headers=headers,
        json={
            "new_email": NEW_EMAIL,
            "current_password": PASSWORD
        }
    )

    assert response.status_code == 200

    assert login(client, EMAIL).status_code == 401

    new_headers = get_headers(client, NEW_EMAIL)

    response = client.get(
        "/users/me",
        headers=new_headers
    )

    assert response.status_code == 200
    assert response.json()["email"] == NEW_EMAIL


@pytest.mark.parametrize(
    "new_email,current_password,expected_status",
    [
        (NEW_EMAIL, "WrongPassword!", 400),
        (EMAIL, PASSWORD, 400),
        ("invalid-email", PASSWORD, 422),
    ]
)
def test_update_email_validation(
    authenticated_user,
    new_email,
    current_password,
    expected_status
):
    client, headers = authenticated_user

    response = client.put(
        "/users/me/email",
        headers=headers,
        json={
            "new_email": new_email,
            "current_password": current_password
        }
    )

    assert response.status_code == expected_status

    profile = client.get("/users/me", headers=headers)

    assert profile.status_code == 200
    assert profile.json()["email"] == EMAIL


def test_update_email_already_registered(
    authenticated_user
):
    client, headers = authenticated_user

    register(client, "other@example.com")

    response = client.put(
        "/users/me/email",
        headers=headers,
        json={
            "new_email": "other@example.com",
            "current_password": PASSWORD
        }
    )

    assert response.status_code == 409


def test_email_change_invalidates_old_token(
    authenticated_user
):
    client, headers = authenticated_user

    response = client.put(
        "/users/me/email",
        headers=headers,
        json={
            "new_email": NEW_EMAIL,
            "current_password": PASSWORD
        }
    )

    assert response.status_code == 200

    response = client.get("/users/me", headers=headers)

    assert response.status_code == 401


def test_update_password_success(authenticated_user):
    client, headers = authenticated_user

    response = client.put(
        "/users/me/password",
        headers=headers,
        json={
            "current_password": PASSWORD,
            "new_password": NEW_PASSWORD
        }
    )

    assert response.status_code == 200

    assert login(client, EMAIL, PASSWORD).status_code == 401
    assert login(client, EMAIL, NEW_PASSWORD).status_code == 200


@pytest.mark.parametrize(
    "current_password,new_password,expected_status",
    [
        ("WrongPassword!", NEW_PASSWORD, 400),
        (PASSWORD, PASSWORD, 400),
        (PASSWORD, "123", 422),
    ]
)
def test_update_password_validation(
    authenticated_user,
    current_password,
    new_password,
    expected_status
):
    client, headers = authenticated_user

    response = client.put(
        "/users/me/password",
        headers=headers,
        json={
            "current_password": current_password,
            "new_password": new_password
        }
    )

    assert response.status_code == expected_status

    assert login(client).status_code == 200
    assert client.get(
        "/users/me", headers=headers
    ).status_code == 200


def test_password_change_invalidates_old_token(
    authenticated_user
):
    client, headers = authenticated_user

    response = client.put(
        "/users/me/password",
        headers=headers,
        json={
            "current_password": PASSWORD,
            "new_password": NEW_PASSWORD
        }
    )

    assert response.status_code == 200

    response = client.get("/users/me", headers=headers)

    assert response.status_code == 401


def test_email_update_without_token(auth_client):
    response = auth_client.put(
        "/users/me/email",
        json={
            "new_email": NEW_EMAIL,
            "current_password": PASSWORD
        }
    )

    assert response.status_code == 401


def test_password_update_without_token(auth_client):
    response = auth_client.put(
        "/users/me/password",
        json={
            "current_password": PASSWORD,
            "new_password": NEW_PASSWORD
        }
    )

    assert response.status_code == 401


def test_password_change_preserves_other_user_session(
    authenticated_user
):
    client, headers = authenticated_user

    register(client, "other@example.com")

    other_headers = get_headers(
        client,
        "other@example.com"
    )

    response = client.put(
        "/users/me/password",
        headers=headers,
        json={
            "current_password": PASSWORD,
            "new_password": NEW_PASSWORD
        }
    )

    assert response.status_code == 200

    assert client.get(
        "/users/me",
        headers=headers
    ).status_code == 401

    response = client.get(
        "/users/me",
        headers=other_headers
    )

    assert response.status_code == 200
    assert response.json()["email"] == "other@example.com"
