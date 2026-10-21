import os
from datetime import date, datetime
from functools import lru_cache

from sqlalchemy import (JSON, BigInteger, Boolean, Column, Date, DateTime, Enum, Integer, MetaData, Numeric, String, Table,
                        create_engine, insert, select)
from sqlalchemy.engine import URL

from derivadas import TZ_LOCAL, Evento
from etl_procesador import METRICA_DIMENSION, RATING_SONAR_NUMERICO, consolidar_dimension

# El esquema lo crea el contenedor de DB (ver rwd_database.png); aquí solo se describen las tablas para leer/escribir.
# Los nombres de columnas de la DB están en inglés; los diccionarios que circulan por el resto del contenedor
# conservan las claves en español (usuario_id, valor_crudo, ...) y se traducen solo aquí.
metadata = MetaData()

# Valores de los enums de la DB (criticality, space_dimension). Clave: valor interno -> valor en la DB.
# POR CONFIRMAR con el contenedor de DB: hoy se asume el mismo texto que usa el código.
ENUM_CRITICIDAD = {"optimo": "optimo", "precaucion": "precaucion", "critico": "critico"}
ENUM_DIMENSION = {d: d for d in ("S", "P", "A", "C", "E")}
FRECUENCIA_DB = {"daily": "day", "weekly": "week"}  # dimension_analyses.frequency es varchar: day, week, month
_criticidad = Enum(*ENUM_CRITICIDAD.values(), name="criticality", create_type=False)
_dimension = Enum(*ENUM_DIMENSION.values(), name="space_dimension", create_type=False)

dimension_analyses = Table(
    "dimension_analyses", metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", Integer),
    Column("dimension", _dimension),
    Column("start_date", Date),
    Column("end_date", Date),
    Column("normalized_score", Numeric(4, 2, asdecimal=False)),  # 0-10
    Column("criticality_status", _criticidad),
    Column("calculated_at", DateTime),
    # Frecuencia de las métricas que promedia la fila: "day" (diarias; el rango es un día o, al cierre de semana,
    # [lunes, domingo] con el promedio semanal de las diarias) o "week" (métricas semanales y por sprint).
    # Internamente el código usa "daily" / "weekly" (FRECUENCIA_DB las traduce); la DB admite también "month".
    Column("frequency", String),
)

metric_analyses = Table(
    "metric_analyses", metadata,
    Column("id", Integer, primary_key=True),
    Column("dimension_analysis_id", Integer),
    Column("user_id", Integer),
    Column("start_date", Date),
    Column("end_date", Date),
    Column("metric_name", String),
    Column("raw_value", Numeric(asdecimal=False)),
    Column("normalized_value", Numeric(4, 2, asdecimal=False)),  # 0-10
    Column("criticality", _criticidad),
)

# Origen: cada evento llega de una fuente (data_sources) que pertenece a un usuario.
data_sources = Table(
    "data_sources", metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", Integer),
    Column("source_type", String),  # enum source_type en la DB; se lee como texto
    Column("identifier", String),
    Column("is_active", Boolean),
)

events = Table(
    "events", metadata,
    Column("id", BigInteger, primary_key=True),
    Column("time", DateTime(timezone=True)),  # TIMESTAMPTZ en el esquema real
    Column("source_id", Integer),
    Column("event_type", String),
    Column("payload", JSON),  # jsonb en PostgreSQL
)


@lru_cache(maxsize=1)
def get_engine():
    return create_engine(url_conexion(), pool_pre_ping=True)


def url_conexion():
    """Dirección de la base. Si no hay `DATABASE_URL`, se arma con las mismas variables que usa el resto del
    proyecto: POSTGRES_HOST (por defecto `database`), POSTGRES_PORT, POSTGRES_USER, POSTGRES_PASSWORD y POSTGRES_DB.
    Así la contraseña puede llevar cualquier carácter sin escribirlo codificado."""
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    return URL.create(
        "postgresql+psycopg2",
        username=os.environ.get("POSTGRES_USER", "postgres"),
        password=os.environ.get("POSTGRES_PASSWORD", "postgres_password"),
        host=os.environ.get("POSTGRES_HOST", "database"),
        port=int(os.environ.get("POSTGRES_PORT", "5432")),
        database=os.environ.get("POSTGRES_DB", "rwd_database"),
    )


