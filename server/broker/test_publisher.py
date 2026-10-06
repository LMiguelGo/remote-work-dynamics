import json
import ssl
import time
from pathlib import Path
import paho.mqtt.client as mqtt

# 1. Definir la ruta hacia el certificado de la CA
BASE_DIR = Path(__file__).resolve().parent
CERTS_DIR = BASE_DIR / "certs"
CA_CERT_PATH = CERTS_DIR / "ca.crt"

# Payload de prueba
registro_prueba = {
    "source_id": "bme280-zona-A",
    "source_type": "sensor_ambiental",
    "employee_id": None,
    "seq": 1,
    "ts": "2026-08-23T10:00:00Z",
    "metrics": {
        "temperatura_c": 22.2,
        "humedad_pct": 53.4,
        "presion_hpa": 1018.78,
        "alerta_generada": False,
        "notificacion_recomendacion_realizada": False,
        "numero_de_notificacion_recomendacion_realizada": 0,
        "%de_productividad": 67.5,
    },
}

# Inicialización del cliente MQTT
client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="agente-sensor-A")

# 2. Configurar la capa de transporte seguro TLS (Puerto 8883)
if CA_CERT_PATH.exists():
    client.tls_set(ca_certs=str(CA_CERT_PATH), cert_reqs=ssl.CERT_NONE)
    client.tls_insecure_set(True)  # Permitir certificados autofirmados locales
else:
    raise FileNotFoundError(f"No se encontró el certificado en: {CA_CERT_PATH}")

# 3. Configurar LWT (Last Will & Testament) antes de conectar
dispositivo_id = registro_prueba["source_id"]
topico_estado = f"telemetria/{dispositivo_id}/estado"
client.will_set(topico_estado, payload="offline", qos=1, retain=True)

# Conexión al Broker
client.connect("127.0.0.1", 8883, keepalive=15)
client.loop_start()

# Anunciar que el dispositivo está en línea
client.publish(topico_estado, payload="online", retain=True)

try:
    # 4. Enviar un Heartbeat previo
    topico_heartbeat = f"telemetria/{dispositivo_id}/heartbeat"
    heartbeat_payload = json.dumps({"source_id": dispositivo_id, "status": "ok"})
    client.publish(topico_heartbeat, heartbeat_payload)
    print(" Heartbeat enviado.")

    # 5. Publicar el registro de telemetría
    payload = json.dumps(registro_prueba)
    topico_registros = "telemetria/sensor_ambiental/registros"
    info = client.publish(topico_registros, payload, qos=1)
    info.wait_for_publish()
    print(" ¡Mensaje de telemetría enviado y confirmado por el Broker vía TLS!")

    time.sleep(1)  # Breve pausa para asegurar la transmisión

finally:
    client.loop_stop()
    client.disconnect()
    print(" Desconexión completada.")