import socketio

sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')

@sio.on('join:conversation')
async def on_join_conversation(sid, conversation_id):
    sio.enter_room(sid, conversation_id)

@sio.on('leave:conversation')
async def on_leave_conversation(sid, conversation_id):
    sio.leave_room(sid, conversation_id)
