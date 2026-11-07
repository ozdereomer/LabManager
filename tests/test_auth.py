from app.main import app
from app.auth import get_current_user

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
