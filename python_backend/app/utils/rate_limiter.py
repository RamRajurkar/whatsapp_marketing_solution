import os
import redis
from datetime import datetime, timezone

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

class RateLimiter:
    def __init__(self):
        # Setup connection pool for thread-safe worker usage
        self.client = redis.from_url(REDIS_URL, decode_responses=True, protocol=3)

    def consume_throughput(self, phone_number_id: str, limit_mps: int = 70) -> bool:
        """
        Token bucket check for Messages Per Second (MPS).
        Prevents bursting beyond Meta's standard 80 mps limit by capping internally at 70.
        Uses a fast Redis transaction counter per second.
        """
        key = f"rl:mps:{phone_number_id}"
        current_second = int(datetime.now(timezone.utc).timestamp())
        window_key = f"{key}:{current_second}"
        
        pipe = self.client.pipeline()
        pipe.incr(window_key)
        pipe.expire(window_key, 10)
        count, _ = pipe.execute()
        
        return count <= limit_mps

    def check_daily_unique_recipient(self, phone_number_id: str, recipient: str, daily_cap: int = 250) -> bool:
        """
        Verify sending template to this recipient does not exceed rolling daily portfolio unique cap.
        Uses a Redis Set key per calendar day.
        """
        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        set_key = f"rl:unique:{phone_number_id}:{date_str}"
        
        # Check if already messaged today
        is_member = self.client.sismember(set_key, recipient)
        if is_member:
            return True
            
        current_count = self.client.scard(set_key)
        if current_count >= daily_cap:
            return False
            
        pipe = self.client.pipeline()
        pipe.sadd(set_key, recipient)
        pipe.expire(set_key, 108000) # 30 hours expiration
        pipe.execute()
        return True

    def check_monthly_tenant_quota(self, tenant_id: str, monthly_limit: int = 50000) -> bool:
        """
        Verify tenant is within their subscription monthly message limit.
        """
        month_str = datetime.now(timezone.utc).strftime("%Y-%m")
        key = f"rl:quota:{tenant_id}:{month_str}"
        
        current_count = self.client.get(key)
        if current_count and int(current_count) >= monthly_limit:
            return False
        return True

    def increment_monthly_tenant_count(self, tenant_id: str):
        """Record a successful outbound message transaction against monthly quotas."""
        month_str = datetime.now(timezone.utc).strftime("%Y-%m")
        key = f"rl:quota:{tenant_id}:{month_str}"
        pipe = self.client.pipeline()
        pipe.incr(key)
        pipe.expire(key, 32 * 24 * 3600) # Expire after 32 days
        pipe.execute()

# Shared global rate limiter client
rate_limiter = RateLimiter()
