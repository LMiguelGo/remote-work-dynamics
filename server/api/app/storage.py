from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional
from urllib.parse import quote

from app.config import settings

# ts es la hora del dispositivo y received_at la del servidor. No siempre
# coinciden. Se puede ejecutar varias veces sin romper nada.
ESQUEMA = """
CREATE TABLE IF NOT EXISTS registros (
    record_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    schema_version TEXT    NOT NULL,
    source_id      TEXT    NOT NULL,
    source_type    TEXT    NOT NULL,
    employee_id    TEXT,
    seq            INTEGER NOT NULL,
    ts             TEXT    NOT NULL,
    received_at    TEXT    NOT NULL,
    private_mode   INTEGER NOT NULL DEFAULT 0,
    metrics_json   TEXT    NOT NULL,
    UNIQUE (source_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_reg_empleado_ts ON registros (employee_id, ts);
CREATE INDEX IF NOT EXISTS idx_reg_ts          ON registros (ts);
CREATE INDEX IF NOT EXISTS idx_reg_tipo        ON registros (source_type);
CREATE INDEX IF NOT EXISTS idx_reg_recibido    ON registros (received_at);

CREATE TABLE IF NOT EXISTS rechazos (
    rechazo_id  INTEGER PRIMARY KEY AUTOINCREMENT,
    received_at TEXT NOT NULL,
    causa       TEXT NOT NULL,
    payload     TEXT NOT NULL
);
"""


def _abrir(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db_path, isolation_level=None)
    con.row_factory = sqlite3.Row
    # Sin WAL, escritor y lector se bloquean. Sin busy_timeout, tira
    # "database is locked" en vez de esperar.
    con.execute("PRAGMA journal_mode = WAL")
    con.execute("PRAGMA synchronous = NORMAL")
    con.execute(f"PRAGMA busy_timeout = {settings.sqlite_busy_timeout_ms}")
    con.execute("PRAGMA foreign_keys = ON")
    return con


def _esquema_presente(con: sqlite3.Connection) -> bool:
    return con.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'registros'"
    ).fetchone() is not None


@contextmanager
def conexion(db_path: Path | str | None = None) -> Iterator[sqlite3.Connection]:
    ruta = Path(db_path) if db_path else settings.db_path
    con = _abrir(ruta)
    # Cuando se borra datos/ con el servicio arriba, _abrir vuelve a crear el
    # archivo vacio y a partir de ahi toda escritura falla con "no such table".
    if not _esquema_presente(con):
        con.executescript(ESQUEMA)
    try:
        yield con
    except Exception:
        # Con isolation_level=None puede no haber transaccion abierta y el
        # rollback revienta con "no transaction is active".
        if con.in_transaction:
            con.rollback()
        raise
    finally:
        con.close()


@contextmanager
def conexion_lectura(db_path: Path | str | None = None) -> Iterator[sqlite3.Connection]:
    ruta = Path(db_path) if db_path else settings.db_path
    if not ruta.exists():
        raise FileNotFoundError(f"no existe la base {ruta}")
    # mode=ro lo impone el motor. Un INSERT por esta conexion no falla por
    # convencion, falla con "attempt to write a readonly database".
    con = sqlite3.connect(f"file:{quote(ruta.as_posix())}?mode=ro",
                          uri=True, isolation_level=None)
    con.row_factory = sqlite3.Row
    # journal_mode no se toca aqui: cambiarlo seria una escritura.
    con.execute(f"PRAGMA busy_timeout = {settings.sqlite_busy_timeout_ms}")
    try:
        yield con
    finally:
        con.close()


def inicializar(db_path: Path | str | None = None) -> None:
    with conexion(db_path) as con:
        con.executescript(ESQUEMA)


def ahora_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ----------------------------------------------------------------------------
# Escritura
# ----------------------------------------------------------------------------

