import io
import json
import logging

from app.logging_config import (
    JsonFormatter,
    configure_logging,
    request_id_context,
)


def make_record(message="request_completed"):
    return logging.LogRecord(
        name="labmanager",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg=message,
        args=(),
        exc_info=None,
    )


def test_json_formatter_basic_fields():
    record = make_record()
    result = json.loads(JsonFormatter().format(record))

    assert result["level"] == "INFO"
    assert result["logger"] == "labmanager"
    assert result["event"] == "request_completed"
    assert result["request_id"] is None
    assert result["timestamp"].endswith("+00:00")


def test_json_formatter_request_id():
    token = request_id_context.set("test-request-id")

    try:
        result = json.loads(
            JsonFormatter().format(make_record())
        )

        assert result["request_id"] == "test-request-id"
    finally:
        request_id_context.reset(token)

    assert request_id_context.get() is None


def test_json_formatter_allowed_fields():
    record = make_record()

    fields = {
        "method": "GET",
        "route": "/equipment/{equipment_id}",
        "status_code": 200,
        "duration_ms": 12.5,
        "error_type": "RuntimeError",
    }

    for key, value in fields.items():
        setattr(record, key, value)

    result = json.loads(JsonFormatter().format(record))

    for key, value in fields.items():
        assert result[key] == value


def test_json_formatter_excludes_sensitive_fields():
    record = make_record()

    record.password = "private-password"
    record.authorization = "private-token"
    record.email = "private@example.com"
    record.body = "private-body"
    record.query_string = "private-query"

    output = JsonFormatter().format(record)

    assert "private-password" not in output
    assert "private-token" not in output
    assert "private@example.com" not in output
    assert "private-body" not in output
    assert "private-query" not in output


def test_json_formatter_excludes_exception_details():
    record = make_record("unhandled_exception")

    try:
        raise RuntimeError("private-database-details")
    except RuntimeError:
        import sys
        record.exc_info = sys.exc_info()

    output = JsonFormatter().format(record)

    assert "private-database-details" not in output
    assert "Traceback" not in output
    assert json.loads(output)["event"] == "unhandled_exception"


def test_configure_logging():
    logger = logging.getLogger("labmanager")

    old_handlers = logger.handlers[:]
    old_level = logger.level
    old_propagate = logger.propagate

    try:
        configure_logging()
        configure_logging()

        assert len(logger.handlers) == 1
        assert logger.level == logging.INFO
        assert logger.propagate is False

        handler = logger.handlers[0]

        assert isinstance(handler, logging.StreamHandler)
        assert isinstance(handler.formatter, JsonFormatter)

        stream = io.StringIO()
        handler.setStream(stream)

        logger.info("test_event")

        result = json.loads(stream.getvalue())

        assert result["event"] == "test_event"
        assert result["level"] == "INFO"

    finally:
        for handler in logger.handlers[:]:
            handler.close()

        logger.handlers = old_handlers
        logger.setLevel(old_level)
        logger.propagate = old_propagate
