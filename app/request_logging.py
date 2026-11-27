import logging
import re
from time import perf_counter
from uuid import uuid4

from app.logging_config import request_id_context


logger = logging.getLogger("labmanager")


def resolve_request_id(scope):
    values = [
        value
        for name, value in scope.get("headers", [])
        if name.lower() == b"x-request-id"
    ]

    if len(values) == 1:
        value = values[0]

        if re.fullmatch(rb"[0-9a-f]{32}", value):
            return value.decode("ascii")

    return uuid4().hex


class RequestLoggingMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request_id = resolve_request_id(scope)
        context_token = request_id_context.set(request_id)

        started_at = perf_counter()
        status_code = 500

        method = scope["method"]

        if method not in {
            "GET", "POST", "PUT", "PATCH",
            "DELETE", "HEAD", "OPTIONS",
        }:
            method = "OTHER"

        async def send_wrapper(message):
            nonlocal status_code

            if message["type"] == "http.response.start":
                status_code = message["status"]

                headers = [
                    (name, value)
                    for name, value in message.get("headers", [])
                    if name.lower() != b"x-request-id"
                ]

                headers.append(
                    (b"x-request-id", request_id.encode("ascii"))
                )

                message = {
                    **message,
                    "headers": headers,
                }

            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)

        finally:
            try:
                duration_ms = round(
                    (perf_counter() - started_at) * 1000,
                    3,
                )

                route = getattr(
                    scope.get("route"),
                    "path",
                    "unmatched",
                )

                if not (
                    scope.get("path") == "/metrics"
                    and method == "GET"
                    and status_code == 200
                ):
                    logger.info(
                        "request_completed",
                        extra={
                            "method": method,
                            "route": route,
                            "status_code": status_code,
                            "duration_ms": duration_ms,
                        },
                    )
            finally:
                request_id_context.reset(context_token)
