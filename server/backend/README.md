# Backend — Infraestructura Telemática para el Análisis de Dinámicas de Trabajo Remoto

Servicio que recibe la actividad de trabajo, la persiste en PostgreSQL con TimescaleDB y la expone por una API con control de acceso por rol. Es la reescritura del prototipo sobre la base de datos real y en contenedores. Recibe eventos de los sensores y de los conectores, los guarda, lee la analítica que calcula otro contenedor y entrega a cada rol lo que le corresponde.

Construido con **Node.js 22**, **Express**, **JWT** y el cliente **pg** sobre **PostgreSQL** con la extensión **TimescaleDB**. Las lecturas de los sensores entran por HTTP y por un broker **MQTT**.

---

## Descripción

El backend recoge señales de trabajo sin acceder a contenido privado. El principio de diseño es la minimización. Se guardan agregados y actividad verificable, nunca contenido de comunicaciones ni navegación específica. Los datos de la persona se referencian por su identificador y el token de sesión solo lleva el id y el rol, sin información personal.

El servicio cubre la entrada de datos, el almacenamiento y el acceso. No calcula el puntaje SPACE ni genera alertas. Ese trabajo vive en el contenedor de analítica, que escribe sus resultados en dos tablas. El backend solo las lee y las entrega por la API. Si todavía no hay analítica, la respuesta sale vacía pero válida.

### Roles y visibilidad

| Rol | Qué ve |
|---|---|
| Administrador del sistema | Crea las cuentas y asigna los roles. No ve métricas. Es una figura técnica, distinta del gerente |
| Empleado | El contexto de su espacio, su jornada, sus alertas y qué datos se recogen. Inicia y cierra la jornada, responde las microencuestas y ajusta sus umbrales ambientales. Ninguna métrica de productividad, ni la propia |
| Líder de equipo | El puntaje de cada integrante de su equipo con el desglose por dimensión, el agregado del equipo y la conectividad de sus integrantes en solo lectura |
| Gerente | Los equipos en cascada con la métrica de cada líder, y la operación de los dispositivos y la conectividad de toda la organización |

Solo se mide al empleado. El líder y el gerente consumen esas métricas, no las generan sobre sí mismos. El líder es miembro del equipo de líderes y a cada equipo de empleados le corresponde uno de esos líderes.

---

## Arquitectura

Separación por responsabilidad. Cada capa tiene una sola tarea y no conoce las de arriba.

```
src/
├── config/        Variables de entorno y constantes del servicio
├── db/            Pool de conexiones a PostgreSQL
├── repositories/  Acceso a cada tabla, SQL siempre parametrizado
├── services/      Logica pura sobre las filas ya consultadas
├── controllers/   Traducen la peticion HTTP a llamadas de servicio
├── routes/        API, prefijos y guardas de rol
├── middlewares/   Sesion, rol, validacion, limite de intentos, errores
├── mqtt/          Suscriptor que recibe las lecturas del ESP32
├── utils/         Fechas y validadores reutilizables
├── app.js         Ensamblaje de Express
└── server.js      Arranque del servidor y del suscriptor MQTT
```

Los servicios son funciones puras sobre datos ya leídos, así que se prueban sin base. Los repositorios se verifican contra el stack levantado. El motor de puntaje no conoce HTTP. Una lectura que llega por el broker y una que llega por la ingesta HTTP terminan en el mismo `INSERT`, y el cálculo no cambia.

Recorrido de una consulta por rol:

```
GET /api/equipo   (token de un lider)
   │
   ├─ auth.middleware    verifica el token y extrae el rol
   ├─ api.routes         exige rol lider ──── si no ──→ 403
   ├─ lider.controller   pide el equipo y su analitica
   ├─ repositories       leen miembros y tablas de analisis
   ├─ equipo.service     arma el desglose por dimension
   └─ 200 con el equipo y el agregado
```

Recorrido del detalle de una persona (la ruta nueva, que además habla con la analítica):

