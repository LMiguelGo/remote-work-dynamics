# HU-BAK-02. Consulta de datos almacenados mediante API de solo lectura

**Sprint 1, 22 al 25 de agosto de 2026. José Martin Gonzalez Joaqui (Backend, APIs y Gestión de Datos)**

Esta es la guía de ejecución de la historia. Consiste en seguir las siete actividades en orden, ejecutar el comando de cada una y compararlo con la salida que se espera. Cuando se terminan las siete, queda comprobado que los tres endpoints responden como se espera.

En HU-BAK-01 los registros quedaron almacenados. Esta historia los expone por una API que solamente puede leer, para que el panel de HU-DASH-01 los pueda consultar sin que se tenga que abrir el archivo de la base de datos y sin que se pueda alterar lo que hay dentro.

---

## Alcance

| # | Endpoint | Devuelve |
|:--:|---|---|
| 1 | `GET /v1/health` | Estado del servicio y acceso al almacenamiento |
| 2 | `GET /v1/registros/ultimo` | El último registro que fue ingresado, completo |
| 3 | `GET /v1/registros/resumen` | Totales, rango temporal e indicadores de las cuatro métricas aprobadas |

Se conserva el `GET /v1/registros/conteo`, que ya venía de HU-BAK-01 y que ahora también pasa por la conexión de solo lectura.

---

## Requisitos previos

- Python 3.10 o superior
- HU-BAK-01 implementada. Cuando no hay registros almacenados, no hay nada que consultar

Situarse en la carpeta del backend:

```bash
cd "C:\Users\User\Desktop\Énfasis 4\UNIDAD 2\backend"
```

Instalar las dependencias, si no se han instalado antes:

```bash
pip install -r requirements.txt
```

### Forma de trabajo

Se necesitan dos ventanas de PowerShell abiertas en esa misma carpeta.

| Ventana | Uso |
|---|---|
| Terminal A | El servicio. Se queda ocupada mientras el backend se está ejecutando |
| Terminal B | Todo lo demás. Desde aquí se consulta y se verifica |

Las actividades 1 a 4 se preparan sin que el servicio esté activo. De la 5 en adelante se necesita la Terminal A.

---

## Actividad 1. Definir los endpoints de consulta y la información que devuelve cada uno

> *"Definir los endpoints de consulta y la informacion que devuelve cada uno."*

| Endpoint | Función | Modelo de respuesta |
|---|---|---|
| `GET /v1/health` | Verificar que el servicio responde y que la base está accesible | `Estado` |
| `GET /v1/registros/ultimo` | Obtener el dato más reciente sin que se tenga que descargar la tabla completa | `RegistroAlmacenado` |
| `GET /v1/registros/resumen` | Obtener los agregados con que se llenan las tarjetas del panel | `Resumen` |

Los tres modelos están declarados en `app/schema.py`. Se declaran como modelos y no como diccionarios sueltos, para que FastAPI los publique en `/docs` y para que los campos que están disponibles queden documentados a partir del código.

El `ultimo` devuelve el registro que tiene el `record_id` más alto, es decir, el último que llegó. No es necesariamente el que tiene el `ts` mayor: cuando un registro se queda retenido en el buffer de HU-INF-04, llega tarde y trae una hora anterior. La historia pide el más reciente que fue ingresado, que es el orden en que van llegando.

### Ejecutar esto

```bash
python -c "from app.main import app; [print(f'{m.upper():<5} {r}') for r, ops in app.openapi()['paths'].items() for m in ops]"
```

**Salida esperada:**

```
GET   /v1/health
POST  /v1/registros
GET   /v1/registros/conteo
GET   /v1/registros/ultimo
GET   /v1/registros/resumen
```

Hay un solo `POST`, que es el de HU-BAK-01. Los demás son de lectura.

Ahora la información que devuelve cada uno:

```bash
python -c "from app import schema; [ (print(f'{n}:'), [print('   ', c) for c in getattr(schema, n).model_fields]) for n in ('Estado','RegistroAlmacenado','Resumen') ]"
```

**Salida esperada:**

