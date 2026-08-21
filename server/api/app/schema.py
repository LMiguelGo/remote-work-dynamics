from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from pydantic import BaseModel, Field, field_validator, model_validator

SCHEMA_VERSION = "1.0"

# Fuentes aceptadas. Un tipo que no este aqui se rechaza.
SOURCE_TYPES = {
    "sensor_ambiental",   # BME280 via ESP32: temperatura, humedad, presion
    "dominio_laboral",    # dominio raiz por bloque de 15 min
    "entrega_sprint",     # story points hechos sobre comprometidos
    "conectividad_vpn",   # minutos de conexion neta por dia
}

# Solo las medidas crudas. Las derivadas se aceptan pero no se exigen.
# El sufijo de unidad en el nombre evita confundir hPa con Pa.
METRICAS_REQUERIDAS = {
    "sensor_ambiental": {"temperatura_c", "humedad_pct", "presion_hpa"},
    "dominio_laboral": {"dominio_raiz", "segundos"},
    "entrega_sprint": {"sprint_id", "story_points_done", "story_points_comprometidos"},
    "conectividad_vpn": {"minutos_conectividad_neta", "minutos_despues_8pm"},
}


class Registro(BaseModel):

    schema_version: str = Field(
        default=SCHEMA_VERSION,
        description="Version del contrato. Permite evolucionar sin romper lo almacenado.",
    )
    source_id: str = Field(
        min_length=1,
        max_length=64,
        description="Identificador de la fuente o dispositivo. Exigido por HU-CAP-04.",
    )
    source_type: str = Field(
        description="Tipo de fuente. Determina que metricas trae el registro.",
    )
    employee_id: str | None = Field(
        default=None,
        max_length=64,
        description="Empleado al que pertenece el dato. Necesario para HU-BAK-05 y HU-ETI-03.",
    )
    seq: int = Field(
        ge=1,
        description="Numero de muestra consecutivo por fuente. Referencia temporal de HU-CAP-04.",
    )
    ts: datetime = Field(
        description="Instante de captura en el dispositivo, ISO-8601 con zona horaria.",
    )
    private_mode: bool = Field(
        default=False,
        description="Verdadero si el empleado tenia la captura en pausa. HU-ETI-02, HU-ANA-09.",
    )
    metrics: Dict[str, Any] = Field(
        description="Medidas del registro. Las llaves dependen del source_type.",
    )

    @field_validator("source_type")
    @classmethod
    def source_type_conocido(cls, v: str) -> str:
        if v not in SOURCE_TYPES:
            raise ValueError(
                f"source_type '{v}' no reconocido. Valores validos: {sorted(SOURCE_TYPES)}"
            )
        return v

    @field_validator("ts")
    @classmethod
    def ts_con_zona_horaria(cls, v: datetime) -> datetime:
        # Sin tzinfo quedan horas locales y UTC mezcladas en la misma columna.
        if v.tzinfo is None:
            raise ValueError("ts debe incluir zona horaria, por ejemplo 2026-08-18T14:32:05Z")
        return v.astimezone(timezone.utc)

    @field_validator("metrics")
    @classmethod
    def metrics_no_vacio(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        if not v:
            raise ValueError("metrics no puede estar vacio")
        # Solo escalares, para que la analitica no tenga que aplanar nada.
        for clave, valor in v.items():
            if not isinstance(valor, (int, float, bool, str)) or isinstance(valor, bytes):
                raise ValueError(f"metrics['{clave}'] debe ser un valor simple, no {type(valor).__name__}")
        return v

    @model_validator(mode="after")
    def metricas_del_tipo_completas(self) -> "Registro":
        requeridas = METRICAS_REQUERIDAS.get(self.source_type, set())
        faltantes = requeridas - self.metrics.keys()
        if faltantes:
            raise ValueError(
                f"metrics de '{self.source_type}' requiere {sorted(requeridas)}, "
                f"faltan {sorted(faltantes)}"
            )
        return self


class Acuse(BaseModel):

    ack: bool
    record_id: int
    source_id: str
    seq: int
    received_at: datetime
    duplicate: bool = False
