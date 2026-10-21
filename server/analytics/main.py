import os
from contextlib import asynccontextmanager
from datetime import date

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from correlaciones import correlacionar_dimensiones, correlacionar_metricas
from db import cargar_muestras_dimensiones, cargar_muestras_metricas
from etl_procesador import iniciar_programador_etl


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = iniciar_programador_etl()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="Analítica SPACE", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"estado": "ok"}


@app.get("/correlaciones/metricas")
def correlaciones_metricas(desde: date | None = None, hasta: date | None = None,
                           usuario_id: int | None = None):
    return correlacionar_metricas(cargar_muestras_metricas(desde, hasta, usuario_id))


@app.get("/correlaciones/dimensiones")
def correlaciones_dimensiones(desde: date | None = None, hasta: date | None = None,
                              usuario_id: int | None = None):
    return correlacionar_dimensiones(cargar_muestras_dimensiones(desde, hasta, usuario_id))
