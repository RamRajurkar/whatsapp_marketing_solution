from pydantic_settings import BaseSettings
from typing import Optional
import warnings

class Settings(BaseSettings):
    APP_MODE: str = "self_hosted"
    MONGODB_URI: str = "mongodb://localhost:27017"
    DB_NAME: str = "resto_chat"
    JWT_SECRET: str = "your-super-secret-jwt-key"
    PORT: int = 5000

    # WhatsApp Meta API
    WA_PHONE_NUMBER_ID: Optional[str] = None
    WA_BUSINESS_ACCOUNT_ID: Optional[str] = None
    WA_ACCESS_TOKEN: Optional[str] = None
    WA_VERIFY_TOKEN: Optional[str] = None
    # App secret from Meta Developer Portal — used to verify webhook signatures
    WA_APP_SECRET: Optional[str] = None
    WA_APP_ID: Optional[str] = None
    WA_API_VERSION: str = "v21.0"

    # Cloudinary
    CLOUDINARY_CLOUD_NAME: Optional[str] = None
    CLOUDINARY_API_KEY: Optional[str] = None
    CLOUDINARY_API_SECRET: Optional[str] = None

    # Supabase (missed-message catchup queue)
    SUPABASE_URL: str = ""
    SUPABASE_ANON_KEY: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()

# Warn at startup if JWT_SECRET is still the insecure default
if settings.JWT_SECRET == "your-super-secret-jwt-key":
    warnings.warn(
        "⚠️  JWT_SECRET is using the insecure default value. "
        "Set a strong random secret in your .env file before going to production!",
        stacklevel=2
    )
