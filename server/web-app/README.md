# Prototipo de métricas por rol — Infraestructura Telemática para el Análisis de Dinámicas de Trabajo Remoto

Prototipo navegable que recibe actividad de trabajo, calcula un puntaje de productividad multidimensional y lo muestra según el rol de quien consulta. Cubre la Actividad 6 de la Unidad 3 como una primera versión funcional del backend, el motor de puntaje y el tablero. Funciona con datos sintéticos y queda como base para que cada integrante conecte su parte encima.

Construido con **Node.js**, **Express**, **JWT** y el **SQLite** integrado de Node.

---

## Descripción

El prototipo recoge señales de trabajo sin acceder a contenido privado. El principio de diseño es la minimización: se miden agregados y actividad verificable, nunca contenido de comunicaciones ni navegación específica.

Recoge las decisiones que salieron de la sesión con el mentor de Mercado Libre. La actividad se mide desde eventos de GitHub y Jira y no vigilando dominios. El puntaje sigue el marco SPACE y combina las cinco dimensiones con una media geométrica ponderada por rol y por cliente. La visibilidad es por jerarquía. El puntaje apoya la decisión del líder, no decide ni sanciona por su cuenta.

Este componente cubre la entrada de datos, el cálculo y el acceso. Recibe eventos, los almacena, calcula el puntaje y lo expone por una API con control de acceso por rol, más un tablero navegable que consume esa API.

### Roles y visibilidad

| Rol | Qué ve |
|---|---|
| Empleado | El contexto de su espacio (ambiente y conexión), su jornada y el tiempo extralaboral, sus alertas y qué datos se recogen. Inicia y cierra la jornada, responde la microencuesta del día y ajusta sus umbrales ambientales. Ninguna métrica de productividad, ni la propia |
| Líder de equipo | El puntaje de cada integrante con su desglose por dimensión, y el agregado del equipo |
| Gerente | Los equipos en cascada, con la métrica de cada líder, que es la agregación de su equipo |

### Dimensiones del marco SPACE

| Dimensión | Señal que la alimenta |
|---|---|
| S · Satisfacción y bienestar | Microencuesta diaria al cerrar la jornada, con tres ítems de 1 a 5: ánimo al terminar, concentración y fatiga |
| P · Rendimiento | Proporción de commits que llegaron a un despliegue, con penalización por tickets reabiertos |
| A · Actividad | Commits verificados más tickets cerrados |
| C · Comunicación y colaboración | Revisiones de PR de otros y comentarios, sin contar autoaprobaciones |
| E · Eficiencia y flujo | Lead time de los tickets, invertido para que menos tiempo rinda más |

El ambiente, la conexión y el tiempo extralaboral no entran al puntaje. Se guardan como contexto para informar y correlacionar. El sobretiempo sale de la jornada que el empleado abre y cierra, comparada con la jornada pactada.

---

## Arquitectura

Separación por responsabilidad, cada módulo con una sola tarea:

```
src/
├── config.js     Constantes: periodo, dimensiones, referencias, arquetipos y umbrales
├── db.js         Esquema y conexion SQLite
├── seed.js       Generador de datos sinteticos
├── ingest.js     Endpoints de entrada de datos
├── scoring.js    Motor de puntaje SPACE
├── alertas.js    Evaluacion de umbrales y generacion de alertas
├── auth.js       Sesion con JWT y verificacion de rol
├── routes.js     API y control de acceso por rol
├── server.js     Ensamblaje y arranque
└── simulator.js  Nodo de sensores simulado
```

Recorrido de una consulta por rol:

```
GET /api/equipo   (token de un lider)
   │
   ├─ auth.js      verifica el token y extrae el rol
   ├─ routes.js    exige rol lider ──── si no ──→ 403
   ├─ scoring.js   calcula cada integrante y el agregado
   ├─ db.js        lee eventos, despliegues y revisiones
   └─ 200 con el equipo, individual y agregado
```

Recorrido de una ingesta:

```
POST /ingesta/evento   (GitHub, Jira o el simulador)
   │
   ├─ ingest.js    valida los campos minimos ──── si faltan ──→ 400
   ├─ db.js        INSERT del evento
   └─ 200 con el acuse
```