def guardar_analisis(usuario_id: int, dimension: str, fecha_inicio: date, fecha_fin: date,
                     metricas: list[dict], previas: list[dict] | None = None, frecuencia: str = "daily") -> int:
    """Guarda una dimensión y sus métricas (salida de procesar_metrica) en una sola transacción.
    Cada métrica puede traer su propio periodo (`fecha_inicio`, `fecha_fin`); si no, hereda el de la dimensión.
    `previas` son métricas ya guardadas (con `valor_normalizado`) que cuentan en el puntaje de la dimensión
    pero no se vuelven a insertar: las métricas diarias que resume la fila semanal de frecuencia "daily"."""
    resumen = consolidar_dimension(metricas + (previas or []))
    with get_engine().begin() as conn:
        dimension_id = conn.execute(insert(dimension_analyses).values(
            user_id=usuario_id,
            dimension=ENUM_DIMENSION[dimension],
            start_date=fecha_inicio,
            end_date=fecha_fin,
            normalized_score=resumen["puntaje_normalizado"],
            criticality_status=ENUM_CRITICIDAD[resumen["estado_criticidad"]],
            calculated_at=datetime.now(TZ_LOCAL),
            frequency=FRECUENCIA_DB[frecuencia],
        )).inserted_primary_key[0]

        if metricas:
            conn.execute(insert(metric_analyses), [
                {
                    "dimension_analysis_id": dimension_id,
                    "user_id": usuario_id,
                    "start_date": m.get("fecha_inicio", fecha_inicio),
                    "end_date": m.get("fecha_fin", fecha_fin),
                    "metric_name": m["metrica"],
                    "raw_value": (RATING_SONAR_NUMERICO.get(str(m["valor_crudo"]).upper(), 0.0)
                                  if isinstance(m["valor_crudo"], str) else m["valor_crudo"]),
                    "normalized_value": m["valor_normalizado"],
                    "criticality": ENUM_CRITICIDAD[m["criticidad"]],
                }
                for m in metricas
            ])
    return dimension_id


def puntajes_diarios(usuario_id: int, desde: date, hasta: date) -> dict[str, list[dict]]:
    """{dimension: [{"metrica", "valor_normalizado"}]} con el puntaje promedio de cada métrica diaria guardada
    entre `desde` y `hasta` (filas de un solo día). Cada métrica cuenta una vez, sin importar cuántos días tuvo datos."""
    stmt = select(metric_analyses.c.metric_name, metric_analyses.c.normalized_value).where(
        metric_analyses.c.user_id == usuario_id,
        metric_analyses.c.start_date >= desde,
        metric_analyses.c.end_date <= hasta,
        metric_analyses.c.start_date == metric_analyses.c.end_date,
    )
    por_metrica: dict[str, list[float]] = {}
    with get_engine().connect() as conn:
        for nombre, puntaje in conn.execute(stmt):
            por_metrica.setdefault(nombre, []).append(float(puntaje))
    por_dimension: dict[str, list[dict]] = {}
    for nombre, puntajes in por_metrica.items():
        por_dimension.setdefault(METRICA_DIMENSION[nombre], []).append(
            {"metrica": nombre, "valor_normalizado": sum(puntajes) / len(puntajes)})
    return por_dimension


def _filtrar(stmt, desde, hasta, usuario_id):
    if desde:
        stmt = stmt.where(dimension_analyses.c.start_date >= desde)
    if hasta:
        stmt = stmt.where(dimension_analyses.c.end_date <= hasta)
    if usuario_id:
        stmt = stmt.where(dimension_analyses.c.user_id == usuario_id)
    return stmt


