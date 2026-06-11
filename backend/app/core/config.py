from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.paths import ensure_user_database, sqlite_url_from_path


class Settings(BaseSettings):
    APP_NAME: str = "Life Manager"
    APP_ENV: str = "development"
    DATABASE_URL: str | None = None
    FRONTEND_ORIGIN: str = "http://localhost:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
    )

    @property
    def database_url(self) -> str:
        # 旧 .env の既定値が残っていても、ユーザー領域保存を優先する。
        if self.DATABASE_URL and self.DATABASE_URL != "sqlite+aiosqlite:///./life_manager.db":
            return self.DATABASE_URL
        return sqlite_url_from_path(ensure_user_database())


settings = Settings()
