import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from decimal import Decimal
from threading import Barrier

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.database import get_db
from app.main import app
from app.models import Equipment, Laboratory, MaintenanceRecord, User


pytestmark = pytest.mark.skipif(
    os.getenv("RUN_POSTGRESQL_INTEGRATION") != "1",
    reason="Requires isolated PostgreSQL integration environment",
)


@pytest.fixture(scope="session")
def postgresql_engine():
    raw_url = os.getenv("POSTGRESQL_TEST_URL", "")

    expected_url = (
        "postgresql+psycopg://"
        "labmanager_test:isolated-postgresql-test-password"
        "@labmanager-postgres-test:5432/"
        "labmanager_integration_test"
    )

    if (
        raw_url != expected_url
        or os.getenv("DATABASE_URL") != "sqlite://"
        or os.getenv("RUN_REDIS_INTEGRATION") == "1"
    ):
        pytest.fail(
            "Unsafe PostgreSQL integration environment",
            pytrace=False,
        )

    url = make_url(raw_url)

    engine = create_engine(
        url,
        pool_pre_ping=True,
        connect_args={
            "connect_timeout": 5,
            "options": (
                "-c statement_timeout=15000 "
                "-c lock_timeout=10000"
            ),
        },
    )

    try:
        with engine.connect() as connection:
            identity = connection.execute(
                text(
                    "SELECT current_database(), current_user, "
                    "current_setting('server_version_num')"
                )
            ).one()

            assert identity[0] == "labmanager_integration_test"
            assert identity[1] == "labmanager_test"
            assert 170000 <= int(identity[2]) < 180000

            assert inspect(connection).get_table_names(
                schema="public"
            ) == [], "Test database must be empty"

        migration_env = os.environ.copy()
        migration_env["DATABASE_URL"] = raw_url

        subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            env=migration_env,
            check=True,
            timeout=60,
        )

        yield engine

    finally:
        engine.dispose()


@pytest.fixture
def postgresql_session_factory(postgresql_engine):
    return sessionmaker(
        bind=postgresql_engine,
        autocommit=False,
        autoflush=False,
    )


@pytest.fixture(autouse=True)
def clean_postgresql_database(postgresql_engine):
    cleanup_sql = text(
        "TRUNCATE TABLE "
        "maintenance_records, equipment, laboratories, users "
        "RESTART IDENTITY"
    )

    with postgresql_engine.begin() as connection:
        connection.execute(cleanup_sql)

    yield

    with postgresql_engine.begin() as connection:
        connection.execute(cleanup_sql)


@pytest.fixture
def postgresql_client(postgresql_session_factory):
    previous_overrides = app.dependency_overrides.copy()

    def override_get_db():
        db = postgresql_session_factory()

        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


def test_postgresql_connection(postgresql_engine):
    assert postgresql_engine.dialect.name == "postgresql"

    with postgresql_engine.connect() as connection:
        assert connection.execute(text("SELECT 1")).scalar_one() == 1


def test_postgresql_migration_head(postgresql_engine):
    with postgresql_engine.connect() as connection:
        revision = connection.execute(
            text("SELECT version_num FROM alembic_version")
        ).scalar_one()

    assert revision == "a71c92e4b605"


def test_postgresql_migrated_tables(postgresql_engine):
    tables = set(
        inspect(postgresql_engine).get_table_names(schema="public")
    )

    assert tables == {
        "alembic_version",
        "users",
        "laboratories",
        "equipment",
        "maintenance_records",
    }


def test_postgresql_api_health(postgresql_client):
    response = postgresql_client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}






def create_test_user(session, email="postgres@example.com"):
    user = User(
        email=email,
        hashed_password="integration-test-hash",
        is_active=True,
    )

    session.add(user)
    session.flush()

    return user


def create_test_laboratory(session, user_id):
    laboratory = Laboratory(
        name="PostgreSQL Test Laboratory",
        location="Integration Test",
        user_id=user_id,
    )

    session.add(laboratory)
    session.flush()

    return laboratory


def test_postgresql_duplicate_email(
    postgresql_session_factory,
):
    with postgresql_session_factory() as session:
        create_test_user(session)
        session.commit()

        with pytest.raises(IntegrityError) as error:
            create_test_user(session)

        assert error.value.orig.sqlstate == "23505"

        session.rollback()

        assert session.query(User).count() == 1


