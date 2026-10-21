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

El backend queda en `http://localhost:3000` y el frontend en `http://localhost`. La clave de todos los usuarios de la demo es `Demo.2026`.

| Usuario | Rol | Qué demuestra al entrar |
|---|---|---|
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
| `GET` | `/api/usuarios-demo` | público | Lista de usuarios para el selector de la demo |
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
| `GET` | `/api/equipo` | líder | Su equipo, individual y agregado |
| `GET` | `/api/equipo/conectividad` | líder | Conectividad de sus integrantes, solo lectura |
| `GET` | `/api/organizacion` | gerente | Los equipos en cascada |
| `GET` | `/api/organizacion/equipo/:liderId` | gerente | Un equipo de su cadena de mando |
| `GET` | `/api/operacion/dispositivos` | gerente | Estado de los dispositivos de la organización |
| `GET` | `/api/operacion/conectividad` | gerente | Conectividad de toda la organización |
| `GET` | `/api/operacion/config` | gerente | Parámetros de operación |
| `PUT` | `/api/operacion/config` | gerente | Ajusta los parámetros de operación |
| `POST` | `/api/ingesta/esp32` | token | Recibe una lectura ambiental del ESP32 |
| `POST` | `/api/ingesta/github` | firma | Recibe webhooks de GitHub (PRs, revisiones y commits) |
| `POST` | `/api/ingesta/jira` | token | Recibe avisos de Jira Automation (tareas creadas y cambios de estado) |

### Control de acceso

Cada endpoint de la API verifica el token y el rol en el servidor. Sin token responde `401`. Con un rol que no corresponde responde `403`. El empleado no tiene ningún endpoint que devuelva métricas de productividad, ni las de otros ni las suyas. Lo que ve por su panel es el contexto de su propio espacio.

La ingesta no usa sesión. La autentica un token compartido que viaja en la cabecera `X-Ingest-Token` o como `Bearer`. Sin token válido responde `401`.

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

**El backend solo lee la analítica.** El puntaje SPACE y las alertas los calcula el contenedor de analítica y los escribe en dos tablas. Separar el cálculo del acceso deja que cada parte evolucione sin tocar la otra.

**Las lecturas entran por HTTP y por MQTT.** El ESP32 publica en el broker y el suscriptor las guarda. Un envío directo por HTTP toma el mismo camino. El servicio de ingesta no sabe por dónde llegó la lectura.

**El empleado no ve métricas de productividad.** Su panel trae el contexto de su propio espacio, su jornada, sus alertas y la transparencia sobre qué se recoge. Interactúa con la herramienta, pero nunca ve un puntaje, para que no se vuelva vigilancia.

**El control de acceso se aplica siempre en el servidor.** El token dice quién pregunta y solo se devuelve lo que a ese rol le corresponde. El frontend no decide la visibilidad.

**La seguridad se aplica en el código, no solo se documenta.** El hash de claves, las guardas de rol, el token de ingesta, la validación, el límite de intentos y las cabeceras viven en el servicio desde el arranque.

---

## Estado

IImplementado. Autenticación con JWT y roles, panel del empleado con jornada, microencuestas y umbrales, vistas de líder y gerente que leen la analítica, operación de dispositivos y conectividad, ingesta de sensores por HTTP y por MQTT, conectores de GitHub y Jira por webhooks (ver `integrations/`), y los controles de seguridad.

Previsto. La conexión de la capa de analítica que llene las tablas de puntaje, y el ajuste de los orígenes, los secretos y una URL pública fija para un despliegue de producción.