El motor de puntaje no conoce HTTP. Un transporte alterno, como un suscriptor MQTT, escribe por la misma ingesta y el cálculo no cambia. El control de acceso se aplica siempre en el servidor: el token dice quién pregunta y solo se devuelve lo que a ese rol le corresponde.

---

## Requisitos

- Node.js 22 o superior
- No requiere servidor de base de datos

La base de datos usa el módulo `node:sqlite`, integrado en Node, así que no compila nada nativo. En Node 22 ese módulo pide el flag `--experimental-sqlite`, ya incluido en los scripts.

---

## Instalación

```bash
git clone https://github.com/LMiguelGo/remote-work-dynamics.git
```

```bash
cd remote-work-dynamics/server/unidad-3/actividad-6-prototipo
```

```bash
npm install
```

---

## Ejecución

Sembrar los datos sintéticos:

```bash
npm run seed
```

**Salida esperada:**

```
Datos sinteticos listos: 10 usuarios, 184 eventos, periodo 2026-09.
Usuarios para entrar (clave demo123):
  - Patricia Ruiz (gerente)
  - Andres Lopez (lider)
  ...
```

Levantar el servicio:

```bash
npm start
```

**Salida esperada:**

```
Prototipo Actividad 6 escuchando en http://localhost:3000
```

Con el servicio activo se abre `http://localhost:3000`. La clave de todos los usuarios de la demo es `demo123`.

| Usuario | Rol | Qué demuestra al entrar |
|---|---|---|
| Patricia Ruiz | gerente | La organización en cascada |
| Andres Lopez, Marcela Diaz | líder | Un equipo, individual y agregado |
| Juan Perez y otros | empleado | El contexto de su espacio, alertas y transparencia. Sin métricas de productividad |

Para ver el camino de los sensores hacia la ingesta, con el servicio activo:

```bash
npm run simular
```

---

## API

Todos los endpoints de métricas cuelgan del prefijo `/api`. La ingesta cuelga de `/ingesta`.

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| `POST` | `/api/login` | público | Entrega un token según usuario y clave |
| `GET` | `/api/usuarios-demo` | público | Lista de usuarios para el selector de la demo |
| `GET` | `/api/mi-panel` | empleado | Contexto del espacio, jornada, umbrales, alertas y transparencia. Sin métricas de productividad |
| `POST` | `/api/jornada/iniciar` | empleado | Abre la jornada del día |
| `POST` | `/api/jornada/finalizar` | empleado | Cierra la jornada abierta |
| `POST` | `/api/encuesta-diaria` | empleado | Registra la microencuesta del día (tres ítems de 1 a 5) |
| `GET` | `/api/umbrales` | empleado | Sus umbrales ambientales |
| `PUT` | `/api/umbrales` | empleado | Ajusta sus umbrales ambientales |
| `GET` | `/api/equipo` | líder | Su equipo, individual y agregado |
| `GET` | `/api/organizacion` | gerente | Los equipos en cascada |
| `GET` | `/api/organizacion/equipo/:liderId` | gerente | Un equipo de su cadena de mando |
| `GET` | `/api/estado` | público | Estado del servicio y si hay datos |
| `GET` | `/api/salud` | público | Comprobación de estado, con la base y cada conector |
| `POST` | `/ingesta/evento` | abierto | Recibe un evento de actividad |
| `POST` | `/ingesta/despliegue` | abierto | Confirma que un commit llegó a producción |
| `POST` | `/ingesta/sensor` | abierto | Recibe una lectura de contexto y evalúa los umbrales |

### Control de acceso

Cada endpoint de métricas verifica el token y el rol en el servidor. Sin token responde `401`. Con un rol que no corresponde responde `403`. El empleado no tiene ningún endpoint que devuelva métricas de productividad, ni las de otros ni las suyas. Lo que ve por su endpoint es el contexto de su propio espacio.

### `POST /api/login`

Petición:

```json
{ "usuario": "Andres Lopez", "clave": "demo123" }
```

