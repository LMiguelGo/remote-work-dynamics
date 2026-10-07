import json
import paho.mqtt.client as mqtt

# Configuración idéntica a la del ESP32
BROKER = "broker.hivemq.com"
PUERTO = 1883
TOPIC = "remote-work/esp32/ambiente"

# Callback: Se ejecuta automáticamente al conectarse al Broker
def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f" Conectado exitosamente al Broker: {BROKER}")
        # Nos suscribimos al topic del ESP32
        client.subscribe(TOPIC)
        print(f" Escuchando mensajes en el topic: '{TOPIC}'...\n")
    else:
        print(f"❌ Error de conexión. Código de retorno: {rc}")

# Callback: Se ejecuta AUTOMÁTICAMENTE cada vez que llega un mensaje desde Wokwi
def on_message(client, userdata, msg):
    try:
        # Decodificar el mensaje bytes a string y luego a JSON
        payload_str = msg.payload.decode('utf-8')
        datos = json.loads(payload_str)

        print("📨 [NUEVO MENSAJE RECIBIDO]")
        print(f"   Topic:       {msg.topic}")
        print(f"   Dispositivo: {datos.get('dispositivo')}")
        print(f"   Lectura N°:  {datos.get('lectura_id')}")
        print(f"   Temperatura: {datos.get('temperatura')} °C")
        print(f"   CO2:         {datos.get('co2')} ppm")
        print("-" * 40)
        
        # AQUÍ PUEDES AGREGAR TU LÓGICA (Ej. guardar en base de datos, procesar, etc.)

    except Exception as e:
        print(f"⚠️ Error al procesar el mensaje raw: {msg.payload.decode('utf-8')}")
        print(f"Detalle: {e}")

# Inicializar cliente MQTT (usando la API Callback V1/V2 de Paho)
cliente = mqtt.Client(client_id="Python_Local_Subscriber")

# Asignar funciones de callback
cliente.on_connect = on_connect
cliente.on_message = on_message

# Conectar al broker público
print("Conectando al servidor MQTT...")
cliente.connect(BROKER, PUERTO, keepalive=60)

# Bucle infinito para mantener el proceso escuchando continuamente
try:
    cliente.loop_forever()
except KeyboardInterrupt:
    print("\n Suscriptor detenido por el usuario.")
    cliente.disconnect()