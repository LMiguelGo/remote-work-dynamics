from __future__ import annotations

import argparse
import json
import random
from datetime import datetime, timedelta, timezone

import requests

API = "http://127.0.0.1:8000/v1"

# Lista blanca. Lo que no este aqui llega como "otros_no_laboral".
DOMINIOS_LABORALES = ["github.com", "stackoverflow.com", "atlassian.net",
                      "google.com", "otros_no_laboral"]


def construir_registro(seq: int, base: datetime, private: bool = False) -> dict:
    tipo = ["sensor_ambiental", "dominio_laboral", "entrega_sprint",
            "conectividad_vpn"][(seq - 1) % 4]

    if tipo == "sensor_ambiental":
        # Rangos del BME280. La presion en hPa.
        temperatura = round(random.uniform(19.5, 27.5), 1)
        # La alerta se dispara fuera de la banda de confort.
        alerta = temperatura > 27.0 or temperatura < 20.0
        fuente, empleado = "bme280-zona-A", None
        ts = base + timedelta(seconds=2 * (seq - 1))
        metricas = {
            "temperatura_c": temperatura,
            "humedad_pct": round(random.uniform(35.0, 65.0), 1),
            "presion_hpa": round(random.uniform(1008.0, 1020.0), 2),
            "alerta_generada": alerta,
            "notificacion_recomendacion_realizada": alerta,
            "numero_de_notificacion_recomendacion_realizada": 1 if alerta else 0,
            "%de_productividad": round(random.uniform(60.0, 95.0), 1),
        }
    elif tipo == "dominio_laboral":
        # Bloques de 15 min sobre el dominio auditado, sin URL completa.
        dentro = random.randint(1, 15)
        fuente, empleado = "aw-watcher-web", "emp-001"
        ts = base + timedelta(minutes=15 * (seq - 1))
        metricas = {
            "dominio_laboral_auditado": random.choice(DOMINIOS_LABORALES),
            "minutos_dentro_del_dominio_laboral_auditado": dentro,
            "minutos_de_distraccion": 15 - dentro,
            "%de_productividad": round(100 * dentro / 15, 1),
        }
    elif tipo == "entrega_sprint":
        # Un registro por sprint, a nivel de equipo.
        comprometidos = random.choice([21, 34, 55])
        hechos = random.randint(int(comprometidos * 0.6), comprometidos)
        fuente, empleado = "jira-board-42", None
        ts = base + timedelta(days=14 * (seq - 1))
        metricas = {
            "sprint_id": f"SPR-{seq:03d}",
            "story_points_done": hechos,
            "story_points_comprometidos": comprometidos,
            "%tasa_de_entrega": round(100 * hechos / comprometidos, 1),
            "%de_productividad": round(100 * hechos / comprometidos, 1),
        }
    else:
        # Agregado diario, ya descontada la inactividad de red.
        despues_8pm = random.choice([0, 0, 15, 45, 90])
        neta = random.randint(380, 540)
        fuente, empleado = "vpn-corporativa", "emp-001"
        ts = base + timedelta(days=seq - 1)
        metricas = {
            "minutos_conectividad_neta": neta,
            "minutos_despues_8pm": despues_8pm,
            "bandera_horas_sobretiempo": despues_8pm > 0,
            # 480 min = jornada de 8 h.
            "%de_productividad": round(min(100.0, 100 * neta / 480), 1),
        }

    return {
        "schema_version": "1.0",
        "source_id": fuente,
        "source_type": tipo,
        "employee_id": empleado,
        "seq": seq,
        "ts": ts.isoformat(timespec="seconds"),
        "private_mode": private,
        "metrics": metricas,
    }


# Juego completo de metricas ambientales, para que cada caso invalido falle por
# una sola razon y no por metricas incompletas de paso.
AMBIENTAL_OK = {
    "temperatura_c": 22.0,
    "humedad_pct": 50.0,
    "presion_hpa": 1013.2,
    "alerta_generada": False,
    "notificacion_recomendacion_realizada": False,
    "numero_de_notificacion_recomendacion_realizada": 0,
    "%de_productividad": 80.0,
}

