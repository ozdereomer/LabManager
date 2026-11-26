import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.metrics import ApplicationMetrics
from app.monitoring import MonitoringMiddleware


@pytest.fixture
def monitoring_app(monkeypatch):
    metrics = ApplicationMetrics()

    monkeypatch.setattr("app.monitoring.metrics", metrics)

    app = FastAPI()
    app.add_middleware(MonitoringMiddleware)

    @app.get("/items/{item_id}")
    def get_item(item_id: int):
        return {"id": item_id}

    @app.get("/error")
    def error():
        raise HTTPException(status_code=400)

    @app.get("/crash")
    def crash():
        raise RuntimeError("Test error")

    @app.get("/metrics")
    def metrics_endpoint():
        return {"status": "ok"}

    @app.get("/in-progress")
    def in_progress():
        return {
            "count": metrics.registry.get_sample_value(
                "labmanager_http_requests_in_progress"
            )
        }

    with TestClient(
        app, raise_server_exceptions=False
    ) as client:
        yield client, metrics.registry


def test_request_counter(monitoring_app):
    client, registry = monitoring_app

    assert client.get("/items/1").status_code == 200
    assert client.get("/items/2").status_code == 200

    assert registry.get_sample_value(
        "labmanager_http_requests_total",
        {
            "method": "GET",
            "route": "/items/{item_id}",
            "status": "200",
        },
    ) == 2


def test_request_duration(monitoring_app):
    client, registry = monitoring_app

    client.get("/items/1")

    labels = {
        "method": "GET",
        "route": "/items/{item_id}",
    }

    assert registry.get_sample_value(
        "labmanager_http_request_duration_seconds_count",
        labels,
    ) == 1

    assert registry.get_sample_value(
        "labmanager_http_request_duration_seconds_sum",
        labels,
    ) > 0


def test_in_progress_requests(monitoring_app):
    client, registry = monitoring_app

    response = client.get("/in-progress")

    assert response.json()["count"] == 1

    assert registry.get_sample_value(
        "labmanager_http_requests_in_progress"
    ) == 0


def test_http_error_recorded(monitoring_app):
    client, registry = monitoring_app

    assert client.get("/error").status_code == 400

    assert registry.get_sample_value(
        "labmanager_http_requests_total",
        {
            "method": "GET",
            "route": "/error",
            "status": "400",
        },
    ) == 1


def test_unhandled_error_recorded(monitoring_app):
    client, registry = monitoring_app

    assert client.get("/crash").status_code == 500

    assert registry.get_sample_value(
        "labmanager_http_requests_total",
        {
            "method": "GET",
            "route": "/crash",
            "status": "500",
        },
    ) == 1

    assert registry.get_sample_value(
        "labmanager_http_requests_in_progress"
    ) == 0


def test_unknown_routes_are_grouped(monitoring_app):
    client, registry = monitoring_app

    assert client.get("/unknown-one").status_code == 404
    assert client.get("/unknown-two").status_code == 404

    assert registry.get_sample_value(
        "labmanager_http_requests_total",
        {
            "method": "GET",
            "route": "unmatched",
            "status": "404",
        },
    ) == 2


def test_unknown_http_method(monitoring_app):
    client, registry = monitoring_app

    assert client.request(
        "CUSTOM", "/items/1"
    ).status_code == 405

    samples = [
        sample
        for metric in registry.collect()
        for sample in metric.samples
        if sample.name == "labmanager_http_requests_total"
    ]

    assert len(samples) == 1
    assert samples[0].labels["method"] == "OTHER"
    assert samples[0].labels["status"] == "405"


def test_metrics_endpoint_excluded(monitoring_app):
    client, registry = monitoring_app

    assert client.get("/metrics").status_code == 200

    samples = [
        sample
        for metric in registry.collect()
        for sample in metric.samples
        if sample.name == "labmanager_http_requests_total"
    ]

    assert samples == []


def test_sensitive_url_values_not_recorded(monitoring_app):
    client, registry = monitoring_app

    client.get("/items/987654321?secret=private-value")
    client.get("/private-user@example.com")

    from prometheus_client import generate_latest

    output = generate_latest(registry).decode()

    assert "987654321" not in output
    assert "private-value" not in output
    assert "private-user@example.com" not in output
