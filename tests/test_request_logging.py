import logging
from uuid import UUID

import pytest
from fastapi import FastAPI, Response
from fastapi.testclient import TestClient

from app.logging_config import request_id_context
from app.request_logging import RequestLoggingMiddleware


@pytest.fixture
def logging_client():
    app = FastAPI()

    @app.get("/items/{item_id}")
    def get_item(item_id: int):
        return {
            "id": item_id,
            "request_id": request_id_context.get(),
        }

    @app.get("/error")
    def error():
        raise RuntimeError("private-error-details")

    @app.get("/custom-header")
    def custom_header():
        return Response(
            content="OK",
            headers={"X-Request-ID": "old-request-id"},
        )

    wrapped_app = RequestLoggingMiddleware(app)

    with TestClient(
        wrapped_app,
        raise_server_exceptions=False,
    ) as client:
        yield client


def test_request_id_header(logging_client):
    response = logging_client.get("/items/1")

    assert response.status_code == 200

    request_id = response.headers["X-Request-ID"]

    assert len(request_id) == 32
    assert UUID(request_id).version == 4


def test_unique_request_ids(logging_client):
    first = logging_client.get("/items/1")
    second = logging_client.get("/items/1")

    assert (
        first.headers["X-Request-ID"]
        != second.headers["X-Request-ID"]
    )


def test_request_id_context(logging_client):
    response = logging_client.get("/items/1")

    assert (
        response.json()["request_id"]
        == response.headers["X-Request-ID"]
    )


def test_client_request_id_is_ignored(logging_client):
    response = logging_client.get(
        "/items/1",
        headers={"X-Request-ID": "untrusted-client-id"},
    )

    assert (
        response.headers["X-Request-ID"]
        != "untrusted-client-id"
    )


def test_existing_response_header_is_replaced(logging_client):
    response = logging_client.get("/custom-header")

    headers = response.headers.get_list("X-Request-ID")

    assert len(headers) == 1
    assert headers[0] != "old-request-id"


def test_request_completion_log(logging_client, caplog):
    with caplog.at_level(logging.INFO, logger="labmanager"):
        response = logging_client.get("/items/42")

    records = [
        record for record in caplog.records
        if record.getMessage() == "request_completed"
    ]

    assert len(records) == 1

    record = records[0]

    assert response.status_code == 200
    assert record.method == "GET"
    assert record.route == "/items/{item_id}"
    assert record.status_code == 200
    assert record.duration_ms >= 0


def test_not_found_logging(logging_client, caplog):
    with caplog.at_level(logging.INFO, logger="labmanager"):
        response = logging_client.get("/unknown")

    assert response.status_code == 404
    assert "X-Request-ID" in response.headers

    record = caplog.records[-1]

    assert record.route == "unmatched"
    assert record.status_code == 404


def test_server_error_logging(logging_client, caplog):
    with caplog.at_level(logging.INFO, logger="labmanager"):
        response = logging_client.get("/error")

    assert response.status_code == 500
    assert "X-Request-ID" in response.headers

    record = caplog.records[-1]

    assert record.status_code == 500
    assert record.route == "/error"
    assert "private-error-details" not in caplog.text


def test_unknown_http_method(logging_client, caplog):
    with caplog.at_level(logging.INFO, logger="labmanager"):
        response = logging_client.request(
            "CUSTOM",
            "/items/1",
        )

    assert response.status_code == 405
    assert caplog.records[-1].method == "OTHER"


def test_sensitive_request_data_not_logged(
    logging_client,
    caplog,
):
    with caplog.at_level(logging.INFO, logger="labmanager"):
        logging_client.get(
            "/items/987654321",
            params={"email": "private@example.com"},
            headers={
                "Authorization": "Bearer private-token",
                "Cookie": "session=private-session",
            },
        )

    record = caplog.records[-1]
    output = str(record.__dict__)

    assert "987654321" not in output
    assert "private@example.com" not in output
    assert "private-token" not in output
    assert "private-session" not in output
    assert record.route == "/items/{item_id}"


