"""Caché en memoria de las correlaciones. Solo cambian cuando un cierre guarda datos nuevos, así que se recalculan al
terminar `cierre_dia` y `cierre_ciclo` (ver `etl_procesador`) y las peticiones del backend solo leen el resultado.
Si el contenedor se reinicia, la caché se rellena sola con la primera consulta. Un resultado vacío (aún no hay datos) no se
guarda por esa vía, para no servir una caché vacía hasta el siguiente cierre. Tras reprocesar historial con `etl.py`, que
corre en otro proceso, `POST /correlaciones/recalcular` renueva la caché sin reiniciar el contenedor.
Si hay un LLM configurado (`llm_dimensiones`), cada recálculo redacta también la lectura de las dimensiones de cada persona. Tras
un arranque en frío la primera petición no espera al proveedor: responde enseguida y el texto del LLM se añade en segundo plano."""
from datetime import datetime
from threading import Lock, Thread

import llm_dimensiones
from conclusion_dimensiones import concluir_dimensiones
from correlaciones import correlacionar_dimensiones, correlacionar_metricas
from db import cargar_muestras_dimensiones, cargar_muestras_metricas
from derivadas import TZ_LOCAL

_calculo = Lock()  # una sola recalculación a la vez
_cache: dict = {}  # {"metricas": [...], "dimensiones": [...], "conclusiones": [...], "calculado_en": "ISO 8601"}


def _calcular(con_llm: bool = True) -> dict:
    muestras = cargar_muestras_dimensiones()
    dimensiones = correlacionar_dimensiones(muestras)
    conclusiones = concluir_dimensiones(dimensiones, muestras)
    return {
        "metricas": correlacionar_metricas(cargar_muestras_metricas()),
        "dimensiones": dimensiones,
        "conclusiones": llm_dimensiones.redactar(conclusiones) if con_llm else conclusiones,
        "calculado_en": datetime.now(TZ_LOCAL).isoformat(timespec="seconds"),
    }


def _interpretar_en_segundo_plano(datos: dict) -> None:
    """Añade el texto del LLM a la caché que acaba de rellenarse sin él. Si mientras tanto otro recálculo la reemplazó, no la pisa."""
    if not llm_dimensiones.hay_clave():
        return

    def tarea() -> None:
        nuevas = llm_dimensiones.redactar(datos["conclusiones"])
        if _cache is datos:
            _guardar({**datos, "conclusiones": nuevas})

    Thread(target=tarea, daemon=True, name="interpretar-dimensiones").start()


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
    """{"calculado_en", "correlaciones"} con las filas de `tipo` ("metricas" o "dimensiones"), de un usuario o de todos.
    Con "dimensiones" trae además `conclusiones`: la lectura de conjunto de esas correlaciones, una por usuario."""
    datos = _cache  # una sola lectura: si otro hilo recalcula, esta versión sigue completa
    if not datos:
        with _calculo:
            datos = _cache or _calcular(con_llm=False)
            if datos is not _cache and (datos["metricas"] or datos["dimensiones"]):  # sin datos todavía: no se guarda
                _guardar(datos)
                _interpretar_en_segundo_plano(datos)

    def de_usuario(filas: list) -> list:
        return filas if usuario_id is None else [f for f in filas if f["usuario_id"] == usuario_id]

    respuesta = {"calculado_en": datos["calculado_en"], "correlaciones": de_usuario(datos[tipo])}
    if tipo == "dimensiones":
        respuesta["conclusiones"] = de_usuario(datos["conclusiones"])
    return respuesta
