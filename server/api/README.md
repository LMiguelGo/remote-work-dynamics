# Backend de telemetría — Infraestructura Telemática para el Análisis de Dinámicas de Trabajo Remoto

Servicio de recepción y almacenamiento de registros de telemetría para un sistema de monitoreo de trabajo remoto. Expone una API REST que recibe registros de distintas fuentes de captura, los valida contra un contrato único y los persiste.

Construido con **FastAPI**, **Pydantic v2** y **SQLite**.

---

## Descripción

El sistema recolecta señales de contexto laboral sin acceder a contenido privado. El principio de diseño es la minimización: se capturan agregados y metadatos, nunca contenido de comunicaciones, pulsaciones individuales, audio ni video.

Este componente es la capa de entrada. Su responsabilidad es recibir, validar, almacenar y confirmar. No interpreta los datos ni calcula indicadores, tareas que corresponden a la capa de analítica.

### Métricas soportadas

| Fuente | `source_type` | Qué mide |
|---|---|---|
| Sensor BME280 vía ESP32 | `sensor_ambiental` | Temperatura, humedad y presión |
| Agente de navegación | `dominio_laboral` | Dominio raíz por bloque de tiempo, nunca la URL |
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

La lógica de negocio no conoce HTTP. Un transporte alterno, como un suscriptor MQTT, invoca `service.recibir()` directamente y obtiene el mismo comportamiento y el mismo acuse sin duplicar código.

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
| `GET` | `/v1/health` | Verificación de vida del servicio |
| `POST` | `/v1/registros` | Recibe, valida y almacena un registro |
| `GET` | `/v1/registros/conteo` | Conteo de almacenados y rechazados |

### `GET /v1/health`

Consulta la base de datos, de modo que no responde correctamente si el almacenamiento está caído.

```json
{ "status": "ok", "schema_version": "1.0" }
```

### `POST /v1/registros`

Petición:

```json
{
  "source_id": "bme280-zona-A",
  "source_type": "sensor_ambiental",
  "employee_id": null,
  "seq": 1,
  "ts": "2026-08-19T09:00:00Z",
  "metrics": { "temperatura_c": 22.2, "humedad_pct": 53.4, "presion_hpa": 1018.78 }
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

### Idempotencia

La escritura es idempotente respecto al par `(source_id, seq)`. Reenviar un registro ya almacenado devuelve `201` con `duplicate: true` y el `record_id` original, sin crear un duplicado.

Esto permite que un agente con almacenamiento temporal reenvíe su cola completa tras una reconexión sin inflar los conteos.

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
| `sensor_ambiental` | `temperatura_c`, `humedad_pct`, `presion_hpa` |
| `dominio_laboral` | `dominio_raiz`, `segundos` |
| `entrega_sprint` | `sprint_id`, `story_points_done`, `story_points_comprometidos` |
| `conectividad_vpn` | `minutos_conectividad_neta`, `minutos_despues_8pm` |

Las métricas derivadas se aceptan pero no se exigen, ya que el servicio almacena sin interpretar.

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

---

## Pruebas

```bash
python -m pytest
```

**Salida esperada:**

```
19 passed
```

Las pruebas se ejecutan contra una base de datos temporal mediante `dependency_overrides`, sin afectar los datos reales.

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
| Resiliencia | El servicio sigue operando tras un rechazo |
| Idempotencia | El reenvío no duplica y respeta la unicidad por fuente |

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
Invalidos rechazados: 7/7
Duplicados detectados: 3/3
```

### Verificación del almacenamiento

Lee la base de datos directamente, sin pasar por la API, de modo que un fallo del servicio no pueda quedar oculto al confirmarse a sí mismo.

```bash
python tools/verificar_almacenamiento.py --esperados 12
```

Devuelve código de salida `0` si todas las comprobaciones pasan y `1` en caso contrario, lo que permite integrarlo en una verificación automática.

> Sobre una base vacía las comprobaciones se cumplen de forma trivial. La herramienta solo aporta información con datos almacenados.

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
│   └── test_recepcion.py             Pruebas automáticas
├── tools/
│   ├── enviar_registros.py           Emisor de prueba
│   └── verificar_almacenamiento.py   Verificador independiente
├── pytest.ini
└── requirements.txt
```

---

## Decisiones de diseño

**SQLite en lugar de un motor cliente-servidor.** No requiere instalación ni administración, la base es un único archivo que se copia y se versiona, y el SQL es estándar, por lo que migrar a PostgreSQL no obliga a reescribir las consultas. Deja de ser adecuado cuando varios procesos escriben de forma concurrente o el volumen supera lo que admite un archivo local.

**Unicidad por `(source_id, seq)` en lugar de un identificador generado por el emisor.** Permite que el reenvío sea seguro sin coordinación entre emisor y servidor.

**`INSERT OR IGNORE` en lugar de consultar antes de insertar.** Comprobar la existencia previa deja una ventana entre la consulta y la inserción en la que dos reenvíos simultáneos pueden duplicar el registro.

**Rechazo explícito de fuentes no declaradas.** Una fuente que el proyecto no aprobó no puede entrar por omisión.

---

## Estado

Implementado: recepción, validación, almacenamiento idempotente, registro de rechazos y consulta de conteos.

Previsto: endpoints de consulta y resumen, recepción vía MQTT, servicio de métricas por empleado, agregación por equipo con umbral mínimo, y política de retención con purga de datos crudos.
