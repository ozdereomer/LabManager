import io
import json
import logging

import pytest
from fastapi.testclient import TestClient

from app.logging_config import JsonFormatter
from app.main import app


@pytest.fixture
def json_logs():
    logger = logging.getLogger("labmanager")
    stream = io.StringIO()

    handler = logging.StreamHandler(stream)
    handler.setFormatter(JsonFormatter())

    logger.addHandler(handler)

    try:
        yield stream
    finally:
        logger.removeHandler(handler)
        handler.close()


def read_logs(stream):
    return [
        json.loads(line)
        for line in stream.getvalue().splitlines()
        if line.strip()
    ]


def test_health_request_logging(json_logs):
    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200

    records = [
        record for record in read_logs(json_logs)
        if record["event"] == "request_completed"
    ]

    assert len(records) == 1

    record = records[0]

    assert record["request_id"] == response.headers["X-Request-ID"]
    assert record["method"] == "GET"
    assert record["route"] == "/health"
    assert record["status_code"] == 200
    assert record["duration_ms"] >= 0


def test_not_found_request_logging(json_logs):
    with TestClient(app) as client:
        response = client.get(
            "/private-test-path",
            params={"secret": "private-query-value"},
        )

    assert response.status_code == 404

    record = read_logs(json_logs)[-1]

    assert record["request_id"] == response.headers["X-Request-ID"]
    assert record["route"] == "unmatched"
    assert record["status_code"] == 404

    output = json_logs.getvalue()

    assert "private-test-path" not in output
    assert "private-query-value" not in output


def test_unauthorized_request_logging(json_logs):
    with TestClient(app) as client:
        response = client.get("/laboratories")

    assert response.status_code == 401

    record = read_logs(json_logs)[-1]

    assert record["request_id"] == response.headers["X-Request-ID"]
    assert record["route"] == "/laboratories"
    assert record["status_code"] == 401


def test_validation_error_logging(json_logs):
    with TestClient(app) as client:
        response = client.post(
            "/register",
            json={
                "email": "private-invalid-email",
                "password": "private-password-value",
            },
        )

    assert response.status_code == 422

    record = read_logs(json_logs)[-1]

    assert record["request_id"] == response.headers["X-Request-ID"]
    assert record["route"] == "/register"
    assert record["status_code"] == 422

    output = json_logs.getvalue()

    assert "private-invalid-email" not in output
    assert "private-password-value" not in output


def test_internal_server_error_logging(json_logs):
    async def failing_endpoint():
        raise RuntimeError("private-exception-details")

    original_routes = app.router.routes[:]
    original_stack = app.middleware_stack

    app.add_api_route(
        "/test-logging-error",
        failing_endpoint,
        methods=["GET"],
        include_in_schema=False,
    )

    try:
        with TestClient(
            app,
            raise_server_exceptions=False,
        ) as client:
            response = client.get("/test-logging-error")

        assert response.status_code == 500
        assert response.json() == {
            "detail": "Internal server error"
        }

        records = read_logs(json_logs)

        errors = [
            record for record in records
            if record["event"] == "unhandled_exception"
        ]

        completed = [
            record for record in records
            if record["event"] == "request_completed"
        ]

        assert len(errors) == 1
        assert len(completed) == 1

        request_id = response.headers["X-Request-ID"]

        assert errors[0]["request_id"] == request_id
        assert completed[0]["request_id"] == request_id

        assert errors[0]["error_type"] == "RuntimeError"
        assert errors[0]["status_code"] == 500
        assert completed[0]["status_code"] == 500

        assert "private-exception-details" not in json_logs.getvalue()

    finally:
        app.router.routes[:] = original_routes
        app.middleware_stack = original_stack


def test_successful_metrics_request_not_logged(
    json_logs,
    monkeypatch,
):
    monkeypatch.setenv(
        "METRICS_TOKEN",
        "isolated-metrics-test-token",
    )

    with TestClient(app) as client:
        response = client.get(
            "/metrics",
            headers={
                "Authorization": "Bearer isolated-metrics-test-token"
            },
        )

    assert response.status_code == 200
    assert "X-Request-ID" in response.headers
    assert read_logs(json_logs) == []


@pytest.mark.parametrize("status_code", [401, 503])
def test_failed_metrics_request_logged(
    json_logs,
    monkeypatch,
    status_code,
):
    if status_code == 401:
        monkeypatch.setenv(
            "METRICS_TOKEN",
            "isolated-metrics-test-token",
        )
    else:
        monkeypatch.delenv("METRICS_TOKEN", raising=False)

    with TestClient(app) as client:
        response = client.get("/metrics")

    assert response.status_code == status_code

    records = read_logs(json_logs)

    assert len(records) == 1

    record = records[0]

    assert record["event"] == "request_completed"
    assert record["route"] == "/metrics"
    assert record["method"] == "GET"
    assert record["status_code"] == status_code
    assert record["request_id"] == response.headers["X-Request-ID"]


def test_non_get_metrics_request_logged(json_logs):
    with TestClient(app) as client:
        response = client.post("/metrics")

    assert response.status_code == 405

    records = read_logs(json_logs)

    assert len(records) == 1
    assert records[0]["method"] == "POST"
    assert records[0]["status_code"] == 405
    assert records[0]["request_id"] == response.headers["X-Request-ID"]
