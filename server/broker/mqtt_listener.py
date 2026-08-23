"""
Módulo Listener MQTT - Canal Seguro TLS, Heartbeat y Monitoreo de Enlace (LWT)
-------------------------------------------------------------------------------
"""

import json
import logging
import signal
import sys
import ssl
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
API_DIR = BASE_DIR / "server" / "api"
CERTS_DIR = BASE_DIR / "server" / "broker" / "certs"

if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

import paho.mqtt.client as mqtt
from app import schema, service, storage
from app.config import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("mqtt_listener")


def on_connect(client, userdata, flags, rc, properties=None):
    if rc == 0:
        logger.info("Conexión segura MQTTS (TLS) establecida con el Broker.")

        # Suscripción a datos y a tópicos de control (Heartbeats y Estado LWT)
        client.subscribe("telemetria/+/registros")
        client.subscribe("telemetria/+/heartbeat")
        client.subscribe("telemetria/+/estado")
        logger.info("Suscrito a registros, heartbeats y canales de estado LWT.")
    else:
        logger.error(f"Fallo al conectar con el Broker. Código: {rc}")


def on_message(client, userdata, msg):
    try:
        topic = msg.topic
        payload_str = msg.payload.decode("utf-8")

        # 1. Manejo de Alertas de Desconexión / Enlace (LWT)
        if topic.endswith("/estado"):
            estado = payload_str.strip()
            if estado == "offline":
                logger.warning(f" ALERTA DE RED: Pérdida de enlace detectada en [{topic}]")
            elif estado == "online":
                logger.info(f" RECONEXIÓN: Enlace restablecido en [{topic}]")
            return

        # 2. Manejo de Heartbeats (Ping Periódico cada N segundos)
        if topic.endswith("/heartbeat"):
            data = json.loads(payload_str)
            device_id = data.get("source_id", "desconocido")
            logger.info(f" HEARTBEAT RECIBIDO: Dispositivo [{device_id}] está activo.")
            return

        # 3. Procesamiento Estándar de Telemetría
        datos_json = json.loads(payload_str)
        ClaseEsquema = getattr(
            schema,
            "RegistroIn",
            getattr(
                schema,
                "RegistroPayload",
                getattr(schema, "Registro", getattr(schema, "RegistroSchema", None)),
            ),
        )

        registro_validado = (
            ClaseEsquema(**datos_json)
            if ClaseEsquema
            else schema.validar(datos_json)
        )

        with storage.conexion() as db:
            resultado = service.recibir(db, registro_validado)

        logger.info(f"Registro procesado y almacenado correctamente: {resultado}")

    except Exception as e:
        logger.error(f"Error al procesar mensaje en [{msg.topic}]: {str(e)}")


def iniciar_listener():
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = on_message

    # --- Configuración de Transporte Seguro TLS (Punto 2) ---
    ca_cert = CERTS_DIR / "ca.crt"
    if ca_cert.exists():
        client.tls_set(
            ca_certs=str(ca_cert),
            cert_reqs=ssl.CERT_NONE,  # Ajustado para certificados locales de prueba
            tls_version=ssl.PROTOCOL_TLSv1_2,
        )
        client.tls_insecure_set(True)
        broker_port = getattr(settings, "MQTTS_BROKER_PORT", 8883)
        logger.info("Capa de transporte seguro TLS/SSL habilitada.")
    else:
        broker_port = getattr(settings, "MQTT_BROKER_PORT", 1883)
        logger.warning("No se encontraron certificados localmente. Usando TCP estándar.")

    broker_host = getattr(settings, "MQTT_BROKER_HOST", "127.0.0.1")

    # --- Configuración del LWT del propio Listener ---
    client.will_set("telemetria/listener/estado", payload="offline", qos=1, retain=True)

    def manejar_salida_limpia(sig, frame):
        logger.info("Deteniendo el servicio MQTT Listener...")
        client.publish("telemetria/listener/estado", "offline", retain=True)
        client.disconnect()
        client.loop_stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, manejar_salida_limpia)
    signal.signal(signal.SIGTERM, manejar_salida_limpia)

    try:
        logger.info(f"Conectando a {broker_host}:{broker_port}...")
        client.connect(broker_host, broker_port, keepalive=15)
        
        # Notificar estado activo
        client.publish("telemetria/listener/estado", "online", retain=True)
        client.loop_forever()

    except KeyboardInterrupt:
        logger.info("Finalizando proceso de listener por teclado.")
        sys.exit(0)


if __name__ == "__main__":
    iniciar_listener()