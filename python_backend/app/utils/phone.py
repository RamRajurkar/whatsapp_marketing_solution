"""
Phone number normalization utility for Indian numbers.
Ensures all phone numbers are stored in the format: 91XXXXXXXXXX (12 digits)
"""
import re


def normalize_indian_phone(phone: str) -> str:
    """
    Normalize an Indian phone number to the format 91XXXXXXXXXX.
    
    Accepts:
      - 9876543210      → 919876543210
      - 09876543210     → 919876543210
      - 919876543210    → 919876543210
      - +919876543210   → 919876543210
      - +91 98765 43210 → 919876543210
      - 0091 9876543210 → 919876543210
    
    Returns the normalized 12-digit string (91 + 10 digits).
    Raises ValueError if the number cannot be normalized.
    """
    if not phone:
        raise ValueError("Phone number is required")
    
    # Remove all non-digit characters (+, spaces, dashes, parentheses)
    digits = re.sub(r'\D', '', phone)
    
    # Remove leading 00 (international dialing prefix)
    if digits.startswith('00'):
        digits = digits[2:]
    
    # If it starts with 91 and is 12 digits, it's already normalized
    if digits.startswith('91') and len(digits) == 12:
        return digits
    
    # If it starts with 0 and is 11 digits (domestic format like 09876543210)
    if digits.startswith('0') and len(digits) == 11:
        digits = digits[1:]  # Remove leading 0
    
    # If it's exactly 10 digits, prepend 91
    if len(digits) == 10:
        return f"91{digits}"
    
    # If it starts with 91 and has more/fewer digits, try to extract
    if digits.startswith('91') and len(digits) > 12:
        # Maybe extra digits, take first 12
        candidate = digits[:12]
        if len(candidate) == 12:
            return candidate
    
    # If nothing worked but we have 12 digits starting with 91
    if len(digits) == 12 and digits.startswith('91'):
        return digits
    
    raise ValueError(
        f"Invalid Indian phone number: '{phone}'. "
        "Please enter a 10-digit mobile number (e.g., 9876543210)"
    )


def format_display_phone(phone: str) -> str:
    """
    Format a normalized phone number for display.
    919876543210 → +91 98765 43210
    """
    digits = re.sub(r'\D', '', phone)
    if len(digits) == 12 and digits.startswith('91'):
        local = digits[2:]  # 10 digits
        return f"+91 {local[:5]} {local[5:]}"
    return f"+{digits}" if digits else phone
