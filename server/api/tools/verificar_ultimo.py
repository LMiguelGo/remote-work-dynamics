from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests

# Para poder correrlo como script sin instalar el paquete.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import storage  # noqa: E402  importacion posterior al codigo, intencional

API = "http://127.0.0.1:8000/v1"

OK = "[ OK ]"
FALLA = "[FALLA]"

FUENTE = "bme280-zona-A"


def registro_de_control(seq: int) -> dict:
    # Marcado con la hora real de ejecucion para distinguirlo de los que
    # dejo la actividad 4, que usan fechas fijas.
    return {
        "schema_version": "1.0",
        "source_id": FUENTE,
        "source_type": "sensor_ambiental",
        "employee_id": None,
        "seq": seq,
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "private_mode": False,
        "metrics": {
            "temperatura_c": 23.7,
            "humedad_pct": 48.0,
            "presion_hpa": 1014.5,
            "alerta_generada": False,
            "notificacion_recomendacion_realizada": False,
            "numero_de_notificacion_recomendacion_realizada": 0,
            "%de_productividad": 88.8,
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sin-envio", action="store_true",
                    help="solo comparar contra la base, sin ingresar un registro nuevo")
    args = ap.parse_args()

    fallas = 0

    print("=" * 78)
    print("ACTIVIDAD 6  El ultimo registro devuelto es el mas reciente ingresado")
    print("=" * 78)

    previo = requests.get(f"{API}/registros/ultimo", timeout=5)
    if previo.status_code == 404:
        print("  Antes del envio  : la base no tiene registros todavia")
        antes = None
    else:
        antes = previo.json()
        print(f"  Antes del envio  : record_id={antes['record_id']}  "
              f"source_id={antes['source_id']}  seq={antes['seq']}")

    if args.sin_envio:
        enviado = None
    else:
        with storage.conexion_lectura() as con:
            siguiente = storage.ultimo_seq(con, FUENTE) + 1
        cuerpo = registro_de_control(siguiente)
        respuesta = requests.post(f"{API}/registros", json=cuerpo, timeout=5)
        if respuesta.status_code != 201:
            print(f"  {FALLA} el registro de control no fue aceptado: "
                  f"HTTP {respuesta.status_code} {respuesta.text[:200]}")
            return 1
        enviado = respuesta.json()
        print(f"  Registro enviado : record_id={enviado['record_id']}  "
              f"seq={enviado['seq']}  ts={cuerpo['ts']}")

    ahora = requests.get(f"{API}/registros/ultimo", timeout=5)
    if ahora.status_code != 200:
        print(f"  {FALLA} el endpoint no devolvio el ultimo registro: HTTP {ahora.status_code}")
        return 1
    ultimo = ahora.json()
    print(f"  Devuelto por API : record_id={ultimo['record_id']}  "
          f"source_id={ultimo['source_id']}  seq={ultimo['seq']}")

    print()
    if enviado is not None:
        for etiqueta, esperado, obtenido in (
            ("el record_id coincide con el del registro enviado",
             enviado["record_id"], ultimo["record_id"]),
            ("el source_id coincide", enviado["source_id"], ultimo["source_id"]),
            ("el seq coincide", enviado["seq"], ultimo["seq"]),
        ):
            if esperado == obtenido:
                print(f"  {OK} {etiqueta}")
            else:
                print(f"  {FALLA} {etiqueta}: se esperaba {esperado} y llego {obtenido}")
                fallas += 1

        if antes is not None and ultimo["record_id"] == antes["record_id"]:
            print(f"  {FALLA} el ultimo no cambio despues de ingresar un registro nuevo")
            fallas += 1
        else:
            print(f"  {OK} el ultimo cambio al ingresar un registro nuevo")

    # Contraste contra la base, sin pasar por la API.
    with storage.conexion_lectura() as con:
        fila = con.execute(
            "SELECT record_id, source_id, seq FROM registros "
            "ORDER BY record_id DESC LIMIT 1"
        ).fetchone()
    if fila is None:
        print(f"  {FALLA} la base no tiene registros")
        fallas += 1
    elif fila["record_id"] == ultimo["record_id"]:
        print(f"  {OK} coincide con el record_id mayor de la tabla registros "
              f"({fila['record_id']})")
    else:
        print(f"  {FALLA} la tabla tiene como maximo {fila['record_id']} y la API "
              f"devolvio {ultimo['record_id']}")
        fallas += 1

    print()
    print("  El endpoint de consulta no puede escribir")
    with storage.conexion_lectura() as con:
        try:
            con.execute("DELETE FROM registros")
            print(f"  {FALLA} la conexion de consulta acepto un DELETE")
            fallas += 1
        except sqlite3.OperationalError as e:
            print(f"  {OK} DELETE rechazado por el motor -> {e}")

    print()
    print("  Ultimo registro completo")
    print(json.dumps(ultimo, ensure_ascii=False, indent=4))

    print()
    print("=" * 78)
    print("RESULTADO: EL ULTIMO REGISTRO ES EL MAS RECIENTE INGRESADO" if fallas == 0
          else f"RESULTADO: {fallas} VERIFICACION(ES) FALLIDA(S)")
    print("=" * 78)
    return 0 if fallas == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
