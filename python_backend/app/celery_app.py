"""
Celery application configuration.

Uses Redis as both the message broker and result backend.
Celery workers run in separate processes from the FastAPI server,
allowing broadcast tasks to survive server restarts.
"""

import os
from celery import Celery

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "broadcast_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

celery_app.conf.update(
    # Serialization
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],

    # Timezone
    timezone="UTC",
    enable_utc=True,

    # Worker settings — optimized for 8-16GB RAM machines
    worker_concurrency=4,                    # 4 concurrent task threads
    worker_max_memory_per_child=200_000,     # Restart worker after 200MB (prevents leaks)
    worker_prefetch_multiplier=1,            # Don't hog tasks — take one at a time

    # Task retry defaults
    task_acks_late=True,                     # Acknowledge after task completes (crash-safe)
    task_reject_on_worker_lost=True,         # Requeue task if worker crashes

    # Result settings
    result_expires=3600,                     # Results expire after 1 hour

    # Celery Beat schedule for automated 24h frequency cap retries
    beat_schedule={
        "auto-retry-frequency-capped-every-30m": {
            "task": "app.tasks.broadcast_task.auto_retry_frequency_capped_recipients",
            "schedule": 1800.0,  # Run every 30 minutes
        },
    },
)

# Explicitly import tasks so they are registered with Celery
import app.tasks.broadcast_task  # noqa: F401

