import uvicorn
import os
from app.config import settings

if __name__ == "__main__":
    # Use reload only in development (set DEV_MODE=1 in .env)
    is_dev = os.getenv("DEV_MODE", "0") == "1"

    uvicorn.run(
        "app.main:socket_app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=is_dev,
        # Note: Socket.IO requires a single worker for sticky sessions.
        # Scaling is handled by the separate Celery worker for heavy tasks.
        workers=1,
    )
