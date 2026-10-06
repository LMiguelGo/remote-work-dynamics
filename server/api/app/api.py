from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Annotated, Iterator

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app import service, storage
from app.config import settings
from app.schema import (SCHEMA_VERSION, Acuse, Estado, RegistroAlmacenado,
                        Registro, Resumen)

router = APIRouter()


def obtener_conexion() -> Iterator[sqlite3.Connection]:
    with storage.conexion() as con:
        yield con


def obtener_conexion_lectura() -> Iterator[sqlite3.Connection]:
    with storage.conexion_lectura() as con:
        yield con


Conexion = Annotated[sqlite3.Connection, Depends(obtener_conexion)]
Lectura = Annotated[sqlite3.Connection, Depends(obtener_conexion_lectura)]


@router.get(
    "/health",
    response_model=Estado,
    tags=["consulta"],
    summary="Estado del servicio y del almacenamiento",
    responses={
        200: {"description": "Servicio activo y base accesible"},
        503: {"description": "Servicio activo pero sin acceso al almacenamiento"},
    },
)
def health(response: Response) -> Estado:
    # No recibe la conexion por dependencia: si la base falla, la dependencia
    # revienta antes de entrar aqui y el endpoint devolveria 500 en vez de
    # informar. Abriendola por dentro puede reportar el fallo.
    accesible, registros = service.estado_almacenamiento()
    if not accesible:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return Estado(
        status="ok" if accesible else "sin_almacenamiento",
        schema_version=SCHEMA_VERSION,
        api_prefix=settings.api_prefix,
        almacenamiento_accesible=accesible,
        ruta_almacenamiento=str(settings.db_path),
        registros_almacenados=registros,
        tiempo_activo_s=service.tiempo_activo_s(),
        consultado_en=datetime.now(timezone.utc),
    )


@router.post(
    "/registros",
    response_model=Acuse,
    status_code=status.HTTP_201_CREATED,
    tags=["recepcion"],
    summary="Recibir un registro de telemetria",
    responses={
        201: {"description": "Registro almacenado o duplicado reconocido"},
        422: {"description": "Registro invalido, no se almacena y queda la traza"},
    },
)
def recibir_registro(registro: Registro, con: Conexion) -> Acuse:
    return service.recibir(con, registro)


@router.get(
    "/registros/conteo",
    tags=["consulta"],
    summary="Conteo de registros almacenados y rechazados",
)
def conteo(con: Lectura) -> dict:
    return service.resumen_conteo(con)


@router.get(
    "/registros/ultimo",
    response_model=RegistroAlmacenado,
    tags=["consulta"],
    summary="Ultimo registro almacenado",
    responses={404: {"description": "Todavia no hay registros"}},
)
def ultimo(con: Lectura) -> RegistroAlmacenado:
    # Ultimo por record_id, no por ts: el mas recientemente ingresado, que es
    # lo que pide la historia. Un dato retenido en un buffer puede llegar hoy
    # con la hora de ayer.
    fila = storage.ultimo_registro(con)
    if fila is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="todavia no hay registros almacenados",
        )
    return RegistroAlmacenado(**fila)


@router.get(
    "/registros/resumen",
    response_model=Resumen,
    tags=["consulta"],
    summary="Resumen agregado del conjunto de registros",
)
def resumen(con: Lectura) -> Resumen:
    return Resumen(**service.resumen(con))