```
GET /api/equipo/integrantes/4/analitica   (token de un lider)
   │
   ├─ auth.middleware      verifica el token y extrae el rol
   ├─ api.routes           exige rol lider ──── si no ──→ 403
   ├─ lider.controller     comprueba que la persona sea de su equipo ──── si no ──→ 404
   ├─ analitica.controller valida dias y semanas ──── si fallan ──→ 400
   ├─ analitica.client     pide a la analitica el catalogo de metricas (lo guarda en memoria) ──── si no hay ──→ 503
   ├─ analyses.repo        lee de la base los resultados guardados de la persona
   ├─ analitica.client     pide a la analitica las correlaciones de la persona (si falla, van en null)
   ├─ analitica.service    arma las cinco dimensiones con historial, franjas y correlaciones
   └─ 200 con el detalle
```

Recorrido de una ingesta de sensor:

```
POST /api/ingesta/esp32   (ESP32 por HTTP, o el broker por MQTT)
   │
   ├─ exigeTokenIngesta   compara el token compartido ──── si no ──→ 401
   ├─ validacion          valida los campos de la lectura ──── si falla ──→ 400
   ├─ ingest.service      convierte la lectura en evento
   ├─ events.repo         INSERT en la hypertable
   └─ 200 con el acuse
```

---

## Cambios de esta versión

Esta versión conecta el backend con el contenedor de analítica y le permite entregar, por persona, el historial de resultados listo para dibujar. La autenticación, los roles, la ingesta, el panel del empleado y la operación no cambiaron. El acuerdo con los demás componentes está en [`docs/interoperabilidad.md`](../../docs/interoperabilidad.md).

### Agregado

| Qué | Dónde |
|---|---|
| Ruta `GET /api/equipo/integrantes/:id/analitica` (líder) y `GET /api/organizacion/integrantes/:id/analitica` (gerente), con `dias` y `semanas` opcionales | `routes/api.routes.js`, `controllers/lider.controller.js`, `controllers/gerente.controller.js` |
| Controlador compartido por las dos rutas | `controllers/analitica.controller.js` |
| Cliente de la analítica: catálogo de métricas (en memoria) y correlaciones | `services/analitica.client.js` |
| Servicio puro que arma el detalle de una persona | `services/analitica.service.js` |
| Lectura del historial de resultados de una persona | `repositories/analyses.repo.js` (`historialDePersona`) |
| Validación de `dias` (1 a 120) y `semanas` (1 a 26) | `utils/validacion.js` (`validarVentana`) |
| Variables `ANALYTICS_URL`, `ANALYTICS_TIMEOUT_MS`, `ANALYTICS_CATALOGO_TTL_MS` | `config/index.js`, `.env.example` |

El empleado **no** tiene ruta de detalle: nadie ve sus propias métricas.

### Corregido

- **`/api/equipo` y `/api/organizacion` juntaban las métricas de todas las semanas.** Analítica guarda una fila de dimensión por semana, y la consulta las traía todas; el servicio se quedaba con el puntaje de la más reciente pero metía en una sola lista las métricas de todas (en el entorno de prueba, 21 métricas en lugar de 3 para la dimensión A). Ahora `analyses.repo.deUsuarios` trae solo el periodo más reciente de cada persona, dimensión y frecuencia.
- **S y P salían siempre vacías en el resumen.** Solo tienen métricas diarias y la consulta solo leía las filas semanales (`frequency = 'week'`). Ahora, por dimensión, el resumen trae el resultado de la última semana: el de sus métricas semanales y por sprint si lo tiene y, si no, el promedio de la semana de sus métricas diarias (la fila `day` con rango de lunes a domingo).

### Cambios de comportamiento (misma forma de respuesta)

- En `/api/equipo` y `/api/organizacion` los campos son los mismos, pero `frequency` puede ser `day` en las dimensiones S y P (el promedio de la semana de sus métricas diarias; su lista `metricas` va vacía porque esas filas no tienen métricas ligadas), y `metricas` trae solo las del periodo más reciente.
- El agregado del equipo (`equipo.agregado`) ahora incluye S y P, por lo que el radar del frontend ya no las dibuja en 0.
- En A y E, el resumen muestra el resultado semanal de las métricas semanales y por sprint, mientras que el detalle por persona abre en la vista del día. Los dos números son correctos y pueden diferir.

