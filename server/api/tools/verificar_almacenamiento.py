from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

# Para poder correrlo como script sin instalar el paquete.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import storage  # noqa: E402  importacion posterior al codigo, intencional

OK = "[ OK ]"
FALLA = "[FALLA]"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--esperados", type=int, default=10,
                    help="numero de registros validos que se enviaron")
    args = ap.parse_args()

    fallas = 0
    with storage.conexion() as con:
        total = storage.contar_registros(con)
        rechazos = storage.contar_rechazos(con)
        por_fuente = storage.conteo_por_fuente(con)
        registros = storage.listar_registros(con, limite=1000)

        print("=" * 78)
        print("ACTIVIDAD 5  Conteo de registros almacenados")
        print("=" * 78)
        print(f"  Base de datos        : {storage.settings.db_path}")
        print(f"  Registros enviados   : {args.esperados}")
        print(f"  Registros almacenados: {total}")
        print(f"  Registros rechazados : {rechazos}")
        print(f"  Conteo por fuente    : {json.dumps(por_fuente, ensure_ascii=False)}")
        if total == args.esperados:
            print(f"  {OK} el conteo almacenado coincide con el enviado")
        else:
            print(f"  {FALLA} se esperaban {args.esperados} y hay {total}")
            fallas += 1

        print()
        print("=" * 78)
        print("ACTIVIDAD 6  Identificador de fuente y referencia temporal")
        print("=" * 78)

        sin_fuente = [r for r in registros if not r["source_id"]]
        sin_seq = [r for r in registros if r["seq"] is None]
        sin_ts = [r for r in registros if not r["ts"]]
        sin_recibido = [r for r in registros if not r["received_at"]]

        for etiqueta, faltantes in (
            ("todos conservan source_id", sin_fuente),
            ("todos conservan seq", sin_seq),
            ("todos conservan ts del dispositivo", sin_ts),
            ("todos conservan received_at del servidor", sin_recibido),
        ):
            if faltantes:
                print(f"  {FALLA} {etiqueta}: {len(faltantes)} sin el campo")
                fallas += 1
            else:
                print(f"  {OK} {etiqueta}")

        ts_invalidos = []
        for r in registros:
            try:
                datetime.fromisoformat(r["ts"])
            except ValueError:
                ts_invalidos.append(r["record_id"])
        if ts_invalidos:
            print(f"  {FALLA} ts no interpretable en record_id {ts_invalidos}")
            fallas += 1
        else:
            print(f"  {OK} todos los ts se interpretan como fecha ISO-8601")

        pares = [(r["source_id"], r["seq"]) for r in registros]
        if len(pares) != len(set(pares)):
            print(f"  {FALLA} hay pares source_id+seq repetidos")
            fallas += 1
        else:
            print(f"  {OK} el par source_id+seq es unico, no hay duplicados")

        print()
        print("  Primeros 3 registros almacenados")
        for r in registros[:3]:
            print(f"    record_id={r['record_id']}  source_id={r['source_id']}  "
                  f"seq={r['seq']}  ts={r['ts']}  metrics={json.dumps(r['metrics'], ensure_ascii=False)}")

        if rechazos:
            print()
            print("  Rechazos registrados")
            for x in storage.listar_rechazos(con, limite=10):
                print(f"    rechazo_id={x['rechazo_id']}  causa={x['causa'][:90]}")

    print()
    print("=" * 78)
    print("RESULTADO: TODAS LAS VERIFICACIONES PASAN" if fallas == 0
          else f"RESULTADO: {fallas} VERIFICACION(ES) FALLIDA(S)")
    print("=" * 78)
    return 0 if fallas == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
