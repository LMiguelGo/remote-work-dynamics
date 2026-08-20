from __future__ import annotations

import sqlite3
from typing import Annotated, Iterator

from fastapi import APIRouter, Depends, status

from app import service, storage
from app.schema import Acuse, Registro

router = APIRouter()


def obtener_conexion() -> Iterator[sqlite3.Connection]:
    with storage.conexion() as con:
        yield con


Conexion = Annotated[sqlite3.Connection, Depends(obtener_conexion)]


@router.get("/health", tags=["operacion"], summary="Verificacion de vida")
def health(con: Conexion) -> dict:
    # Consulta la base a proposito, para que no responda ok si esta caida.
    storage.contar_registros(con)
    return {"status": "ok", "schema_version": "1.0"}


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
    tags=["verificacion"],
    summary="Conteo de registros almacenados y rechazados",
)
def conteo(con: Conexion) -> dict:
    return service.resumen_conteo(con)
