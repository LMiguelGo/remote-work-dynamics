# Firmware ESP32: monitoreo ambiental (ruido, temperatura y humedad) por MQTT

Firmware para un ESP32 que mide el nivel de ruido (micrófono INMP441), la temperatura y la humedad (sensor DHT22) y los publica cada ~5 segundos en un broker MQTT por una conexión TLS. Hace parte del proyecto *Infraestructura Telemática para el Análisis de Dinámicas de Trabajo Remoto* (Énfasis IV, Universidad del Cauca).

> **Estado:** las pruebas formales siguen pendientes y hay limitaciones conocidas (ver [Limitaciones conocidas](#limitaciones-conocidas)). El offset de ruido se calibró con una app de sonómetro de celular, por lo que la medición es aproximada (no hay calibración con un instrumento certificado).

## Contenido

1. [Qué hace](#qué-hace)
2. [Hardware y pinout](#hardware-y-pinout)
3. [Instalación y uso](#instalación-y-uso)
4. [Configuración (secrets.h)](#configuración-secretsh)
5. [Qué mide y cómo lo mide](#qué-mide-y-cómo-lo-mide)
6. [Estructura del mensaje MQTT](#estructura-del-mensaje-mqtt)
7. [Calibración del ruido (offset)](#calibración-del-ruido-offset)
8. [Parámetros y límites](#parámetros-y-límites)
9. [Manejo de fallas y conectividad](#manejo-de-fallas-y-conectividad)
10. [Mensajes del monitor serie](#mensajes-del-monitor-serie)
11. [Seguridad](#seguridad)
12. [Limitaciones conocidas](#limitaciones-conocidas)
13. [Solución de problemas](#solución-de-problemas)

---

## Qué hace

Cada ciclo de 5 segundos el dispositivo:

1. Acumula las muestras de audio del micrófono y calcula el nivel de ruido promedio (Leq) de la ventana, en dB.
2. Toma varias lecturas del DHT22 y calcula la mediana de temperatura y humedad.
3. Si ambos sensores están bien y hay conexión MQTT, publica un mensaje JSON con los tres valores.
4. Si algún sensor falla, descarta la lectura y avisa solo por el monitor serie (no se publica nada).

El micrófono **no graba ni envía audio**: solo se calcula un número (el nivel) a partir de las muestras, y las muestras se descartan.

---

## Hardware y pinout

| Componente | Pin del componente | Pin del ESP32 | Notas |
|---|---|---|---|
| INMP441 | VDD | 3V3 | No usar 5 V |
| INMP441 | GND | GND | |
| INMP441 | L/R | GND | Selecciona el canal izquierdo (el código lee solo el izquierdo) |
| INMP441 | SCK (BCLK) | GPIO 18 | Reloj de bit I²S |
| INMP441 | WS (LRCL) | GPIO 19 | Selección de palabra I²S |
| INMP441 | SD (DOUT) | GPIO 21 | Datos de audio |
| DHT22 | VCC (+) | 3V3 | |
| DHT22 | DATA (OUT) | GPIO 4 | Si el sensor es de 4 pines, pull-up de 10 kΩ entre VCC y DATA |
| DHT22 | GND (−) | GND | |

```
        ESP32 DevKit V1
      ┌───────────────────┐
 3V3 ─┤ 3V3          IO18 ├─ SCK  ┐
 GND ─┤ GND          IO19 ├─ WS   ├─ INMP441
      │              IO21 ├─ SD   ┘   (L/R → GND, VDD → 3V3, GND → GND)
      │               IO4 ├─ DATA ── DHT22 (VCC → 3V3, GND → GND)
      └───────────────────┘
```

Si cambias algún pin, hazlo en las constantes `DHT_PIN`, `I2S_SCK`, `I2S_WS` e `I2S_SD` al inicio de `main.cpp`, y actualiza esta tabla.

---

## Instalación y uso

### Requisitos

- Placa ESP32 (probado con `esp32doit-devkit-v1`).
- [PlatformIO](https://platformio.org/) en VS Code.
- Cable USB **de datos** (no solo de carga).
- Una red WiFi de **2.4 GHz** (el ESP32 no usa 5 GHz).

### platformio.ini

```ini
[env:esp32doit-devkit-v1]
platform = espressif32
board = esp32doit-devkit-v1
framework = arduino
monitor_speed = 115200
monitor_dtr = 0
monitor_rts = 0
lib_deps =
    beegee-tokyo/DHT sensor library for ESPx
    knolleary/PubSubClient
```

- `monitor_dtr = 0` y `monitor_rts = 0` evitan que el ESP32 se reinicie cada vez que se abre el monitor serie.
- Las bibliotecas `WiFi`, `WiFiClientSecure` y `Preferences` vienen incluidas con el framework de Arduino para ESP32.
- Opcional: conviene fijar la versión de `platform` (por ejemplo, `espressif32@6.x`) para que la compilación no cambie con futuras actualizaciones. El firmware contempla las dos variantes de nombres de campos DMA del driver I²S (según la versión de ESP-IDF).

### Pasos

1. Rellena `src/secrets.h` con los valores propios y marca el archivo con `skip-worktree` (ver [Configuración](#configuración-secretsh)).
2. Conecta el hardware según el [pinout](#hardware-y-pinout).
3. En VS Code: **Build** (✔), **Upload** (→) y **Serial Monitor** (🔌).
4. Si la carga se queda en `Connecting...`, mantén pulsado el botón **BOOT** del ESP32 hasta que empiece a subir.
5. Abre el monitor (115200 baudios) y pulsa **EN** para reiniciar el equipo y ver el arranque.

Salida esperada en un arranque normal:

```
WiFi conectado
Hora UTC sincronizada
MQTT conectado
Muestras DHT validas en la ventana: 3
{"dispositivo":"esp32_empleado1","lectura_id":601,"temperatura":28.70,"humedad":56.65,"ruido_raw":45.3}
Publicado
```

---

## Configuración (secrets.h)

Las credenciales viven en `src/secrets.h`. El archivo del repositorio tiene todos los campos vacíos y sirve como plantilla: cada persona lo llena en su copia local.

Para que Git no registre las claves reales al llenarlo, se marca el archivo para ignorar sus cambios locales (desde la raíz del repositorio):

```bash
git update-index --skip-worktree esp-32/src/secrets.h
```

Para volver a rastrearlo (por ejemplo, antes de un `git pull` que lo modifique), se usa `--no-skip-worktree`.

| Constante | Descripción |
|---|---|
| `WIFI_SSID`, `WIFI_PASS` | Red WiFi (2.4 GHz) |
| `MQTT_HOST`, `MQTT_PORT` | Servidor y puerto del broker (típico 8883 para TLS) |
| `MQTT_USER`, `MQTT_PASS` | Credenciales del dispositivo en el broker |
| `MQTT_TOPIC` | Tópico donde se publica |
| `DEVICE_ID` | Identificador del dispositivo (aparece en el campo `dispositivo`) |
| `CA_CERT` | Certificado de la CA que firma el certificado del broker (PEM). Admite varios certificados (la cadena completa) pegados uno debajo del otro, sin texto en medio |

Para obtener el certificado de la CA puedes usar, por ejemplo:

```bash
openssl s_client -showcerts -connect HOST:8883
```

y copiar el certificado raíz o intermedio de la cadena.

Dentro de `main.cpp`:

```cpp
#define VALIDAR_CERT 1   // 1 = valida el certificado del broker (recomendado)
                         // 0 = setInsecure(): NO verifica el certificado (solo pruebas)
```

---

## Qué mide y cómo lo mide

### Ruido (INMP441)

El INMP441 es un micrófono MEMS digital con salida I²S. El ESP32 lo lee como maestro I²S.

**Captura**

- Frecuencia de muestreo: 16 kHz, canal izquierdo, muestras de 32 bits de las que se usan los 24 bits útiles (`>> 8`).
- Se lee en bloques de 512 muestras (32 ms).

**Cálculo por bloque**

1. Se resta la media del bloque (quita la componente continua, DC).
2. Se calcula el RMS del bloque.
3. El bloque se considera **muerto** (sin señal válida) si todas sus muestras son iguales (`vmax == vmin`), si el RMS es menor a `RMS_MIN_VALIDO` (≈ −87 dBFS) o si la lectura I²S falló o llegó vacía.
4. Los bloques buenos acumulan su potencia (RMS²).

**Cálculo por ventana (5 s)**

1. **Leq**: raíz del promedio de potencia de los bloques buenos (promedio energético, no un promedio de decibeles).
2. Conversión a escala digital: `dBFS = 20 · log10(RMS / 8388608)` (8388608 = 2²³, el fondo de escala de 24 bits).
3. Conversión a presión sonora: `dB SPL = dBFS + CALIB_OFFSET`.
4. Si el resultado es menor que 0, se fija en 0.

El valor resultante es el campo `ruido_raw` del mensaje, expresado en dB.

**Importante**

- No se aplica ponderación A: es un nivel lineal (dB SPL), no dB(A).
- El valor enviado es el nivel promedio de la ventana de 5 s. Un pico breve (por ejemplo, un aplauso) se diluye en el promedio. El firmware no envía el nivel máximo (Lmax).
- Con el offset actual la medida es aproximada (ver [Calibración](#calibración-del-ruido-offset)).

### Temperatura y humedad (DHT22)

- El sensor se lee cada 2 s (`PERIODO_DHT_MS`).
- Una lectura es **válida** si el estado del sensor es OK, no es NaN y está dentro de los límites físicos (−40 a 80 °C y 0 a 100 %).
- En cada ventana de 5 s se guardan hasta 5 lecturas válidas; con al menos 2 se calcula la **mediana** de temperatura y de humedad. La mediana reduce el efecto de una lectura aislada rara.
- Si hay menos de 2 lecturas válidas en la ventana, el DHT se considera con falla y no se publica.

---

## Estructura del mensaje MQTT

Se publica un JSON en el tópico `MQTT_TOPIC`, una vez por ventana (~cada 5 s), solo cuando ambos sensores están bien:

```json
{
  "dispositivo": "esp32_empleado1",
  "lectura_id": 601,
  "temperatura": 28.70,
  "humedad": 56.65,
  "ruido_raw": 45.3
}
```

| Campo | Tipo | Unidad | Descripción |
|---|---|---|---|
| `dispositivo` | texto | — | Valor de `DEVICE_ID` |
| `lectura_id` | entero | — | Contador creciente. Se guarda en memoria no volátil y, al reiniciar, salta 100 para no repetir ids. Puede tener huecos |
| `temperatura` | decimal (2 dec.) | °C | Mediana de las lecturas válidas de la ventana |
| `humedad` | decimal (2 dec.) | % HR | Mediana de las lecturas válidas de la ventana |
| `ruido_raw` | decimal (1 dec.) | dB SPL (aprox.) | Leq de la ventana |

**El mensaje no incluye** (requeriría acordar cambios con el backend): timestamp UTC del dispositivo, estado de cada sensor (ok/sospechoso/error), valores nulos cuando un sensor falla, ni Leq/Lmax por separado. Los fallos de sensor no llegan al servidor: solo se ven por el monitor serie.

El tamaño del mensaje es de unos 110 bytes, por debajo del límite por defecto de PubSubClient (256 bytes, incluida la cabecera).

---

## Calibración del ruido (offset)

`CALIB_OFFSET` convierte el nivel digital (dBFS) en dB SPL:

```
dB SPL = dBFS + CALIB_OFFSET
```

### Valores de referencia

| Origen | Valor | Comentario |
|---|---|---|
| Hoja de datos del INMP441 | 120 | Sensibilidad −26 dBFS a 94 dB SPL → 94 + 26 = 120 |
| Valor en el código | 81 | Calibrado con una app de sonómetro de celular (referencia aproximada) |

Con el cableado actual, el silencio marca unos −75 a −61 dBFS. Con offset 81 eso da 6 a 20 dB, por debajo del piso físico del micrófono (~33 dB): en silencio el valor no es fiable y el firmware lo avisa por el monitor serie.

### Cómo calcular el offset

Se necesita una referencia. El offset actual se obtuvo con una **app de sonómetro en el celular**, que es una referencia aproximada. Para mayor exactitud, lo ideal es un sonómetro calibrado o un calibrador acústico de 94 dB a 1 kHz.

1. Carga el firmware con el `CALIB_OFFSET` actual y abre el monitor serie.
2. Coloca la fuente de sonido (ruido rosa o un tono constante, a volumen estable) y el sonómetro de referencia lo más cerca posible del micrófono, a la misma distancia.
3. Usa un nivel moderado a alto (por ejemplo, 70 a 85 dB), bien por encima del piso del micrófono (~33 dB) y lejos de la saturación.
4. Anota el valor de referencia del sonómetro (`dB_ref`) y el `ruido_raw` del firmware (`dB_fw`), promediando varios envíos (por ejemplo, 5 a 10).
5. Calcula el nuevo offset:

   ```
   CALIB_OFFSET_nuevo = CALIB_OFFSET_actual + (dB_ref − dB_fw)
   ```

   Ejemplo: offset actual 81, referencia 75 dB, firmware marca 36 dB → nuevo offset = 81 + (75 − 36) = **120**.
6. Cambia la constante en `main.cpp`, vuelve a subir el código y comprueba con otro nivel distinto (por ejemplo, 60 y 85 dB). La diferencia con la referencia debería ser pequeña (una diferencia de ±3 dB es un criterio razonable).

> **Nota:** la calibración no es válida con niveles por debajo de ~40 dB ni con lecturas en 0 (el firmware recorta a 0 y el cálculo daría un offset incorrecto). Si el valor no cambia al variar el sonido, la causa suele estar en el cableado.

### Limitaciones de la calibración

- Una app de celular no es un instrumento calibrado: sirve como referencia aproximada.
- El micrófono no distingue bien entre ~30 y 45 dB porque ahí domina su ruido propio.
- El offset no corrige la respuesta en frecuencia (no hay ponderación A).

---

## Parámetros y límites

Todos se definen como constantes al inicio de `main.cpp`. Los marcados como *provisionales* no tienen respaldo en los requerimientos y deben ajustarse con las pruebas.

| Parámetro | Valor | Significado |
|---|---|---|
| `SAMPLE_RATE` | 16000 Hz | Frecuencia de muestreo del audio |
| Bloque de audio | 512 muestras (32 ms) | Tamaño de cada lectura I²S |
| Ventana de envío | 5000 ms | Intervalo entre publicaciones |
| `CALIB_OFFSET` | 81.0 | dBFS → dB SPL (calibrado con app de sonómetro) |
| `RMS_MIN_VALIDO` | 375 | RMS mínimo (~ −87 dBFS, piso del INMP441) |
| `DB_PISO_MICROFONO` | 33 dB | Por debajo, aviso de valor poco fiable (solo Serial) |
| `MUESTRA_SATURADA` | 8 300 000 | Muestra cercana al fondo de escala: aviso de saturación (provisional) |
| `VARIACION_CONGELADO` | 0,1 % | Variación del RMS entre ventanas para considerarlo "sin cambio" (provisional) |
| `VENTANAS_CONGELADO` | 12 (≈ 60 s) | Ventanas iguales seguidas para marcar ruido sospechoso (provisional) |
| `TEMP_MIN`/`TEMP_MAX` | −40 / 80 °C | Límites físicos del DHT22 |
| `HUM_MIN`/`HUM_MAX` | 0 / 100 % | Límites físicos del DHT22 |
| `PERIODO_DHT_MS` | 2000 ms | Intervalo entre lecturas del DHT |
| `MAX_MUESTRAS_DHT` / `MIN_MUESTRAS_DHT` | 5 / 2 | Lecturas guardadas / mínimas válidas por ventana (provisional) |
| `FALLAS_PARA_DETENER` | 6 (≈ 30 s) | Ventanas malas seguidas para pasar a *detenido* (provisional) |
| `BUENAS_PARA_RECUPERAR` | 3 | Ventanas buenas seguidas para volver a publicar (provisional) |
| `PERIODO_AVISO_MS` | 60 s | Repetición del aviso *detenido* por Serial |
| `ESPERA_WIFI_SETUP_MS` | 20 s | Espera máxima de WiFi en el arranque |
| `PERIODO_NTP_MS` | 30 s | Reintento de sincronización de hora |
| `RECHAZOS_PARA_BLOQUEAR` | 5 | Rechazos de credenciales antes de pausar (provisional) |
| `BLOQUEO_CREDENCIALES_MS` | 30 min | Duración de la pausa tras rechazos |
| `ESPERA_MQTT_MAX_MS` | 5 min | Tope de la espera creciente entre reintentos MQTT |
| `WDT_SEGUNDOS` | 30 s | Tiempo sin responder tras el cual el watchdog reinicia el equipo |
| `SALTO_ID` / `GUARDAR_ID_CADA` | 100 / 50 | Salto de `lectura_id` al reiniciar / cada cuántas lecturas se guarda |

Rangos de referencia del micrófono (hoja de datos): piso de ruido ≈ 33 dB SPL (−87 dBFS) y saturación ≈ 120 dB SPL (0 dBFS).

---

## Manejo de fallas y conectividad

### Sensores

- **Micrófono desconectado, canal vacío o sin señal:** los bloques se cuentan como muertos. Si más de la mitad de los bloques de una ventana son muertos, el ruido se marca como *error* y la lectura se descarta (nunca se envía 0).
- **Valor congelado:** si el RMS casi no varía durante 12 ventanas seguidas, el ruido se marca *sospechoso* (solo aviso por Serial; la lectura se sigue publicando).
- **DHT con falla:** menos de 2 lecturas válidas en la ventana → lectura descartada.
- **Máquina de estados de fallas:** al primer fallo se avisa (*falla*); tras 6 ventanas malas seguidas pasa a *detenido*; para volver (*recuperado*) hacen falta 3 ventanas buenas seguidas.

### Red y MQTT

- **WiFi:** si se cae, se reintenta cada 5 s sin bloquear la medición.
- **Hora (NTP):** con `VALIDAR_CERT 1`, el TLS necesita la fecha correcta. Si no hay hora UTC, no se intenta MQTT y se reintenta NTP cada 30 s (mensaje `Sin hora UTC: no se puede validar el certificado`).
- **MQTT:** espera creciente entre reintentos (1 s, 2 s, 4 s... hasta 5 min).
- **Credenciales rechazadas (rc 4 o 5):** tras 5 intentos se pausa 30 min y luego se prueba una vez más, sin necesidad de reiniciar.
- **Error de conexión (rc=-2):** se imprime además el error TLS (`lastError`) para ayudar al diagnóstico.
- **Sin conexión MQTT:** la lectura de esa ventana se descarta (no hay búfer local).

### Robustez

- **Watchdog:** si el programa se queda bloqueado más de 30 s, el equipo se reinicia solo.
- **I²S:** se revisan los códigos de error al iniciar y leer; si el micrófono no inicia, el ruido se reporta como error.
- **`lectura_id` persistente:** se guarda en memoria no volátil (`Preferences`).

---

## Mensajes del monitor serie

| Mensaje | Significado |
|---|---|
| `WiFi conectado` / `WiFi sin conexion (se reintenta en el loop)` | Resultado de la conexión inicial |
| `Hora UTC sincronizada` / `NTP sin respuesta (...)` | Resultado de NTP |
| `Sin hora UTC: no se puede validar el certificado (reintentando NTP)` | Falta la hora; no se intenta MQTT |
| `MQTT conectado` | Conexión con el broker establecida |
| `MQTT rc=-2` + `TLS lastError=...` | Fallo de conexión (red, hora o certificado) |
| `MQTT rc=4` o `rc=5` | Usuario/clave incorrectos o no autorizado |
| `Credenciales rechazadas varias veces: reintentos pausados 30 min` | Pausa por rechazos |
| `Fin del bloqueo por credenciales: se prueba de nuevo` | Termina la pausa y se hace un nuevo intento |
| `DHT descartado: estado=... T=... H=...` | Lectura del DHT descartada y por qué |
| `Muestras DHT validas en la ventana: N` | Lecturas válidas del DHT en la ventana |
| `AVISO: nivel por debajo del piso del microfono (~33 dB)` | Valor poco fiable (es esperable en silencio si el offset es bajo) |
| `AVISO: ruido sospechoso (valor sin variacion)` | RMS congelado |
| `AVISO: saturacion del microfono en la ventana` | Muestras cerca del fondo de escala |
| `Sin MQTT: lectura descartada` | No había conexión al terminar la ventana |
| `Lectura descartada (sensor con falla)` | Falló el DHT o el micrófono |
| `ESTADO: falla / detenido / recuperado \| ruido: ... \| dht: ...` | Cambios de estado |
| `{...}` y `Publicado` | Mensaje enviado correctamente |
| `ERROR al publicar` | El cliente MQTT no pudo enviar |
| `ERROR I2S: ...` | No se pudo iniciar el micrófono |

---

## Seguridad

- **TLS con validación de certificado:** la conexión al broker se valida con `VALIDAR_CERT 1` y el certificado `CA_CERT`. Con `VALIDAR_CERT 0` se usa `setInsecure()`, que no verifica el certificado y deja la conexión expuesta a un ataque de intermediario; esa opción existe solo para pruebas.
- **Credenciales separadas del código:** las claves de WiFi y MQTT y el certificado de la CA se definen en `src/secrets.h`, no en `main.cpp`. El archivo del repositorio no contiene valores reales; en cada copia local se marca con `skip-worktree` para que Git no registre las claves. Toda credencial que llegue a exponerse se considera comprometida y debe rotarse.
- **Reintentos acotados** ante credenciales rechazadas: espera creciente y pausa de 30 min tras 5 rechazos.
- **Privacidad:** el dispositivo no graba ni transmite audio; solo se calcula y envía un nivel numérico. Las muestras de audio se procesan en memoria y se descartan.

---

## Limitaciones conocidas

- **Calibración aproximada:** `CALIB_OFFSET = 81` se calibró con una app de sonómetro de celular, no con un instrumento certificado; los valores son aproximados. En silencio quedan por debajo del piso físico del micrófono (~33 dB) y no son fiables.
- **Sin ponderación A:** el nivel es lineal, no dB(A).
- **Solo promedio (Leq):** no se envía Lmax; los picos breves se diluyen.
- **Sin timestamp en el mensaje:** la hora se sincroniza por NTP, pero no se incluye en el JSON.
- **Sin búfer ni reenvío:** durante una caída de red las lecturas se pierden.
- **Fallos de sensor no llegan al servidor:** solo se informan por el monitor serie; el mensaje no incluye estado ni valores nulos.
- **`lectura_id` con huecos:** salta 100 en cada reinicio, por lo que no sirve para contar mensajes perdidos.
- **Intervalo fijo de 5 s:** una mejora posible sería enviar cada 3 s con Leq y Lmax.
- **Umbrales provisionales:** ver la [tabla de parámetros](#parámetros-y-límites).
- **Driver I²S heredado (`driver/i2s.h`):** funciona, pero está marcado como obsoleto en versiones recientes del framework.
- **Un solo canal y un solo dispositivo:** no hay gestión de varios sensores de ruido.

---

## Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El monitor no muestra nada | Puerto o baudios incorrectos, o el equipo no se reinició | 115200 baudios; pulsa **EN** |
| Se queda en `Connecting...` al subir | El ESP32 no entra en modo de carga | Mantén **BOOT** al subir; usa cable de datos; instala el driver CP210x/CH340 |
| `DHT descartado: estado=TIMEOUT T=nan` | Cableado, alimentación o falta de pull-up | Revisa DATA (GPIO 4), 3V3, GND y la resistencia de 10 kΩ en sensores de 4 pines |
| Temperatura y humedad absurdas con `estado=OK` | Modelo de sensor mal configurado | Confirma el modelo del sensor y `DHT_TIPO` |
| `ERROR I2S: ...` o ruido siempre en error | Micrófono sin iniciar o mal cableado | Revisa SCK/WS/SD (18/19/21), L/R a GND y 3V3 |
| El ruido se queda fijo en 0 o no cambia | SD/WS/SCK mal conectados o canal incorrecto | Revisa el cableado y que L/R esté a GND |
| `MQTT rc=-2` con hora sincronizada | Red caída, servidor inalcanzable o `CA_CERT` incorrecto | Mira `TLS lastError`; verifica host, puerto y la CA |
| `MQTT rc=4` o `5` | Usuario/clave incorrectos o sin permisos | Revisa `MQTT_USER`, `MQTT_PASS` y las ACL del broker |
| Valores de ruido muy bajos en silencio | Por debajo de ~33 dB domina el ruido propio del micrófono | Es esperable; si también son bajos con ruido alto, revisa el offset (ver [Calibración](#calibración-del-ruido-offset)) |
| El equipo se reinicia solo cada cierto tiempo | Watchdog (loop bloqueado más de 30 s) | Revisa la red y los mensajes previos al reinicio |

---

## Estructura del proyecto

```
.
├── platformio.ini
├── .gitignore
├── README.md
└── src/
    ├── main.cpp            # firmware
    └── secrets.h           # credenciales (vacío en el repositorio)
```
