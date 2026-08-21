from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Ruta de backend/, para no depender del directorio actual.
RAIZ = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):

    model_config = SettingsConfigDict(
        env_prefix="BACKEND_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Almacenamiento
    db_path: Path = RAIZ / "datos" / "telemetria.db"
    sqlite_busy_timeout_ms: int = 5000

    # Servicio
    api_prefix: str = "/v1"
    log_level: str = "INFO"

    # Margen de tolerancia del reloj del dispositivo.
    max_desfase_horas: int = 48


settings = Settings()
