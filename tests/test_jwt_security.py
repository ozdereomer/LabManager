import os
import runpy
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException

from app.auth import (
    SECRET_KEY,
    ALGORITHM,
    create_access_token,
    decode_access_token,
)
from app.models import User


def valid_payload():
    now = datetime.now(timezone.utc)

    return {
        "sub": "1",
        "ver": 0,
        "iat": now,
        "exp": now + timedelta(minutes=30),
    }


def encode_token(payload, key=SECRET_KEY):
    return jwt.encode(
        payload,
        key,
        algorithm=ALGORITHM,
    )


def assert_invalid_token(token):
    with pytest.raises(HTTPException) as exc:
        decode_access_token(token)

    assert exc.value.status_code == 401
    assert exc.value.detail == "Invalid or expired token"
    assert exc.value.headers == {
        "WWW-Authenticate": "Bearer"
    }


def test_missing_jwt_secret(monkeypatch):
    monkeypatch.delenv("JWT_SECRET_KEY", raising=False)

    with pytest.raises(
        RuntimeError,
        match="JWT_SECRET_KEY environment variable is missing",
    ):
        runpy.run_path("app/auth.py", run_name="auth_config_test")


def test_valid_token_decoding():
    token = encode_token(valid_payload())

    assert decode_access_token(token) == (1, 0)


@pytest.mark.parametrize(
    "user_id",
    ["0", "-1", "invalid", ""],
)
def test_invalid_user_id(user_id):
    payload = valid_payload()
    payload["sub"] = user_id

    assert_invalid_token(encode_token(payload))


@pytest.mark.parametrize(
    "version",
    [-1, "0", 1.5, True, None],
)
def test_invalid_token_version(version):
    payload = valid_payload()
    payload["ver"] = version

    assert_invalid_token(encode_token(payload))


@pytest.mark.parametrize(
    "claim",
    ["sub", "ver", "iat", "exp"],
)
def test_missing_required_claim(claim):
    payload = valid_payload()
    del payload[claim]

    assert_invalid_token(encode_token(payload))


def test_expired_token():
    payload = valid_payload()

    payload["iat"] = (
        datetime.now(timezone.utc) - timedelta(minutes=31)
    )
    payload["exp"] = (
        datetime.now(timezone.utc) - timedelta(minutes=1)
    )

    token = encode_token(payload)

    with pytest.raises(jwt.ExpiredSignatureError):
        jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )

    assert_invalid_token(token)


def test_invalid_signature():
    token = encode_token(
        valid_payload(),
        key=os.urandom(64),
    )

    assert_invalid_token(token)


def test_future_issued_token():
    payload = valid_payload()
    payload["iat"] = (
        datetime.now(timezone.utc) + timedelta(minutes=5)
    )

    assert_invalid_token(encode_token(payload))


def test_invalid_algorithm():
    token = jwt.encode(
        valid_payload(),
        SECRET_KEY,
        algorithm="HS384",
    )

    assert_invalid_token(token)


def test_created_token_contains_correct_claims():
    user = User(
        id=42,
        email="jwt-test@example.com",
        token_version=3,
        is_active=True,
    )

    token = create_access_token(user)

    payload = jwt.decode(
        token,
        SECRET_KEY,
        algorithms=[ALGORITHM],
    )

    assert payload["sub"] == "42"
    assert payload["ver"] == 3
    assert payload["exp"] - payload["iat"] == 1800
    assert decode_access_token(token) == (42, 3)
