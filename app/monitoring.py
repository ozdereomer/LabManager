from time import perf_counter

from app.metrics import metrics


class MonitoringMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        if scope["path"] == "/metrics":
            await self.app(scope, receive, send)
            return

        method = scope["method"]

        if method not in {
            "GET", "POST", "PUT", "PATCH",
            "DELETE", "HEAD", "OPTIONS",
        }:
            method = "OTHER"

        status_code = 500
        started_at = perf_counter()

        metrics.http_requests_in_progress.inc()

        async def send_wrapper(message):
            nonlocal status_code

            if message["type"] == "http.response.start":
                status_code = message["status"]

            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration = perf_counter() - started_at

            route = getattr(
                scope.get("route"),
                "path",
                "unmatched",
            )

            metrics.http_requests.labels(
                method=method,
                route=route,
                status=str(status_code),
            ).inc()

            metrics.http_request_duration.labels(
                method=method,
                route=route,
            ).observe(duration)

            metrics.http_requests_in_progress.dec()
