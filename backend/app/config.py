from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    MYSQL_URL: str
    MONGODB_URL: str
    MONGODB_DB_NAME: str = "zoomcar_docs"

    REDIS_URL: str

    SECRET_KEY: str
    ALGORITHM: str = "HS256"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    SMTP_HOST: str
    SMTP_PORT: int = 587
    SMTP_USER: str
    SMTP_PASSWORD: str
    SMTP_FROM: str
    SMTP_FROM_NAME: str = "SigFleet"
    SMTP_USE_TLS: bool = True

    FRONTEND_URL: str = "http://localhost"
    BACKEND_URL: str = "http://localhost/api"

    UPLOAD_DIR: str = "uploads"

    MAX_UPLOAD_SIZE_MB: int = 10
    PAYMENT_SIMULATE: bool = True
    CHAUFFEUR_FEE_PER_DAY: int = 800
    MINOR_DAMAGE_FEE: int = 2000
    MAJOR_DAMAGE_FEE: int = 10000
    TOTAL_LOSS_FEE: int = 50000
    GEMINI_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""
    GROQ_API_KEY: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
