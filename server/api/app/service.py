from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timedelta, timezone

from app import storage
from app.config import settings
from app.schema import Acuse, Registro

log = logging.getLogger("backend.service")


def recibir(con: sqlite3.Connection, registro: Registro) -> Acuse:
    datos = registro.model_dump()
    # SQLite no tiene tipo fecha, se guarda como texto ISO.
    datos["ts"] = registro.ts.isoformat(timespec="seconds")

    _advertir_si_reloj_desfasado(registro)

    record_id, received_at, duplicado = storage.guardar_registro(con, datos)

    if duplicado:
        log.info(
            "duplicado_ignorado source_id=%s seq=%s record_id=%s",
            registro.source_id, registro.seq, record_id,
        )
    else:
        log.info(
            "registro_almacenado record_id=%s source_id=%s seq=%s ts=%s private_mode=%s",
            record_id, registro.source_id, registro.seq, datos["ts"], registro.private_mode,
        )

    return Acuse(
        ack=True,
        record_id=record_id,
        source_id=registro.source_id,
        seq=registro.seq,
        received_at=datetime.fromisoformat(received_at),
        duplicate=duplicado,
    )


def _advertir_si_reloj_desfasado(registro: Registro) -> None:
    # Advierte, no rechaza. Un dato viejo puede venir retenido del buffer.
    desfase = datetime.now(timezone.utc) - registro.ts
    limite = timedelta(hours=settings.max_desfase_horas)
    if abs(desfase) > limite:
        log.warning(
            "reloj_desfasado source_id=%s seq=%s ts=%s desfase_horas=%.1f",
            registro.source_id, registro.seq, registro.ts.isoformat(),
            desfase.total_seconds() / 3600,
        )


def resumen_conteo(con: sqlite3.Connection) -> dict:
    return {
        "registros_almacenados": storage.contar_registros(con),
        "registros_rechazados": storage.contar_rechazos(con),
        "por_fuente": storage.conteo_por_fuente(con),
    }