### Sigue igual

- Inicio de sesión, tokens, cambio de clave, roles y guardas de ruta, límite de intentos y cabeceras de seguridad.
- Panel del empleado, jornada, encuestas, umbrales y alertas.
- Ingesta de sensores (HTTP y MQTT), de GitHub, de Jira y por contrato.
- Operación del gerente (dispositivos, conectividad y configuración) y conectividad del líder.
- Cómo se alcanza la base de datos y el proxy de nginx hacia `/api`.
- Rutas ya existentes: misma dirección y misma estructura de respuesta.

### Dependencia nueva y qué pasa si falla

El backend ahora es **cliente de la analítica** (`http://analytics:8000`, solo red interna). No agrega paquetes: usa `fetch`, incluido en Node 22.

| Si la analítica... | Efecto |
|---|---|
| No responde y el backend nunca tuvo el catálogo | Las rutas de detalle contestan `503`. Todo lo demás sigue funcionando |
| No responde, pero el backend ya tenía el catálogo | Sigue usando el último catálogo, aunque haya vencido |
| No responde a las correlaciones | El detalle se entrega con `correlaciones: null` |
| Cambia sus correlaciones (texto, números, relaciones nuevas) | Nada: el backend las pasa tal cual y no valida su contenido |
| Cambia su catálogo | El backend lo toma al vencer su copia en memoria (10 minutos) |

---

## Requisitos

- Docker y Docker Compose
- Node.js 22 o superior, solo para correr las pruebas y el seed fuera del contenedor

La base y el broker se levantan como servicios del `docker-compose.yml`. El servicio de base no publica puerto hacia el host. Solo es alcanzable desde la red interna por los otros contenedores.

---

## Variables de entorno

Las variables se documentan en `.env.example`. Para una copia local se copia a `.env` y se ajusta.

| Variable | Descripción |
|---|---|
| `PORT` | Puerto donde escucha el backend |
| `DATABASE_URL` | Cadena de conexión a PostgreSQL |
| `JWT_SECRET` | Clave para firmar los JWT de sesión |
| `MQTT_URL` | URL del broker MQTT |
| `MQTT_TOPIC` | Tópico donde el ESP32 publica sus lecturas |
| `MQTT_USERNAME`, `MQTT_PASSWORD` | Credenciales del broker, opcionales. Vacías si el broker es anónimo |
| `INGEST_TOKEN` | Token compartido que autentica la ingesta HTTP de sensores |
| `CORS_ORIGIN` | Orígenes permitidos para CORS, separados por comas |
| `GITHUB_WEBHOOK_SECRET` | Secreto compartido con el webhook de GitHub. Valida la firma de cada aviso |
| `GITHUB_TOKEN` | Token de la API de GitHub. Opcional y reservado: aún no se usa en el código |
| `JIRA_STORY_POINTS_FIELD` | Id del campo de story points en Jira, por ejemplo `customfield_10016` |
| `ANALYTICS_URL` | Dirección del contenedor de analítica por la red interna. Por defecto `http://analytics:8000` |
| `ANALYTICS_TIMEOUT_MS`, `ANALYTICS_CATALOGO_TTL_MS` | Espera máxima por respuesta de analítica (4000) y tiempo que se guarda en memoria su catálogo de métricas (10 minutos) |

En producción el `JWT_SECRET` y el `INGEST_TOKEN` se fijan con cadenas largas y aleatorias, por ejemplo la salida de `openssl rand -hex 32`, y el `CORS_ORIGIN` se acota al dominio real del frontend. Los valores de `.env.example` son solo de desarrollo.

---

## Ejecución

Desde la carpeta `server`, levantar todo el stack:

```bash
docker compose up --build
```

Con los contenedores arriba, sembrar los datos de demostración dentro del contenedor del backend:

```bash
docker compose exec backend npm run seed
```

**Salida esperada:**

```
Seed completado. Usuarios creados: gerente1, lider1, empleado1, empleado2
Conteos: { ... }
```