# Un caso por regla. Los seq van desde 90 para no chocar con los validos.
REGISTROS_INVALIDOS = [
    ({"schema_version": "1.0", "source_type": "sensor_ambiental", "seq": 90,
      "ts": "2026-08-19T10:00:00Z", "metrics": dict(AMBIENTAL_OK)},
     "sin source_id"),
    ({"schema_version": "1.0", "source_id": "bme280-zona-A", "source_type": "sensor_ambiental",
      "seq": 91, "ts": "19/08/2026 10:00", "metrics": dict(AMBIENTAL_OK)},
     "ts con formato invalido"),
    ({"schema_version": "1.0", "source_id": "webcam-01", "source_type": "video_facial",
      "seq": 92, "ts": "2026-08-19T10:00:00Z", "metrics": {"atencion": 0.8}},
     "metrica descartada en la reunion"),
    ({"schema_version": "1.0", "source_id": "bme280-zona-A", "source_type": "sensor_ambiental",
      "seq": 0, "ts": "2026-08-19T10:00:00Z", "metrics": dict(AMBIENTAL_OK)},
     "seq menor que 1"),
    ({"schema_version": "1.0", "source_id": "bme280-zona-A", "source_type": "sensor_ambiental",
      "seq": 93, "ts": "2026-08-19T10:00:00Z", "metrics": {}},
     "metrics vacio"),
    ({"schema_version": "1.0", "source_id": "bme280-zona-A", "source_type": "sensor_ambiental",
      "seq": 94, "ts": "2026-08-19T10:00:00Z",
      "metrics": {k: v for k, v in AMBIENTAL_OK.items() if k != "presion_hpa"}},
     "sensor ambiental sin presion"),
    ({"schema_version": "1.0", "source_id": "bme280-zona-A", "source_type": "sensor_ambiental",
      "seq": 96, "ts": "2026-08-19T10:00:00Z",
      "metrics": {k: v for k, v in AMBIENTAL_OK.items() if k != "%de_productividad"}},
     "sensor ambiental sin %de_productividad"),
    ({"schema_version": "1.0", "source_id": "aw-watcher-web", "source_type": "dominio_laboral",
      "seq": 95, "ts": "2026-08-19T10:00:00Z",
      "metrics": {"url": "https://github.com/org/repo/pull/12?token=abc",
                  "minutos_dentro_del_dominio_laboral_auditado": 5,
                  "minutos_de_distraccion": 10, "%de_productividad": 33.3}},
     "URL completa en vez de dominio auditado"),
]


def enviar(payload: dict) -> tuple[int, dict]:
    r = requests.post(f"{API}/registros", json=payload, timeout=5)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, {"raw": r.text}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=10, help="numero de registros validos")
    ap.add_argument("--invalidos", action="store_true", help="enviar tambien registros invalidos")
    ap.add_argument("--duplicados", action="store_true", help="reenviar los 3 primeros registros")
    args = ap.parse_args()

    # Semilla fija para obtener siempre los mismos valores.
    random.seed(20260818)
    base = datetime(2026, 8, 19, 9, 0, 0, tzinfo=timezone.utc)

    print("=" * 78)
    print(f"Enviando {args.n} registros validos a {API}/registros")
    print("=" * 78)

    enviados = []
    aceptados = 0
    for seq in range(1, args.n + 1):
        payload = construir_registro(seq, base)
        enviados.append(payload)
        code, resp = enviar(payload)
        if code == 201 and resp.get("ack"):
            aceptados += 1
            print(f"  seq={seq:<3} HTTP {code}  ack=True  record_id={resp['record_id']:<4} "
                  f"duplicate={resp['duplicate']}")
        else:
            print(f"  seq={seq:<3} HTTP {code}  {json.dumps(resp, ensure_ascii=False)}")

    rechazados = 0
    if args.invalidos:
        print()
        print("=" * 78)
        print("Enviando registros invalidos, deben ser rechazados sin tumbar el servicio")
        print("=" * 78)
        for payload, motivo in REGISTROS_INVALIDOS:
            code, resp = enviar(payload)
            ok = code == 422 and resp.get("ack") is False
            rechazados += 1 if ok else 0
            print(f"  {motivo:<28} HTTP {code}  {'RECHAZADO OK' if ok else 'REVISAR'}")
            if ok:
                print(f"     causa -> {resp.get('causas')}")

    duplicados_ok = 0
    if args.duplicados:
        print()
        print("=" * 78)
        print("Reenviando los 3 primeros registros, simula el buffer de HU-INF-04")
        print("=" * 78)
        for payload in enviados[:3]:
            code, resp = enviar(payload)
            if resp.get("duplicate"):
                duplicados_ok += 1
            print(f"  seq={payload['seq']:<3} HTTP {code}  duplicate={resp.get('duplicate')}  "
                  f"record_id={resp.get('record_id')}")

    print()
    print("-" * 78)
    print(f"Validos aceptados : {aceptados}/{args.n}")
    if args.invalidos:
        print(f"Invalidos rechazados: {rechazados}/{len(REGISTROS_INVALIDOS)}")
    if args.duplicados:
        print(f"Duplicados detectados: {duplicados_ok}/3")
    print("-" * 78)

    # TODO manda dos GET al mismo endpoint, arreglar en HU-BAK-02.
    code, resp = requests.get(f"{API}/registros/conteo", timeout=5).status_code, \
        requests.get(f"{API}/registros/conteo", timeout=5).json()
    print(f"GET /registros/conteo  HTTP {code}")
    print(json.dumps(resp, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