```
Estado:
    status
    schema_version
    api_prefix
    almacenamiento_accesible
    ruta_almacenamiento
    registros_almacenados
    tiempo_activo_s
    consultado_en
RegistroAlmacenado:
    record_id
    schema_version
    source_id
    source_type
    employee_id
    seq
    ts
    received_at
    private_mode
    metrics
Resumen:
    generado_en
    totales
    rango_temporal
    por_tipo_de_fuente
    por_fuente
    indicadores
```


---

## Actividad 2. Implementar el endpoint de verificación de estado del servicio

> *"Implementar el endpoint de verificacion de estado del servicio."*

El `GET /v1/health` ya existía desde HU-BAK-01, pero solamente respondía `ok`. Recibía la conexión por inyección, así que cuando el almacenamiento fallaba, el endpoint se caía junto con él y devolvía un `500` genérico en lugar de informar de lo que estaba pasando. Ahora abre la base por su cuenta y distingue dos situaciones:

| Situación | Código | `status` |
|---|:--:|---|
| Servicio activo y base accesible | `200` | `ok` |
| Servicio activo sin acceso a la base | `503` | `sin_almacenamiento` |

El cambio está en `app/api.py`, en la función `health`, y el acceso al almacenamiento en `app/service.py`, en `estado_almacenamiento`.

### Preparación de los datos

La base se entrega borrada, para que esta sea una ejecución limpia. Se crea así:

```bash
python -c "from app import storage; storage.inicializar(); print('base creada en', storage.settings.db_path)"
```

Levantar el servicio en la Terminal A y dejarla abierta:

```bash
python -m uvicorn app.main:app --reload --port 8000
```

Cargar los doce registros de HU-BAK-01, en la Terminal B:

```bash
python tools/enviar_registros.py --n 12 --invalidos --duplicados
```

### Ejecutar esto en la Terminal B

```bash
python -c "import requests, json; r = requests.get('http://127.0.0.1:8000/v1/health'); print('HTTP', r.status_code); print(json.dumps(r.json(), indent=2, ensure_ascii=False))"
```

**Salida esperada:**

```
HTTP 200
{
  "status": "ok",
  "schema_version": "1.0",
  "api_prefix": "/v1",
  "almacenamiento_accesible": true,
  "ruta_almacenamiento": "C:\\Users\\User\\Desktop\\Énfasis 4\\UNIDAD 2\\backend\\datos\\telemetria.db",
  "registros_almacenados": 12,
  "tiempo_activo_s": 12.7,
  "consultado_en": "2026-08-24T01:43:50.529024Z"
}
```

El `tiempo_activo_s` y el `consultado_en` cambian cada vez que se ejecuta el comando. Todo lo demás coincide.

### Detección del fallo de almacenamiento

El siguiente comando levanta una copia del servicio que apunta a una base que no existe. No toca la base real y tampoco necesita la Terminal A.

```bash
python -W ignore -c "import os, logging; os.environ['BACKEND_DB_PATH']=r'datos\no-existe.db'; logging.disable(logging.CRITICAL); from fastapi.testclient import TestClient; from app.main import app; r=TestClient(app).get('/v1/health'); print('HTTP', r.status_code, '->', r.json()['status'])"
```

**Salida esperada:**

```
HTTP 503 -> sin_almacenamiento
```


---

## Actividad 3. Implementar el endpoint que devuelve el último registro almacenado

> *"Implementar el endpoint que devuelve el ultimo registro almacenado."*

El `GET /v1/registros/ultimo` se define en `app/api.py` y se apoya en `storage.ultimo_registro`, que ya existía desde HU-BAK-01. Devuelve el registro completo: la envoltura, las métricas y los dos campos que el servicio agrega cuando guarda, que son el `record_id` y el `received_at`.

Cuando la base está vacía responde `404`, porque no tener ningún registro y tener un último registro vacío son dos situaciones distintas para quien consume la API.

### Ejecutar esto en la Terminal B

```bash
python -c "import requests, json; r = requests.get('http://127.0.0.1:8000/v1/registros/ultimo'); print('HTTP', r.status_code); print(json.dumps(r.json(), indent=2, ensure_ascii=False))"
```

**Salida esperada:**

```
HTTP 200
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
    "bandera_horas_sobretiempo": false,
    "minutos_conectividad_neta": 536,
    "minutos_despues_8pm": 0
  }
}
```

El `received_at` corresponde al momento en que se hizo la carga, así que cambia cada vez. El `record_id`, el `source_id`, el `seq` y las métricas se mantienen fijos, porque el generador de HU-BAK-01 usa una semilla constante.