def test_postgresql_duplicate_serial_number(
    postgresql_session_factory,
):
    with postgresql_session_factory() as session:
        user = create_test_user(session)
        laboratory = create_test_laboratory(
            session, user.id
        )

        laboratory_id = laboratory.id

        session.add(
            Equipment(
                name="Equipment A",
                serial_number="PG-SERIAL-001",
                laboratory_id=laboratory_id,
            )
        )

        session.commit()

        session.add(
            Equipment(
                name="Equipment B",
                serial_number="PG-SERIAL-001",
                laboratory_id=laboratory_id,
            )
        )

        with pytest.raises(IntegrityError) as error:
            session.commit()

        assert error.value.orig.sqlstate == "23505"

        session.rollback()

        assert session.query(Equipment).count() == 1


def test_postgresql_laboratory_foreign_key(
    postgresql_session_factory,
):
    with postgresql_session_factory() as session:
        session.add(
            Laboratory(
                name="Invalid Laboratory",
                user_id=999999,
            )
        )

        with pytest.raises(IntegrityError) as error:
            session.commit()

        assert error.value.orig.sqlstate == "23503"

        session.rollback()

        assert session.query(Laboratory).count() == 0


def test_postgresql_equipment_foreign_key(
    postgresql_session_factory,
):
    with postgresql_session_factory() as session:
        session.add(
            Equipment(
                name="Invalid Equipment",
                serial_number="PG-INVALID-001",
                laboratory_id=999999,
            )
        )

        with pytest.raises(IntegrityError) as error:
            session.commit()

        assert error.value.orig.sqlstate == "23503"

        session.rollback()

        assert session.query(Equipment).count() == 0


def test_postgresql_maintenance_foreign_key(
    postgresql_session_factory,
):
    with postgresql_session_factory() as session:
        session.add(
            MaintenanceRecord(
                equipment_id=999999,
                maintenance_date=date(2026, 1, 1),
                description="Invalid maintenance",
            )
        )

        with pytest.raises(IntegrityError) as error:
            session.commit()

        assert error.value.orig.sqlstate == "23503"

        session.rollback()

        assert session.query(MaintenanceRecord).count() == 0


def test_postgresql_restrict_parent_deletion(
    postgresql_session_factory,
):
    with postgresql_session_factory() as session:
        user = create_test_user(session)
        create_test_laboratory(session, user.id)

        session.commit()

        session.delete(user)

        with pytest.raises(IntegrityError) as error:
            session.commit()

        assert error.value.orig.sqlstate == "23503"

        session.rollback()

        assert session.query(User).count() == 1
        assert session.query(Laboratory).count() == 1




def test_postgresql_transaction_rollback(
    postgresql_session_factory,
):
    with postgresql_session_factory() as session:
        user = create_test_user(session)
        create_test_laboratory(session, user.id)

        assert session.query(User).count() == 1
        assert session.query(Laboratory).count() == 1

        session.rollback()

    with postgresql_session_factory() as session:
        assert session.query(User).count() == 0
        assert session.query(Laboratory).count() == 0


def test_postgresql_atomic_transaction(
    postgresql_session_factory,
):
    with postgresql_session_factory() as session:
        create_test_user(session)

        session.add(
            Laboratory(
                name="Invalid Laboratory",
                user_id=999999,
            )
        )

        with pytest.raises(IntegrityError) as error:
            session.commit()

        assert error.value.orig.sqlstate == "23503"

        session.rollback()

    with postgresql_session_factory() as session:
        assert session.query(User).count() == 0
        assert session.query(Laboratory).count() == 0


def test_postgresql_token_version_default(
    postgresql_engine,
):
    with postgresql_engine.begin() as connection:
        version = connection.execute(
            text(
                "INSERT INTO users "
                "(email, hashed_password, is_active) "
                "VALUES (:email, :password, true) "
                "RETURNING token_version"
            ),
            {
                "email": "default@example.com",
                "password": "integration-test-hash",
            },
        ).scalar_one()

        assert version == 0


def test_postgresql_numeric_precision(
    postgresql_session_factory,
):
    with postgresql_session_factory() as session:
        user = create_test_user(session)
        laboratory = create_test_laboratory(
            session, user.id
        )

        equipment = Equipment(
            name="Precision Test Equipment",
            serial_number="PG-PRECISION-001",
            laboratory_id=laboratory.id,
        )

        session.add(equipment)
        session.flush()

        record = MaintenanceRecord(
            equipment_id=equipment.id,
            maintenance_date=date(2026, 1, 1),
            description="Numeric precision test",
            cost=Decimal("12345678.91"),
        )

        session.add(record)
        session.flush()

        record_id = record.id

        session.commit()

    with postgresql_session_factory() as session:
        saved_record = session.get(
            MaintenanceRecord, record_id
        )

        assert isinstance(saved_record.cost, Decimal)
        assert saved_record.cost == Decimal("12345678.91")
        assert saved_record.cost.as_tuple().exponent == -2


