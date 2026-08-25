from __future__ import annotations

import sqlite3

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.api import obtener_conexion, obtener_conexion_lectura
from app.main import app

CONSULTA = ["/v1/health", "/v1/registros/ultimo", "/v1/registros/resumen",
            "/v1/registros/conteo"]

# Una fuente de cada tipo, con valores fijos para poder predecir los promedios.
FUENTES = {
    "sensor_ambiental": ("bme280-zona-A", {
        "temperatura_c": 28.0, "humedad_pct": 40.0, "presion_hpa": 1010.0,
        "alerta_generada": True,
        "notificacion_recomendacion_realizada": True,
        "numero_de_notificacion_recomendacion_realizada": 1,
        "%de_productividad": 80.0,
    }),
    "dominio_laboral": ("aw-watcher-web", {
        "dominio_laboral_auditado": "github.com",
        "minutos_dentro_del_dominio_laboral_auditado": 9,
        "minutos_de_distraccion": 6,
        "%de_productividad": 60.0,
    }),
    "entrega_sprint": ("jira-board-42", {
        "sprint_id": "SPR-001", "story_points_done": 27,
        "story_points_comprometidos": 30,
        "%tasa_de_entrega": 90.0, "%de_productividad": 90.0,
    }),
    "conectividad_vpn": ("vpn-corporativa", {
        "minutos_conectividad_neta": 480, "minutos_despues_8pm": 0,
        "%de_productividad": 100.0,
    }),
}


@pytest.fixture()
def cliente(tmp_path, monkeypatch):
    db = tmp_path / "consulta.db"
    monkeypatch.setattr(storage.settings, "db_path", db)
    storage.inicializar(db)

    def escritura():
        with storage.conexion(db) as con:
            yield con

    def lectura():
        with storage.conexion_lectura(db) as con:
            yield con

    app.dependency_overrides[obtener_conexion] = escritura
    app.dependency_overrides[obtener_conexion_lectura] = lectura
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def enviar(cliente, tipo, seq, ts="2026-08-22T09:00:00Z", **cambios):
    fuente, metricas = FUENTES[tipo]
    cuerpo = {
        "schema_version": "1.0", "source_id": fuente, "source_type": tipo,
        "employee_id": "emp-001", "seq": seq, "ts": ts,
        "private_mode": False, "metrics": dict(metricas),
    }
    cuerpo.update(cambios)
    return cliente.post("/v1/registros", json=cuerpo)


def cargar_las_cuatro(cliente):
    for i, tipo in enumerate(FUENTES, start=1):
        assert enviar(cliente, tipo, seq=i).status_code == 201


# --- Criterio 1: existe un endpoint que verifica que el servicio esta activo ---

def test_health_reporta_el_servicio_y_el_almacenamiento(cliente):
    r = cliente.get("/v1/health")
    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["status"] == "ok"
    assert cuerpo["almacenamiento_accesible"] is True
    assert cuerpo["registros_almacenados"] == 0
    assert cuerpo["api_prefix"] == "/v1"
    assert cuerpo["tiempo_activo_s"] >= 0


def test_health_refleja_los_registros_que_van_entrando(cliente):
    cargar_las_cuatro(cliente)
    assert cliente.get("/v1/health").json()["registros_almacenados"] == 4


def test_health_avisa_cuando_el_almacenamiento_no_responde(tmp_path, monkeypatch):
    monkeypatch.setattr(storage.settings, "db_path", tmp_path / "borrada.db")
    app.dependency_overrides.clear()
    # Sin el gestor de contexto no corre el lifespan, asi que la base no se
    # vuelve a crear y el endpoint se enfrenta a la ausencia real del archivo.
    r = TestClient(app).get("/v1/health")
    assert r.status_code == 503
    assert r.json()["status"] == "sin_almacenamiento"
    assert r.json()["almacenamiento_accesible"] is False
    assert r.json()["registros_almacenados"] is None


# --- Criterio 2: el ultimo registro corresponde al mas reciente ingresado ---

def test_ultimo_devuelve_el_que_acaba_de_entrar(cliente):
    cargar_las_cuatro(cliente)
    esperado = enviar(cliente, "dominio_laboral", seq=99).json()

    cuerpo = cliente.get("/v1/registros/ultimo").json()
    assert cuerpo["record_id"] == esperado["record_id"]
    assert cuerpo["source_id"] == "aw-watcher-web"
    assert cuerpo["seq"] == 99
    assert cuerpo["metrics"]["dominio_laboral_auditado"] == "github.com"
    assert cuerpo["received_at"]


def test_ultimo_es_el_ultimo_en_llegar_no_el_de_fecha_mayor(cliente):
    enviar(cliente, "sensor_ambiental", seq=1, ts="2026-08-22T09:00:00Z")
    # Dato viejo que llega despues, como el que reenvia el buffer de HU-INF-04.
    enviar(cliente, "sensor_ambiental", seq=2, ts="2026-08-01T06:00:00Z")

    cuerpo = cliente.get("/v1/registros/ultimo").json()
    assert cuerpo["seq"] == 2
    assert cuerpo["ts"].startswith("2026-08-01T06:00:00")


