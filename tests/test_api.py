
def create_laboratory(client):
    response = client.post(
        "/laboratories",
        json={
            "name": "Test Laboratuvarı",
            "location": "Test Katı"
        }
    )
    return response.json()["id"]


def test_create_laboratory(client):
    response = client.post(
        "/laboratories",
        json={
            "name": "Bilgisayar Laboratuvarı",
            "location": "Zemin Kat"
        }
    )

    assert response.status_code == 201
    assert response.json()["name"] == "Bilgisayar Laboratuvarı"


def test_get_laboratories(client):
    create_laboratory(client)

    response = client.get("/laboratories")

    assert response.status_code == 200
    assert len(response.json()) == 1


def test_create_equipment(client):
    laboratory_id = create_laboratory(client)

    response = client.post(
        "/equipment",
        json={
            "name": "Test Bilgisayarı",
            "serial_number": "TEST-001",
            "status": "available",
            "laboratory_id": laboratory_id
        }
    )

    assert response.status_code == 201
    assert response.json()["name"] == "Test Bilgisayarı"


def test_equipment_stats(client):
    laboratory_id = create_laboratory(client)

    for i, status in enumerate(
        ["available", "maintenance", "broken"]
    ):
        client.post(
            "/equipment",
            json={
                "name": f"Test Cihazı {i}",
                "serial_number": f"STATS-{i}",
                "status": status,
                "laboratory_id": laboratory_id
            }
        )

    response = client.get("/equipment/stats")

    assert response.status_code == 200
    assert response.json() == {
        "total": 3,
        "available": 1,
        "maintenance": 1,
        "broken": 1
    }


def test_get_laboratory_equipment(client):
    laboratory_id = create_laboratory(client)

    client.post(
        "/equipment",
        json={
            "name": "Test Bilgisayarı",
            "serial_number": "LAB-001",
            "status": "available",
            "laboratory_id": laboratory_id
        }
    )

    response = client.get(
        f"/laboratories/{laboratory_id}/equipment"
    )

    assert response.status_code == 200
    assert len(response.json()) == 1


def test_nonexistent_laboratory_returns_404(client):
    response = client.get("/laboratories/999/equipment")

    assert response.status_code == 404
    assert response.json()["detail"] == "Laboratory not found"


def test_duplicate_serial_number_returns_409(client):
    laboratory_id = create_laboratory(client)

    equipment = {
        "name": "Test Bilgisayarı",
        "serial_number": "DUPLICATE-001",
        "status": "available",
        "laboratory_id": laboratory_id
    }

    first_response = client.post("/equipment", json=equipment)
    second_response = client.post("/equipment", json=equipment)

    assert first_response.status_code == 201
    assert second_response.status_code == 409
def test_update_equipment(client):
    laboratory_id = create_laboratory(client)

    create_response = client.post(
        "/equipment",
        json={
            "name": "Eski Bilgisayar",
            "serial_number": "UPDATE-001",
            "status": "available",
            "laboratory_id": laboratory_id
        }
    )

    equipment_id = create_response.json()["id"]

    response = client.put(
        f"/equipment/{equipment_id}",
        json={
            "name": "Yeni Bilgisayar",
            "serial_number": "UPDATE-001",
            "status": "maintenance",
            "laboratory_id": laboratory_id
        }
    )

    assert response.status_code == 200

    assert response.status_code == 200
    assert response.json()["name"] == "Yeni Bilgisayar"
    assert response.json()["status"] == "maintenance"


def test_delete_equipment(client):
    laboratory_id = create_laboratory(client)

    create_response = client.post(
        "/equipment",
        json={
            "name": "Silinecek Bilgisayar",
            "serial_number": "DELETE-001",
            "status": "available",
            "laboratory_id": laboratory_id
        }
    )

    equipment_id = create_response.json()["id"]

    response = client.delete(f"/equipment/{equipment_id}")

    assert response.status_code == 200

    list_response = client.get("/equipment")

    assert list_response.status_code == 200
    assert len(list_response.json()) == 0


