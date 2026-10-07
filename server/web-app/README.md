# Prototipo de métricas por rol — Infraestructura Telemática para el Análisis de Dinámicas de Trabajo Remoto

Prototipo navegable que recibe actividad de trabajo, calcula un puntaje de productividad multidimensional y lo muestra según el rol de quien consulta. Nació como la Actividad 6 de la Unidad 3 con el backend, el motor de puntaje y el tablero. La Actividad 3 amplió el frontend con dashboards de líder y gerente, un panel de operación y visualización en tiempo real. La Actividad 4 empezó por la recepción de telemetría: un suscriptor MQTT que guarda las lecturas del sensor en la base. Funciona con datos sintéticos y queda como base para que cada integrante conecte su parte encima.

Construido con **Node.js**, **Express**, **JWT** y el **SQLite** integrado de Node. El tablero usa **Chart.js** servido desde el propio proyecto.

---

## Descripción

El prototipo recoge señales de trabajo sin acceder a contenido privado. El principio de diseño es la minimización: se miden agregados y actividad verificable, nunca contenido de comunicaciones ni navegación específica.

Recoge las decisiones que salieron de la sesión con el mentor de Mercado Libre. La actividad se mide desde eventos de GitHub y Jira y no vigilando dominios. El puntaje sigue el marco SPACE y combina las cinco dimensiones con una media geométrica ponderada por rol y por cliente. La visibilidad es por jerarquía. El puntaje apoya la decisión del líder, no decide ni sanciona por su cuenta.

Este componente cubre la entrada de datos, el cálculo, el acceso y la presentación. Recibe eventos, los almacena, calcula el puntaje y lo expone por una API con control de acceso por rol, más un tablero navegable que consume esa API.

### Roles y visibilidad

| Rol | Qué ve |
|---|---|
| Empleado | El contexto de su espacio (ambiente y conexión), su jornada y el tiempo extralaboral, sus alertas y qué datos se recogen. Inicia y cierra la jornada, responde la microencuesta del día y ajusta sus umbrales ambientales. Ninguna métrica de productividad, ni la propia |
| Líder de equipo | El puntaje de cada integrante con su desglose por dimensión y el agregado del equipo, en un radar de métricas agregadas, una tabla con indicadores en semáforo y un gráfico temporal de fatiga y ánimo |
| Gerente | Los equipos en cascada, con la métrica de cada líder, y un panel de operación con el estado de los dispositivos, los eventos de conectividad en tiempo real, la salud de los conectores y la configuración de monitoreo |

### Dimensiones del marco SPACE

| Dimensión | Señal que la alimenta |
|---|---|
| S · Satisfacción y bienestar | Microencuesta diaria al cerrar la jornada, con tres ítems de 1 a 5: ánimo al terminar, concentración y fatiga |
| P · Rendimiento | Proporción de commits que llegaron a un despliegue, con penalización por tickets reabiertos |
| A · Actividad | Commits verificados más tickets cerrados |
| C · Comunicación y colaboración | Revisiones de PR de otros y comentarios, sin contar autoaprobaciones |
| E · Eficiencia y flujo | Lead time de los tickets, invertido para que menos tiempo rinda más |

El ambiente, la conexión y el tiempo extralaboral no entran al puntaje. Se guardan como contexto para informar y correlacionar. El sobretiempo sale de la jornada que el empleado abre y cierra, comparada con la jornada pactada.

### Tablero y visualización

El tablero sirve las tres vistas de rol con el mismo lenguaje visual. La Actividad 3 añadió estos componentes:

- **Métricas agregadas.** Un radar con el perfil SPACE del equipo y, en el gerente, la organización en cascada.
- **Actividad general.** Una tabla de integrantes con el puntaje y cada dimensión en semáforo, que se despliega para ver el desglose y las preguntas para revisar.
- **Patrones temporales.** Un gráfico de doble eje con la fatiga en barras y el ánimo y el flujo en líneas, por día del período.
- **Estado de dispositivos.** Una tabla con el sensor, su última lectura y su estado, que se refresca sola.
- **Eventos de conectividad.** Dos series de tiempo, calidad de conexión y temperatura, con franjas de alerta de fondo que salen de los umbrales del diccionario.
- **Configuración de monitoreo.** El intervalo de muestreo en vivo y el diccionario de métricas y umbrales como referencia.

Los colores del semáforo (óptimo, precaución, crítico) salen del diccionario de métricas y umbrales que definió el equipo, el mismo que aparece como referencia en la configuración de monitoreo. La actualización en tiempo real se resuelve con un refresco periódico del panel de operación, sin recargar la página.

---

## Arquitectura

Separación por responsabilidad, cada módulo con una sola tarea:

```
src/
├── config.js     Constantes: periodo, dimensiones, referencias, umbrales, dispositivos y diccionario
├── db.js         Esquema y conexion SQLite
├── seed.js       Generador de datos sinteticos
├── ingest.js     Endpoints de entrada de datos
├── mqtt.js       Suscriptor MQTT que persiste las lecturas del sensor
├── scoring.js    Motor de puntaje SPACE
├── alertas.js    Evaluacion de umbrales y generacion de alertas
├── operacion.js  Consultas de dispositivos, conectividad y configuracion
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

Recorrido de una lectura del sensor por MQTT:

```
ESP32 ──publica──→ broker MQTT ──→ mqtt.js (suscriptor)
   │
   ├─ operacion.js   resuelve a quien pertenece el dispositivo
   ├─ db.js          INSERT en contexto por la misma via que la ingesta
   ├─ alertas.js     evalua la lectura contra el umbral del empleado
   └─ el dato queda disponible para el panel de operacion
```

El motor de puntaje no conoce HTTP. El suscriptor MQTT escribe el contexto por la misma vía que la ingesta y el cálculo no cambia. El control de acceso se aplica siempre en el servidor: el token dice quién pregunta y solo se devuelve lo que a ese rol le corresponde.

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
cd remote-work-dynamics/server/web-app
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
🤖 Suscriptor MQTT de Node.js conectado exitosamente a HiveMQ.
📡 Escuchando mensajes en el tópico: 'remote-work/esp32/ambiente'...
```

Con el servicio activo se abre `http://localhost:3000`. La clave de todos los usuarios de la demo es `demo123`.

| Usuario | Rol | Qué demuestra al entrar |
|---|---|---|
| Patricia Ruiz | gerente | La organización en cascada y el panel de operación |
| Andres Lopez, Marcela Diaz | líder | Un equipo, individual y agregado, con radar, tabla y patrones temporales |
| Juan Perez y otros | empleado | El contexto de su espacio, alertas y transparencia. Sin métricas de productividad |

Para ver el camino de los sensores hacia la ingesta por HTTP, con el servicio activo:

```bash
npm run simular
```

El suscriptor MQTT arranca junto con el servicio. Si no hay internet, informa el error de conexión y el resto del prototipo sigue funcionando.

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
| `GET` | `/api/equipo` | líder | Su equipo, individual y agregado, con la serie diaria de ánimo |
| `GET` | `/api/organizacion` | gerente | Los equipos en cascada |
| `GET` | `/api/organizacion/equipo/:liderId` | gerente | Un equipo de su cadena de mando |
| `GET` | `/api/operacion/dispositivos` | gerente | Estado de cada dispositivo con su última lectura |
| `GET` | `/api/operacion/conectividad` | gerente | Series de conexión y temperatura y los eventos recientes |
| `GET` | `/api/operacion/config` | gerente | Intervalo de muestreo y el diccionario de umbrales |
| `PUT` | `/api/operacion/config` | gerente | Ajusta el intervalo de muestreo |
| `GET` | `/api/estado` | público | Estado del servicio y si hay datos |
| `GET` | `/api/salud` | público | Comprobación de estado, con la base y cada conector |
| `POST` | `/ingesta/evento` | abierto | Recibe un evento de actividad |
| `POST` | `/ingesta/despliegue` | abierto | Confirma que un commit llegó a producción |
| `POST` | `/ingesta/sensor` | abierto | Recibe una lectura de contexto y evalúa los umbrales |

### Control de acceso

Cada endpoint de métricas verifica el token y el rol en el servidor. Sin token responde `401`. Con un rol que no corresponde responde `403`. El empleado no tiene ningún endpoint que devuelva métricas de productividad, ni las de otros ni las suyas. El panel de operación es solo del gerente y muestra infraestructura y contexto, nunca la productividad de una persona.

### `GET /api/equipo`

Vista del líder. Cada integrante con su desglose, el agregado del equipo y la serie diaria de ánimo que alimenta el gráfico temporal. La respuesta va recortada.

```json
{
  "lider": { "id": 2, "nombre": "Andres Lopez" },
  "periodo": "2026-09",
  "metricaLider": 63.5,
  "agregadoDimensiones": { "S": 68.8, "P": 62.3, "A": 53.1, "C": 83, "E": 74 },
  "integrantes": [
    {
      "usuario": { "id": 4, "nombre": "Juan Perez", "rol": "empleado", "arquetipo": "backend" },
      "compuesto": 90.8,
      "dimensiones": { "S": 81.3, "P": 90, "A": 90, "C": 100, "E": 91 },
      "banderas": [],
      "cobertura": 5,
      "contexto": { "temperatura": 22.9, "calidad_conexion": 87.9, "extralaboral_pct": 0.2 }
    }
  ],
  "serieAnimo": [
    { "fecha": "2026-09-03", "enps": 3.57, "fatiga": 2.71, "flujo": 3.14 }
  ],
  "preguntasParaElLider": []
}
```

