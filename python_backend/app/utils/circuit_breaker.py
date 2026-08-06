import os
import redis
import time

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

class CircuitBreaker:
    def __init__(self):
        self.client = redis.from_url(REDIS_URL, decode_responses=True)
        self.window_seconds = 60
        self.failure_threshold_pct = 20.0
        self.min_attempts = 10
        self.cooldown_seconds = 300 # 5 minutes pause

    def record_send_result(self, tenant_id: str, success: bool):
        """Record outbound message success/failure state in a sliding Redis window."""
        now = time.time()
        bucket = "success" if success else "failure"
        key = f"cb:window:{tenant_id}:{bucket}"
        
        # Add current timestamp to Redis Sorted Set
        self.client.zadd(key, {str(now): now})
        
        # Prune elements older than 60 seconds
        cutoff = now - self.window_seconds
        self.client.zremrangebyscore(key, 0, cutoff)

    def is_circuit_tripped(self, tenant_id: str) -> bool:
        """
        Check if the circuit breaker is tripped for the tenant.
        If failure rate exceeds 20% over last 60 seconds (min 10 attempts),
        trips the breaker for 5 minutes.
        """
        tripped_key = f"cb:tripped:{tenant_id}"
        
        # Check if already tripped
        if self.client.exists(tripped_key):
            return True
            
        # Prune old logs and fetch size
        now = time.time()
        cutoff = now - self.window_seconds
        
        success_key = f"cb:window:{tenant_id}:success"
        failure_key = f"cb:window:{tenant_id}:failure"
        
        self.client.zremrangebyscore(success_key, 0, cutoff)
        self.client.zremrangebyscore(failure_key, 0, cutoff)
        
        successes = self.client.zcard(success_key)
        failures = self.client.zcard(failure_key)
        total = successes + failures
        
        if total >= self.min_attempts:
            fail_rate = (failures / total) * 100
            if fail_rate > self.failure_threshold_pct:
                # Trip the circuit breaker
                self.client.setex(tripped_key, self.cooldown_seconds, "tripped")
                print(f"[Circuit Breaker] Tripped for tenant {tenant_id}. Rate: {fail_rate:.1f}%. Pausing sends.")
                return True
                
        return False

# Global circuit breaker instance
circuit_breaker = CircuitBreaker()