def test_un_reenvio_duplicado_no_desplaza_al_ultimo(cliente):
    enviar(cliente, "sensor_ambiental", seq=1)
    ultimo = enviar(cliente, "entrega_sprint", seq=2).json()
    enviar(cliente, "sensor_ambiental", seq=1)  # reenvio, ya estaba

    assert cliente.get("/v1/registros/ultimo").json()["record_id"] == ultimo["record_id"]


def test_ultimo_responde_404_con_la_base_vacia(cliente):
    r = cliente.get("/v1/registros/ultimo")
    assert r.status_code == 404
    assert "registros" in r.json()["detail"]


# --- Criterio 3: existe un endpoint con el resumen agregado ---

def test_resumen_totaliza_almacenados_y_rechazados(cliente):
    cargar_las_cuatro(cliente)
    enviar(cliente, "sensor_ambiental", seq=0)  # invalido, queda como rechazo

    totales = cliente.get("/v1/registros/resumen").json()["totales"]
    assert totales["registros"] == 4
    assert totales["rechazos"] == 1
    assert totales["fuentes"] == 4
    assert totales["empleados"] == 1
    assert totales["en_modo_privado"] == 0


def test_resumen_desglosa_las_cuatro_fuentes(cliente):
    cargar_las_cuatro(cliente)
    por_tipo = cliente.get("/v1/registros/resumen").json()["por_tipo_de_fuente"]
    assert [t["source_type"] for t in por_tipo] == sorted(FUENTES)
    assert all(t["registros"] == 1 and t["fuentes"] == 1 for t in por_tipo)


def test_resumen_promedia_las_metricas_aprobadas(cliente):
    cargar_las_cuatro(cliente)
    ind = cliente.get("/v1/registros/resumen").json()["indicadores"]
    assert ind["productividad_media_pct"] == 82.5   # (80 + 60 + 90 + 100) / 4
    assert ind["alertas_ambientales"] == 1
    assert ind["tasa_entrega_media_pct"] == 90.0
    assert ind["conectividad_neta_media_min"] == 480.0
    assert ind["distraccion_media_min"] == 6.0


def test_resumen_acota_el_rango_temporal(cliente):
    enviar(cliente, "sensor_ambiental", seq=1, ts="2026-08-20T08:00:00Z")
    enviar(cliente, "sensor_ambiental", seq=2, ts="2026-08-22T17:30:00Z")

    rango = cliente.get("/v1/registros/resumen").json()["rango_temporal"]
    assert rango["primer_ts"].startswith("2026-08-20T08:00:00")
    assert rango["ultimo_ts"].startswith("2026-08-22T17:30:00")
    assert rango["primer_received_at"] and rango["ultimo_received_at"]


def test_resumen_responde_con_la_base_vacia(cliente):
    # Sin datos tiene que dar ceros, no reventar ni devolver 404.
    cuerpo = cliente.get("/v1/registros/resumen").json()
    assert cuerpo["totales"]["registros"] == 0
    assert cuerpo["por_tipo_de_fuente"] == []
    assert cuerpo["rango_temporal"]["primer_ts"] is None
    assert cuerpo["indicadores"]["productividad_media_pct"] is None
    assert cuerpo["indicadores"]["alertas_ambientales"] == 0


# --- Criterio 4: ninguno de los endpoints permite escribir ni modificar ---

@pytest.mark.parametrize("ruta", CONSULTA)
@pytest.mark.parametrize("metodo", ["post", "put", "patch", "delete"])
def test_los_endpoints_de_consulta_no_aceptan_escritura(cliente, ruta, metodo):
    r = getattr(cliente, metodo)(ruta)
    assert r.status_code == 405, f"{metodo.upper()} {ruta}"


def test_la_conexion_de_consulta_no_puede_escribir_en_la_base(cliente):
    cargar_las_cuatro(cliente)
    # La garantia es del motor, no del codigo de la aplicacion.
    with storage.conexion_lectura(storage.settings.db_path) as con:
        for sentencia in (
            "DELETE FROM registros",
            "UPDATE registros SET source_id = 'otro'",
            "INSERT INTO rechazos (received_at, causa, payload) VALUES ('x','y','z')",
            "DROP TABLE registros",
        ):
            with pytest.raises(sqlite3.OperationalError, match="readonly"):
                con.execute(sentencia)


def test_consultar_no_altera_lo_almacenado(cliente):
    cargar_las_cuatro(cliente)
    antes = cliente.get("/v1/registros/conteo").json()
    for _ in range(3):
        for ruta in CONSULTA:
            cliente.get(ruta)
    assert cliente.get("/v1/registros/conteo").json() == antes