def test_update_laboratory(client):
    create_response = client.post(
        "/laboratories",
        json={
            "name": "Eski Laboratuvar",
            "location": "Eski Konum"
        }
    )

    laboratory_id = create_response.json()["id"]

    response = client.put(
        f"/laboratories/{laboratory_id}",
        json={
            "name": "Yeni Laboratuvar",
            "location": "Yeni Konum"
        }
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Yeni Laboratuvar"
    assert response.json()["location"] == "Yeni Konum"


def test_delete_laboratory(client):
    create_response = client.post(
        "/laboratories",
        json={
            "name": "Silinecek Laboratuvar",
            "location": "Test Konumu"
        }
    )

    laboratory_id = create_response.json()["id"]

    response = client.delete(
        f"/laboratories/{laboratory_id}"
    )

    assert response.status_code == 200

    list_response = client.get("/laboratories")

    assert list_response.status_code == 200
    assert len(list_response.json()) == 0
def test_update_nonexistent_equipment_returns_404(client):
    response = client.put(
        "/equipment/999",
        json={
            "name": "Olmayan Cihaz",
            "serial_number": "NONE-999",
            "status": "available",
            "laboratory_id": 1
        }
    )

    assert response.status_code == 404


def test_delete_nonexistent_equipment_returns_404(client):
    response = client.delete("/equipment/999")

    assert response.status_code == 404
def test_update_nonexistent_laboratory_returns_404(client):
    response = client.put(
        "/laboratories/999",
        json={
            "name": "Olmayan Laboratuvar",
            "location": "Test"
        }
    )

    assert response.status_code == 404


def test_delete_nonexistent_laboratory_returns_404(client):
    response = client.delete("/laboratories/999")

    assert response.status_code == 404
def test_equipment_filter_by_status(client):
    laboratory_id = create_laboratory(client)

    for i, status in enumerate(
        ["available", "maintenance", "broken"]
    ):
        client.post(
            "/equipment",
            json={
                "name": f"Cihaz {i}",
                "serial_number": f"FILTER-{i}",
                "status": status,
                "laboratory_id": laboratory_id
            }
        )

    response = client.get("/equipment?status=available")

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["status"] == "available"
def test_equipment_filter_by_name(client):
    laboratory_id = create_laboratory(client)

    for i, name in enumerate(
        ["Dell Bilgisayar", "HP Bilgisayar", "Canon Yazıcı"]
    ):
        client.post(
            "/equipment",
            json={
                "name": name,
                "serial_number": f"NAME-{i}",
                "status": "available",
                "laboratory_id": laboratory_id
            }
        )

    response = client.get("/equipment?name=Dell")

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["name"] == "Dell Bilgisayar"


def test_equipment_filter_by_serial_number(client):
    laboratory_id = create_laboratory(client)

    for i, serial in enumerate(
        ["PC-2026-001", "PC-2026-002", "MON-2026-001"]
    ):
        client.post(
            "/equipment",
            json={
                "name": f"Cihaz {i}",
                "serial_number": serial,
                "status": "available",
                "laboratory_id": laboratory_id
            }
        )

    response = client.get("/equipment?serial_number=PC-2026")

    assert response.status_code == 200
    assert len(response.json()) == 2
def test_equipment_sort_by_name_ascending(client):
    laboratory_id = create_laboratory(client)

    for i, name in enumerate(["Zebra", "Apple", "Mouse"]):
        client.post(
            "/equipment",
            json={
                "name": name,
                "serial_number": f"SORT-{i}",
                "status": "available",
                "laboratory_id": laboratory_id
            }
        )

    response = client.get("/equipment?sort_by=name&order=asc")

    assert response.status_code == 200

    names = [item["name"] for item in response.json()]

    assert names == ["Apple", "Mouse", "Zebra"]


def test_equipment_sort_by_name_descending(client):
    laboratory_id = create_laboratory(client)

    for i, name in enumerate(["Zebra", "Apple", "Mouse"]):
        client.post(
            "/equipment",
            json={
                "name": name,
                "serial_number": f"SORT-DESC-{i}",
                "status": "available",
                "laboratory_id": laboratory_id
            }
        )

    response = client.get("/equipment?sort_by=name&order=desc")

    assert response.status_code == 200

    names = [item["name"] for item in response.json()]

    assert names == ["Zebra", "Mouse", "Apple"]
def test_equipment_pagination(client):
    laboratory_id = create_laboratory(client)

    for i in range(5):
        client.post(
            "/equipment",
            json={
                "name": f"Cihaz {i}",
                "serial_number": f"PAGE-{i}",
                "status": "available",
                "laboratory_id": laboratory_id
            }
        )

    response = client.get("/equipment?skip=0&limit=2")

    assert response.status_code == 200
    assert len(response.json()) == 2

    response = client.get("/equipment?skip=2&limit=2")

    assert response.status_code == 200
    assert len(response.json()) == 2


def test_equipment_pagination_invalid_limit(client):
    response = client.get("/equipment?limit=101")

    assert response.status_code == 422


def test_equipment_pagination_negative_skip(client):
    response = client.get("/equipment?skip=-1")

    assert response.status_code == 422
def test_delete_laboratory_with_equipment(client):
    laboratory_id = create_laboratory(client)

    client.post(
        "/equipment",
        json={
            "name": "Laboratuvar Bilgisayarı",
            "serial_number": "FK-TEST-001",
            "status": "available",
            "laboratory_id": laboratory_id
        }
    )

    response = client.delete(
        f"/laboratories/{laboratory_id}"
    )

    assert response.status_code == 409
def test_create_equipment_with_invalid_status(client):
    laboratory_id = create_laboratory(client)

    response = client.post(
        "/equipment",
        json={
            "name": "Test Bilgisayarı",
            "serial_number": "INVALID-001",
            "status": "abc123",
            "laboratory_id": laboratory_id
        }
    )

    assert response.status_code == 422
def test_update_equipment_with_invalid_status(client):
    laboratory_id = create_laboratory(client)

    equipment = client.post(
        "/equipment",
        json={
            "name": "Test Bilgisayarı",
            "serial_number": "INVALID-UPDATE-001",
            "status": "available",
            "laboratory_id": laboratory_id
        }
    )

    equipment_id = equipment.json()["id"]

    response = client.put(
        f"/equipment/{equipment_id}",
        json={"status": "abc123"}
    )

    assert response.status_code == 422
def test_equipment_invalid_sort_by_returns_400(client):
    response = client.get("/equipment?sort_by=invalid")

    assert response.status_code == 400


def test_equipment_invalid_order_returns_400(client):
    response = client.get("/equipment?order=invalid")

    assert response.status_code == 400
def test_equipment_filter_by_laboratory_id(client):
    laboratory_id = create_laboratory(client)

    client.post(
        "/equipment",
        json={
            "name": "Filtre Test Bilgisayarı",
            "serial_number": "FILTER-001",
            "status": "available",
            "laboratory_id": laboratory_id
        }
    )

    response = client.get(
        f"/equipment?laboratory_id={laboratory_id}"
    )

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["laboratory_id"] == laboratory_id


def test_equipment_combined_filters(client):
    laboratory_id = create_laboratory(client)

    client.post(
        "/equipment",
        json={
            "name": "Filtre Test Bilgisayarı",
            "serial_number": "FILTER-002",
            "status": "available",
            "laboratory_id": laboratory_id
        }
    )

    response = client.get(
        f"/equipment?name=Filtre&status=available&laboratory_id={laboratory_id}"
    )

    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["serial_number"] == "FILTER-002"
def test_create_equipment_with_nonexistent_laboratory_returns_404(client):
    response = client.post(
        "/equipment",
        json={
            "name": "Test Cihazı",
            "serial_number": "INVALID-LAB-001",
            "status": "available",
            "laboratory_id": 9999
        }
    )

    assert response.status_code == 404


def test_update_equipment_with_nonexistent_laboratory_returns_404(client):
    laboratory_id = create_laboratory(client)

    equipment_response = client.post(
        "/equipment",
        json={
            "name": "Test Cihazı",
            "serial_number": "INVALID-LAB-002",
            "status": "available",
            "laboratory_id": laboratory_id
        }
    )

    equipment_id = equipment_response.json()["id"]

    response = client.put(
    f"/equipment/{equipment_id}",
    json={
        "name": "Test Cihazı",
        "serial_number": "INVALID-LAB-002",
        "status": "available",
        "laboratory_id": 9999
    }
)
def test_update_equipment_duplicate_serial_number_returns_409(client):
    laboratory_id = create_laboratory(client)

    first = client.post(
        "/equipment",
        json={
            "name": "Bilgisayar 1",
            "serial_number": "DUPLICATE-001",
            "status": "available",
            "laboratory_id": laboratory_id
        }
    )

    second = client.post(
        "/equipment",
        json={
            "name": "Bilgisayar 2",
            "serial_number": "DUPLICATE-002",
            "status": "available",
            "laboratory_id": laboratory_id
        }
    )

    second_id = second.json()["id"]

    response = client.put(
        f"/equipment/{second_id}",
        json={
            "name": "Bilgisayar 2",
            "serial_number": "DUPLICATE-001",
            "status": "available",
            "laboratory_id": laboratory_id
        }
    )

    assert response.status_code == 409
def test_get_laboratories_empty(client):
    response = client.get("/laboratories")

    assert response.status_code == 200
    assert response.json() == []
def test_get_equipment_empty(client):
    response = client.get("/equipment")

    assert response.status_code == 200
    assert response.json() == []


def test_equipment_stats_empty(client):
    response = client.get("/equipment/stats")

    assert response.status_code == 200
    assert response.json() == {
        "total": 0,
        "available": 0,
        "maintenance": 0,
        "broken": 0
    }
def test_users_cannot_access_each_others_laboratories(multi_user_client):
    client, current_user = multi_user_client

    # User 1 creates a laboratory
    response = client.post(
        "/laboratories",
        json={
            "name": "User 1 Laboratory",
            "location": "Floor 1"
        }
    )

    assert response.status_code == 201
    laboratory_id = response.json()["id"]

    # Switch to User 2
    current_user["id"] = 2

    # User 2 cannot see User 1's laboratory
    response = client.get("/laboratories")
    assert response.status_code == 200
    assert response.json() == []

    # User 2 cannot access its equipment
    response = client.get(
        f"/laboratories/{laboratory_id}/equipment"
    )
    assert response.status_code == 404

    # User 2 cannot update or delete it
    response = client.put(
        f"/laboratories/{laboratory_id}",
        json={
            "name": "Hacked Laboratory",
            "location": "Floor 2"
        }
    )
    assert response.status_code == 404

    response = client.delete(f"/laboratories/{laboratory_id}")
    assert response.status_code == 404

    # User 1 still owns the laboratory
    current_user["id"] = 1

    response = client.get("/laboratories")
    assert len(response.json()) == 1


def test_users_cannot_access_each_others_equipment(multi_user_client):
    client, current_user = multi_user_client

    # User 1 creates a laboratory
    laboratory = client.post(
        "/laboratories",
        json={
            "name": "User 1 Laboratory",
            "location": "Floor 1"
        }
    )

    laboratory_id = laboratory.json()["id"]

    # User 1 creates equipment
    equipment = client.post(
        "/equipment",
        json={
            "name": "User 1 Computer",
            "serial_number": "USER1-001",
            "status": "available",
            "laboratory_id": laboratory_id
        }
    )

    assert equipment.status_code == 201
    equipment_id = equipment.json()["id"]

    # Switch to User 2
    current_user["id"] = 2

    # User 2 cannot see User 1's equipment
    response = client.get("/equipment")
    assert response.status_code == 200
    assert response.json() == []

    # User 2 cannot create equipment in User 1's laboratory
    response = client.post(
        "/equipment",
        json={
            "name": "Unauthorized Computer",
            "serial_number": "USER2-001",
            "status": "available",
            "laboratory_id": laboratory_id
        }
    )
    assert response.status_code == 404

    # User 2 cannot update or delete User 1's equipment
    response = client.put(
        f"/equipment/{equipment_id}",
        json={
            "name": "Hacked Computer",
            "serial_number": "USER1-001",
            "status": "broken",
            "laboratory_id": laboratory_id
        }
    )
    assert response.status_code == 404

    response = client.delete(f"/equipment/{equipment_id}")
    assert response.status_code == 404

    # User 1 still owns the equipment
    current_user["id"] = 1

    response = client.get("/equipment")
    assert len(response.json()) == 1
def test_global_exception_handler(client):
    from fastapi.testclient import TestClient
    from app.main import app

    def test_error():
        raise RuntimeError("Test internal error")

    app.add_api_route(
        "/test-error",
        test_error,
        methods=["GET"]
    )

    route = next(
        route for route in app.router.routes
        if getattr(route, "path", None) == "/test-error"
    )

    try:
        with TestClient(
            app,
            raise_server_exceptions=False
        ) as test_client:
            response = test_client.get("/test-error")

        assert response.status_code == 500
        assert response.json() == {
            "detail": "Internal server error"
        }

    finally:
        app.router.routes.remove(route)