---

## Actividad 4. Implementar el endpoint que devuelve el resumen agregado

> *"Implementar el endpoint que devuelve el resumen agregado del conjunto de registros."*

El `GET /v1/registros/resumen` devuelve cuatro bloques:

| Bloque | Contenido |
|---|---|
| `totales` | Registros, rechazos, fuentes distintas, empleados distintos y registros en modo privado |
| `rango_temporal` | Primer y último `ts` del dispositivo, primer y último `received_at` del servidor |
| `por_tipo_de_fuente` | Una fila por cada una de las cuatro métricas aprobadas |
| `indicadores` | Un promedio por métrica aprobada |

Los agregados se calculan en SQL y no en Python, en `app/storage.py`, en las funciones `resumen_global`, `resumen_por_tipo` e `indicadores`. Cuando se traen todas las filas a la memoria para promediarlas, deja de funcionar cuando la tabla crece, y el resumen se consulta cada vez que se refresca el panel.

Las métricas están guardadas dentro de la columna `metrics_json` y se leen con `json_extract`, que es una función propia de SQLite:

```sql
ROUND(AVG(json_extract(metrics_json, '$."%de_productividad"')), 1)
```

Cada indicador filtra por el tipo de fuente al que pertenece. Como `AVG` ignora los nulos, el promedio se calcula solamente sobre las filas que sí traen esa métrica.

### Ejecutar esto en la Terminal B

```bash
python -c "import requests, json; r = requests.get('http://127.0.0.1:8000/v1/registros/resumen'); print('HTTP', r.status_code); d = r.json(); print(json.dumps({k: d[k] for k in ('totales','rango_temporal','por_fuente','indicadores')}, indent=2, ensure_ascii=False))"
```

**Salida esperada:**

```
HTTP 200
{
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
  "por_fuente": {
    "aw-watcher-web": 3,
    "bme280-zona-A": 3,
    "jira-board-42": 3,
    "vpn-corporativa": 3
  },
  "indicadores": {
    "productividad_media_pct": 81.1,
    "alertas_ambientales": 0,
    "tasa_entrega_media_pct": 89.7,
    "conectividad_neta_media_min": 470.7,
    "distraccion_media_min": 5.7
  }
}
```

Los registros de `entrega_sprint` están separados catorce días, uno por cada sprint, así que el `ultimo_ts` llega hasta 2027. No es un error de fecha.

Ahora el desglose por fuente:

```bash
python -c "import requests; d = requests.get('http://127.0.0.1:8000/v1/registros/resumen').json(); [print('{:<18} registros={}  productividad_media_pct={}'.format(t['source_type'], t['registros'], t['productividad_media_pct'])) for t in d['por_tipo_de_fuente']]"
```

**Salida esperada:**

```
conectividad_vpn   registros=3  productividad_media_pct=94.2
dominio_laboral    registros=3  productividad_media_pct=62.2
entrega_sprint     registros=3  productividad_media_pct=89.7
sensor_ambiental   registros=3  productividad_media_pct=78.5
```

Están las cuatro métricas aprobadas, con tres registros cada una.


---

## Actividad 5. Consultar los endpoints desde un cliente externo

> *"Consultar los endpoints desde un cliente externo y registrar las respuestas obtenidas."*

El `tools/consultar_endpoints.py` es un proceso independiente que habla con el servicio por HTTP, de la misma forma en que lo va a hacer el panel de HU-DASH-01. Recorre los cuatro endpoints de lectura, imprime la respuesta completa de cada uno y comprueba que ninguno admite escritura.

La comprobación intenta un `POST`, un `PUT`, un `PATCH` y un `DELETE` contra cada ruta. Los cuatro responden `405 Method Not Allowed`, que quiere decir que la ruta sí existe pero que solamente está declarada para `GET`.

### Ejecutar esto en la Terminal B

```bash
python tools/consultar_endpoints.py
```

**Salida esperada**, recortada. Las respuestas completas ya aparecieron en las actividades 2 a 4:

```
==============================================================================
ACTIVIDAD 5  Consulta de los endpoints desde un cliente externo
             http://127.0.0.1:8000/v1
==============================================================================

  GET /health
      Estado del servicio y del almacenamiento
      [ OK ] HTTP 200
      ...

  GET /registros/ultimo
      Ultimo registro almacenado
      [ OK ] HTTP 200
      ...

  GET /registros/resumen
      Resumen agregado del conjunto
      [ OK ] HTTP 200
      ...

  GET /registros/conteo
      Conteo de almacenados y rechazados
      [ OK ] HTTP 200
      ...

==============================================================================
             Los endpoints de consulta no aceptan escritura
==============================================================================
  [ OK ] /health                POST=405  PUT=405  PATCH=405  DELETE=405
  [ OK ] /registros/ultimo      POST=405  PUT=405  PATCH=405  DELETE=405
  [ OK ] /registros/resumen     POST=405  PUT=405  PATCH=405  DELETE=405
  [ OK ] /registros/conteo      POST=405  PUT=405  PATCH=405  DELETE=405

  405 Method Not Allowed: la ruta existe pero solo esta declarada para GET.

==============================================================================
RESULTADO: LOS ENDPOINTS DE CONSULTA RESPONDEN
==============================================================================
```


---

## Actividad 6. Comprobar que el último registro devuelto sea el más reciente ingresado

> *"Comprobar que el ultimo registro devuelto corresponda al mas reciente que fue ingresado."*

El `tools/verificar_ultimo.py` comprueba de forma activa que el endpoint sí devuelve el último que fue ingresado:

1. Consulta cuál es el último registro en ese momento.
2. Ingresa un registro nuevo, con un `seq` que sea mayor que cualquiera de los que ya existen para esa fuente.
3. Vuelve a consultar y compara el `record_id`, el `source_id` y el `seq` contra los del registro que acaba de enviar.
4. Contrasta contra la base directamente, sin pasar por la API, para que un fallo del servicio no se quede oculto porque el servicio se esté confirmando a sí mismo.
5. Intenta un `DELETE` por la conexión de consulta y confirma que el motor lo rechaza.

El último paso es el que cubre el cuarto criterio de aceptación. Los endpoints de consulta se apoyan en `storage.conexion_lectura`, que abre el archivo con `mode=ro`, así que el que impide escribir es el motor de la base de datos, y no una convención del código.

### Ejecutar esto en la Terminal B

```bash
python tools/verificar_ultimo.py
```

**Salida esperada:**

```
==============================================================================
ACTIVIDAD 6  El ultimo registro devuelto es el mas reciente ingresado
==============================================================================
  Antes del envio  : record_id=12  source_id=vpn-corporativa  seq=12
  Registro enviado : record_id=16  seq=10  ts=2026-08-24T01:41:21+00:00
  Devuelto por API : record_id=16  source_id=bme280-zona-A  seq=10

  [ OK ] el record_id coincide con el del registro enviado
  [ OK ] el source_id coincide
  [ OK ] el seq coincide
  [ OK ] el ultimo cambio al ingresar un registro nuevo
  [ OK ] coincide con el record_id mayor de la tabla registros (16)

  El endpoint de consulta no puede escribir
  [ OK ] DELETE rechazado por el motor -> attempt to write a readonly database

  Ultimo registro completo
{
    "record_id": 16,
    ...
}

==============================================================================
RESULTADO: EL ULTIMO REGISTRO ES EL MAS RECIENTE INGRESADO
==============================================================================
```

En la secuencia de `record_id` queda un hueco entre el 12 y el 16. Los tres reenvíos duplicados de la actividad 4 de HU-BAK-01 reservaron los números 13, 14 y 15 antes de que se comprobara la restricción `UNIQUE`, y cuando esas filas se descartaron, los números ya estaban gastados. No se perdió ningún registro: la tabla tiene trece filas y el máximo es 16. El identificador sirve para ordenar y no para contar.


---

## Actividad 7. Guardar las capturas de las respuestas

> *"Guardar capturas de las respuestas como evidencia del funcionamiento."*

### Ejecutar esto en la Terminal B

```bash
python -m pytest -v
```

**Salida esperada:**

```
52 passed
```

Son las 22 pruebas de HU-BAK-01 más las 30 de esta historia, que están en `tests/test_consulta.py` y agrupadas por criterio de aceptación. Se ejecutan contra una base temporal, así que no afectan los datos reales.

Para ejecutar solamente las de esta historia:

```bash
python -m pytest tests/test_consulta.py -v
```