El backend queda en `http://localhost:3000` y el frontend en `http://localhost`. Cada usuario de la demo tiene su propia clave, distinta, que el seed genera al azar y escribe en `server/backend/.seed-credenciales.txt`. Ese archivo está fuera de git y no se sube al repositorio.

| Usuario | Rol | Qué demuestra al entrar |
|---|---|---|
| admin1 | administrador | Crea cuentas y asigna roles |
| gerente1 | gerente | Los equipos en cascada y la operación de la organización |
| lider1 | líder | Su equipo con el desglose y la conectividad de sus integrantes |
| empleado1, empleado2 | empleado | El contexto de su espacio, sus alertas y la transparencia. Sin métricas de productividad |

La imagen del backend no siembra en el build. El seed es un paso aparte para no acoplar la construcción de la imagen a los datos.

Las dos tablas de analítica las llena el contenedor de analítica. El seed deja filas de ejemplo para que las vistas de líder y gerente muestren datos en la demo. En un despliegue real el backend solo lee lo que la analítica haya escrito.

---

## API

Los endpoints de la API cuelgan del prefijo `/api`. La ingesta de sensores cuelga de `/api/ingesta`.

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/api/login` | público | Entrega un token según usuario y clave |
| `GET` | `/api/usuarios-demo` | público | Lista de usuarios para el selector de la demo. Apagado en producción |
| `POST` | `/api/cambiar-clave` | sesión | El usuario cambia su propia clave |
| `POST` | `/api/usuarios` | admin | Crea una cuenta y asigna su rol, con clave temporal |
| `POST` | `/api/usuarios/:id/restablecer-clave` | admin | Restablece la clave de una cuenta |
| `GET` | `/api/estado` | público | Estado del servicio y si hay datos sembrados |
| `GET` | `/api/salud` | público | Comprobación de estado del servicio y la base |
| `GET` | `/api/mi-panel` | empleado | Contexto del espacio, jornada, umbrales y alertas. Sin métricas de productividad |
| `POST` | `/api/jornada/iniciar` | empleado | Abre la jornada del día |
| `POST` | `/api/jornada/finalizar` | empleado | Cierra la jornada abierta |
| `POST` | `/api/encuesta-diaria` | empleado | Registra la microencuesta del día |
| `GET` | `/api/encuesta-semanal/estado` | empleado | Dice si falta la encuesta de la semana |
| `POST` | `/api/encuesta-semanal` | empleado | Registra la encuesta de la semana |
| `GET` | `/api/umbrales` | empleado | Sus umbrales ambientales |
| `PUT` | `/api/umbrales` | empleado | Ajusta sus umbrales ambientales |
| `GET` | `/api/equipo` | líder | Su equipo, individual y agregado. Por dimensión trae el resultado de la última semana: el de sus métricas semanales y por sprint, o el promedio de sus métricas diarias si no tiene semanales |
| `GET` | `/api/equipo/conectividad` | líder | Conectividad de sus integrantes, solo lectura |
| `GET` | `/api/organizacion` | gerente | Los equipos en cascada |
| `GET` | `/api/organizacion/equipo/:liderId` | gerente | Un equipo de su cadena de mando |
| `GET` | `/api/equipo/integrantes/:id/analitica` | líder | Historial por dimensión y por métrica de un integrante de su equipo, listo para graficar |
| `GET` | `/api/organizacion/integrantes/:id/analitica` | gerente | Lo mismo para un integrante de cualquier equipo de su organización |
| `GET` | `/api/operacion/dispositivos` | gerente | Estado de los dispositivos de la organización |
| `GET` | `/api/operacion/conectividad` | gerente | Conectividad de toda la organización |
| `GET` | `/api/operacion/config` | gerente | Parámetros de operación |
| `PUT` | `/api/operacion/config` | gerente | Ajusta los parámetros de operación |
| `POST` | `/api/ingesta/esp32` | token | Recibe una lectura cruda del ESP32 y la traduce al contrato |
| `POST` | `/api/ingesta` | token | Recibe un evento ya en el contrato del equipo, de cualquier conector |
| `POST` | `/api/ingesta/github` | firma | Recibe webhooks de GitHub (PRs, revisiones y commits) |
| `POST` | `/api/ingesta/jira` | token | Recibe avisos de Jira Automation (tareas creadas y cambios de estado) |

### Detalle de analítica de una persona

`GET /api/equipo/integrantes/:id/analitica` (líder) y `GET /api/organizacion/integrantes/:id/analitica` (gerente) entregan, para una persona, todo lo que el frontend necesita para dibujar la vista del día y la de la semana sin calcular nada. Si la persona no es del equipo u organización de la sesión responde `404`. El empleado no tiene esta ruta: nadie ve sus propias métricas.

Parámetros opcionales: `dias` (1 a 120, por defecto 30) y `semanas` (1 a 26, por defecto 8). La ventana se cuenta hacia atrás desde el **día de referencia**, el último día con resultado de al menos dos dimensiones. Un día suelto con una sola dimensión, como un fin de semana en que solo se guarda "días sin commits", no cuenta como último día y sus filas posteriores se omiten.

```json
{
  "usuario": { "id": 4, "username": "empleado1", "full_name": "Elena Castro" },
  "referencia": "2026-10-16",
  "ventana": { "dias": 30, "semanas": 8 },
  "catalogo_version": "391e7aa58a63",
  "dimensiones": [
    {
      "dimension": "E", "nombre": "Eficiencia y flujo",
      "diaria": {
        "ultimo": { "start_date": "2026-10-16", "end_date": "2026-10-16", "normalized_score": 5.9,
                    "criticality_status": "critico", "metricas_medidas": 5, "metricas_total": 5 },
        "anterior": { "...": "el punto del dia previo" },
        "variacion": -0.3,
        "historial": [ { "start_date": "2026-09-21", "end_date": "2026-09-21", "normalized_score": 8.4, "criticality_status": "optimo" } ],
        "promedios_semanales": [ { "start_date": "2026-10-12", "end_date": "2026-10-18", "normalized_score": 6.4, "criticality_status": "precaucion" } ]
      },
      "semanal": { "ultimo": { "...": "igual que en diaria" }, "anterior": {}, "variacion": -2.7, "historial": [] },
      "metricas": [
        {
          "metric_name": "latencia_red_ms", "nombre": "Latencia de red", "unidad": "ms", "formato": "{v} ms", "decimales": 0,
          "mejor": "menos", "frecuencia": "diaria", "escala": { "min": 0, "max": 225 },
          "franjas": [ { "desde": 0, "hasta": 50, "estado": "optimo" }, { "desde": 50, "hasta": 150, "estado": "precaucion" },
                       { "desde": 150, "hasta": 225, "estado": "critico" } ],
          "ultimo": { "start_date": "2026-10-16", "end_date": "2026-10-16", "raw_value": 188.1, "normalized_value": 5.3, "criticality": "critico" },
          "historial": [ { "start_date": "2026-09-21", "end_date": "2026-09-21", "raw_value": 55, "normalized_value": 7.1, "criticality": "precaucion" } ]
        }
      ]
    }
  ],
  "correlaciones": { "calculado_en": "2026-10-24T00:10:03-05:00", "metricas": [], "dimensiones": [], "conclusion_dimensiones": null }
}
```

- Siempre vienen las cinco dimensiones. `diaria` o `semanal` es `null` cuando la dimensión no tiene resultados de esa frecuencia (C solo tiene semanal; S y P solo diaria).
- `diaria` y `semanal` no se mezclan ni se promedian entre sí. `promedios_semanales` es el promedio de la semana de los puntos diarios, para la vista de la semana.
- Cada métrica trae su `historial` ordenado de más antiguo a más reciente, con la fecha de cada punto, y `ultimo`. `frecuencia` dice si se dibuja por día (línea) o por semana o sprint (barras).
- `franjas` y `escala` son las del catálogo de analítica, en la unidad de la métrica. En las métricas por sprint `franjas` es `null`, porque su puntaje sale de la diferencia con el promedio de sus sprints anteriores (`umbrales_relativos`). La escala es una sugerencia: si algún valor la supera, quien dibuja la amplía.
- `normalized_score` y `normalized_value` están en escala 0 a 10 (óptimo 8 a 10, precaución 6 a 7.9, crítico 0 a 5.9). El backend no calcula ninguno: los lee de `dimension_analyses` y `metric_analyses`.
- `correlaciones.conclusion_dimensiones` es la conclusión que redacta la analítica sobre qué dimensiones se mueven juntas (`estado`, `mensaje`, `interpretacion`, `aviso`, `puntajes`, `relaciones`, `sin_datos`); es `null` si la analítica aún no la trae. `interpretacion` es la lectura de un LLM y es `null` si no hay LLM configurado o falló. El backend lo pasa tal cual.
- `correlaciones` se lee de analítica en cada petición (ella las guarda en memoria y las renueva con cada cierre) y es `null` si analítica no responde. El catálogo se guarda en memoria del backend; si analítica no responde y no hay ninguno guardado, la ruta responde `503`.

### Control de acceso

Cada endpoint de la API verifica el token y el rol en el servidor. Sin token responde `401`. Con un rol que no corresponde responde `403`. El empleado no tiene ningún endpoint que devuelva métricas de productividad, ni las de otros ni las suyas. Lo que ve por su panel es el contexto de su propio espacio.

La ingesta no usa sesión. La autentica un token compartido que viaja en la cabecera `X-Ingest-Token` o `X-Ingesta-Token`, o como `Bearer`. Sin token válido responde `401`.

### Ingesta por contrato

`POST /api/ingesta` recibe eventos ya en el contrato del equipo, para los conectores que no son el firmware. El cuerpo es `{ identifier, event_type, time, payload }`. El backend ubica la fuente por `identifier` en `data_sources`, guarda el evento en `events` con su `payload` tal cual y responde `2xx`. Si el `identifier` no tiene fuente registrada responde `404`, y el conector puede reintentar. El `esp32` tiene su propio endpoint porque envía crudo que hay que traducir, mientras que por aquí el evento ya llega con su forma final.

```json
{
  "identifier": "SCRUM",
  "event_type": "issue_updated",
  "time": "2026-10-20T22:30:00Z",
  "payload": { "issue_key": "SCRUM-3", "status_from": "Bloqueado", "status_to": "En curso" }
}
```

---

## Seguridad

Los controles siguen las guías de OWASP para autenticación, límites de recursos y cabeceras.

- **Claves con bcrypt.** Las contraseñas se guardan como hash, nunca en claro.
- **Sesión con JWT.** El token lleva solo el id y el rol, sin información personal, y caduca a las ocho horas.
- **Guardas de rol.** Cada endpoint exige sesión y el rol que le corresponde, resuelto en el servidor.
- **Token de ingesta.** La entrada de sensores exige un token compartido que se compara en tiempo constante.
- **Validación de entrada.** Las peticiones con cuerpo exigen `application/json` y pasan por un validador. Un tipo distinto responde `415` y un campo inválido responde `400`.
- **Límite de intentos.** El login acepta diez intentos por IP cada quince minutos y la ingesta sesenta lecturas por minuto. Al pasar el límite responde `429`.
- **Cabeceras de seguridad.** Helmet fija las cabeceras recomendadas y oculta la firma del servidor.
- **CORS restringido.** Solo se aceptan los orígenes de `CORS_ORIGIN`, no cualquiera.
- **Firma de webhooks.** Los avisos de GitHub se validan con HMAC-SHA256 sobre el cuerpo crudo y se comparan en tiempo constante. Los de Jira se autentican con el token de ingesta.

### Seguridad de cuentas

Sigue OWASP y NIST SP 800-63B.

- **Sin registro abierto.** Las cuentas las crea el administrador del sistema y les asigna el rol. Nadie ajeno puede crearse una cuenta.
- **Clave propia por persona.** El administrador entrega una clave temporal y el sistema obliga a cambiarla en el primer ingreso. Mientras no se cambie, las rutas de negocio responden `403` con el código `debe_cambiar_clave`.
- **Política de contraseñas.** Mínimo doce caracteres, se admiten frases largas, se bloquean las claves comunes o triviales, sin reglas de composición obligatorias y sin rotación periódica forzada.
- **Sin enumeración de cuentas.** El login responde un error genérico, no dice si falló el usuario o la clave. `/api/usuarios-demo` solo existe en desarrollo.
- **Cuentas desactivables.** Una cuenta inactiva no inicia sesión, sin borrarla.

## Qué no subir a GitHub

Regla general: el código sí, los secretos no. Lo que nunca va al repositorio, ya cubierto por `.gitignore`:

- El archivo `.env` con los valores reales. Al repositorio va solo `.env.example`, la plantilla sin secretos.
- La clave `JWT_SECRET` y el `INGEST_TOKEN` de producción. Se entregan por un canal privado y se cargan por entorno en el servidor. El token de ingesta lo comparte el equipo de Jira, también por canal privado.
- El archivo `.seed-credenciales.txt` que genera el seed con las claves de la demo en claro.
- `node_modules` y la carpeta de datos de la base.

Si un secreto llega a subirse por error, no basta con borrarlo en un commit nuevo, porque queda en el historial. Hay que rotarlo, es decir, generar uno nuevo y reemplazarlo en todos lados.

---

## Pruebas

Las pruebas de los servicios corren sin base porque son funciones puras:

```bash
npm install
npm test
```

Los repositorios y la ingesta se verifican contra el stack levantado, no con pruebas unitarias.

---

## Estructura del proyecto

```
backend/
├── scripts/
│   └── seed.js          Datos de demostracion
├── src/
│   ├── config/          Entorno y constantes
│   ├── db/              Pool de PostgreSQL
│   ├── repositories/    Acceso por tabla
│   ├── services/        Logica pura
│   ├── controllers/     Peticion HTTP a servicio
│   ├── routes/          API y guardas de rol
│   ├── middlewares/     Sesion, validacion, limite, errores
│   ├── mqtt/            Suscriptor del ESP32
│   ├── utils/           Fechas y validadores
│   ├── app.js           Ensamblaje de Express
│   └── server.js        Arranque
├── tests/
├── Dockerfile
├── .env.example
├── package.json
└── README.md
```

---

## Decisiones de diseño

**PostgreSQL con TimescaleDB en lugar del SQLite del prototipo.** Los eventos de sensores crecen con el tiempo y encajan en una hypertable, que particiona por tiempo y permite una política de retención. El modelo pasa a una base real pensada para series temporales.

**El backend solo lee la analítica.** El puntaje SPACE y las alertas los calcula el contenedor de analítica y los escribe en dos tablas. El backend las lee y le pide a la analítica el catálogo de métricas y las correlaciones, pero no calcula nada. Separar el cálculo del acceso deja que cada parte evolucione sin tocar la otra.

**Las lecturas entran por HTTP y por MQTT.** El ESP32 publica en el broker y el suscriptor las guarda. Un envío directo por HTTP toma el mismo camino. El servicio de ingesta no sabe por dónde llegó la lectura.

**El empleado no ve métricas de productividad.** Su panel trae el contexto de su propio espacio, su jornada, sus alertas y la transparencia sobre qué se recoge. Interactúa con la herramienta, pero nunca ve un puntaje, para que no se vuelva vigilancia.

**El control de acceso se aplica siempre en el servidor.** El token dice quién pregunta y solo se devuelve lo que a ese rol le corresponde. El frontend no decide la visibilidad.

**La seguridad se aplica en el código, no solo se documenta.** El hash de claves, las guardas de rol, el token de ingesta, la validación, el límite de intentos y las cabeceras viven en el servicio desde el arranque.

---

## Estado

Implementado. Autenticación con JWT y roles, panel del empleado con jornada, microencuestas y umbrales, vistas de líder y gerente que leen la analítica, operación de dispositivos y conectividad, ingesta de sensores por HTTP y por MQTT, y los controles de seguridad.

Conectado a la analítica. El contenedor de analítica llena las tablas de puntaje; el backend las lee y le pide el catálogo y las correlaciones. Previsto. Los conectores reales de GitHub y Jira (el de Jira hoy envía `blocked_time_hours` en `null`, lo que impide calcular `tiempo_bloqueado_pct`), y el ajuste de los orígenes y los secretos para un despliegue de producción.
