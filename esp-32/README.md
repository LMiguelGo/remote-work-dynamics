# Simulación ESP32 (Wokwi)

Este directorio contiene el firmware simulado para el microcontrolador **ESP32**, desarrollado para ejecutarse en el simulador en línea [Wokwi](https://wokwi.com/).

## Descripción

El archivo [`sketch.ino`](sketch.ino) simula un nodo IoT que recopila métricas ambientales del espacio de trabajo remoto y las transmite a través del protocolo **MQTT**:

- **Sensor DHT22:** Monitoreo de temperatura (°C) y humedad relativa (%).
- **Potenciómetro:** Simulación de niveles de ruido ambiental (dB).
- **Conectividad WiFi:** Conexión a la red virtual de pruebas `Wokwi-GUEST`.
- **Publicación MQTT:** Envío de telemetría en formato JSON al broker `broker.hivemq.com` en el tópico `remote-work/esp32/ambiente`.

## Uso en Wokwi

1. Crear un proyecto nuevo para **ESP32** en [Wokwi](https://wokwi.com/).
2. Copiar y pegar el contenido de [`sketch.ino`](sketch.ino) en el editor del sketch.
3. Asegurarse de tener configuradas las siguientes dependencias en `libraries.txt`:
   - `PubSubClient`
   - `DHT sensor library for ESPx` (o `DHTesp`)
4. Iniciar la simulación para comenzar a emitir datos al broker MQTT.