def test_concurrent_request_isolation():
    import asyncio

    async def scenario():
        request_ids = {}
        both_started = asyncio.Event()

        async def endpoint(scope, receive, send):
            name = scope["path"]
            initial_id = request_id_context.get()

            request_ids[name] = initial_id

            if len(request_ids) == 2:
                both_started.set()

            await both_started.wait()
            await asyncio.sleep(0)

            assert request_id_context.get() == initial_id

            await send({
                "type": "http.response.start",
                "status": 200,
                "headers": [],
            })

            await send({
                "type": "http.response.body",
                "body": b"OK",
            })

        middleware = RequestLoggingMiddleware(endpoint)

        async def receive():
            return {"type": "http.disconnect"}

        async def run_request(path):
            messages = []

            async def send(message):
                messages.append(message)

            await middleware(
                {
                    "type": "http",
                    "method": "GET",
                    "path": path,
                },
                receive,
                send,
            )

            assert request_id_context.get() is None

            headers = dict(messages[0]["headers"])

            assert (
                headers[b"x-request-id"].decode()
                == request_ids[path]
            )

        await asyncio.wait_for(
            asyncio.gather(
                run_request("/first"),
                run_request("/second"),
            ),
            timeout=5,
        )

        assert request_ids["/first"] != request_ids["/second"]
        assert request_id_context.get() is None

    asyncio.run(scenario())


@pytest.mark.parametrize("should_fail", [False, True])
def test_context_restored_after_request(should_fail):
    import asyncio

    async def scenario():
        async def endpoint(scope, receive, send):
            assert request_id_context.get() != "parent-context"

            if should_fail:
                raise RuntimeError("test-error")

            await send({
                "type": "http.response.start",
                "status": 200,
                "headers": [],
            })

            await send({
                "type": "http.response.body",
                "body": b"OK",
            })

        async def receive():
            return {"type": "http.disconnect"}

        async def send(message):
            pass

        middleware = RequestLoggingMiddleware(endpoint)

        scope = {
            "type": "http",
            "method": "GET",
            "path": "/test",
        }

        token = request_id_context.set("parent-context")

        try:
            if should_fail:
                with pytest.raises(RuntimeError):
                    await middleware(scope, receive, send)
            else:
                await middleware(scope, receive, send)

            assert request_id_context.get() == "parent-context"

        finally:
            request_id_context.reset(token)

        assert request_id_context.get() is None

    asyncio.run(scenario())


def test_valid_request_id_is_preserved(logging_client):
    request_id = "0123456789abcdef0123456789abcdef"

    response = logging_client.get(
        "/items/1",
        headers={"X-Request-ID": request_id},
    )

    assert response.status_code == 200
    assert response.headers["X-Request-ID"] == request_id
    assert response.json()["request_id"] == request_id


@pytest.mark.parametrize(
    "invalid_id",
    [
        "",
        "123",
        "a" * 31,
        "a" * 33,
        "A" * 32,
        "g" * 32,
        "private-user-information",
        "a" * 32 + "," + "b" * 32,
    ],
)
def test_invalid_request_id_is_replaced(
    logging_client,
    invalid_id,
):
    response = logging_client.get(
        "/items/1",
        headers={"X-Request-ID": invalid_id},
    )

    assert response.status_code == 200

    request_id = response.headers["X-Request-ID"]

    assert request_id != invalid_id
    assert len(request_id) == 32
    assert UUID(request_id).version == 4
    assert response.json()["request_id"] == request_id


def test_duplicate_request_id_headers_are_rejected(
    logging_client,
):
    first_id = "a" * 32
    second_id = "b" * 32

    response = logging_client.get(
        "/items/1",
        headers=[
            ("X-Request-ID", first_id),
            ("X-Request-ID", second_id),
        ],
    )

    assert response.status_code == 200

    request_id = response.headers["X-Request-ID"]

    assert request_id not in {first_id, second_id}
    assert UUID(request_id).version == 4


def test_request_id_header_case_insensitive():
    from app.request_logging import resolve_request_id

    request_id = "a" * 32

    scope = {
        "headers": [
            (b"X-Request-ID", request_id.encode("ascii")),
        ]
    }

    assert resolve_request_id(scope) == request_id
