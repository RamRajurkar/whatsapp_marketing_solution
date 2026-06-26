from datetime import datetime, timedelta

_cache = {
    "settings": None,
    "expires_at": None
}

_reply_templates = {}

async def get_bot_settings(db):
    """
    Get bot settings from memory cache if valid,
    otherwise fetch from MongoDB and cache for 5 minutes.
    """
    global _cache
    now = datetime.utcnow()
    
    # Return from cache if valid
    if _cache["settings"] is not None and _cache["expires_at"] is not None:
        if now < _cache["expires_at"]:
            return _cache["settings"]
            
    # Otherwise fetch from DB and cache for 5 minutes
    settings = await db.bot_settings.find_one({})
    
    _cache["settings"] = settings
    _cache["expires_at"] = now + timedelta(minutes=5)
    return settings

def invalidate_cache():
    """
    Invalidate the bot settings cache immediately.
    Call this when settings are updated via API.
    """
    global _cache, _reply_templates
    _cache["settings"] = None
    _cache["expires_at"] = None
    _reply_templates.clear()

def get_greeting_payload(phone_number: str, welcome_text: str, buttons: list) -> dict:
    global _reply_templates
    
    if "greeting" not in _reply_templates:
        # Build the interactive button payload template once
        _reply_templates["greeting"] = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "type": "interactive",
            "interactive": {
                "type": "button",
                "body": {"text": welcome_text},
                "action": {
                    "buttons": [{"type": "reply", "reply": {"id": b["id"], "title": b["title"]}} for b in buttons]
                }
            }
        }
        
    # Copy the template and update the "to" field
    payload = _reply_templates["greeting"].copy()
    payload["to"] = phone_number
    return payload