def test_postgresql_transaction_visibility(
    postgresql_session_factory,
):
    with (
        postgresql_session_factory() as writer,
        postgresql_session_factory() as reader,
    ):
        create_test_user(writer)

        assert writer.query(User).count() == 1
        assert reader.query(User).count() == 0

        writer.commit()

        assert reader.query(User).count() == 1


PG_TEST_PASSWORD = "PostgresTest123!"
PG_NEW_PASSWORD = "PostgresUpdated456!"


def pg_register(client, email, password=PG_TEST_PASSWORD):
    response = client.post(
        "/register",
        json={
            "email": email,
            "password": password,
        },
    )

    assert response.status_code == 201, response.text

    return response.json()


def pg_login(client, email, password=PG_TEST_PASSWORD):
    response = client.post(
        "/login",
        data={
            "username": email,
            "password": password,
        },
    )

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"

    return {
        "Authorization": (
            "Bearer " + response.json()["access_token"]
        )
    }


def test_postgresql_api_register_login(
    postgresql_client,
    postgresql_session_factory,
):
    email = "auth-postgres@example.com"

    registered = pg_register(postgresql_client, email)

    assert registered["email"] == email
    assert registered["is_active"] is True
    assert "hashed_password" not in registered

    headers = pg_login(postgresql_client, email)

    response = postgresql_client.get(
        "/users/me",
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["email"] == email
    assert response.json()["id"] == registered["id"]

    with postgresql_session_factory() as session:
        user = session.get(User, registered["id"])

        assert user is not None
        assert user.email == email
        assert user.hashed_password != PG_TEST_PASSWORD
        assert user.token_version == 0


def test_postgresql_api_duplicate_email(
    postgresql_client,
    postgresql_session_factory,
):
    email = "duplicate-postgres@example.com"

    pg_register(postgresql_client, email)

    response = postgresql_client.post(
        "/register",
        json={
            "email": email,
            "password": PG_TEST_PASSWORD,
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Email already registered"

    with postgresql_session_factory() as session:
        assert session.query(User).count() == 1

    pg_login(postgresql_client, email)


def test_postgresql_api_invalid_credentials(
    postgresql_client,
):
    email = "invalid-login@example.com"

    pg_register(postgresql_client, email)

    response = postgresql_client.post(
        "/login",
        data={
            "username": email,
            "password": "IncorrectPassword123!",
        },
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"

    pg_login(postgresql_client, email)


def test_postgresql_api_email_update(
    postgresql_client,
    postgresql_session_factory,
):
    old_email = "old-postgres@example.com"
    new_email = "new-postgres@example.com"

    registered = pg_register(
        postgresql_client, old_email
    )

    old_headers = pg_login(
        postgresql_client, old_email
    )

    response = postgresql_client.put(
        "/users/me/email",
        headers=old_headers,
        json={
            "current_password": PG_TEST_PASSWORD,
            "new_email": new_email,
        },
    )

    assert response.status_code == 200, response.text

    response = postgresql_client.get(
        "/users/me",
        headers=old_headers,
    )

    assert response.status_code == 401

    response = postgresql_client.post(
        "/login",
        data={
            "username": old_email,
            "password": PG_TEST_PASSWORD,
        },
    )

    assert response.status_code == 401

    new_headers = pg_login(
        postgresql_client, new_email
    )

    response = postgresql_client.get(
        "/users/me",
        headers=new_headers,
    )

    assert response.status_code == 200
    assert response.json()["email"] == new_email

    with postgresql_session_factory() as session:
        user = session.get(User, registered["id"])

        assert user.email == new_email
        assert user.token_version == 1


def test_postgresql_api_password_update(
    postgresql_client,
    postgresql_session_factory,
):
    email = "password-postgres@example.com"

    registered = pg_register(postgresql_client, email)

    old_headers = pg_login(postgresql_client, email)

    response = postgresql_client.put(
        "/users/me/password",
        headers=old_headers,
        json={
            "current_password": PG_TEST_PASSWORD,
            "new_password": PG_NEW_PASSWORD,
        },
    )

    assert response.status_code == 200, response.text

    response = postgresql_client.get(
        "/users/me",
        headers=old_headers,
    )

    assert response.status_code == 401

    response = postgresql_client.post(
        "/login",
        data={
            "username": email,
            "password": PG_TEST_PASSWORD,
        },
    )

    assert response.status_code == 401

    new_headers = pg_login(
        postgresql_client,
        email,
        PG_NEW_PASSWORD,
    )

    response = postgresql_client.get(
        "/users/me",
        headers=new_headers,
    )

    assert response.status_code == 200

    with postgresql_session_factory() as session:
        user = session.get(User, registered["id"])

        assert user.token_version == 1
        assert user.hashed_password != PG_NEW_PASSWORD


def pg_create_laboratory(client, headers, name="Test Laboratory"):
    response = client.post(
        "/laboratories",
        headers=headers,
        json={
            "name": name,
            "location": "Integration Test",
        },
    )

    assert response.status_code == 201, response.text
    return response.json()


def pg_create_equipment(
    client,
    headers,
    laboratory_id,
    serial_number="PG-API-001",
    name="Test Equipment",
    status="available",
):
    response = client.post(
        "/equipment",
        headers=headers,
        json={
            "name": name,
            "serial_number": serial_number,
            "status": status,
            "laboratory_id": laboratory_id,
        },
    )

    assert response.status_code == 201, response.text
    return response.json()


def pg_create_maintenance(client, headers, equipment_id):
    response = client.post(
        "/maintenance",
        headers=headers,
        json={
            "equipment_id": equipment_id,
            "maintenance_date": "2026-01-01",
            "description": "Initial maintenance",
            "technician": "Test Technician",
            "cost": "123.45",
        },
    )

    assert response.status_code == 201, response.text
    return response.json()


def test_postgresql_api_laboratory_crud(
    postgresql_client,
    postgresql_session_factory,
):
    client = postgresql_client
    email = "lab-crud@example.com"

    user = pg_register(client, email)
    headers = pg_login(client, email)

    laboratory = pg_create_laboratory(client, headers)
    lab_id = laboratory["id"]

    response = client.get(
        "/laboratories",
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json() == [laboratory]

    response = client.put(
        f"/laboratories/{lab_id}",
        headers=headers,
        json={
            "name": "Updated Laboratory",
            "location": "Updated Location",
        },
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Updated Laboratory"

    with postgresql_session_factory() as session:
        saved = session.get(Laboratory, lab_id)

        assert saved.user_id == user["id"]
        assert saved.name == "Updated Laboratory"
        assert saved.location == "Updated Location"

    response = client.delete(
        f"/laboratories/{lab_id}",
        headers=headers,
    )

    assert response.status_code == 200

    with postgresql_session_factory() as session:
        assert session.get(Laboratory, lab_id) is None


def test_postgresql_api_equipment_crud(
    postgresql_client,
    postgresql_session_factory,
):
    client = postgresql_client
    email = "equipment-crud@example.com"

    pg_register(client, email)
    headers = pg_login(client, email)

    laboratory = pg_create_laboratory(client, headers)
    lab_id = laboratory["id"]

    equipment = pg_create_equipment(
        client, headers, lab_id
    )

    equipment_id = equipment["id"]

    response = client.get(
        "/equipment",
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json() == [equipment]

    response = client.get(
        f"/laboratories/{lab_id}/equipment",
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json() == [equipment]

    response = client.put(
        f"/equipment/{equipment_id}",
        headers=headers,
        json={
            "name": "Updated Equipment",
            "serial_number": "PG-UPDATED-001",
            "status": "maintenance",
            "laboratory_id": lab_id,
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "maintenance"

    with postgresql_session_factory() as session:
        saved = session.get(Equipment, equipment_id)

        assert saved.name == "Updated Equipment"
        assert saved.serial_number == "PG-UPDATED-001"
        assert saved.status == "maintenance"
        assert saved.laboratory_id == lab_id

    response = client.delete(
        f"/equipment/{equipment_id}",
        headers=headers,
    )

    assert response.status_code == 200

    with postgresql_session_factory() as session:
        assert session.get(Equipment, equipment_id) is None


def test_postgresql_api_maintenance_crud(
    postgresql_client,
    postgresql_session_factory,
):
    client = postgresql_client
    email = "maintenance-crud@example.com"

    pg_register(client, email)
    headers = pg_login(client, email)

    laboratory = pg_create_laboratory(client, headers)

    equipment = pg_create_equipment(
        client, headers, laboratory["id"]
    )

    equipment_id = equipment["id"]

    record = pg_create_maintenance(
        client, headers, equipment_id
    )

    record_id = record["id"]

    assert Decimal(record["cost"]) == Decimal("123.45")

    response = client.get(
        "/maintenance",
        headers=headers,
        params={"equipment_id": equipment_id},
    )

    assert response.status_code == 200
    assert response.json() == [record]

    response = client.put(
        f"/maintenance/{record_id}",
        headers=headers,
        json={
            "equipment_id": equipment_id,
            "maintenance_date": "2026-02-01",
            "description": "Updated maintenance",
            "technician": "Updated Technician",
            "cost": "987.65",
        },
    )

    assert response.status_code == 200
    assert Decimal(response.json()["cost"]) == Decimal("987.65")

    with postgresql_session_factory() as session:
        saved = session.get(MaintenanceRecord, record_id)

        assert saved.description == "Updated maintenance"
        assert saved.technician == "Updated Technician"
        assert saved.maintenance_date == date(2026, 2, 1)
        assert saved.cost == Decimal("987.65")

    response = client.delete(
        f"/maintenance/{record_id}",
        headers=headers,
    )

    assert response.status_code == 200

    with postgresql_session_factory() as session:
        assert session.get(MaintenanceRecord, record_id) is None


def test_postgresql_api_duplicate_serial(
    postgresql_client,
    postgresql_session_factory,
):
    client = postgresql_client
    email = "duplicate-serial@example.com"

    pg_register(client, email)
    headers = pg_login(client, email)

    laboratory = pg_create_laboratory(client, headers)

    pg_create_equipment(
        client,
        headers,
        laboratory["id"],
        serial_number="PG-DUPLICATE-001",
    )

    response = client.post(
        "/equipment",
        headers=headers,
        json={
            "name": "Duplicate Equipment",
            "serial_number": "PG-DUPLICATE-001",
            "status": "available",
            "laboratory_id": laboratory["id"],
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "This serial number already exists"
    )

    with postgresql_session_factory() as session:
        assert session.query(Equipment).count() == 1

    pg_create_equipment(
        client,
        headers,
        laboratory["id"],
        serial_number="PG-RECOVERY-001",
    )

    with postgresql_session_factory() as session:
        assert session.query(Equipment).count() == 2


def test_postgresql_api_protected_deletion(
    postgresql_client,
    postgresql_session_factory,
):
    client = postgresql_client
    email = "protected-deletion@example.com"

    pg_register(client, email)
    headers = pg_login(client, email)

    laboratory = pg_create_laboratory(client, headers)
    lab_id = laboratory["id"]

    equipment = pg_create_equipment(
        client, headers, lab_id
    )

    equipment_id = equipment["id"]

    record = pg_create_maintenance(
        client, headers, equipment_id
    )

    response = client.delete(
        f"/laboratories/{lab_id}",
        headers=headers,
    )

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Cannot delete laboratory with existing equipment"
    )

    response = client.delete(
        f"/equipment/{equipment_id}",
        headers=headers,
    )

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Cannot delete equipment with maintenance records"
    )

    with postgresql_session_factory() as session:
        assert session.query(Laboratory).count() == 1
        assert session.query(Equipment).count() == 1
        assert session.query(MaintenanceRecord).count() == 1

    response = client.delete(
        f"/maintenance/{record['id']}",
        headers=headers,
    )

    assert response.status_code == 200

    response = client.delete(
        f"/equipment/{equipment_id}",
        headers=headers,
    )

    assert response.status_code == 200

    response = client.delete(
        f"/laboratories/{lab_id}",
        headers=headers,
    )

    assert response.status_code == 200

    with postgresql_session_factory() as session:
        assert session.query(Laboratory).count() == 0
        assert session.query(Equipment).count() == 0
        assert session.query(MaintenanceRecord).count() == 0


def pg_create_two_users(client):
    pg_register(client, "owner@example.com")
    pg_register(client, "other@example.com")

    owner = pg_login(client, "owner@example.com")
    other = pg_login(client, "other@example.com")

    return owner, other


def test_postgresql_api_multi_user_isolation(
    postgresql_client,
    postgresql_session_factory,
):
    client = postgresql_client
    owner, other = pg_create_two_users(client)

    lab = pg_create_laboratory(client, owner)
    lab_id = lab["id"]

    equipment = pg_create_equipment(
        client, owner, lab_id
    )
    equipment_id = equipment["id"]

    record = pg_create_maintenance(
        client, owner, equipment_id
    )
    record_id = record["id"]

    for endpoint in (
        "/laboratories",
        "/equipment",
        "/maintenance",
    ):
        response = client.get(endpoint, headers=other)

        assert response.status_code == 200
        assert response.json() == []

        response = client.get(endpoint, headers=owner)

        assert response.status_code == 200
        assert len(response.json()) == 1

    response = client.get(
        f"/laboratories/{lab_id}/equipment",
        headers=other,
    )

    assert response.status_code == 404

    updates = [
        (
            f"/laboratories/{lab_id}",
            {"name": "Unauthorized update"},
        ),
        (
            f"/equipment/{equipment_id}",
            {
                "name": "Unauthorized update",
                "serial_number": "PG-UNAUTHORIZED",
                "status": "broken",
                "laboratory_id": lab_id,
            },
        ),
        (
            f"/maintenance/{record_id}",
            {
                "equipment_id": equipment_id,
                "maintenance_date": "2026-03-01",
                "description": "Unauthorized update",
                "cost": "999.99",
            },
        ),
    ]

    for endpoint, payload in updates:
        response = client.put(
            endpoint,
            headers=other,
            json=payload,
        )

        assert response.status_code == 404

        response = client.delete(
            endpoint,
            headers=other,
        )

        assert response.status_code == 404

    response = client.get(
        "/equipment/stats",
        headers=other,
    )

    assert response.status_code == 200
    assert response.json() == {
        "total": 0,
        "available": 0,
        "maintenance": 0,
        "broken": 0,
    }

    with postgresql_session_factory() as session:
        assert session.get(Laboratory, lab_id).name == lab["name"]
        assert session.get(Equipment, equipment_id).name == equipment["name"]
        assert session.get(MaintenanceRecord, record_id).description == record["description"]


def test_postgresql_api_cross_user_relationships(
    postgresql_client,
):
    client = postgresql_client
    owner, other = pg_create_two_users(client)

    owner_lab = pg_create_laboratory(client, owner)
    other_lab = pg_create_laboratory(client, other)

    owner_equipment = pg_create_equipment(
        client,
        owner,
        owner_lab["id"],
        serial_number="PG-OWNER-001",
    )

    other_equipment = pg_create_equipment(
        client,
        other,
        other_lab["id"],
        serial_number="PG-OTHER-001",
    )

    response = client.post(
        "/equipment",
        headers=other,
        json={
            "name": "Unauthorized Equipment",
            "serial_number": "PG-CROSS-001",
            "status": "available",
            "laboratory_id": owner_lab["id"],
        },
    )

    assert response.status_code == 404

    response = client.put(
        f"/equipment/{other_equipment['id']}",
        headers=other,
        json={
            "name": other_equipment["name"],
            "serial_number": other_equipment["serial_number"],
            "status": "available",
            "laboratory_id": owner_lab["id"],
        },
    )

    assert response.status_code == 404

    response = client.post(
        "/maintenance",
        headers=other,
        json={
            "equipment_id": owner_equipment["id"],
            "maintenance_date": "2026-01-01",
            "description": "Unauthorized maintenance",
        },
    )

    assert response.status_code == 404

    record = pg_create_maintenance(
        client, other, other_equipment["id"]
    )

    response = client.put(
        f"/maintenance/{record['id']}",
        headers=other,
        json={
            "equipment_id": owner_equipment["id"],
            "maintenance_date": "2026-01-01",
            "description": "Unauthorized transfer",
        },
    )

    assert response.status_code == 404

    response = client.get(
        "/equipment",
        headers=other,
    )

    assert response.status_code == 200
    assert response.json() == [other_equipment]

    response = client.get(
        "/maintenance",
        headers=other,
    )

    assert response.status_code == 200
    assert response.json() == [record]


def test_postgresql_api_global_serial_uniqueness(
    postgresql_client,
    postgresql_session_factory,
):
    client = postgresql_client
    owner, other = pg_create_two_users(client)

    owner_lab = pg_create_laboratory(client, owner)
    other_lab = pg_create_laboratory(client, other)

    pg_create_equipment(
        client,
        owner,
        owner_lab["id"],
        serial_number="PG-GLOBAL-001",
    )

    response = client.post(
        "/equipment",
        headers=other,
        json={
            "name": "Duplicate Equipment",
            "serial_number": "PG-GLOBAL-001",
            "status": "available",
            "laboratory_id": other_lab["id"],
        },
    )

    assert response.status_code == 409

    with postgresql_session_factory() as session:
        assert session.query(Equipment).count() == 1

    response = client.get(
        "/equipment",
        headers=other,
    )

    assert response.status_code == 200
    assert response.json() == []


def test_postgresql_api_filtering_pagination(
    postgresql_client,
):
    client = postgresql_client

    pg_register(client, "filter@example.com")
    headers = pg_login(client, "filter@example.com")

    lab = pg_create_laboratory(client, headers)

    alpha = pg_create_equipment(
        client,
        headers,
        lab["id"],
        serial_number="PG-FILTER-001",
        name="Alpha Microscope",
        status="available",
    )

    beta = pg_create_equipment(
        client,
        headers,
        lab["id"],
        serial_number="PG-FILTER-002",
        name="Beta Microscope",
        status="maintenance",
    )

    gamma = pg_create_equipment(
        client,
        headers,
        lab["id"],
        serial_number="PG-FILTER-003",
        name="Gamma Computer",
        status="broken",
    )

    cases = [
        (
            {"name": "MICROSCOPE", "sort_by": "id"},
            [alpha, beta],
        ),
        (
            {"serial_number": "pg-filter-002"},
            [beta],
        ),
        (
            {"status": "maintenance"},
            [beta],
        ),
        (
            {"laboratory_id": lab["id"]},
            [alpha, beta, gamma],
        ),
        (
            {"sort_by": "name", "order": "desc"},
            [gamma, beta, alpha],
        ),
        (
            {
                "sort_by": "id",
                "order": "asc",
                "skip": 1,
                "limit": 1,
            },
            [beta],
        ),
    ]

    for params, expected in cases:
        response = client.get(
            "/equipment",
            headers=headers,
            params=params,
        )

        assert response.status_code == 200
        assert response.json() == expected


def test_postgresql_api_dashboard_aggregation(
    postgresql_client,
):
    client = postgresql_client
    owner, other = pg_create_two_users(client)

    lab = pg_create_laboratory(client, owner)
    pg_create_laboratory(client, owner, "Empty Laboratory")

    equipment = pg_create_equipment(
        client,
        owner,
        lab["id"],
        serial_number="PG-DASHBOARD-001",
        status="available",
    )

    pg_create_equipment(
        client,
        owner,
        lab["id"],
        serial_number="PG-DASHBOARD-002",
        status="maintenance",
    )

    pg_create_maintenance(
        client, owner, equipment["id"]
    )

    response = client.post(
        "/maintenance",
        headers=owner,
        json={
            "equipment_id": equipment["id"],
            "maintenance_date": "2026-02-01",
            "description": "Second maintenance",
            "cost": "0.10",
        },
    )

    assert response.status_code == 201

    other_lab = pg_create_laboratory(client, other)

    other_equipment = pg_create_equipment(
        client,
        other,
        other_lab["id"],
        serial_number="PG-DASHBOARD-OTHER",
        status="broken",
    )

    pg_create_maintenance(
        client, other, other_equipment["id"]
    )

    response = client.get(
        "/dashboard",
        headers=owner,
    )

    assert response.status_code == 200

    dashboard = response.json()
    stats = dashboard["stats"]

    assert dashboard["user_email"] == "owner@example.com"
    assert stats["total_laboratories"] == 2
    assert stats["total_equipment"] == 2
    assert stats["available_equipment"] == 1
    assert stats["maintenance_equipment"] == 1
    assert stats["broken_equipment"] == 0
    assert stats["total_maintenance_records"] == 2

    assert Decimal(
        stats["total_maintenance_cost"]
    ) == Decimal("123.55")

    assert len(dashboard["laboratories"]) == 2

    counts = {
        item["name"]: item["equipment_count"]
        for item in dashboard["laboratories"]
    }

    assert counts["Test Laboratory"] == 2
    assert counts["Empty Laboratory"] == 0

    recent = dashboard["recent_maintenance"]

    assert len(recent) == 2
    assert recent[0]["maintenance_date"] == "2026-02-01"
    assert recent[1]["maintenance_date"] == "2026-01-01"

    assert all(
        item["equipment_id"] == equipment["id"]
        for item in recent
    )




def pg_run_concurrent_requests(
    engine,
    matches_statement,
    first_request,
    second_request,
):
    barrier = Barrier(2, timeout=10)

    def synchronize_statement(
        conn,
        cursor,
        statement,
        parameters,
        context,
        executemany,
    ):
        normalized = " ".join(statement.lower().split())

        if matches_statement(normalized):
            barrier.wait()

    event.listen(
        engine,
        "before_cursor_execute",
        synchronize_statement,
    )

    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(first_request)
            second = executor.submit(second_request)

            return [
                first.result(timeout=30),
                second.result(timeout=30),
            ]
    finally:
        event.remove(
            engine,
            "before_cursor_execute",
            synchronize_statement,
        )


def pg_run_concurrent_inserts(
    engine,
    table_name,
    first_request,
    second_request,
):
    return pg_run_concurrent_requests(
        engine,
        lambda statement: statement.startswith(
            f"insert into {table_name} "
        ),
        first_request,
        second_request,
    )


def test_postgresql_concurrent_registration(
    postgresql_client,
    postgresql_engine,
    postgresql_session_factory,
):
    client = postgresql_client
    email = "concurrent-register@example.com"

    def register():
        return client.post(
            "/register",
            json={
                "email": email,
                "password": PG_TEST_PASSWORD,
            },
        )

    responses = pg_run_concurrent_inserts(
        postgresql_engine,
        "users",
        register,
        register,
    )

    assert sorted(
        response.status_code
        for response in responses
    ) == [201, 409]

    rejected = next(
        response for response in responses
        if response.status_code == 409
    )

    assert rejected.json()["detail"] == (
        "Email already registered"
    )

    with postgresql_session_factory() as session:
        assert session.query(User).filter(
            User.email == email
        ).count() == 1

        assert session.query(User).count() == 1

    pg_login(client, email)


def test_postgresql_concurrent_equipment_creation(
    postgresql_client,
    postgresql_engine,
    postgresql_session_factory,
):
    client = postgresql_client

    owner, other = pg_create_two_users(client)

    owner_lab = pg_create_laboratory(client, owner)
    other_lab = pg_create_laboratory(client, other)

    serial_number = "PG-CONCURRENT-001"

    def create_equipment(headers, lab_id):
        return client.post(
            "/equipment",
            headers=headers,
            json={
                "name": "Concurrent Equipment",
                "serial_number": serial_number,
                "status": "available",
                "laboratory_id": lab_id,
            },
        )

    responses = pg_run_concurrent_inserts(
        postgresql_engine,
        "equipment",
        lambda: create_equipment(
            owner, owner_lab["id"]
        ),
        lambda: create_equipment(
            other, other_lab["id"]
        ),
    )

    assert sorted(
        response.status_code
        for response in responses
    ) == [201, 409]

    rejected = next(
        response for response in responses
        if response.status_code == 409
    )

    assert rejected.json()["detail"] == (
        "This serial number already exists"
    )

    accepted = next(
        response for response in responses
        if response.status_code == 201
    ).json()

    with postgresql_session_factory() as session:
        assert session.query(Equipment).count() == 1

        saved = session.query(Equipment).filter(
            Equipment.serial_number == serial_number
        ).one()

        assert saved.id == accepted["id"]
        assert saved.laboratory_id == accepted["laboratory_id"]

    owner_response = client.get(
        "/equipment",
        headers=owner,
    )

    other_response = client.get(
        "/equipment",
        headers=other,
    )

    assert owner_response.status_code == 200
    assert other_response.status_code == 200

    if accepted["laboratory_id"] == owner_lab["id"]:
        assert owner_response.json() == [accepted]
        assert other_response.json() == []
    else:
        assert owner_response.json() == []
        assert other_response.json() == [accepted]


def pg_run_concurrent_account_updates(
    engine,
    first_request,
    second_request,
):
    return pg_run_concurrent_requests(
        engine,
        lambda statement: (
            statement.startswith("select ")
            and "from users" in statement
            and "for update" in statement
        ),
        first_request,
        second_request,
    )


@pytest.mark.parametrize(
    "first_action,second_action",
    [
        ("email", "email"),
        ("password", "password"),
        ("email", "password"),
    ],
    ids=[
        "email-vs-email",
        "password-vs-password",
        "email-vs-password",
    ],
)
def test_postgresql_concurrent_account_updates(
    postgresql_client,
    postgresql_engine,
    postgresql_session_factory,
    first_action,
    second_action,
):
    client = postgresql_client

    original_email = "concurrent-account@example.com"

    registered = pg_register(
        client, original_email
    )

    old_headers = pg_login(
        client, original_email
    )

    actions = [
        first_action,
        second_action,
    ]

    new_emails = [
        "concurrent-first@example.com",
        "concurrent-second@example.com",
    ]

    new_passwords = [
        "ConcurrentFirst123!",
        "ConcurrentSecond456!",
    ]

    def update_account(index):
        action = actions[index]

        payload = {
            "current_password": PG_TEST_PASSWORD,
        }

        if action == "email":
            payload["new_email"] = new_emails[index]
        else:
            payload["new_password"] = new_passwords[index]

        return client.put(
            f"/users/me/{action}",
            headers=old_headers,
            json=payload,
        )

    responses = pg_run_concurrent_account_updates(
        postgresql_engine,
        lambda: update_account(0),
        lambda: update_account(1),
    )

    assert sorted(
        response.status_code
        for response in responses
    ) == [200, 401]

    winner = next(
        index
        for index, response in enumerate(responses)
        if response.status_code == 200
    )

    loser = 1 - winner

    assert responses[loser].json()["detail"] == (
        "Invalid or expired session"
    )

    expected_email = original_email
    expected_password = PG_TEST_PASSWORD

    if actions[winner] == "email":
        expected_email = new_emails[winner]
    else:
        expected_password = new_passwords[winner]

    with postgresql_session_factory() as session:
        user = session.get(
            User, registered["id"]
        )

        assert user is not None
        assert user.token_version == 1
        assert user.email == expected_email
        assert session.query(User).count() == 1

    response = client.get(
        "/users/me",
        headers=old_headers,
    )

    assert response.status_code == 401

    new_headers = pg_login(
        client,
        expected_email,
        expected_password,
    )

    response = client.get(
        "/users/me",
        headers=new_headers,
    )

    assert response.status_code == 200
    assert response.json()["email"] == expected_email
    assert response.json()["id"] == registered["id"]

    if actions[loser] == "email":
        rejected_email = new_emails[loser]
        rejected_password = expected_password
    else:
        rejected_email = expected_email
        rejected_password = new_passwords[loser]

    response = client.post(
        "/login",
        data={
            "username": rejected_email,
            "password": rejected_password,
        },
    )

    assert response.status_code == 401