### `GET /api/operacion/dispositivos`

Vista del gerente. Cada dispositivo con la persona a la que está asignado, su estado y la última lectura por métrica.

```json
{
  "dispositivos": [
    {
      "dispositivo": "ESP32_Wokwi",
      "descripcion": "Sensor ambiental ESP32 (DHT22 + ruido)",
      "asignadoA": "Juan Perez",
      "ultimaLectura": "2026-10-07T13:59:43.946Z",
      "enVivo": true,
      "estado": "en vivo",
      "lecturas": {
        "temperatura": { "valor": 31.5, "ts": "2026-10-07T13:59:43.943Z" },
        "humedad": { "valor": 48.2, "ts": "2026-10-07T13:59:43.946Z" },
        "ruido": { "valor": 85.7, "ts": "2026-10-07T13:59:43.946Z" },
        "calidad_conexion": { "valor": 84, "ts": "2026-09-24T09:00:00" }
      }
    }
  ],
  "ts": "2026-10-07T13:59:44.000Z"
}
```

### `GET /api/salud`

Comprobación de estado. Dice si la base responde y cuándo entró por última vez cada conector, incluido el de MQTT.

```json
{
  "estado": "ok",
  "base": "ok",
  "periodo": "2026-09",
  "usuarios": 10,
  "conectores": [
    { "nombre": "github", "ultimaIngesta": "2026-09-28T17:00:00", "estado": "activo" },
    { "nombre": "jira", "ultimaIngesta": "2026-09-28T16:00:00", "estado": "activo" },
    { "nombre": "sensores", "ultimaIngesta": "2026-09-24T09:00:00", "estado": "activo" },
    { "nombre": "mqtt", "ultimaIngesta": null, "estado": "sin datos" }
  ],
  "ts": "2026-10-07T13:42:54.468Z"
}
```

---

## Recepción MQTT

El suscriptor arranca con el servicio, se conecta al broker público y escucha el tópico del sensor ambiental. Cada mensaje del ESP32 trae un dispositivo, un número de lectura y las variables del entorno:

```json
{ "dispositivo": "ESP32_Wokwi", "lectura_id": 42, "temperatura": 24.1, "humedad": 53.0, "ruido_raw": 1800 }
```

Al llegar un mensaje, el suscriptor resuelve a qué empleado pertenece el dispositivo, guarda cada variable en la tabla de contexto por la misma vía que la ingesta y evalúa la lectura contra los umbrales de esa persona. El nivel de ruido llega como un valor crudo del potenciómetro y se lleva a una escala aproximada en decibeles para poder compararlo con el umbral. La escritura va envuelta en un control de errores, de modo que un problema de base de datos nunca interrumpe la escucha del suscriptor. El contexto nunca entra al puntaje.

El mapa de dispositivos vive en la tabla `dispositivos` y en la constante `DISPOSITIVOS` de `src/config.js`. Así una lectura que llega sin identificador de usuario queda atribuida al empleado correcto.

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

Una lectura de contexto por HTTP, que es lo que publica el simulador:

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

El seed crea una jerarquía de un gerente, dos líderes y siete empleados, repartidos en dos clientes con pesos distintos. A cada empleado le genera jornadas del mes, una microencuesta por día y sus umbrales de arranque. Registra además el sensor ESP32 del tablero Wokwi, asignado a Juan Perez, listo para recibir lecturas por MQTT. Trae casos preparados para que se note el comportamiento del motor:

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
| `INTERVALO_MONITOREO_SEGUNDOS` | `5` | Refresco del panel de operación en vivo |

Los umbrales ambientales de arranque están en `UMBRALES_DEFECTO`. El mapa de dispositivos está en `DISPOSITIVOS`. El diccionario de métricas y umbrales está en `DICCIONARIO_UMBRALES`, y las franjas numéricas de los gráficos en `BANDAS_GRAFICO`. Todo dentro del mismo `src/config.js`. Los pesos por rol y por cliente se siembran en `src/seed.js`. El puerto del servicio se toma de la variable `PORT`, con `3000` por defecto.

---

## Estructura del proyecto

```
web-app/
├── src/
│   ├── config.js       Constantes del modelo
│   ├── db.js           Esquema y conexion SQLite
│   ├── seed.js         Datos sinteticos
│   ├── ingest.js       Endpoints de ingesta
│   ├── mqtt.js         Suscriptor MQTT con persistencia
│   ├── scoring.js      Motor de puntaje SPACE
│   ├── alertas.js      Umbrales y alertas
│   ├── operacion.js    Dispositivos, conectividad y configuracion
│   ├── auth.js         Sesion JWT y rol
│   ├── routes.js       API y control de acceso
│   ├── server.js       Arranque
│   └── simulator.js    Nodo de sensores simulado
├── public/
│   ├── index.html      Tablero
│   ├── app.js          Logica del tablero
│   ├── styles.css
│   └── vendor/
│       └── chart.umd.min.js   Chart.js servido localmente
├── package.json
└── README.md
```