def cargar_muestras_metricas(desde: date | None = None, hasta: date | None = None,
                             usuario_id: int | None = None) -> list[dict]:
    """Filas (usuario, periodo, métrica, valor_crudo) para correlacionar métricas."""
    stmt = select(
        metric_analyses.c.user_id.label("usuario_id"),
        metric_analyses.c.start_date.label("fecha_inicio"),
        metric_analyses.c.end_date.label("fecha_fin"),
        metric_analyses.c.metric_name.label("nombre_metrica"),
        metric_analyses.c.raw_value.label("valor_crudo"),
    )
    if desde:
        stmt = stmt.where(metric_analyses.c.start_date >= desde)
    if hasta:
        stmt = stmt.where(metric_analyses.c.end_date <= hasta)
    if usuario_id:
        stmt = stmt.where(metric_analyses.c.user_id == usuario_id)
    with get_engine().connect() as conn:
        return [dict(r._mapping) for r in conn.execute(stmt)]


def cargar_muestras_dimensiones(desde: date | None = None, hasta: date | None = None,
                                usuario_id: int | None = None) -> list[dict]:
    """Filas (usuario, periodo, dimensión, puntaje) para correlacionar dimensiones."""
    stmt = select(
        dimension_analyses.c.user_id.label("usuario_id"),
        dimension_analyses.c.start_date.label("fecha_inicio"),
        dimension_analyses.c.dimension,
        dimension_analyses.c.normalized_score.label("puntaje_normalizado"),
    ).where(dimension_analyses.c.start_date == dimension_analyses.c.end_date)  # solo filas diarias; las semanales son resumen
    inversa = {v: k for k, v in ENUM_DIMENSION.items()}
    with get_engine().connect() as conn:
        filas = [dict(r._mapping) for r in conn.execute(_filtrar(stmt, desde, hasta, usuario_id))]
    for f in filas:
        f["dimension"] = inversa.get(f["dimension"], f["dimension"])
    return filas


def existe_analisis(usuario_id: int, fecha_inicio: date, fecha_fin: date, frecuencia: str = "daily") -> bool:
    """True si el usuario ya tiene filas de dimensión para ese periodo y frecuencia (evita duplicar al repetir un cierre)."""
    stmt = select(dimension_analyses.c.id).where(
        dimension_analyses.c.user_id == usuario_id,
        dimension_analyses.c.frequency == FRECUENCIA_DB[frecuencia],
        dimension_analyses.c.start_date == fecha_inicio,
        dimension_analyses.c.end_date == fecha_fin,
    ).limit(1)
    with get_engine().connect() as conn:
        return conn.execute(stmt).first() is not None


def cargar_eventos(desde: datetime, hasta: datetime, usuario_id: int | None = None) -> dict[int, list[Evento]]:
    """Eventos con `desde <= time < hasta`, agrupados por usuario: {usuario_id: [Evento, ...]} en orden cronológico.
    El usuario sale de events.source_id -> data_sources.user_id. Sin `usuario_id` trae a todos.
    Para métricas que miran hacia atrás (tickets, PRs) el llamador debe pasar una ventana que incluya los eventos previos.
    `desde` y `hasta` sin zona son hora de Colombia. events.time es TIMESTAMPTZ: sin la zona explícita PostgreSQL los
    interpretaría en la zona de su sesión (normalmente UTC) y las ventanas diarias se correrían 5 horas."""
    desde = desde if desde.tzinfo else desde.replace(tzinfo=TZ_LOCAL)
    hasta = hasta if hasta.tzinfo else hasta.replace(tzinfo=TZ_LOCAL)
    stmt = select(
        data_sources.c.user_id, data_sources.c.source_type, events.c.event_type, events.c.time, events.c.payload,
    ).join(data_sources, events.c.source_id == data_sources.c.id
    ).where(events.c.time >= desde, events.c.time < hasta).order_by(events.c.time)
    if usuario_id:
        stmt = stmt.where(data_sources.c.user_id == usuario_id)
    por_usuario: dict[int, list[Evento]] = {}
    with get_engine().connect() as conn:
        for fila in conn.execute(stmt):
            por_usuario.setdefault(fila.user_id, []).append(
                Evento.desde_dict({"source_type": str(fila.source_type), "event_type": fila.event_type,
                                   "time": fila.time, "payload": fila.payload}))
    return por_usuario
