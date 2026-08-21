from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.api import obtener_conexion
from app.main import app

# Registro base. Cada prueba cambia solo el campo que le interesa.
BASE = {
    "schema_version": "1.0",
    "source_id": "bme280-test",
    "source_type": "sensor_ambiental",
    "employee_id": "emp-001",
    "seq": 1,
    "ts": "2026-08-19T09:00:00Z",
    "private_mode": False,
    "metrics": {"temperatura_c": 24.1, "humedad_pct": 45.0, "presion_hpa": 1013.25},
}


@pytest.fixture()
def cliente(tmp_path, monkeypatch):
    db = tmp_path / "prueba.db"
    monkeypatch.setattr(storage.settings, "db_path", db)
    storage.inicializar(db)

    def conexion_de_prueba():
        with storage.conexion(db) as con:
            yield con

    app.dependency_overrides[obtener_conexion] = conexion_de_prueba
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def registro(**cambios):
    return {**BASE, **cambios}


# --- Criterio 1: el endpoint acepta un registro y responde con confirmacion ---

def test_acepta_registro_valido_y_confirma(cliente):
    r = cliente.post("/v1/registros", json=registro())
    assert r.status_code == 201
    cuerpo = r.json()
    assert cuerpo["ack"] is True
    assert cuerpo["duplicate"] is False
    assert cuerpo["source_id"] == "bme280-test"
    assert cuerpo["seq"] == 1
    assert cuerpo["record_id"] >= 1
    assert cuerpo["received_at"]


def test_health_responde(cliente):
    r = cliente.get("/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# --- Criterio 2: se conserva identificador de fuente y referencia temporal ---

def test_conserva_fuente_y_referencia_temporal(cliente, tmp_path):
    cliente.post("/v1/registros", json=registro(seq=7))
    with storage.conexion(storage.settings.db_path) as con:
        fila = storage.listar_registros(con)[0]
    assert fila["source_id"] == "bme280-test"
    assert fila["seq"] == 7
    assert fila["ts"].startswith("2026-08-19T09:00:00")
    assert fila["received_at"]
    assert fila["metrics"]["temperatura_c"] == 24.1


def test_normaliza_ts_a_utc(cliente):
    # Entra hora de Bogota, debe quedar almacenada en UTC.
    cliente.post("/v1/registros", json=registro(seq=8, ts="2026-08-19T04:00:00-05:00"))
    with storage.conexion(storage.settings.db_path) as con:
        fila = storage.listar_registros(con)[0]
    assert fila["ts"].startswith("2026-08-19T09:00:00")


# --- Criterio 3: el conteo almacenado coincide con el enviado ---

def test_conteo_coincide_con_lo_enviado(cliente):
    for i in range(1, 11):
        assert cliente.post("/v1/registros", json=registro(seq=i)).status_code == 201
    r = cliente.get("/v1/registros/conteo")
    assert r.json()["registros_almacenados"] == 10
    assert r.json()["por_fuente"] == {"bme280-test": 10}


# --- Criterio 4: el servicio sobrevive a registros invalidos ---

@pytest.mark.parametrize(
    "payload,motivo",
    [
        ({k: v for k, v in BASE.items() if k != "source_id"}, "sin source_id"),
        ({**BASE, "ts": "19/08/2026 10:00"}, "ts invalido"),
        ({**BASE, "source_type": "video_facial"}, "metrica descartada en la reunion"),
        ({**BASE, "seq": 0}, "seq menor que 1"),
        ({**BASE, "metrics": {}}, "metrics vacio"),
        ({**BASE, "metrics": {"lista": [1, 2, 3]}}, "metric no escalar"),
        ({**BASE, "metrics": {"temperatura_c": 24.1, "humedad_pct": 45.0}},
         "sensor ambiental sin presion"),
        ({**BASE, "source_type": "dominio_laboral", "source_id": "aw-watcher-web",
          "metrics": {"url": "https://github.com/org/repo?token=abc", "segundos": 300}},
         "URL completa en vez de dominio raiz"),
    ],
)
def test_rechaza_registro_invalido(cliente, payload, motivo):
    r = cliente.post("/v1/registros", json=payload)
    assert r.status_code == 422, motivo
    assert r.json()["ack"] is False
    assert r.json()["causas"]


def test_el_servicio_sigue_vivo_tras_un_rechazo(cliente):
    cliente.post("/v1/registros", json=registro(seq=0))
    r = cliente.post("/v1/registros", json=registro(seq=1))
    assert r.status_code == 201


def test_los_rechazos_quedan_registrados(cliente):
    cliente.post("/v1/registros", json=registro(seq=0))
    r = cliente.get("/v1/registros/conteo")
    assert r.json()["registros_rechazados"] == 1
    assert r.json()["registros_almacenados"] == 0


# --- Idempotencia: base para el buffer local de HU-INF-04 ---

def test_reenvio_no_duplica(cliente):
    primera = cliente.post("/v1/registros", json=registro(seq=3)).json()
    segunda = cliente.post("/v1/registros", json=registro(seq=3)).json()
    assert primera["duplicate"] is False
    assert segunda["duplicate"] is True
    assert segunda["record_id"] == primera["record_id"]
    assert cliente.get("/v1/registros/conteo").json()["registros_almacenados"] == 1


def test_mismo_seq_de_otra_fuente_no_es_duplicado(cliente):
    # La unicidad es del par (source_id, seq), no del seq solo.
    a = cliente.post("/v1/registros", json=registro(seq=1, source_id="bme280-A")).json()
    b = cliente.post("/v1/registros", json=registro(seq=1, source_id="bme280-B")).json()
    assert b["duplicate"] is False
    assert a["record_id"] != b["record_id"]
    assert cliente.get("/v1/registros/conteo").json()["registros_almacenados"] == 2


# --- Contrato con historias posteriores ---

def test_private_mode_se_conserva(cliente):
    # Se guarda aunque hoy nadie lo use.
    cliente.post("/v1/registros", json=registro(seq=5, private_mode=True))
    with storage.conexion(storage.settings.db_path) as con:
        assert storage.listar_registros(con)[0]["private_mode"] is True


def test_acepta_las_cuatro_metricas_aprobadas(cliente):
    # Las cuatro fuentes con sus llaves obligatorias.
    fuentes = [
        ("sensor_ambiental", "bme280-zona-A",
         {"temperatura_c": 22.4, "humedad_pct": 51.0, "presion_hpa": 1012.8}),
        ("dominio_laboral", "aw-watcher-web",
         {"dominio_raiz": "github.com", "segundos": 600}),
        ("entrega_sprint", "jira-board-42",
         {"sprint_id": "SPR-001", "story_points_done": 29,
          "story_points_comprometidos": 34, "tasa_entrega": 0.853}),
        ("conectividad_vpn", "vpn-corporativa",
         {"minutos_conectividad_neta": 468, "minutos_despues_8pm": 45,
          "bandera_horas_sobretiempo": True}),
    ]
    for i, (tipo, fuente, metricas) in enumerate(fuentes, start=20):
        r = cliente.post("/v1/registros", json=registro(
            seq=i, source_type=tipo, source_id=fuente, metrics=metricas))
        assert r.status_code == 201, tipo
    assert cliente.get("/v1/registros/conteo").json()["registros_almacenados"] == len(fuentes)
