from decimal import Decimal


def create_equipment(client, serial="MAINT-001"):
    lab = client.post("/laboratories", json={
        "name": "Test Laboratory",
        "location": "Test Location"
    })
    assert lab.status_code == 201

    equipment = client.post("/equipment", json={
        "name": "Test Equipment",
        "serial_number": serial,
        "status": "available",
        "laboratory_id": lab.json()["id"]
    })
    assert equipment.status_code == 201

    return equipment.json()["id"]


def maintenance_payload(equipment_id):
    return {
        "equipment_id": equipment_id,
        "maintenance_date": "2026-11-26",
        "description": "Routine maintenance",
        "technician": "Test Technician",
        "cost": 250
    }


def create_record(client, equipment_id):
    response = client.post(
        "/maintenance",
        json=maintenance_payload(equipment_id)
    )
    assert response.status_code == 201
    return response.json()


def test_create_maintenance(client):
    equipment_id = create_equipment(client)
    record = create_record(client, equipment_id)

    assert record["equipment_id"] == equipment_id
    assert record["description"] == "Routine maintenance"
    assert Decimal(str(record["cost"])) == Decimal("250")


def test_get_maintenance(client):
    equipment_id = create_equipment(client)
    record = create_record(client, equipment_id)

    response = client.get("/maintenance")

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["id"] == record["id"]


def test_update_maintenance(client):
    equipment_id = create_equipment(client)
    record = create_record(client, equipment_id)

    payload = maintenance_payload(equipment_id)
    payload["description"] = "Maintenance completed"
    payload["cost"] = 300

    response = client.put(
        f"/maintenance/{record['id']}",
        json=payload
    )

    assert response.status_code == 200
    assert response.json()["description"] == "Maintenance completed"
    assert Decimal(str(response.json()["cost"])) == Decimal("300")


def test_delete_maintenance(client):
    equipment_id = create_equipment(client)
    record = create_record(client, equipment_id)

    response = client.delete(f"/maintenance/{record['id']}")

    assert response.status_code == 200
    assert client.get("/maintenance").json() == []


def test_maintenance_invalid_equipment(client):
    response = client.post(
        "/maintenance",
        json=maintenance_payload(99999)
    )

    assert response.status_code == 404


def test_maintenance_negative_cost(client):
    equipment_id = create_equipment(client)

    payload = maintenance_payload(equipment_id)
    payload["cost"] = -100

    response = client.post("/maintenance", json=payload)

    assert response.status_code == 422


def test_maintenance_empty_description(client):
    equipment_id = create_equipment(client)

    payload = maintenance_payload(equipment_id)
    payload["description"] = ""

    response = client.post("/maintenance", json=payload)

    assert response.status_code == 422


def test_maintenance_filter_by_equipment(client):
    equipment1 = create_equipment(client, "MAINT-001")
    equipment2 = create_equipment(client, "MAINT-002")

    create_record(client, equipment1)
    create_record(client, equipment2)

    response = client.get(
        "/maintenance",
        params={"equipment_id": equipment1}
    )

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["equipment_id"] == equipment1


def test_delete_equipment_with_maintenance(client):
    equipment_id = create_equipment(client)
    record = create_record(client, equipment_id)

    response = client.delete(f"/equipment/{equipment_id}")

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Cannot delete equipment with maintenance records"
    )

    assert any(
        item["id"] == equipment_id
        for item in client.get("/equipment").json()
    )

    response = client.delete(f"/maintenance/{record['id']}")
    assert response.status_code == 200

    response = client.delete(f"/equipment/{equipment_id}")
    assert response.status_code == 200


def test_maintenance_user_isolation(multi_user_client):
    client, current_user = multi_user_client

    current_user["id"] = 1
    equipment_id = create_equipment(client)
    record = create_record(client, equipment_id)

    current_user["id"] = 2

    response = client.get("/maintenance")
    assert response.status_code == 200
    assert response.json() == []

    response = client.get(
        "/maintenance",
        params={"equipment_id": equipment_id}
    )
    assert response.status_code == 200
    assert response.json() == []

    response = client.post(
        "/maintenance",
        json=maintenance_payload(equipment_id)
    )
    assert response.status_code == 404

    response = client.put(
        f"/maintenance/{record['id']}",
        json=maintenance_payload(equipment_id)
    )
    assert response.status_code == 404

    response = client.delete(f"/maintenance/{record['id']}")
    assert response.status_code == 404

    current_user["id"] = 1

    response = client.get("/maintenance")
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["id"] == record["id"]
