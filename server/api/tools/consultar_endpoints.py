from __future__ import annotations

import argparse
import json

import requests

API = "http://127.0.0.1:8000/v1"

OK = "[ OK ]"
FALLA = "[FALLA]"

# Los cuatro de solo lectura. /registros queda fuera a proposito: ese es el de
# escritura de HU-BAK-01.
ENDPOINTS = [
    ("/health", "Estado del servicio y del almacenamiento"),
    ("/registros/ultimo", "Ultimo registro almacenado"),
    ("/registros/resumen", "Resumen agregado del conjunto"),
    ("/registros/conteo", "Conteo de almacenados y rechazados"),
]

METODOS_DE_ESCRITURA = ["post", "put", "patch", "delete"]


def consultar(ruta: str) -> tuple[int, object]:
    r = requests.get(f"{API}{ruta}", timeout=5)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, {"raw": r.text}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sin-escritura", action="store_true",
                    help="omitir la comprobacion de que no aceptan escritura")
    args = ap.parse_args()

    fallas = 0

    print("=" * 78)
    print("ACTIVIDAD 5  Consulta de los endpoints desde un cliente externo")
    print(f"             {API}")
    print("=" * 78)

    for ruta, descripcion in ENDPOINTS:
        codigo, cuerpo = consultar(ruta)
        esperado = 200
        marca = OK if codigo == esperado else FALLA
        if codigo != esperado:
            fallas += 1
        print()
        print(f"  GET {ruta}")
        print(f"      {descripcion}")
        print(f"      {marca} HTTP {codigo}")
        print(json.dumps(cuerpo, ensure_ascii=False, indent=6))

    if not args.sin_escritura:
        print()
        print("=" * 78)
        print("             Los endpoints de consulta no aceptan escritura")
        print("=" * 78)
        for ruta, _ in ENDPOINTS:
            resultados = []
            for metodo in METODOS_DE_ESCRITURA:
                r = requests.request(metodo, f"{API}{ruta}", timeout=5)
                resultados.append(f"{metodo.upper()}={r.status_code}")
                if r.status_code != 405:
                    fallas += 1
            correcto = all(x.endswith("=405") for x in resultados)
            print(f"  {OK if correcto else FALLA} {ruta:<22} {'  '.join(resultados)}")
        print()
        print("  405 Method Not Allowed: la ruta existe pero solo esta declarada"
              " para GET.")

    print()
    print("=" * 78)
    print("RESULTADO: LOS ENDPOINTS DE CONSULTA RESPONDEN" if fallas == 0
          else f"RESULTADO: {fallas} COMPROBACION(ES) FALLIDA(S)")
    print("=" * 78)
    return 0 if fallas == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
