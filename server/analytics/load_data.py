"""Carga los eventos sintéticos de generar_datos.py en la base del sistema completo (sistema_completo/server), ya sembrada
con `npm run seed` del backend. Ana (la que empeora) se asigna a empleado1 y Luis (estable) a empleado2; las fuentes que
falten (github, jira, sonarqube) se crean con identificador `<usuario>-<tipo>`.

Uso, con el sistema levantado:  python cargar_en_sistema.py
Es idempotente en los eventos: borra primero los eventos de esas fuentes entre el 2026-08-24 y el 2026-10-18."""
import subprocess
import sys

from generate_data import FUENTES, INICIO, SEMANAS, generar, sql_texto
from datetime import timedelta
import json

ASIGNACION = {1: "empleado1", 2: "empleado2"}  # usuario de generar_datos -> username del sistema
FIN = INICIO + timedelta(days=7 * SEMANAS)


def psql(sql: str) -> str:
    r = subprocess.run(["docker", "exec", "-i", "database", "psql", "-U", "postgres", "-d", "rwd_database",
                        "-v", "ON_ERROR_STOP=1", "-At", "-F", "|"],
                       input=sql, capture_output=True, text=True, encoding="utf-8")
    if r.returncode:
        sys.exit(f"psql falló:\n{r.stderr}")
    return r.stdout


def main():
    usuarios = {fila.split("|")[1]: int(fila.split("|")[0])
                for fila in psql("select id, username from users;").splitlines()}
    fuentes = {}  # (user_id, tipo) -> id de data_sources
    for fila in psql("select id, user_id, source_type from data_sources;").splitlines():
        i, u, t = fila.split("|")
        fuentes.setdefault((int(u), t), int(i))
    for username in ASIGNACION.values():
        for tipo in FUENTES:
            if (usuarios[username], tipo) not in fuentes:
                nuevo = psql(f"insert into data_sources (user_id, source_type, identifier, is_active) values "
                             f"({usuarios[username]}, '{tipo}', {sql_texto(username + '-' + tipo)}, true) returning id;")
                fuentes[(usuarios[username], tipo)] = int(nuevo.split()[0])
                print(f"fuente creada: {username}-{tipo} (id {nuevo.split()[0]})")

    # generar_datos numera las fuentes (usuario-1)*6 + posición + 1; se traduce al id real de cada una
    traduccion = {(u - 1) * len(FUENTES) + FUENTES.index(t) + 1: fuentes[(usuarios[username], t)]
                  for u, username in ASIGNACION.items() for t in FUENTES}
    ids = sorted(traduccion.values())
    lineas = [f"delete from events where source_id in ({','.join(map(str, ids))}) "
              f"and time >= '{INICIO} 00:00:00-05' and time < '{FIN} 00:00:00-05';"]
    eventos = generar()
    for hora, fid, tipo, payload in eventos:
        lineas.append(f"insert into events (time, source_id, event_type, payload) values "
                      f"('{hora:%Y-%m-%d %H:%M:%S}-05', {traduccion[fid]}, '{tipo}', {sql_texto(json.dumps(payload))}::jsonb);")
    psql("\n".join(lineas))
    print(f"{len(eventos)} eventos cargados para {', '.join(ASIGNACION.values())}.")


if __name__ == "__main__":
    main()
