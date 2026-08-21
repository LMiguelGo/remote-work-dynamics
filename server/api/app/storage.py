from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator, Optional

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


@contextmanager
def conexion(db_path: Path | str | None = None) -> Iterator[sqlite3.Connection]:
    ruta = Path(db_path) if db_path else settings.db_path
    con = _abrir(ruta)
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
