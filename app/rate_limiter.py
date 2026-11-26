import hashlib
import hmac
import logging

from fastapi import HTTPException
from redis.exceptions import RedisError

from app.auth import SECRET_KEY
from app.redis_client import get_redis_client


logger = logging.getLogger("labmanager")


RATE_LIMIT_SCRIPT = """
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local ttl = redis.call('PTTL', KEYS[1])

if ttl == -1 then
    redis.call('PEXPIRE', KEYS[1], window * 1000)
    ttl = window * 1000
end

if current >= limit then
    return {0, math.max(math.ceil(ttl / 1000), 1)}
end

local count = redis.call('INCR', KEYS[1])

if count == 1 then
    redis.call('PEXPIRE', KEYS[1], window * 1000)
end

return {1, 0}
"""


def build_rate_limit_key(
    scope: str,
    identifier: str
) -> str:
    digest = hmac.new(
        SECRET_KEY.encode("utf-8"),
        f"ratelimit:{scope}:{identifier}".encode("utf-8"),
        hashlib.sha256
    ).hexdigest()

    return f"labmanager:ratelimit:{scope}:{digest}"


def enforce_rate_limit(
    scope: str,
    identifier: str,
    limit: int,
    window_seconds: int
) -> None:
    if limit <= 0 or window_seconds <= 0:
        raise ValueError("Rate limit settings must be positive")

    key = build_rate_limit_key(scope, identifier)

    try:
        client = get_redis_client()

        allowed, retry_after = client.eval(
            RATE_LIMIT_SCRIPT,
            1,
            key,
            limit,
            window_seconds
        )

    except (RedisError, RuntimeError):
        logger.error("Rate limiting service unavailable")

        raise HTTPException(
            status_code=503,
            detail="Authentication service temporarily unavailable"
        )

    if not allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later.",
            headers={
                "Retry-After": str(retry_after)
            }
        )
