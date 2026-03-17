import os
import json
import redis
from functools import wraps

REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", None)

redis_client = redis.Redis(
    host=REDIS_HOST,
    port=REDIS_PORT,
    password=REDIS_PASSWORD,
    decode_responses=True,
)


def cache_response(prefix: str, ttl: int = 600):
    """분석 결과를 Redis에 캐싱하는 데코레이터. TTL 기본값 10분."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Build cache key from function name and arguments
            key_parts = [prefix]
            for arg in args:
                if not hasattr(arg, 'query'):  # Skip db session
                    key_parts.append(str(arg))
            for k, v in sorted(kwargs.items()):
                if k != 'db':
                    key_parts.append(f"{k}={v}")
            cache_key = ":".join(key_parts)

            try:
                cached = redis_client.get(cache_key)
                if cached:
                    return json.loads(cached)
            except redis.ConnectionError:
                pass  # Redis unavailable, skip cache

            result = func(*args, **kwargs)

            try:
                redis_client.set(cache_key, json.dumps(result, default=str), ex=ttl)
            except redis.ConnectionError:
                pass  # Redis unavailable, skip cache

            return result
        return wrapper
    return decorator
