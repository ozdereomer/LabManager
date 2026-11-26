import pytest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.database import get_db
from app.auth import get_current_user
from app.models import Base, User


@pytest.fixture
def test_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )

    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


@pytest.fixture
def client(test_engine):
    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=test_engine
    )

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    def override_get_current_user():
        return User(
            id=1,
            email="test@example.com",
            hashed_password="test",
            is_active=True
        )

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
@pytest.fixture
def multi_user_client(test_engine):

    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=test_engine
    )

    db = TestingSessionLocal()

    user1 = User(
        id=1,
        email="user1@example.com",
        hashed_password="test",
        is_active=True
    )

    user2 = User(
        id=2,
        email="user2@example.com",
        hashed_password="test",
        is_active=True
    )

    db.add_all([user1, user2])
    db.commit()
    db.close()

    current_user = {"id": 1}

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    def override_get_current_user():
        db = TestingSessionLocal()
        try:
            return db.query(User).filter(
                User.id == current_user["id"]
            ).first()
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = override_get_current_user

    with TestClient(app) as test_client:
        yield test_client, current_user

    app.dependency_overrides.clear()
@pytest.fixture
def auth_client(test_engine):

    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=test_engine
    )

    def override_get_db():
        db = TestingSessionLocal()

        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides.pop(get_current_user, None)

    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def mock_endpoint_rate_limiter(monkeypatch):
    from unittest.mock import Mock

    limiter = Mock()

    monkeypatch.setattr(
        "app.main.enforce_rate_limit",
        limiter
    )

    return limiter


@pytest.fixture(autouse=True)
def isolate_redis_rate_limit_keys(monkeypatch):
    import os
    from uuid import uuid4

    if os.getenv("RUN_REDIS_INTEGRATION") == "1":
        expected_environment = {
            "REDIS_HOST": "labmanager-redis-test",
            "REDIS_PASSWORD": "isolated-test-password",
            "DATABASE_URL": "sqlite://",
        }

        for name, expected in expected_environment.items():
            if os.getenv(name) != expected:
                pytest.fail(
                    f"Unsafe Redis integration environment: {name}",
                    pytrace=False
                )

        monkeypatch.setattr(
            "app.rate_limiter.SECRET_KEY",
            uuid4().hex
        )
