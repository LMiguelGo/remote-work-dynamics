"""Carga datos sintéticos de demostración (8 semanas de eventos de dos personas) y deja calculados los resultados.

Ana (la que empeora) se asigna a empleado1 y Luis (estable) a empleado2, usuarios que crea `npm run seed` del backend, que
debe haberse ejecutado antes. Las fuentes que falten (github, jira, sonarqube) se crean con identificador `<usuario>-<tipo>`.

Se ejecuta dentro del contenedor de analítica, que ya llega a la DB por la red interna:
    docker compose exec -e ALLOW_DEMO_DATA=1 analytics python load_data.py

Pasos: 1) carga los eventos (borra antes los de esas fuentes entre el 2026-08-24 y el 2026-10-18, así que repetirlo no
duplica), 2) reprocesa ese rango (`etl.rellenar`, que llena metric_analyses y dimension_analyses) y 3) pide a la API
renovar la caché de correlaciones (`POST /correlaciones/recalcular`; el reprocesado corre en otro proceso y no se la avisa).

Solo para entornos de prueba: inserta eventos inventados, por eso exige `ALLOW_DEMO_DATA=1`."""
import json
import os
import sys
import urllib.request
from datetime import timedelta

from sqlalchemy import text

from db import get_engine
from etl import rellenar
from generate_data import FUENTES, INICIO, SEMANAS, generar

ASIGNACION = {1: "empleado1", 2: "empleado2"}  # usuario de generate_data -> username del sistema
FIN = INICIO + timedelta(days=7 * SEMANAS)  # lunes siguiente a la última semana
ANALYTICS_URL = os.getenv("ANALYTICS_URL", "http://localhost:8000")


def cargar_eventos(conn) -> int:
    usuarios = dict(conn.execute(text("select username, id from users")).all())
    faltan = [u for u in ASIGNACION.values() if u not in usuarios]
    if faltan:
        sys.exit(f"Faltan los usuarios {', '.join(faltan)}: ejecuta primero el seed del backend (npm run seed).")

    fuentes = {}  # (user_id, tipo) -> id de data_sources
    for i, u, t in conn.execute(text("select id, user_id, source_type from data_sources")).all():
        fuentes.setdefault((u, t), i)
    for username in ASIGNACION.values():
        for tipo in FUENTES:
            if (usuarios[username], tipo) not in fuentes:
                nuevo = conn.execute(
                    text("insert into data_sources (user_id, source_type, identifier, is_active) "
                         "values (:u, :t, :ident, true) returning id"),
                    {"u": usuarios[username], "t": tipo, "ident": f"{username}-{tipo}"}).scalar_one()
                fuentes[(usuarios[username], tipo)] = nuevo
                print(f"fuente creada: {username}-{tipo} (id {nuevo})")

    # generate_data numera las fuentes (usuario-1)*6 + posición + 1; se traduce al id real de cada una
    traduccion = {(u - 1) * len(FUENTES) + FUENTES.index(t) + 1: fuentes[(usuarios[username], t)]
                  for u, username in ASIGNACION.items() for t in FUENTES}
    conn.execute(text("delete from events where source_id = any(:ids) and time >= :desde and time < :hasta"),
                 {"ids": sorted(traduccion.values()), "desde": f"{INICIO} 00:00:00-05", "hasta": f"{FIN} 00:00:00-05"})

    eventos = generar()
    conn.execute(
        text("insert into events (time, source_id, event_type, payload) "
             "values (cast(:hora as timestamptz), :fuente, :tipo, cast(:payload as jsonb))"),
        [{"hora": f"{hora:%Y-%m-%d %H:%M:%S}-05", "fuente": traduccion[fid], "tipo": tipo, "payload": json.dumps(payload)}
         for hora, fid, tipo, payload in eventos])
    return len(eventos)


def recalcular_correlaciones() -> None:
    peticion = urllib.request.Request(f"{ANALYTICS_URL}/correlaciones/recalcular", method="POST")
    try:
        with urllib.request.urlopen(peticion, timeout=120) as r:
            print(f"Correlaciones recalculadas (HTTP {r.status}).")
    except OSError as e:
        print(f"No se pudo avisar a la API ({e}). Cuando esté arriba: POST {ANALYTICS_URL}/correlaciones/recalcular")


def main():
    if os.getenv("ALLOW_DEMO_DATA") != "1":
        sys.exit("Este script inserta eventos inventados. Si es un entorno de prueba, ejecútalo con ALLOW_DEMO_DATA=1.")
    with get_engine().begin() as conn:  # una sola transacción: si algo falla, no queda nada a medias
        n = cargar_eventos(conn)
    print(f"{n} eventos cargados para {', '.join(ASIGNACION.values())}.")
    rellenar(INICIO, FIN - timedelta(days=1))
    print(f"Resultados calculados del {INICIO} al {FIN - timedelta(days=1)}.")
    recalcular_correlaciones()


if __name__ == "__main__":
    main()