def guardar_registro(con: sqlite3.Connection, datos: dict[str, Any]) -> tuple[int, str, bool]:
    # INSERT OR IGNORE y no SELECT previo: entre consultar e insertar quedaba
    # una ventana donde dos reenvios simultaneos alcanzaban a duplicar.
    received_at = ahora_utc()
    fila = (
        datos["schema_version"],
        datos["source_id"],
        datos["source_type"],
        datos.get("employee_id"),
        int(datos["seq"]),
        datos["ts"],
        received_at,
        1 if datos.get("private_mode") else 0,
        json.dumps(datos["metrics"], ensure_ascii=False, sort_keys=True),
    )
    cur = con.execute(
        """INSERT OR IGNORE INTO registros
           (schema_version, source_id, source_type, employee_id, seq,
            ts, received_at, private_mode, metrics_json)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        fila,
    )
    if cur.rowcount == 1:
        return cur.lastrowid, received_at, False

    # Ya existia, se devuelve el id original.
    existente = con.execute(
        "SELECT record_id, received_at FROM registros WHERE source_id = ? AND seq = ?",
        (datos["source_id"], int(datos["seq"])),
    ).fetchone()
    return existente["record_id"], existente["received_at"], True


def registrar_rechazo(con: sqlite3.Connection, causa: str, payload: Any) -> int:
    cur = con.execute(
        "INSERT INTO rechazos (received_at, causa, payload) VALUES (?,?,?)",
        (ahora_utc(), causa, json.dumps(payload, ensure_ascii=False, default=str)[:2000]),
    )
    return cur.lastrowid


# ----------------------------------------------------------------------------
# Lectura
# ----------------------------------------------------------------------------

def contar_registros(con: sqlite3.Connection) -> int:
    return con.execute("SELECT COUNT(*) AS n FROM registros").fetchone()["n"]


def contar_rechazos(con: sqlite3.Connection) -> int:
    return con.execute("SELECT COUNT(*) AS n FROM rechazos").fetchone()["n"]


def conteo_por_fuente(con: sqlite3.Connection) -> dict[str, int]:
    filas = con.execute(
        "SELECT source_id, COUNT(*) AS n FROM registros GROUP BY source_id ORDER BY source_id"
    ).fetchall()
    return {f["source_id"]: f["n"] for f in filas}


def listar_registros(con: sqlite3.Connection, limite: int = 100) -> list[dict]:
    filas = con.execute(
        "SELECT * FROM registros ORDER BY record_id LIMIT ?", (limite,)
    ).fetchall()
    return [fila_a_dict(f) for f in filas]


def listar_rechazos(con: sqlite3.Connection, limite: int = 100) -> list[dict]:
    filas = con.execute(
        "SELECT * FROM rechazos ORDER BY rechazo_id LIMIT ?", (limite,)
    ).fetchall()
    return [dict(f) for f in filas]


def ultimo_registro(con: sqlite3.Connection) -> Optional[dict]:
    fila = con.execute("SELECT * FROM registros ORDER BY record_id DESC LIMIT 1").fetchone()
    return fila_a_dict(fila) if fila else None


def fila_a_dict(fila: sqlite3.Row) -> dict:
    d = dict(fila)
    d["private_mode"] = bool(d["private_mode"])
    d["metrics"] = json.loads(d.pop("metrics_json"))
    return d


def ultimo_seq(con: sqlite3.Connection, source_id: str) -> int:
    fila = con.execute(
        "SELECT COALESCE(MAX(seq), 0) AS s FROM registros WHERE source_id = ?",
        (source_id,),
    ).fetchone()
    return fila["s"]


def resumen_global(con: sqlite3.Connection) -> dict:
    fila = con.execute(
        """SELECT COUNT(*)                       AS registros,
                  COUNT(DISTINCT source_id)      AS fuentes,
                  COUNT(DISTINCT employee_id)    AS empleados,
                  MIN(ts)                        AS primer_ts,
                  MAX(ts)                        AS ultimo_ts,
                  MIN(received_at)               AS primer_received_at,
                  MAX(received_at)               AS ultimo_received_at,
                  COALESCE(SUM(private_mode), 0) AS en_modo_privado
           FROM registros"""
    ).fetchone()
    return dict(fila)


def resumen_por_tipo(con: sqlite3.Connection) -> list[dict]:
    filas = con.execute(
        """SELECT source_type,
                  COUNT(*)                  AS registros,
                  COUNT(DISTINCT source_id) AS fuentes,
                  MIN(ts)                   AS primer_ts,
                  MAX(ts)                   AS ultimo_ts,
                  ROUND(AVG(json_extract(metrics_json, '$."%de_productividad"')), 1)
                                            AS productividad_media_pct
           FROM registros
           GROUP BY source_type
           ORDER BY source_type"""
    ).fetchall()
    return [dict(f) for f in filas]


def indicadores(con: sqlite3.Connection) -> dict:
    # json_extract lee dentro de metrics_json sin traer las filas a Python.
    # El CASE deja fuera las fuentes donde la metrica no aplica: AVG ignora
    # los NULL, asi que el promedio sale sobre las filas que si la traen.
    fila = con.execute(
        """SELECT ROUND(AVG(json_extract(metrics_json, '$."%de_productividad"')), 1)
                    AS productividad_media_pct,
                  COALESCE(SUM(CASE WHEN source_type = 'sensor_ambiental'
                       THEN json_extract(metrics_json, '$.alerta_generada') END), 0)
                    AS alertas_ambientales,
                  ROUND(AVG(CASE WHEN source_type = 'entrega_sprint'
                       THEN json_extract(metrics_json, '$."%tasa_de_entrega"') END), 1)
                    AS tasa_entrega_media_pct,
                  ROUND(AVG(CASE WHEN source_type = 'conectividad_vpn'
                       THEN json_extract(metrics_json, '$.minutos_conectividad_neta') END), 1)
                    AS conectividad_neta_media_min,
                  ROUND(AVG(CASE WHEN source_type = 'dominio_laboral'
                       THEN json_extract(metrics_json, '$.minutos_de_distraccion') END), 1)
                    AS distraccion_media_min
           FROM registros"""
    ).fetchone()
    return dict(fila)
