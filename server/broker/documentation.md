# Documentación Técnica de Integración y Arquitectura MQTTS

**Proyecto:** Remote Work Dynamics - Sistema de Telemetría e Monitoreo IoT / Backend  
**Fecha:** 23 de agosto de 2026  
**Módulo:** Broker & Transporte (`server/broker/`)  
**Protocolo:** MQTT v3.1.1 / MQTTS sobre TLS/SSL (Puerto 8883)  

---

## 1. Resumen General de la Arquitectura

La solución establece un canal de comunicación asíncrono, seguro y de baja latencia entre los dispositivos/agentes de campo (`apps/agent/` y `apps/edge-node/`) y el servidor backend central (`server/`).

El flujo de información opera bajo el patrón **Publicador/Suscriptor** utilizando un broker **Mosquitto** centralizado. Se han implementado tres mecanismos fundamentales de nivel empresarial:

1. **Cifrado Transport Layer Security (MQTTS - Puerto 8883):** Protección de extremo a extremo para evitar la interceptación o alteración de métricas en tránsito.
2. **Detección de Caída de Enlace via Last Will & Testament (LWT):** Notificación automática por parte del broker cuando un nodo se desconecta anómalamente.
3. **Señal de Vida Activa (Heartbeats / Pings):** Monitoreo periódico del estado operativo de los dispositivos.

---

## 2. Componentes Implementados

### A. Agente Publicador de Telemetría (`publisher.py`)

* **Propósito:** Cliente liviano de envío puntual. Simula la captura de datos de un sensor o nodo perimetral que transmite métricas ambientales y finaliza su ciclo de ejecución.
* **Características Clave:**
  * Establece un canal seguro MQTTS cifrado mediante certificados CA (`ca.crt`) en el puerto `8883`.
  * Registra una condición de **Última Voluntad (LWT)** en `telemetria/<id>/estado` para notificar el estado `offline` en caso de desconexión anómala.
  * Transmite el estado `online` al iniciar la conexión.
  * Publica un payload en formato JSON con métricas de sensores (temperatura, humedad, presión, alertas y porcentaje de productividad) hacia el tópico: `telemetria/sensor_ambiental/registros`.
  * Garantiza la entrega del mensaje mediante **QoS level 1** (*At least once*).
  * Ejecuta un cierre limpio de la conexión utilizando `client.disconnect()`.

---

### B. Listener Central MQTT (`mqtt_listener.py`)

* **Propósito:** Servicio backend en Python que actúa como puente entre el Broker Mosquitto y la base de datos local (SQLite). Procesa, valida y persiste todas las transmisiones en tiempo real.
* **Características Clave:**
  * **Inyección Dinámica de Entorno:** Inserción en `sys.path` para importar y reutilizar directamente los módulos del backend (`schema`, `service`, `storage`).
  * **Suscripción con Comodines (`+`):**
    * `telemetria/+/registros`: Captura de registros de telemetría.
    * `telemetria/+/heartbeat`: Confirmación periódica de actividad (*pings*).
    * `telemetria/+/estado`: Alertas de conexión y desconexión (**LWT**).
  * **Procesamiento de Mensajes (`on_message`):**
    1. *Monitoreo de Red:* Detecta y registra las alertas `offline` y `online` de los nodos.
    2. *Heartbeats:* Procesa y confirma la recepción de pings periódicos.
    3. *Validación & Persistencia:* Valida la estructura JSON entrante mediante esquemas dinámicos de Pydantic (`RegistroIn`) y almacena los datos en SQLite invocando directamente `service.recibir(db, ...)`.
  * **Soporte de Transporte Dual:** Conecta sobre MQTTS (`8883`) si detecta los certificados SSL/TLS locales, o conmuta a TCP estándar (`1883`) si faltan.
  * **LWT Integrado del Backend:** Anuncia `offline` en `telemetria/listener/estado` si el propio servicio en Python colapsa inesperadamente.
  * **Manejo de Señales (`SIGINT` / `SIGTERM`):** Garantiza un cierre controlado del proceso sin dejar conexiones colgadas en el broker.

---

### C. Emulador y Probador de Resiliencia (`test_agent.py`)

* **Propósito:** Script de prueba continua para validar en tiempo real el comportamiento de los canales MQTTS, el envío periódico de pings y la activación de las alertas LWT ante caídas brutas.
* **Características Clave:**
  * Valida la presencia física del certificado de la Autoridad Certificadora (`certs/ca.crt`) antes de intentar la conexión de red.
  * Inicializa el cliente TLS para operar en el puerto seguro `8883`.
  * Configura la condición LWT hacia `telemetria/esp32_zona_a/estado` con el payload `offline` y la bandera `retain=True`.
  * Mantiene un bucle activo (`while True`) emitiendo señales de **Heartbeat** cada 5 segundos con información de tiempo de actividad (`uptime_s`) y estado.
  * **Simulación de Caídas Brutas:** Al interrumpir la ejecución con `Ctrl + C`, detiene el hilo sin enviar la señal de `disconnect()`, lo que obliga a Mosquitto a disparar la alerta LWT de forma instantánea hacia el Listener.

---

## 3. Estructura de Tópicos y Convenciones MQTT

| Tipo de Canal | Patrón de Tópico | Payload Ejemplo / Estado |
| :--- | :--- | :--- |
| **Telemetría** | `telemetria/<tipo_fuente>/registros` | JSON con métricas (`temperatura_c`, `humedad_pct`, etc.) |
| **Estado de Enlace (LWT)** | `telemetria/<source_id>/estado` | Cadena de texto: `"online"` \| `"offline"` |
| **Heartbeat (Ping)** | `telemetria/<source_id>/heartbeat` | JSON: `{"source_id": "...", "status": "ok"}` |

---

## 4. Estructura de Certificados Local (`server/broker/certs/`)

```text
server/broker/certs/
├── ca.crt         # Certificado de la Entidad Certificadora Local (CA)
├── ca.key         # Clave privada de la CA
├── server.crt     # Certificado SSL/TLS del Broker Mosquitto
└── server.key     # Clave privada del Servidor Mosquitto