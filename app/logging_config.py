import json
import logging
from contextvars import ContextVar
from datetime import datetime, timezone


request_id_context: ContextVar[str | None] = ContextVar(
    "request_id",
    default=None,
)


class JsonFormatter(logging.Formatter):
    def format(self, record):
        payload = {
            "timestamp": datetime.fromtimestamp(
                record.created,
                tz=timezone.utc,
            ).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "event": record.getMessage(),
            "request_id": request_id_context.get(),
        }

        for field in (
            "method",
            "route",
            "status_code",
            "duration_ms",
            "error_type",
        ):
            if hasattr(record, field):
                payload[field] = getattr(record, field)

        return json.dumps(
            payload,
            ensure_ascii=False,
        )


def configure_logging():
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())

    logger = logging.getLogger("labmanager")
    logger.handlers.clear()
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False
