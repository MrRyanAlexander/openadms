"""Configuration. Every deployable value comes from the environment, and the
database is addressed through exactly one variable: DATABASE_URL."""
from __future__ import annotations

import os
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ---- Identity ---------------------------------------------------------
    app_name: str = "Open ADMS API"
    version: str = "1.0.0"
    environment: str = "development"

    # ---- Data -------------------------------------------------------------
    database_url: str = "postgresql://adms:adms@127.0.0.1:5432/openadms"
    db_pool_min: int = 1
    db_pool_max: int = 10
    db_command_timeout: float = 30.0

    # ---- Auth -------------------------------------------------------------
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = 60
    refresh_token_days: int = 30
    bcrypt_rounds: int = 12

    # ---- CORS -------------------------------------------------------------
    # Deliberately permissive by pattern rather than by list: the frontends are
    # deployed to dynamically generated preview URLs on Netlify.
    cors_origin_regex: str = (
        r"^https?://("
        r"localhost(:\d+)?|127\.0\.0\.1(:\d+)?|"
        r"[a-z0-9-]+\.netlify\.app|"
        r"[a-z0-9-]+\.netlify\.live|"
        r"[a-z0-9-]+\.up\.railway\.app|"
        r"[a-z0-9-]+\.onrender\.com|"
        r"[a-z0-9.-]+\.pages\.dev"
        r")$"
    )
    cors_allow_origins: str = ""

    # ---- Federation -------------------------------------------------------
    instance_key: str = ""
    peer_signature_skew_seconds: int = 300
    registry_url: str = ""

    # ---- Runtime ----------------------------------------------------------
    port: int = 8080
    log_level: str = "info"
    media_root: str = "./media"
    public_base_url: str = ""

    @property
    def asyncpg_dsn(self) -> str:
        """asyncpg wants postgresql://; normalize the other common spellings."""
        dsn = self.database_url
        for prefix in ("postgresql+asyncpg://", "postgres://"):
            if dsn.startswith(prefix):
                dsn = "postgresql://" + dsn[len(prefix):]
        return dsn.split("?")[0] if "sslmode=" in dsn else dsn

    @property
    def extra_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_allow_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