---

## Decisiones de diseño

**SQLite integrado de Node en lugar de un módulo nativo.** No compila nada, así que corre igual en cualquier máquina del equipo sin herramientas de compilación. El SQL es estándar, por lo que migrar a otro motor no obliga a reescribir las consultas.

**Media geométrica ponderada en lugar de un promedio.** Una dimensión floja pesa en el resultado. Con un promedio simple, subir la actividad tapa una satisfacción baja, y eso es justo lo que se quiere evitar.

**El empleado no ve métricas de productividad.** Fue una decisión del mentor. Su panel trae el contexto de su propio espacio, su jornada, sus alertas y la transparencia sobre qué se recoge. Interactúa con la herramienta, porque abre y cierra la jornada, responde la microencuesta y fija sus umbrales, pero nunca ve un puntaje, para que no se vuelva vigilancia.

**El panel de operación es solo del gerente y no muestra personas.** Reúne el estado de los dispositivos, la conectividad y la salud de los conectores. Es infraestructura y contexto, no el desempeño de nadie, para no convertir el monitoreo técnico en vigilancia.

**El ambiente, la conexión y el tiempo extralaboral quedan fuera del puntaje.** Son contexto que informa y correlaciona, no una vara para evaluar a la persona. El sobretiempo se muestra, pero el sistema no descuenta nada por él: acompañar al empleado es tarea del líder, no un castigo automático.

**Las alertas salen de los umbrales del empleado.** La persona decide desde qué valores quiere que le avisen, y cada lectura que llega por la ingesta o por MQTT se compara contra esas cotas. Cuando una las supera, se genera la alerta, siempre como contexto de bienestar.

**El semáforo del tablero sale del diccionario de métricas y umbrales.** Óptimo, precaución y crítico son los rangos que definió el equipo. El mismo diccionario aparece como referencia en la configuración de monitoreo, para que el color del tablero y la norma escrita no se separen.

**Chart.js se sirve desde el propio proyecto.** El archivo queda en `public/vendor`, así los gráficos funcionan en la sustentación aunque no haya internet, y el tablero no depende de un CDN externo. Las franjas de alerta de las series de tiempo se dibujan con un plugin propio, sin un segundo paquete.

**La visualización en tiempo real se resuelve con un refresco periódico.** El panel de operación vuelve a pedir los datos cada pocos segundos y actualiza las tablas y las series sin recargar la página. Para la escala del piloto alcanza, y evita montar un canal de streaming.

**El suscriptor MQTT escribe por la misma vía que la ingesta.** La lectura que llega del sensor se guarda en la tabla de contexto y se evalúa contra los umbrales igual que una lectura por HTTP. El motor de puntaje no cambia, y la escritura va protegida para que un fallo de base de datos no tumbe la escucha.

**La actividad cuenta solo si llegó a un despliegue.** Distingue el aporte real de los commits inflados que no salen del repositorio.

**Nadie aprueba su propio PR.** La revisión cruzada es la que sostiene la métrica de colaboración, así que la autoaprobación se descarta y se marca.

**Los patrones sospechosos son preguntas, no sanciones.** La métrica apoya la decisión del líder. El sistema no castiga por su cuenta.

**El tablero es estático y lo sirve el mismo Express.** Arranca con un comando, sin paso de compilación, y así cualquier integrante lo extiende sin montar un frontend aparte.

**Los datos son sintéticos.** Permiten demostrar el flujo completo antes de conectar GitHub, Jira o el broker MQTT reales.

---

## Estado

Implementado: ingesta de eventos, almacenamiento, motor de puntaje SPACE con verificación de despliegue y auditoría de PR, jornada laboral con tiempo extralaboral, microencuesta diaria que alimenta la satisfacción, umbrales ambientales por empleado con alertas automáticas, comprobación de estado, control de acceso por rol, tablero navegable para los tres roles con radar, tabla de indicadores en semáforo y gráfico temporal, panel de operación del gerente con estado de dispositivos, eventos de conectividad en tiempo real y salud de conectores, recepción de lecturas por MQTT con persistencia en la base, y simulador de sensores.

Previsto: conexión con las APIs reales de GitHub y Jira, más métricas del diccionario alimentadas desde la capa de analítica, persistencia de los puntajes calculados y endurecimiento de seguridad para un despliegue real.
