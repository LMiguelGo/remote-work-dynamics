from contextlib import asynccontextmanager
from datetime import date, datetime

from fastapi import FastAPI

import cache_correlaciones
from catalogo import CATALOGO
from correlaciones import correlacionar_dimensiones, correlacionar_metricas
from db import cargar_muestras_dimensiones, cargar_muestras_metricas
from derivadas import TZ_LOCAL
from etl_procesador import iniciar_programador_etl


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = iniciar_programador_etl()
    yield
    scheduler.shutdown(wait=False)


# Solo lo consulta el backend desde la red interna, por eso no hay CORS: el navegador no llama a este servicio.
app = FastAPI(title="Analítica SPACE", lifespan=lifespan)


@app.get("/health")
def health():
    return {"estado": "ok"}


@app.get("/metricas/catalogo")
def catalogo_metricas():
    """Las 28 métricas con nombre, unidad, dirección, frecuencia, escala y franjas de criticidad. Cambia solo al desplegar una
    versión nueva, así que quien lo consulte puede guardarlo en memoria y volver a pedirlo cuando cambie `version`."""
    return CATALOGO


@app.post("/correlaciones/recalcular")
def recalcular_correlaciones():
    """Renueva la caché con los datos actuales de la DB. Se usa tras reprocesar historial con `etl.py` (otro proceso)
    o cuando se cargan datos fuera de los cierres; los cierres normales ya la renuevan solos."""
    return cache_correlaciones.recalcular()


@app.get("/correlaciones/metricas")
def correlaciones_metricas(desde: date | None = None, hasta: date | None = None,
                           usuario_id: int | None = None):
    """Sin `desde` ni `hasta` devuelve lo precalculado en el último cierre; con ellos calcula en el momento."""
    if desde or hasta:
        filas = correlacionar_metricas(cargar_muestras_metricas(desde, hasta, usuario_id))
        return {"calculado_en": datetime.now(TZ_LOCAL).isoformat(timespec="seconds"), "correlaciones": filas}
    return cache_correlaciones.obtener("metricas", usuario_id)


@app.get("/correlaciones/dimensiones")
def correlaciones_dimensiones(desde: date | None = None, hasta: date | None = None,
                              usuario_id: int | None = None):
    if desde or hasta:
        filas = correlacionar_dimensiones(cargar_muestras_dimensiones(desde, hasta, usuario_id))
        return {"calculado_en": datetime.now(TZ_LOCAL).isoformat(timespec="seconds"), "correlaciones": filas}
    return cache_correlaciones.obtener("dimensiones", usuario_id)
