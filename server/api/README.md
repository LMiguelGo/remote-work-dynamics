# Backend de telemetría — Infraestructura Telemática para el Análisis de Dinámicas de Trabajo Remoto

Servicio de recepción, almacenamiento y consulta de registros de telemetría para un sistema de monitoreo de trabajo remoto. Expone una API REST que recibe registros de distintas fuentes de captura, los valida contra un contrato único, los persiste y los devuelve por endpoints de solo lectura.

Construido con **FastAPI**, **Pydantic v2** y **SQLite**.

---

## Descripción

El sistema recolecta señales de contexto laboral sin acceder a contenido privado. El principio de diseño es la minimización: se capturan agregados y metadatos, nunca contenido de comunicaciones, pulsaciones individuales, audio ni video.

Este componente es la capa de entrada y la de acceso. Su responsabilidad es recibir, validar, almacenar, confirmar y exponer lo almacenado. Calcula agregados descriptivos sobre los registros, pero no interpreta los datos ni deriva conclusiones, tarea que corresponde a la capa de analítica.

### Métricas soportadas

| Fuente | `source_type` | Qué mide |
|---|---|---|
| Sensor BME280 vía ESP32 | `sensor_ambiental` | Temperatura, humedad y presión |
| Agente de navegación | `dominio_laboral` | Dominio auditado por bloque de tiempo, nunca la URL |
| Jira, Trello o Asana | `entrega_sprint` | Story points completados sobre comprometidos |
| VPN corporativa | `conectividad_vpn` | Minutos de conexión neta por día |

Un `source_type` no declarado es rechazado. Esto impide que entre por descuido una fuente que el proyecto decidió no recolectar.

---

## Arquitectura

Separación en capas, cada módulo con una única responsabilidad:

```
app/
├── api.py       Capa HTTP. Traduce peticiones y respuestas
├── schema.py    Contrato del registro y sus validaciones
├── service.py   Reglas de negocio, independiente del transporte
├── storage.py   Acceso a datos. Único módulo con SQL
├── config.py    Configuración por variables de entorno
└── main.py      Ensamblaje, ciclo de vida y manejo de errores
```

Recorrido de una petición:

```
POST /v1/registros
   │
   ├─ api.py        recibe el JSON
   ├─ schema.py     valida ──── si falla ──→ 422 y se registra la traza
   ├─ service.py    normaliza la marca temporal
   ├─ storage.py    INSERT OR IGNORE
   └─ 201 con el acuse
```

Recorrido de una consulta:

```
GET /v1/registros/resumen
   │
   ├─ api.py        abre una conexión en modo solo lectura
   ├─ service.py    compone los bloques del resumen
   ├─ storage.py    agrega en SQL, sin traer las filas a memoria
   └─ 200 con el resumen
```

La lógica de negocio no conoce HTTP. Un transporte alterno, como un suscriptor MQTT, invoca `service.recibir()` directamente y obtiene el mismo comportamiento y el mismo acuse sin duplicar código.

Escritura y lectura usan conexiones distintas. La de lectura se abre con `mode=ro`, de manera que la imposibilidad de escribir desde un endpoint de consulta la impone el motor de base de datos y no una convención del código.

---

## Requisitos

- Python 3.10 o superior
- No requiere servidor de base de datos

---

## Instalación

```bash
git clone https://github.com/LMiguelGo/remote-work-dynamics.git
```

```bash
cd remote-work-dynamics/server/api
```

```bash
pip install -r requirements.txt
```

Dependencias:

| Paquete | Uso |
|---|---|
| `fastapi` | Framework del servicio |
| `uvicorn[standard]` | Servidor ASGI |
| `pydantic` | Validación del contrato |
| `pydantic-settings` | Configuración por entorno |
| `requests` | Cliente de las herramientas auxiliares |
| `pytest` | Ejecución de las pruebas |
| `paho-mqtt` | Reservado para la recepción vía MQTT |

---

## Ejecución

Crear la base de datos:

```bash
python -c "from app import storage; storage.inicializar()"
```

Levantar el servicio:

```bash
python -m uvicorn app.main:app --reload --port 8000
```

**Salida esperada:**

```
almacenamiento_listo ruta=...\datos\telemetria.db registros_existentes=0
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000
```

