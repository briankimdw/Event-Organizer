from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Anchor to this file so it works no matter where uvicorn is started from.
        env_file=Path(__file__).parent / ".env",
        extra="ignore",
    )

    supabase_url: str
    # Publishable/anon key (not service_role): the backend acts *as the user*,
    # so Row-Level Security still decides what each request can see.
    supabase_key: str
    supabase_jwt_secret: str | None = None
    cors_origins: list[str] = ["http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
