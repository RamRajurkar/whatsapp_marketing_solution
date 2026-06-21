import os
import socketio

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Use Redis as the Socket.IO message manager so that events emitted from
# Celery workers (separate processes) are delivered to connected clients.
mgr = socketio.AsyncRedisManager(REDIS_URL)

sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    client_manager=mgr,
)

@sio.on('join:conversation')
async def on_join_conversation(sid, conversation_id):
    sio.enter_room(sid, conversation_id)

@sio.on('leave:conversation')
async def on_leave_conversation(sid, conversation_id):
    sio.leave_room(sid, conversation_id)

# Broadcast progress rooms
@sio.on('join:broadcasts')
async def on_join_broadcasts(sid, data=None):
    sio.enter_room(sid, 'broadcasts')

@sio.on('leave:broadcasts')
async def on_leave_broadcasts(sid, data=None):
    sio.leave_room(sid, 'broadcasts')