Con el servicio activo, la documentación interactiva queda disponible en `http://127.0.0.1:8000/docs`, generada a partir del código.

---

## API

Todos los endpoints cuelgan del prefijo de versión `/v1`.

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/v1/health` | Estado del servicio y del almacenamiento |
| `POST` | `/v1/registros` | Recibe, valida y almacena un registro |
| `GET` | `/v1/registros/ultimo` | Último registro almacenado |
| `GET` | `/v1/registros/resumen` | Resumen agregado del conjunto |
| `GET` | `/v1/registros/conteo` | Conteo de almacenados y rechazados |

Un único método de escritura. Los cuatro endpoints de consulta responden `405` ante `POST`, `PUT`, `PATCH` o `DELETE`.

### `GET /v1/health`

Abre la base por su cuenta en lugar de recibir la conexión por inyección, de modo que puede informar de un fallo del almacenamiento en vez de caer junto con él.

```json
{
  "status": "ok",
  "schema_version": "1.0",
  "api_prefix": "/v1",
  "almacenamiento_accesible": true,
  "ruta_almacenamiento": "datos/telemetria.db",
  "registros_almacenados": 12,
  "tiempo_activo_s": 12.7,
  "consultado_en": "2026-08-24T01:43:50.529024Z"
}
```

Responde `503` con `"status": "sin_almacenamiento"` y `registros_almacenados` nulo cuando el servicio está en pie pero no alcanza la base.

### `POST /v1/registros`

Petición:

```json
{
  "source_id": "bme280-zona-A",
  "source_type": "sensor_ambiental",
  "employee_id": null,
  "seq": 1,
  "ts": "2026-08-19T09:00:00Z",
  "metrics": {
    "temperatura_c": 22.2,
    "humedad_pct": 53.4,
    "presion_hpa": 1018.78,
    "alerta_generada": false,
    "notificacion_recomendacion_realizada": false,
    "numero_de_notificacion_recomendacion_realizada": 0,
    "%de_productividad": 67.5
  }
}
```

Respuesta `201`:

```json
{
  "ack": true,
  "record_id": 1,
  "source_id": "bme280-zona-A",
  "seq": 1,
  "received_at": "2026-08-19T14:02:11+00:00",
  "duplicate": false
}
```

Respuesta `422` cuando el registro incumple el contrato:

```json
{
  "ack": false,
  "error": "registro invalido",
  "rechazo_id": 1,
  "causas": "seq: Input should be greater than or equal to 1"
}
```

Un registro inválido no interrumpe el servicio. Se rechaza, se conserva la traza con su causa y el servicio continúa operando.

Cuando la traza no se puede guardar, la respuesta sigue siendo `422` y el `rechazo_id` llega nulo. Un registro inválido tiene que rechazarse aunque el almacenamiento esté fallando, así que un fallo al escribir la traza no convierte el `422` en un `500`.

### Idempotencia

La escritura es idempotente respecto al par `(source_id, seq)`. Reenviar un registro ya almacenado devuelve `201` con `duplicate: true` y el `record_id` original, sin crear un duplicado.

Esto permite que un agente con almacenamiento temporal reenvíe su cola completa tras una reconexión sin inflar los conteos.

### `GET /v1/registros/ultimo`

Devuelve el registro completo con el `record_id` más alto, es decir el último en llegar. No es necesariamente el de `ts` mayor: un registro retenido en un buffer llega tarde trayendo una hora anterior.

```json
{
  "record_id": 12,
  "schema_version": "1.0",
  "source_id": "vpn-corporativa",
  "source_type": "conectividad_vpn",
  "employee_id": "emp-001",
  "seq": 12,
  "ts": "2026-08-30T09:00:00Z",
  "received_at": "2026-08-24T01:43:49Z",
  "private_mode": false,
  "metrics": {
    "%de_productividad": 100.0,
    "minutos_conectividad_neta": 536,
    "minutos_despues_8pm": 0
  }
}
```

Responde `404` con la base vacía, porque no tener ningún registro y tener un último registro vacío son situaciones distintas para quien consume la API.

### `GET /v1/registros/resumen`

Agregados descriptivos del conjunto, calculados en SQL. Las métricas se leen dentro de `metrics_json` con `json_extract`, sin traer las filas a memoria.

```json
{
  "generado_en": "2026-08-24T01:43:50Z",
  "totales": {
    "registros": 12,
    "rechazos": 8,
    "fuentes": 4,
    "empleados": 1,
    "en_modo_privado": 0
  },
  "rango_temporal": {
    "primer_ts": "2026-08-19T09:00:00Z",
    "ultimo_ts": "2027-01-06T09:00:00Z",
    "primer_received_at": "2026-08-24T01:43:49Z",
    "ultimo_received_at": "2026-08-24T01:43:49Z"
  },
  "por_tipo_de_fuente": [
    {
      "source_type": "conectividad_vpn",
      "registros": 3,
      "fuentes": 1,
      "primer_ts": "2026-08-22T09:00:00Z",
      "ultimo_ts": "2026-08-30T09:00:00Z",
      "productividad_media_pct": 94.2
    }
  ],
  "por_fuente": { "vpn-corporativa": 3 },
  "indicadores": {
    "productividad_media_pct": 81.1,
    "alertas_ambientales": 0,
    "tasa_entrega_media_pct": 89.7,
    "conectividad_neta_media_min": 470.7,
    "distraccion_media_min": 5.7
  }
}
```

Cada indicador se calcula solo sobre la fuente a la que pertenece y queda nulo mientras esa fuente no haya enviado datos. `productividad_media_pct` sí atraviesa las cuatro, porque las cuatro reportan esa métrica.

### Solo lectura

Los endpoints de consulta se apoyan en `storage.conexion_lectura`, que abre el archivo con `mode=ro`. Cualquier intento de escritura por esa conexión falla en el motor:

```
sqlite3.OperationalError: attempt to write a readonly database
```

La protección es doble. En HTTP, las rutas solo están declaradas para `GET` y cualquier otro método recibe `405`. En la base, la conexión no tiene permiso de escritura aunque el código lo intentara.

---

## Formato del registro

Una sola envoltura para todas las fuentes. Lo único que varía es `source_type` y las llaves de `metrics`.

| Campo | Obligatorio | Descripción |
|---|:--:|---|
| `schema_version` | no | Versión del contrato. Por defecto `"1.0"` |
| `source_id` | sí | Identificador del dispositivo o fuente, de 1 a 64 caracteres |
| `source_type` | sí | Tipo de fuente. Debe estar declarado |
| `employee_id` | no | Empleado propietario. Nulo si la fuente no es personal |
| `seq` | sí | Número de muestra consecutivo por fuente, ≥ 1 |
| `ts` | sí | Instante de captura, ISO-8601 con zona horaria |
| `private_mode` | no | Verdadero si la captura estaba en pausa |
| `metrics` | sí | Medidas. Solo valores escalares |

`record_id` no se envía: lo asigna el servicio y lo devuelve en el acuse.

### Llaves obligatorias por fuente

| `source_type` | Llaves requeridas en `metrics` |
|---|---|
| `sensor_ambiental` | `temperatura_c`, `humedad_pct`, `presion_hpa`, `alerta_generada`, `notificacion_recomendacion_realizada`, `numero_de_notificacion_recomendacion_realizada`, `%de_productividad` |
| `dominio_laboral` | `dominio_laboral_auditado`, `minutos_dentro_del_dominio_laboral_auditado`, `minutos_de_distraccion`, `%de_productividad` |
| `entrega_sprint` | `sprint_id`, `story_points_done`, `story_points_comprometidos`, `%tasa_de_entrega`, `%de_productividad` |
| `conectividad_vpn` | `minutos_conectividad_neta`, `minutos_despues_8pm`, `%de_productividad` |

`%de_productividad` es común a las cuatro fuentes, de modo que los indicadores puedan compararse entre ellas.

Otras métricas derivadas, como `bandera_horas_sobretiempo`, se aceptan pero no se exigen, ya que el servicio almacena sin interpretar.

### Reglas de validación

- `ts` debe incluir zona horaria. Se normaliza a UTC antes de almacenar
- `metrics` no puede estar vacío y solo admite valores escalares
- `source_type` debe pertenecer a las fuentes declaradas
- `metrics` debe contener las llaves obligatorias de su `source_type`

---

## Modelo de datos

**Tabla `registros`**

| Columna | Tipo | Notas |
|---|---|---|
| `record_id` | INTEGER | Clave primaria autoincremental |
| `source_id` | TEXT | Junto a `seq` forma la clave única |
| `source_type` | TEXT | |
| `employee_id` | TEXT | Admite nulo |
| `seq` | INTEGER | |
| `ts` | TEXT | Hora del dispositivo, en UTC |
| `received_at` | TEXT | Hora del servidor |
| `private_mode` | INTEGER | |
| `metrics_json` | TEXT | Serializado con llaves ordenadas |

**Tabla `rechazos`** conserva los registros que no superaron la validación, con su causa.

`ts` y `received_at` se almacenan por separado porque no siempre coinciden. Un registro retenido en un buffer llega tarde pero fue capturado antes.

SQLite opera en modo **WAL**, que admite un escritor y varios lectores concurrentes.

El esquema se crea al arrancar el servicio. Cuando se borra la carpeta `datos/` con el servicio activo, la conexión de escritura vuelve a crear el archivo y detecta que las tablas no están, así que las rehace en la siguiente petición. Sin eso, el archivo quedaría vacío y toda escritura fallaría con `no such table`.

La secuencia de `record_id` puede presentar huecos. Un reenvío duplicado reserva el número antes de que se compruebe la restricción `UNIQUE`, y al descartarse la fila ese número ya está gastado. El identificador sirve para ordenar, no para contar.

---

## Pruebas

```bash
python -m pytest
```

**Salida esperada:**

```
52 passed
```

Las pruebas se ejecutan contra una base de datos temporal mediante `dependency_overrides`, sin afectar los datos reales. Están repartidas en `tests/test_recepcion.py`, para la escritura, y `tests/test_consulta.py`, para la lectura.

Ejecutar un grupo concreto:

```bash
python -m pytest -k "duplica or seq"
```

Cobertura por área:

| Área | Qué verifica |
|---|---|
| Recepción | El endpoint acepta un registro válido y confirma |
| Persistencia | Se conservan identificador de fuente y referencia temporal |
| Normalización | Una marca temporal con desfase horario queda en UTC |
| Conteo | Lo almacenado coincide con lo enviado |
| Validación | Los registros inválidos se rechazan y queda la traza |
| Resiliencia | El servicio sigue operando tras un rechazo, y el `422` se sostiene aunque no se pueda guardar la traza |
| Recuperación | La conexión de escritura rehace el esquema si la base quedó sin tablas |
| Idempotencia | El reenvío no duplica y respeta la unicidad por fuente |
| Estado | `/health` informa del fallo del almacenamiento en lugar de caer |
| Último registro | Corresponde al último ingresado, no al de fecha mayor |
| Resumen | Totales, rango temporal e indicadores, incluida la base vacía |
| Solo lectura | Los métodos de escritura dan `405` y la conexión rechaza el `INSERT` |

---

## Herramientas auxiliares

### Envío de registros de prueba

Simula un dispositivo emisor. Requiere el servicio en ejecución.

```bash
python tools/enviar_registros.py --n 12 --invalidos --duplicados
```

| Opción | Efecto |
|---|---|
| `--n N` | Número de registros válidos. Rota las cuatro fuentes |
| `--invalidos` | Añade registros que deben ser rechazados |
| `--duplicados` | Reenvía los tres primeros para comprobar la idempotencia |

**Salida esperada:**

```
Validos aceptados : 12/12
Invalidos rechazados: 8/8
Duplicados detectados: 3/3
```

### Verificación del almacenamiento

Lee la base de datos directamente, sin pasar por la API, de modo que un fallo del servicio no pueda quedar oculto al confirmarse a sí mismo.

```bash
python tools/verificar_almacenamiento.py --esperados 12
```

Devuelve código de salida `0` si todas las comprobaciones pasan y `1` en caso contrario, lo que permite integrarlo en una verificación automática.

> Sobre una base vacía las comprobaciones se cumplen de forma trivial. La herramienta solo aporta información con datos almacenados.

### Consulta de los endpoints

Cliente externo que recorre los cuatro endpoints de lectura, imprime cada respuesta y comprueba que ninguno admite escritura.

```bash
python tools/consultar_endpoints.py
```

**Salida esperada:**

```
  [ OK ] /health                POST=405  PUT=405  PATCH=405  DELETE=405
  [ OK ] /registros/ultimo      POST=405  PUT=405  PATCH=405  DELETE=405
  [ OK ] /registros/resumen     POST=405  PUT=405  PATCH=405  DELETE=405
  [ OK ] /registros/conteo      POST=405  PUT=405  PATCH=405  DELETE=405
