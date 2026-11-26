from prometheus_client import (
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
)


class ApplicationMetrics:
    def __init__(self):
        self.registry = CollectorRegistry()

        self.http_requests = Counter(
            "labmanager_http_requests_total",
            "Total HTTP requests",
            ["method", "route", "status"],
            registry=self.registry,
        )

        self.http_request_duration = Histogram(
            "labmanager_http_request_duration_seconds",
            "HTTP request duration in seconds",
            ["method", "route"],
            buckets=(
                0.005, 0.01, 0.025, 0.05,
                0.1, 0.25, 0.5, 1.0,
                2.5, 5.0, 10.0,
            ),
            registry=self.registry,
        )

        self.http_requests_in_progress = Gauge(
            "labmanager_http_requests_in_progress",
            "HTTP requests currently being processed",
            registry=self.registry,
        )

        self.rate_limit_rejections = Counter(
            "labmanager_rate_limit_rejections_total",
            "Requests rejected by the rate limiter",
            ["scope"],
            registry=self.registry,
        )

        self.rate_limit_errors = Counter(
            "labmanager_rate_limit_errors_total",
            "Rate limiter backend errors",
            ["scope"],
            registry=self.registry,
        )

        self.authentication_attempts = Counter(
            "labmanager_authentication_attempts_total",
            "Authentication attempts by outcome",
            ["outcome"],
            registry=self.registry,
        )


metrics = ApplicationMetrics()
