from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    MYSQL_URL: str
    MONGODB_URL: str
    MONGODB_DB_NAME: str = "zoomcar_docs"

    # Redis is optional — rate limiting and caching degrade gracefully when absent
    REDIS_URL: str = ""

    SECRET_KEY: str
    ALGORITHM: str = "HS256"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""
    SMTP_FROM_NAME: str = "SigFleet"
    SMTP_USE_TLS: bool = True

    FRONTEND_URL: str = "http://localhost"
    BACKEND_URL: str = "http://localhost/api"
    CORS_ORIGINS: str = ""
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"

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

    @field_validator("MYSQL_URL", mode="before")
    @classmethod
    def normalize_mysql_url(cls, value: str) -> str:
        if not isinstance(value, str):
            return value
        normalized = value.strip()
        # Normalise driver prefix
        if normalized.startswith("mysql://"):
            normalized = normalized.replace("mysql://", "mysql+aiomysql://", 1)
        # Aiven uses ?ssl-mode=REQUIRED; SQLAlchemy wants ?ssl=true
        normalized = normalized.replace("ssl-mode=REQUIRED", "ssl=true")
        normalized = normalized.replace("ssl-mode=required", "ssl=true")
        return normalized

    @property
    def cors_origins(self) -> list[str]:
        values = [
            self.FRONTEND_URL,
            "http://localhost",
            "http://localhost:3000",
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:5175",
            "http://localhost:5176",
            "http://localhost:5177",
            "http://localhost:8000",
        ]
        values.extend(origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip())
        return list(dict.fromkeys(value.rstrip("/") for value in values if value))

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
