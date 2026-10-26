"""Caché en memoria de las correlaciones. Solo cambian cuando un cierre guarda datos nuevos, así que se recalculan al
terminar `cierre_dia` y `cierre_ciclo` (ver `etl_procesador`) y las peticiones del backend solo leen el resultado.
Si el contenedor se reinicia, la caché se rellena sola con la primera consulta. Un resultado vacío (aún no hay datos) no se
guarda por esa vía, para no servir una caché vacía hasta el siguiente cierre. Tras reprocesar historial con `etl.py`, que
corre en otro proceso, `POST /correlaciones/recalcular` renueva la caché sin reiniciar el contenedor."""
from datetime import datetime
from threading import Lock

from correlaciones import correlacionar_dimensiones, correlacionar_metricas
from db import cargar_muestras_dimensiones, cargar_muestras_metricas
from derivadas import TZ_LOCAL

_calculo = Lock()  # una sola recalculación a la vez
_cache: dict = {}  # {"metricas": [...], "dimensiones": [...], "calculado_en": "ISO 8601"}


def _calcular() -> dict:
    return {
        "metricas": correlacionar_metricas(cargar_muestras_metricas()),
        "dimensiones": correlacionar_dimensiones(cargar_muestras_dimensiones()),
        "calculado_en": datetime.now(TZ_LOCAL).isoformat(timespec="seconds"),
    }


def _guardar(nueva: dict) -> None:
    """Reemplaza la caché entera de una vez: quien esté leyendo conserva la versión anterior completa."""
    global _cache
    _cache = nueva


def recalcular() -> dict:
    """Calcula las correlaciones de todo el historial y reemplaza la caché, aunque el resultado esté vacío.
    Devuelve cuántas filas tiene cada tipo."""
    with _calculo:
        nueva = _calcular()
        _guardar(nueva)
    return {"calculado_en": nueva["calculado_en"], "metricas": len(nueva["metricas"]),
            "dimensiones": len(nueva["dimensiones"])}


def obtener(tipo: str, usuario_id: int | None = None) -> dict:
    """{"calculado_en", "correlaciones"} con las filas de `tipo` ("metricas" o "dimensiones"), de un usuario o de todos."""
    datos = _cache  # una sola lectura: si otro hilo recalcula, esta versión sigue completa
    if not datos:
        with _calculo:
            datos = _cache or _calcular()
            if datos is not _cache and (datos["metricas"] or datos["dimensiones"]):  # sin datos todavía: no se guarda
                _guardar(datos)
    filas = datos[tipo]
    if usuario_id is not None:
        filas = [f for f in filas if f["usuario_id"] == usuario_id]
    return {"calculado_en": datos["calculado_en"], "correlaciones": filas}