Respuesta `200`:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": { "id": 2, "nombre": "Andres Lopez", "rol": "lider" }
}
```

### `GET /api/mi-panel`

Vista del empleado. No devuelve métricas de productividad. Solo el contexto de su espacio, sus alertas y qué datos se recogen sobre él.

```json
{
  "nombre": "Laura Gomez",
  "capturaActiva": true,
  "mensaje": "Este panel no muestra metricas de productividad. Solo el contexto de tu espacio, tus alertas y que datos se recogen.",
  "ambiente": { "temperatura": 23.2, "humedad": 52, "presion": 1011, "estado": "Normal", "serieTemp": [22.6, 23.1, 23.4, 22.9, 23.2] },
  "conexion": { "calidad": 50, "estado": "Conexión inestable", "vpn": false },
  "bienestar": { "nivel": 62, "texto": "Requiere atención" },
  "jornada": { "estado": "cerrada", "inicio": null, "horasHoy": null, "horasPactadas": 8, "extralaboralPct": 14.8 },
  "encuestaPendiente": true,
  "umbrales": {
    "temperatura": { "minimo": 18, "maximo": 27 },
    "humedad": { "minimo": 30, "maximo": 70 },
    "calidad_conexion": { "minimo": 55, "maximo": null }
  },
  "queSeCaptura": [
    { "fuente": "github", "tipo": "commit" },
    { "fuente": "jira", "tipo": "ticket" }
  ],
  "alertas": [
    {
      "tipo": "conexion",
      "mensaje": "Tu conexión bajó del umbral que definiste (55/100). Se reporta como contexto, no afecta tu evaluación.",
      "ts": "2026-09-14T10:00:00"
    }
  ]
}
```

El ambiente, la conexión y el tiempo extralaboral son contexto del propio espacio del empleado, no una medida de su productividad. El campo `encuestaPendiente` dice si todavía falta la microencuesta del día.

### Jornada, microencuesta y umbrales

El empleado abre la jornada con `POST /api/jornada/iniciar` y la cierra con `POST /api/jornada/finalizar`. Al cerrar responde la microencuesta, con tres enteros de 1 a 5:

```json
{ "enps": 5, "flujo": 4, "fatiga": 2 }
```

Sus umbrales ambientales se consultan con `GET /api/umbrales` y se ajustan con `PUT /api/umbrales`. Un valor `null` deja esa cota sin límite:

```json
{
  "temperatura": { "minimo": 18, "maximo": 27 },
  "humedad": { "minimo": 30, "maximo": 70 },
  "calidad_conexion": { "minimo": 55, "maximo": null }
}
```

### `GET /api/salud`

Comprobación de estado. Dice si la base responde y cuándo entró por última vez cada conector.

```json
{
  "estado": "ok",
  "base": "ok",
  "periodo": "2026-09",
  "usuarios": 10,
  "conectores": [
    { "nombre": "github", "ultimaIngesta": "2026-09-28T17:00:00", "estado": "activo" },
    { "nombre": "jira", "ultimaIngesta": "2026-09-28T16:00:00", "estado": "activo" },
    { "nombre": "sensores", "ultimaIngesta": "2026-09-24T09:00:00", "estado": "activo" }
  ],
  "ts": "2026-09-23T04:42:54.468Z"
}
```

### `GET /api/equipo`

Vista del líder. Cada integrante con su desglose y el agregado del equipo. La respuesta va recortada a un integrante como ejemplo.

```json
{
  "lider": { "id": 2, "nombre": "Andres Lopez" },
  "periodo": "2026-09",
  "metricaLider": 64.5,
  "agregadoDimensiones": { "S": 68.8, "P": 62.3, "A": 53.1, "C": 83, "E": 74 },
  "integrantes": [
    {
      "usuario": { "id": 4, "nombre": "Juan Perez", "rol": "empleado", "arquetipo": "backend" },
      "compuesto": 90.8,
      "dimensiones": { "S": 82, "P": 90, "A": 90, "C": 100, "E": 91 },
      "banderas": [],
      "cobertura": 5,
      "contexto": { "temperatura": 24.1, "humedad": 51.3, "presion": 1011, "calidad_conexion": 89.4 }
    }
  ],
  "preguntasParaElLider": [
    {
      "integrante": "Diego Torres",
      "preguntas": [
        "Tiene 24 commits que no llegaron a un despliegue real. Conviene revisar con la persona si aportan valor."
      ]
    }
  ]
}
```

### `GET /api/organizacion`

Vista del gerente. Los equipos con su agregado y la métrica de cada líder.

```json
{
  "gerente": { "id": 1, "nombre": "Patricia Ruiz" },
  "periodo": "2026-09",
  "metricaOrganizacion": 65.2,
  "equipos": [
    {
      "lider": { "id": 2, "nombre": "Andres Lopez" },
      "metricaLider": 64.5,
      "tamano": 4,
      "preguntasAbiertas": 2,
      "agregadoDimensiones": { "S": 68.8, "P": 62.3, "A": 53.1, "C": 83, "E": 74 }
    }
  ]
}
```

---

## Formato de los datos de ingesta

Un evento de actividad, que es lo que enviarían GitHub o Jira:

```json
{ "usuario_id": 4, "fuente": "github", "tipo": "commit", "ref": "c-4-99", "meta": { "lineas": 40 } }
```

La confirmación de que un commit llegó a producción, que sostiene la verificación de despliegue:

```json
{ "usuario_id": 4, "commit_ref": "c-4-99", "ok": true }
```

Una lectura de contexto, que es lo que hoy publica el simulador y mañana el broker MQTT:

```json
{ "usuario_id": 4, "tipo": "conexion", "metrica": "calidad_conexion", "valor": 92 }
```

---

## Motor de puntaje

Para cada persona se leen las señales del mes y se calcula así:

- La satisfacción sale de las microencuestas del mes. Cada ítem va de 1 a 5, la fatiga se invierte porque más fatiga es peor, y el promedio se lleva a una escala de 0 a 100.
- La actividad cuenta solo los commits que aparecen en un despliegue. Los que no llegaron a producción se descartan antes de sumar.
- Las autoaprobaciones de PR no cuentan para la colaboración y quedan marcadas.
- Cada dimensión SPACE se lleva a una escala de 0 a 100 por distancia a una referencia.
- Las cinco dimensiones se combinan con una media geométrica ponderada, con pesos que dependen del rol y del cliente. La media geométrica hace que una dimensión floja pese en el resultado en lugar de taparse subiendo otra.
- El ambiente, la conexión y el tiempo extralaboral quedan fuera del cálculo y se devuelven como contexto. El sobretiempo se saca de la jornada que abre y cierra el empleado, frente a la jornada pactada.
- La métrica del líder es la agregación del desempeño de su equipo, no su actividad individual.

Los patrones sospechosos no bajan el puntaje por su cuenta. Se devuelven como preguntas para que el líder los converse: commits sin despliegue, intentos de autoaprobación, o una actividad real que no cuadra con el rol declarado.

---

## Datos sintéticos

El seed crea una jerarquía de un gerente, dos líderes y siete empleados, repartidos en dos clientes con pesos distintos. A cada empleado le genera jornadas del mes, una microencuesta por día y sus umbrales de arranque. Trae casos preparados para que se note el comportamiento del motor:

| Empleado | Caso | Qué muestra |
|---|---|---|
| Diego Torres | Muchos commits sin despliegue y jornadas largas | La actividad real baja, aparece un sobretiempo alto como contexto y le sale una pregunta al líder |
| Laura Gomez | Autoaprobación y conexión por debajo del umbral | Se marca la autoaprobación y la alerta se dispara sola desde las lecturas de conexión |
| Camilo Vargas | Backend cuyo fuerte real es la colaboración | Aparece un posible desajuste de rol |

---

## Configuración

Las constantes del modelo están en `src/config.js`.

| Constante | Valor | Descripción |
|---|---|---|
| `PERIODO` | `2026-09` | Ventana mensual del reporte |
| `HORAS_PACTADAS` | `8` | Jornada pactada, base del tiempo extralaboral |
| `REFERENCIAS.A_max` | `40` | Actividad verificable que rinde 100 |
| `REFERENCIAS.C_max` | `25` | Colaboración que rinde 100 |
| `REFERENCIAS.lead_min_h` | `8` | Lead time ideal en horas |
| `REFERENCIAS.lead_max_h` | `120` | Lead time malo en horas |

Los umbrales ambientales de arranque están en `UMBRALES_DEFECTO`, dentro del mismo `src/config.js`. Los pesos por rol y por cliente se siembran en `src/seed.js`. El puerto del servicio se toma de la variable `PORT`, con `3000` por defecto.

---

## Estructura del proyecto

```
actividad-6-prototipo/
├── src/
│   ├── config.js       Constantes del modelo
│   ├── db.js           Esquema y conexion SQLite
│   ├── seed.js         Datos sinteticos
│   ├── ingest.js       Endpoints de ingesta
│   ├── scoring.js      Motor de puntaje SPACE
│   ├── alertas.js      Umbrales y alertas
│   ├── auth.js         Sesion JWT y rol
│   ├── routes.js       API y control de acceso
│   ├── server.js       Arranque
│   └── simulator.js    Nodo de sensores simulado
├── public/
│   ├── index.html      Tablero
│   ├── app.js          Logica del tablero
│   └── styles.css
├── package.json
└── README.md
```

---

## Decisiones de diseño

**SQLite integrado de Node en lugar de un módulo nativo.** No compila nada, así que corre igual en cualquier máquina del equipo sin herramientas de compilación. El SQL es estándar, por lo que migrar a otro motor no obliga a reescribir las consultas.

**Media geométrica ponderada en lugar de un promedio.** Una dimensión floja pesa en el resultado. Con un promedio simple, subir la actividad tapa una satisfacción baja, y eso es justo lo que se quiere evitar.

**El empleado no ve métricas de productividad.** Fue una decisión del mentor. Su panel trae el contexto de su propio espacio, su jornada, sus alertas y la transparencia sobre qué se recoge. Interactúa con la herramienta, porque abre y cierra la jornada, responde la microencuesta y fija sus umbrales, pero nunca ve un puntaje, para que no se vuelva vigilancia.

**El ambiente, la conexión y el tiempo extralaboral quedan fuera del puntaje.** Son contexto que informa y correlaciona, no una vara para evaluar a la persona. El sobretiempo se muestra, pero el sistema no descuenta nada por él: acompañar al empleado es tarea del líder, no un castigo automático.

**Las alertas salen de los umbrales del empleado.** La persona decide desde qué valores quiere que le avisen, y cada lectura que llega por la ingesta se compara contra esas cotas. Cuando una las supera, se genera la alerta, siempre como contexto de bienestar.

**La actividad cuenta solo si llegó a un despliegue.** Distingue el aporte real de los commits inflados que no salen del repositorio.

**Nadie aprueba su propio PR.** La revisión cruzada es la que sostiene la métrica de colaboración, así que la autoaprobación se descarta y se marca.

**Los patrones sospechosos son preguntas, no sanciones.** La métrica apoya la decisión del líder. El sistema no castiga por su cuenta.

**El tablero es estático y lo sirve el mismo Express.** Arranca con un comando, sin paso de compilación, y así cualquier integrante lo extiende sin montar un frontend aparte.

**Los datos son sintéticos.** Permiten demostrar el flujo completo antes de conectar GitHub, Jira o el broker MQTT reales.

---

## Estado

Implementado: ingesta de eventos, almacenamiento, motor de puntaje SPACE con verificación de despliegue y auditoría de PR, jornada laboral con tiempo extralaboral, microencuesta diaria que alimenta la satisfacción, umbrales ambientales por empleado con alertas automáticas, comprobación de estado, control de acceso por rol, tablero navegable para los tres roles y simulador de sensores.

Previsto: conexión con las APIs reales de GitHub y Jira, recepción vía MQTT, más indicadores de la capa de analítica, persistencia de los puntajes calculados y endurecimiento de seguridad para un despliegue real.
