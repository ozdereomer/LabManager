from decimal import Decimal

from app.main import app
from app.auth import get_current_user


def create_lab(client, name="Test Laboratory"):
    response = client.post("/laboratories", json={
        "name": name,
        "location": "Test Location"
    })

    assert response.status_code == 201
    return response.json()["id"]


def create_equipment(client, lab_id, serial, status="available"):
    response = client.post("/equipment", json={
        "name": f"Equipment {serial}",
        "serial_number": serial,
        "status": status,
        "laboratory_id": lab_id
    })

    assert response.status_code == 201
    return response.json()["id"]


def create_maintenance(client, equipment_id, date, cost=250):
    response = client.post("/maintenance", json={
        "equipment_id": equipment_id,
        "maintenance_date": date,
        "description": "Routine maintenance",
        "technician": "Test Technician",
        "cost": cost
    })

    assert response.status_code == 201
    return response.json()


def test_dashboard_empty(client):
    response = client.get("/dashboard")

    assert response.status_code == 200

    data = response.json()
    stats = data["stats"]

    assert data["user_email"] == "test@example.com"
    assert stats["total_laboratories"] == 0
    assert stats["total_equipment"] == 0
    assert stats["available_equipment"] == 0
    assert stats["maintenance_equipment"] == 0
    assert stats["broken_equipment"] == 0
    assert stats["total_maintenance_records"] == 0
    assert Decimal(str(stats["total_maintenance_cost"])) == 0
    assert data["laboratories"] == []
    assert data["recent_maintenance"] == []


def test_dashboard_laboratory_count(client):
    create_lab(client, "Laboratory 1")
    create_lab(client, "Laboratory 2")

    response = client.get("/dashboard")

    assert response.status_code == 200
    assert response.json()["stats"]["total_laboratories"] == 2


def test_dashboard_equipment_stats(client):
    lab_id = create_lab(client)

    create_equipment(client, lab_id, "DASH-001", "available")
    create_equipment(client, lab_id, "DASH-002", "available")
    create_equipment(client, lab_id, "DASH-003", "maintenance")
    create_equipment(client, lab_id, "DASH-004", "broken")

    response = client.get("/dashboard")

    assert response.status_code == 200

    stats = response.json()["stats"]

    assert stats["total_equipment"] == 4
    assert stats["available_equipment"] == 2
    assert stats["maintenance_equipment"] == 1
    assert stats["broken_equipment"] == 1


def test_dashboard_equipment_distribution(client):
    lab1 = create_lab(client, "Laboratory 1")
    lab2 = create_lab(client, "Laboratory 2")
    lab3 = create_lab(client, "Empty Laboratory")

    create_equipment(client, lab1, "DASH-001")
    create_equipment(client, lab1, "DASH-002")
    create_equipment(client, lab2, "DASH-003")

    response = client.get("/dashboard")

    assert response.status_code == 200

    laboratories = {
        lab["id"]: lab["equipment_count"]
        for lab in response.json()["laboratories"]
    }

    assert laboratories == {
        lab1: 2,
        lab2: 1,
        lab3: 0
    }


def test_dashboard_maintenance_stats(client):
    lab_id = create_lab(client)
    equipment_id = create_equipment(client, lab_id, "DASH-001")

    create_maintenance(client, equipment_id, "2026-11-24", 250.50)
    create_maintenance(client, equipment_id, "2026-11-25", 350.25)
    create_maintenance(client, equipment_id, "2026-11-26", None)

    response = client.get("/dashboard")

    assert response.status_code == 200

    stats = response.json()["stats"]

    assert stats["total_maintenance_records"] == 3
    assert Decimal(str(stats["total_maintenance_cost"])) == Decimal("600.75")


def test_dashboard_recent_maintenance(client):
    lab_id = create_lab(client)
    equipment_id = create_equipment(client, lab_id, "DASH-001")

    for day in range(1, 8):
        create_maintenance(
            client,
            equipment_id,
            f"2026-11-{day:02d}"
        )

    response = client.get("/dashboard")

    assert response.status_code == 200

    records = response.json()["recent_maintenance"]

    assert len(records) == 5

    assert [record["maintenance_date"] for record in records] == [
        "2026-11-07",
        "2026-11-06",
        "2026-11-05",
        "2026-11-04",
        "2026-11-03"
    ]

    assert records[0]["equipment_name"] == "Equipment DASH-001"


def test_dashboard_user_isolation(multi_user_client):
    client, current_user = multi_user_client

    current_user["id"] = 1

    lab1 = create_lab(client, "User 1 Laboratory")
    equipment1 = create_equipment(client, lab1, "USER1-001")

    create_maintenance(client, equipment1, "2026-11-25", 500)

    current_user["id"] = 2

    lab2 = create_lab(client, "User 2 Laboratory")
    equipment2 = create_equipment(
        client, lab2, "USER2-001", "broken"
    )

    create_maintenance(client, equipment2, "2026-11-26", 100)

    response = client.get("/dashboard")

    assert response.status_code == 200

    data = response.json()
    stats = data["stats"]

    assert data["user_email"] == "user2@example.com"
    assert stats["total_laboratories"] == 1
    assert stats["total_equipment"] == 1
    assert stats["available_equipment"] == 0
    assert stats["maintenance_equipment"] == 0
    assert stats["broken_equipment"] == 1
    assert stats["total_maintenance_records"] == 1
    assert Decimal(str(stats["total_maintenance_cost"])) == 100

    assert len(data["laboratories"]) == 1
    assert data["laboratories"][0]["id"] == lab2

    assert len(data["recent_maintenance"]) == 1
    assert data["recent_maintenance"][0]["equipment_id"] == equipment2

    current_user["id"] = 1

    response = client.get("/dashboard")

    assert response.status_code == 200

    data = response.json()

    assert data["user_email"] == "user1@example.com"
    assert data["stats"]["total_equipment"] == 1
    assert data["stats"]["available_equipment"] == 1
    assert data["stats"]["broken_equipment"] == 0
    assert Decimal(str(data["stats"]["total_maintenance_cost"])) == 500
    assert data["laboratories"][0]["id"] == lab1
    assert data["recent_maintenance"][0]["equipment_id"] == equipment1


def test_dashboard_requires_authentication(client):
    original_override = app.dependency_overrides.pop(
        get_current_user
    )

    try:
        response = client.get("/dashboard")
        assert response.status_code == 401
    finally:
        app.dependency_overrides[get_current_user] = original_override
