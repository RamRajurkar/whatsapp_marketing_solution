from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    MONGODB_URI: str = "mongodb://localhost:27017"
    DB_NAME: str = "resto_chat"
    JWT_SECRET: str = "your-super-secret-jwt-key"
    PORT: int = 5000
    
    # WhatsApp Meta API
    WA_PHONE_NUMBER_ID: Optional[str] = None
    WA_BUSINESS_ACCOUNT_ID: Optional[str] = None
    WA_ACCESS_TOKEN: Optional[str] = None
    WA_VERIFY_TOKEN: Optional[str] = None

    # Cloudinary
    CLOUDINARY_CLOUD_NAME: Optional[str] = None
    CLOUDINARY_API_KEY: Optional[str] = None
    CLOUDINARY_API_SECRET: Optional[str] = None

    class Config:
        env_file = ".env"

settings = Settings()
