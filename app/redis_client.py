import os
from functools import lru_cache

from redis import Redis
from redis.backoff import NoBackoff
from redis.retry import Retry


@lru_cache(maxsize=1)
def get_redis_client() -> Redis:
    password = os.getenv("REDIS_PASSWORD")

    if not password:
        raise RuntimeError(
            "REDIS_PASSWORD environment variable is missing"
        )

    return Redis(
        host=os.getenv("REDIS_HOST", "redis"),
        port=6379,
        username="labmanager",
        password=password,
        db=0,
        socket_connect_timeout=2,
        socket_timeout=2,
        decode_responses=True,
        protocol=2,
        driver_info=None,
        retry=Retry(NoBackoff(), 0)
    )
