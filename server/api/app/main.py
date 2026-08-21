from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app import storage
from app.api import router
from app.config import settings

logging.basicConfig(
    level=settings.log_level,
    format="%(asctime)s %(levelname)-8s %(name)-18s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("backend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    storage.inicializar()
    with storage.conexion() as con:
        n = storage.contar_registros(con)
    log.info("almacenamiento_listo ruta=%s registros_existentes=%d", settings.db_path, n)
    yield
    log.info("servicio_detenido")


app = FastAPI(
    title="Backend de monitoreo - Infraestructura Telematica",
    summary="HU-BAK-01: recepcion y almacenamiento de registros de telemetria.",
    version="1.0",
    lifespan=lifespan,
)


@app.exception_handler(RequestValidationError)
async def registro_invalido(request: Request, exc: RequestValidationError):
    causas = "; ".join(
        f"{'.'.join(str(p) for p in e['loc'][1:]) or 'cuerpo'}: {e['msg']}"
        for e in exc.errors()
    )
    # El cuerpo puede no ser ni JSON valido, por eso el try.
    try:
        cuerpo = await request.json()
    except Exception:
        cuerpo = {"_cuerpo_no_parseable": True}

    with storage.conexion() as con:
        rechazo_id = storage.registrar_rechazo(con, causas, cuerpo)

    log.warning("registro_rechazado rechazo_id=%s causas=%s", rechazo_id, causas)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={
            "ack": False,
            "error": "registro invalido",
            "rechazo_id": rechazo_id,
            "causas": causas,
        },
    )


app.include_router(router, prefix=settings.api_prefix)
