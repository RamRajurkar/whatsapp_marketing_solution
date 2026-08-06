def classify_meta_error(error_code: int) -> dict:
    """
    Classify Meta Graph API error codes to govern campaign dispatch retries.
    
    Returns:
        dict: {
            "action": "fail" | "retry_short" | "retry_medium" | "retry_long",
            "retry_delay": int (seconds),
            "is_permanent": bool,
            "message": str
        }
    """
    code = int(error_code)
    
    # 1. Permanent failures (no retry)
    if code == 131047:
        return {
            "action": "fail",
            "retry_delay": 0,
            "is_permanent": True,
            "message": "Invalid/unregistered phone number"
        }
    elif code == 131026:
        return {
            "action": "fail",
            "retry_delay": 0,
            "is_permanent": True,
            "message": "Recipient has opted out of WhatsApp messages"
        }
    elif 131000 <= code <= 132999 and code not in (131049, 131057):
        return {
            "action": "fail",
            "retry_delay": 0,
            "is_permanent": True,
            "message": f"Template parameter or structure error (Code #{code})"
        }
        
    # 2. Long delay retries (frequency capping)
    elif code == 131049:
        return {
            "action": "retry_long",
            "retry_delay": 24 * 3600, # Retry after 24 hours
            "is_permanent": False,
            "message": "Frequency capping limit reached for customer across businesses"
        }
        
    # 3. Short delay retries (throughput / rate limit)
    elif code == 130429:
        return {
            "action": "retry_short",
            "retry_delay": 15, # Retry in 15 seconds
            "is_permanent": False,
            "message": "WhatsApp Cloud API throughput limit exceeded (throttling)"
        }
        
    # 4. Medium delay retries (temporary update states)
    elif code == 131057:
        return {
            "action": "retry_medium",
            "retry_delay": 60, # Retry in 60 seconds
            "is_permanent": False,
            "message": "Phone number is undergoing tier/quality updates"
        }
        
    # 5. Fallback for unrecognized codes (transient with short delay, capped attempts)
    else:
        return {
            "action": "retry_short",
            "retry_delay": 15,
            "is_permanent": False,
            "message": f"Unrecognized Meta API error code: {code}. Retrying transiently."
        }
