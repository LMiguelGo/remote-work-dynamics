import ssl
import sys
from pathlib import Path
import json
import time
import paho.mqtt.client as mqtt

# Obtiene la ruta de 'server/broker' sin importar desde dónde se ejecute el comando
BASE_DIR = Path(__file__).resolve().parent
CERTS_DIR = BASE_DIR / "certs"
CA_PATH = CERTS_DIR / "ca.crt"

# Validación rápida antes de conectar
if not CA_PATH.exists():
    print(f"[ERROR] No se encontró el certificado CA en: {CA_PATH}")
    sys.exit(1)

print(f"[INFO] Cargando certificado desde: {CA_PATH}")

# Configuración del cliente MQTT
client = mqtt.Client(client_id="test_client", protocol=mqtt.MQTTv311)

# Configurar TLS pasando la ruta como string explícito
client.tls_set(ca_certs=str(CA_PATH), cert_reqs=ssl.CERT_NONE)
client.tls_insecure_set(True)  # Permite certificados autofirmados en desarrollo

# Conexión al broker MQTTS
try:
    client.connect("127.0.0.1", 8883, 60)
    print("[ÉXITO] Conexión segura establecida con el broker MQTTS en el puerto 8883.")
except Exception as e:
    print(f"[ERROR] No se pudo conectar al broker: {e}")

# 1. Configurar LWT (Detectará desconexión inesperada en el servidor)
client.will_set("telemetria/esp32_zona_a/estado", payload="offline", qos=1, retain=True)

client.loop_start()

# Anunciar que el nodo está conectado
client.publish("telemetria/esp32_zona_a/estado", payload="online", retain=True)

try:
    print("Agente activo. Enviando heartbeats cada 5 segundos... (Presiona Ctrl+C para simular desconexión)")
    while True:
        # 2. Enviar Ping de Heartbeat periódico
        heartbeat_payload = json.dumps({"source_id": "bme280-zona-A", "status": "ok", "uptime_s": 120})
        client.publish("telemetria/esp32_zona_a/heartbeat", heartbeat_payload)
        time.sleep(5)

except KeyboardInterrupt:
    print("\nSimulando desconexión...")
    client.loop_stop()
    # Si la conexión se corta sin disconnect(), Mosquitto disparará la alerta LWT