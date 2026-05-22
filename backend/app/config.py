from pydantic_settings import BaseSettings


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
    FRONTEND_URL: str = "http://localhost"
    BACKEND_URL: str = "http://localhost/api"
    UPLOAD_DIR: str = "/app/uploads"
    MAX_UPLOAD_SIZE_MB: int = 10
    PAYMENT_SIMULATE: bool = True

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
