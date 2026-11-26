import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.metrics import ApplicationMetrics


TEST_TOKEN = "isolated-metrics-test-token"


@pytest.fixture
def metrics_client(monkeypatch):
    monkeypatch.setenv("METRICS_TOKEN", TEST_TOKEN)

    with TestClient(app) as client:
        yield client


def test_metrics_without_token(metrics_client):
    response = metrics_client.get("/metrics")

    assert response.status_code == 401
    assert response.json()["detail"] == "Unauthorized"
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_metrics_with_invalid_token(metrics_client):
    response = metrics_client.get(
        "/metrics",
        headers={"Authorization": "Bearer invalid-token"},
    )

    assert response.status_code == 401


def test_metrics_without_configuration(metrics_client, monkeypatch):
    monkeypatch.delenv("METRICS_TOKEN", raising=False)

    response = metrics_client.get("/metrics")

    assert response.status_code == 503
    assert response.json()["detail"] == "Metrics service unavailable"


def test_metrics_with_valid_token(metrics_client):
    metrics_client.get("/health")

    response = metrics_client.get(
        "/metrics",
        headers={"Authorization": f"Bearer {TEST_TOKEN}"},
    )

    assert response.status_code == 200
    assert "text/plain" in response.headers["content-type"]
    assert "labmanager_http_requests_total" in response.text
    assert "labmanager_http_request_duration_seconds" in response.text
    assert "labmanager_http_requests_in_progress" in response.text
    assert TEST_TOKEN not in response.text


def test_metrics_hidden_from_openapi(metrics_client):
    response = metrics_client.get("/openapi.json")

    assert response.status_code == 200
    assert "/metrics" not in response.json()["paths"]


def test_metrics_registry_isolation():
    first = ApplicationMetrics()
    second = ApplicationMetrics()

    first.http_requests_in_progress.inc()

    name = "labmanager_http_requests_in_progress"

    assert first.registry.get_sample_value(name) == 1
    assert second.registry.get_sample_value(name) == 0