**Salida esperada:**

```
30 passed
```



En la Terminal A, presionar `Ctrl+C` para detener el servicio.


---

## Secuencia completa

Este es el orden exacto para rehacer todo desde cero.

Borrar los datos que haya de antes:

```bash
Remove-Item -Recurse -Force datos
```

**Actividad 2.** Crear la base:

```bash
python -c "from app import storage; storage.inicializar(); print('base creada en', storage.settings.db_path)"
```

**Actividad 2.** Terminal A, dejar abierta:

```bash
python -m uvicorn app.main:app --reload --port 8000
```

**Actividad 2.** Terminal B, cargar los doce registros:

```bash
python tools/enviar_registros.py --n 12 --invalidos --duplicados
```

**Actividades 2, 3 y 4.** Terminal B, consultar cada endpoint:

```bash
python -c "import requests, json; [print(r, json.dumps(requests.get('http://127.0.0.1:8000/v1'+r).json(), indent=2, ensure_ascii=False)) for r in ('/health','/registros/ultimo','/registros/resumen')]"
```

**Actividad 5.** Terminal B:

```bash
python tools/consultar_endpoints.py
```

**Actividad 6.** Terminal B:

```bash
python tools/verificar_ultimo.py
```

**Actividad 7.** Terminal B:

```bash
python -m pytest -v
```

---

## Lista de cumplimiento

Marcar cada actividad cuando ya se ejecutó y cuando su salida coincide con la esperada.

- [ ] **Act. 1.** El comando lista cinco rutas, una sola `POST`, y los campos de los tres modelos
- [ ] **Act. 2.** El `/v1/health` responde `200` con `registros_almacenados: 12`, y `503` cuando la base no existe
- [ ] **Act. 3.** El `/v1/registros/ultimo` devuelve el `record_id: 12` completo
- [ ] **Act. 4.** El `/v1/registros/resumen` devuelve los cuatro bloques y `productividad_media_pct: 81.1`
- [ ] **Act. 5.** Los cuatro endpoints responden y los cuatro métodos de escritura dan `405`
- [ ] **Act. 6.** Las cinco comprobaciones en `[ OK ]` y el `DELETE` rechazado por el motor
- [ ] **Act. 7.** `52 passed`

---

## Resolución de problemas

| Síntoma | Causa y solución |
|---|---|
| `HTTP 503` en `/v1/health` sin haberlo provocado | La base no existe. Ejecutar el comando que la crea en la actividad 2 |
| `HTTP 404` en `/v1/registros/ultimo` | La base está creada pero vacía. Falta cargar los registros con `enviar_registros.py` |
| `Connection refused` | El servicio no está activo. Revisar la Terminal A |
| `FileNotFoundError: no existe la base` al ejecutar las herramientas | Las herramientas leen la base directamente, así que se aplica lo mismo que arriba |
| `productividad_media_pct` distinto de `81.1` | Se cargó un número de registros distinto de 12, o se ejecutó `verificar_ultimo.py` antes de consultar el resumen |
| `attempt to write a readonly database` fuera de la actividad 6 | Un endpoint de consulta está intentando escribir. La protección está funcionando, pero eso indica que hay un error en el código |

---

## Relación con las historias dependientes

| Historia | Qué toma de aquí |
|---|---|
| **HU-DASH-01** (Angela, Sprint 1) | Los tres endpoints y sus modelos, que quedan publicados en `/docs`. El wireframe se arma sobre el `resumen` y el `ultimo` |
| **HU-INF-01** (Miguel, Sprint 1) | El `/v1/health` es el punto que consulta el monitoreo para saber si el backend sigue estando activo |
| **HU-BAK-03** (Sprint 2) | Cuando se amplíe `METRICAS_REQUERIDAS`, el bloque `indicadores` se amplía con ellas. La envoltura del resumen no cambia |
| **HU-BAK-05** (Sprint 3) | La consulta por empleado se agrega como filtro sobre estos mismos endpoints. El índice por `employee_id` ya existe |
| **HU-ANA-09** (Yulieth, Sprint 4) | El `en_modo_privado` ya viene contado en `totales` |
| **HU-ETI-03** (Angela, Sprint 4) | La conexión en modo `ro` es la evidencia técnica de que la consulta no puede alterar el dato capturado |
