import json
import logging
import sys

from app.uvicorn_logging import UvicornJsonFormatter


def make_record(message, args=(), exc_info=None):
    return logging.LogRecord(
        name="uvicorn.error",
        level=logging.ERROR if exc_info else logging.INFO,
        pathname=__file__,
        lineno=1,
        msg=message,
        args=args,
        exc_info=exc_info,
    )


def test_normal_server_message():
    record = make_record(
        "Started server process [%d]",
        args=(123,),
    )

    result = json.loads(
        UvicornJsonFormatter().format(record)
    )

    assert result["event"] == "Started server process [123]"
    assert result["logger"] == "uvicorn.error"
    assert result["level"] == "INFO"
    assert result["timestamp"].endswith("+00:00")


def test_exception_details_are_hidden():
    try:
        raise RuntimeError("private-database-password")
    except RuntimeError:
        record = make_record(
            "Private connection details: %s",
            args=("private-connection-string",),
            exc_info=sys.exc_info(),
        )

    output = UvicornJsonFormatter().format(record)
    result = json.loads(output)

    assert result["event"] == "server_exception"
    assert result["error_type"] == "RuntimeError"
    assert result["level"] == "ERROR"

    assert "private-database-password" not in output
    assert "private-connection-string" not in output
    assert "Private connection details" not in output
    assert "Traceback" not in output


def test_cached_exception_text_is_hidden():
    record = make_record("private-error-message")
    record.exc_text = "private-cached-traceback"

    output = UvicornJsonFormatter().format(record)
    result = json.loads(output)

    assert result["event"] == "server_exception"
    assert "private-error-message" not in output
    assert "private-cached-traceback" not in output


def test_stack_information_is_hidden():
    record = make_record("server_event")
    record.stack_info = "private-stack-information"

    output = UvicornJsonFormatter().format(record)

    assert "private-stack-information" not in output
    assert json.loads(output)["event"] == "server_event"


def test_original_record_is_not_modified():
    try:
        raise ValueError("original-exception")
    except ValueError:
        record = make_record(
            "Original message: %s",
            args=("original-argument",),
            exc_info=sys.exc_info(),
        )

    record.exc_text = "original-traceback"
    record.stack_info = "original-stack"

    original = record.__dict__.copy()

    UvicornJsonFormatter().format(record)

    assert record.__dict__ == original


def test_empty_exception_type():
    record = make_record(
        "private-error",
        exc_info=(None, None, None),
    )

    result = json.loads(
        UvicornJsonFormatter().format(record)
    )

    assert result["event"] == "server_exception"
    assert "error_type" not in result
