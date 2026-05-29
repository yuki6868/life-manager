from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "Freelance AI Secretary"
    APP_ENV: str = "development"
    DATABASE_URL: str = "sqlite+aiosqlite:///./freelance_ai_secretary.db"
    FRONTEND_ORIGIN: str = "http://localhost:5173"

    class Config:
        env_file = ".env"


settings = Settings()