```

### Verificación del último registro

Comprueba de forma activa que el endpoint devuelve el último ingresado: consulta el estado actual, envía un registro nuevo y verifica que el endpoint lo refleje. Contrasta además contra la base directamente, sin pasar por la API.

```bash
python tools/verificar_ultimo.py
```

Devuelve código de salida `0` si todas las comprobaciones pasan y `1` en caso contrario.

---

## Configuración

Se lee de variables de entorno con el prefijo `BACKEND_`, o de un archivo `.env` en la raíz del proyecto.

| Variable | Por defecto | Descripción |
|---|---|---|
| `BACKEND_DB_PATH` | `datos/telemetria.db` | Ruta del archivo SQLite |
| `BACKEND_API_PREFIX` | `/v1` | Prefijo de versión de la API |
| `BACKEND_LOG_LEVEL` | `INFO` | Nivel de registro |
| `BACKEND_SQLITE_BUSY_TIMEOUT_MS` | `5000` | Espera ante base bloqueada |
| `BACKEND_MAX_DESFASE_HORAS` | `48` | Tolerancia del reloj del dispositivo |

Ningún valor sensible se escribe en el código fuente.

---

## Estructura del proyecto

```
backend/
├── app/
│   ├── api.py                        Rutas HTTP
│   ├── config.py                     Configuración
│   ├── main.py                       Ensamblaje de la aplicación
│   ├── schema.py                     Contrato y validaciones
│   ├── service.py                    Reglas de negocio
│   └── storage.py                    Acceso a datos
├── tests/
│   ├── test_recepcion.py             Pruebas de escritura
│   └── test_consulta.py              Pruebas de lectura
├── tools/
│   ├── enviar_registros.py           Emisor de prueba
│   ├── verificar_almacenamiento.py   Verificador de lo almacenado
│   ├── consultar_endpoints.py        Cliente externo de consulta
│   └── verificar_ultimo.py           Verificador del último registro
├── pytest.ini
└── requirements.txt
```

---

## Decisiones de diseño

**SQLite en lugar de un motor cliente-servidor.** No requiere instalación ni administración, la base es un único archivo que se copia y se versiona, y el SQL es estándar, por lo que migrar a PostgreSQL no obliga a reescribir las consultas. Deja de ser adecuado cuando varios procesos escriben de forma concurrente o el volumen supera lo que admite un archivo local.

**Unicidad por `(source_id, seq)` en lugar de un identificador generado por el emisor.** Permite que el reenvío sea seguro sin coordinación entre emisor y servidor.

**`INSERT OR IGNORE` en lugar de consultar antes de insertar.** Comprobar la existencia previa deja una ventana entre la consulta y la inserción en la que dos reenvíos simultáneos pueden duplicar el registro.

**Rechazo explícito de fuentes no declaradas.** Una fuente que el proyecto no aprobó no puede entrar por omisión.

**Conexión en modo `ro` para las consultas en lugar de confiar en que el código no escriba.** Una convención se rompe con un descuido en una revisión de código. El permiso del motor no.

**Agregación en SQL en lugar de en Python.** Traer todas las filas a memoria para promediarlas deja de funcionar en cuanto la tabla crece, y el resumen se consulta en cada refresco del panel.

**El esquema se rehace en la conexión de escritura y no solo al arrancar.** La guía de ejecución propone borrar `datos/` para empezar limpio, y esa carpeta se puede borrar con el servicio activo. Cuando eso pasa, el archivo se vuelve a crear vacío y el servicio queda inservible hasta que se reinicia, así que la comprobación del esquema se hace al abrir la conexión.

**El último registro se determina por `record_id` y no por `ts`.** El orden de llegada y el orden de captura no coinciden cuando un emisor reenvía datos retenidos.

---

## Estado

Implementado: recepción, validación, almacenamiento idempotente, registro de rechazos, y consulta de estado, último registro, conteos y resumen agregado por una API de solo lectura.

Previsto: recepción vía MQTT, servicio de métricas por empleado, agregación por equipo con umbral mínimo, y política de retención con purga de datos crudos.
