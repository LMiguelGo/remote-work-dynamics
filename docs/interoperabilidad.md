# Interoperabilidad: base de datos, analítica, backend y frontend

Este documento es el acuerdo entre los equipos de la base de datos, la analítica, el backend y el frontend: qué hace cada uno, qué escribe y qué lee, qué convenciones comparten y qué revisar cuando algo cambia. Cada componente tiene su propio documento con el detalle:

| Componente | Documento |
|---|---|
| Eventos que entran (contrato de los payloads) | [`data_guide.md`](data_guide.md) |
| Base de datos | [`database.md`](database.md) y `server/database/init/02-schema.sql` |
| Analítica | [`server/analytics/README.md`](../server/analytics/README.md) y [`contrato_backend.md`](../server/analytics/docs/contrato_backend.md) |
| Backend | [`server/backend/README.md`](../server/backend/README.md) |
| Frontend | [`server/frontend/README.md`](../server/frontend/README.md) |

## 1. Cómo viaja un dato

```
 ESP32, aplicación web,          ┌───────────────┐        ┌────────────────────────────┐
 GitHub, Jira, SonarQube, red ──►│   BACKEND     │──────► │  events  (hypertable)      │
                                 │   (ingesta)   │        │  data_sources              │
                                 └───────────────┘        └─────────────┬──────────────┘
                                                                        │ lee
                                                                ┌───────▼────────┐
                                                                │   ANALÍTICA    │  cierres 00:00 y lunes 00:10
                                                                │  calcula 28    │
                                                                │  métricas      │
                                                                └───┬────────┬───┘
                                                          escribe   │        │  HTTP :8000 (red interna)
                                          ┌─────────────────────────▼──┐     │  correlaciones y catálogo
                                          │ metric_analyses            │     │
                                          │ dimension_analyses         │     │
                                          └──────────────┬─────────────┘     │
                                                         │ lee               │ pide
                                                   ┌─────▼───────────────────▼─┐
                                                   │         BACKEND           │  arma el JSON por persona,
                                                   │  (rutas de líder/gerente) │  valida quién puede verla
                                                   └─────────────┬─────────────┘
                                                                 │ JSON
                                                            ┌────▼────┐
                                                            │FRONTEND │  dibuja
                                                            └─────────┘
```

Una petición típica: el líder abre la fila de un integrante.

1. El navegador pide al backend `GET /api/equipo/integrantes/4/analitica`.
2. El backend comprueba que esa persona sea de su equipo (si no, 404), pide a analítica el catálogo de métricas (lo guarda en memoria) y lee de la base los resultados guardados de esa persona.
3. Pide a analítica las correlaciones de esa persona.
4. Arma un solo JSON con las cinco dimensiones, cada métrica con su historial y franjas, y las correlaciones. Lo entrega al frontend.
5. El frontend lo dibuja sin calcular nada.

**El frontend solo habla con el backend. El backend es el único que habla con analítica.** Analítica no conoce al frontend ni al backend: solo lee la base y atiende peticiones HTTP.

## 2. Quién escribe y quién lee

| Tabla | La llena | La leen |
|---|---|---|
| `events` | El backend: las rutas de ingesta (sensores, GitHub, Jira, el contrato general) y la aplicación web (jornada y encuestas) | Analítica (todos los cálculos) y el backend (panel del empleado, operación) |
| `data_sources` | El backend (seed y administración) | Analítica (para saber de quién es cada evento) y el backend |
| `dimension_analyses` | **Solo analítica** | El backend (resumen del equipo y detalle por persona) y la propia analítica (para no repetir cierres y para las correlaciones) |
| `metric_analyses` | **Solo analítica** | El backend (detalle por persona) y la propia analítica (para las correlaciones) |
| `users`, `teams`, `roles`, `team_roles`, `employee_profiles`, `alerts` | El backend | El backend. Analítica no las lee (hoy tampoco `employee_profiles.work_schedule`) |

Reglas que se derivan:

- Nadie fuera de analítica escribe resultados, y analítica no escribe ninguna otra tabla.
- El backend no calcula puntajes ni correlaciones: los lee o los pide.
- El frontend no calcula nada: ni puntajes, ni criticidades, ni promedios de dimensión, ni correlaciones.

## 3. Convenciones compartidas

**Las 5 dimensiones SPACE** se llaman siempre `S`, `P`, `A`, `C`, `E` (enum `space_dimension`). S Satisfacción y bienestar, P Rendimiento, A Actividad, C Comunicación y colaboración, E Eficiencia y flujo.

**Las 28 métricas** se identifican por su clave en minúsculas con guiones bajos (`latencia_red_ms`), que es el valor de `metric_analyses.metric_name`. La lista completa con su dimensión, unidad, frecuencia y umbrales está en el [README de analítica, sección 4.3](../server/analytics/README.md#43-umbrales-de-las-28-métricas) y se consulta por programa en `GET /metricas/catalogo`. 19 son diarias y 9 semanales o por sprint.

**Puntaje y criticidad** son siempre los mismos para métricas y dimensiones:

| Criticidad (enum `criticality`) | Puntaje 0 a 10 |
|---|---|
| `optimo` | 8.0 a 10 |
| `precaucion` | 6.0 a 7.9 |
| `critico` | 0 a 5.9 |

**Sin dato no es cero.** Una métrica que no se midió en un periodo no tiene fila, y una dimensión sin métricas no tiene fila. Quien lee debe mostrarlo como "sin dato" y nunca rellenarlo con 0 ni con el valor anterior. En el JSON del backend, `null` significa sin dato.

**Frecuencia (`dimension_analyses.frequency`):** `day` o `week` (la base admite también `month`, que no se usa). Hay tres clases de fila de dimensión; no se mezclan ni se promedian entre sí:

| Clase | `frequency` | Rango | Qué es |
|---|---|---|---|
| Resultado del día | `day` | un día (`start_date = end_date`) | Promedio de las métricas diarias de ese día |
| Promedio de la semana de las diarias | `day` | lunes a domingo | Promedio de la semana de los puntos diarios |
| Resultado semanal | `week` | lunes a domingo | Promedio de las métricas semanales y por sprint |

S y P solo tienen filas del primero y segundo tipo; C solo del tercero; A y E de los tres. Detalle en el [README de analítica, sección 5](../server/analytics/README.md#5-cómo-se-guarda-el-resultado).

**Tiempo.**

- `events.time` es `TIMESTAMPTZ`. Las marcas dentro del `payload` (`start_time`, `end_time`) son texto ISO 8601 en UTC.
- Un **día** de analítica es el día calendario de **Colombia (UTC-5)**. Cualquier consulta que cuente "los eventos de un día" debe usar esa zona explícita; sin ella, PostgreSQL usa la de su sesión (UTC) y el día se corre 5 horas.
- `start_date` y `end_date` de los resultados son `DATE` (sin hora), en fecha local de Colombia. El backend los entrega como texto `AAAA-MM-DD`; el frontend no los convierte con la zona del navegador.
- Una **semana** va de lunes a domingo. Un **sprint** es hoy esa misma semana calendario, porque ningún evento trae las fechas reales del sprint.

**Rating de seguridad de SonarQube.** Letra A a E en el evento; se guarda como número (`raw_value`: A = 5 hasta E = 1) y se muestra como letra.

**Escala de los resultados.** `normalized_value` y `normalized_score` en `numeric(4,2)`, siempre entre 0 y 10, con un decimal.

## 4. Contratos entre componentes

| Entre | Qué | Documento |
|---|---|---|
| Fuentes → backend → `events` | Tipos de evento y campos del payload | [`data_guide.md`](data_guide.md) |
| `events` → analítica | Qué eventos y campos lee, cómo y con qué ventana de tiempo | [Analítica, sección 2](../server/analytics/README.md#2-de-dónde-salen-los-datos) |
| Analítica → base de datos | Qué filas escribe y cómo se relacionan | [Analítica, sección 5](../server/analytics/README.md#5-cómo-se-guarda-el-resultado) |
| Analítica → backend (HTTP) | Correlaciones, catálogo y recálculo | [`contrato_backend.md`](../server/analytics/docs/contrato_backend.md) |
| Base de datos → backend | Lectura de resultados | [`contrato_backend.md`](../server/analytics/docs/contrato_backend.md), "Lo que el backend lee directamente" |
| Backend → frontend (HTTP) | Resumen del equipo y detalle por persona | [Backend, "Detalle de analítica de una persona"](../server/backend/README.md#detalle-de-analítica-de-una-persona) |

## 5. Cuándo hay datos nuevos

| Qué | Cuándo aparece |
|---|---|
| Resultados diarios (métricas y dimensiones) | Después de las 00:00, con el día anterior |
| Resultados semanales y por sprint, y el promedio de la semana de las diarias | El lunes después de las 00:10, con la semana anterior |
| Correlaciones | Cuando termina cada cierre (00:00 y lunes 00:10). Las de dimensiones y las de `periodo = "dia"` cambian a diario; las de `periodo = "semana"`, el lunes |
| Catálogo de métricas | Al desplegar una versión nueva de analítica. El backend lo vuelve a pedir cada 10 minutos |

Un dato de hoy no aparece hoy: se calcula al cierre de su día.

## 6. Red y configuración

Servicios del compose (`server/docker-compose.yml`), todos en la red `app-network`:

| Servicio | Quién lo alcanza | Cómo |
|---|---|---|
| `database` | `backend`, `analytics` | `database:5432`, con `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`. No hace falta publicar el puerto para que se comuniquen |
| `analytics` | **Solo `backend`** | `http://analytics:8000` (variable `ANALYTICS_URL` del backend). Nadie más lo necesita |
| `backend` | `frontend` (nginx hace de proxy de `/api`) | `http://backend:3000` |
| `frontend` | El navegador | Puerto 80 |

Lo que el compose actual todavía trae y ya no hace falta, a revisar por quien lo mantiene: el servicio `analytics` publica el puerto 8000 y define `CORS_ORIGINS`. Analítica no tiene autenticación, así que mientras el puerto esté publicado cualquiera con acceso a esa máquina puede pedir los datos de cualquier persona.

## 7. Qué revisar cuando algo cambia

| Si cambias... | Revisa |
|---|---|
| Un campo del `payload` de un evento (nombre, tipo, unidad) | Analítica: `derivadas.py` (la tabla del README, sección 2) y `data_guide.md`. El backend de ingesta que lo genera |
| Un `event_type` o una fuente | Analítica: la métrica que lo usa. `data_guide.md`. El enum `source_type` si es una fuente nueva |
| Un umbral o una escala de una métrica | Analítica (`CONFIGURACION_METRICAS`); el catálogo cambia solo (`version`). Los resultados **ya guardados** conservan el puntaje con el umbral anterior: hay que reprocesar si se quieren recalcular. Backend y frontend: nada |
| La clave de una métrica (`metric_name`) | Todo: analítica (código y catálogo), las filas ya guardadas en `metric_analyses`, el catálogo que usa el backend. Es el cambio más costoso: evítalo |
| Los valores del enum `criticality` o `space_dimension` | Base de datos, analítica (`db.ENUM_CRITICIDAD`, `db.ENUM_DIMENSION`), backend y frontend (colores y textos) |
| El esquema de `dimension_analyses` o `metric_analyses` | Analítica (`db.py` y `guardar_analisis`) y backend (`analyses.repo.js`) |
| El formato de las correlaciones (campos de una fila, valores de `estado` o `periodo`) | Backend (las pasa tal cual, no se rompe) y frontend (`Correlaciones.tsx`, `utils/analitica.ts`, `types/index.ts`) |
| El texto de una correlación | Nada: el frontend imprime `mensaje` tal como llega |
| La zona horaria o el horario laboral | Analítica (`TZ_LOCAL`, `CalendarioLaboral`) y toda consulta por día |
| El nombre o la ruta de un endpoint de analítica | Backend (`analitica.client.js`) y el contrato de este repositorio |
| La respuesta de las rutas `/analitica` del backend | Frontend (`types/index.ts` y `src/components/analitica/`) |
| La política de retención de `events` (hoy 365 días) | Analítica lee 90 días hacia atrás en cada cierre; el reprocesado de historial largo necesita los eventos |

### Añadir una métrica nueva

1. **Evento.** Si necesita un evento o un campo que no existe, defínelo en `data_guide.md` y hazlo llegar desde el backend de ingesta.
2. **Analítica.**
   - `derivadas.py`: la función que calcula su valor crudo y su entrada en `calcular_metricas` (o en `CAMPOS_PROMEDIO` si es el promedio de un campo).
   - `etl_procesador.py`: su entrada en `CONFIGURACION_METRICAS` (tipo de escala y umbrales) y en `METRICA_DIMENSION`.
   - `correlaciones.py`: `METRICAS_SEMANALES` si es semanal; y, opcionalmente, una relación nueva.
   - `catalogo.py`: su entrada en `DEFINICIONES` (nombre, unidad, formato, decimales) y, si la escala sugerida no sirve, en `ESCALAS`.
3. **Pruebas.** Las de escalas, las de `derivadas` y la del catálogo (que cada franja dé la criticidad que calcula la escala) deben seguir pasando.
4. **Base de datos.** Nada: `metric_name` es texto libre.
5. **Backend y frontend.** Nada, si la métrica llega por el catálogo: aparece sola bajo su dimensión, con su gráfica. Solo habría cambios si introduce un tipo de escala nuevo (`mejor`) que el frontend no sabe dibujar.
6. **Documentación.** El README de analítica se regenera a partir del código en las tablas de umbrales, de correlaciones y de frecuencias.

## 8. Cómo comprobar que todo se comunica

- **Analítica vive:** `curl http://localhost:8000/health` (solo desde la máquina del compose; el puerto no debería estar publicado en producción).
- **Analítica ve la base:** el número de eventos que lee debe coincidir con `SELECT count(*) FROM events e JOIN data_sources d ON d.id = e.source_id`. Para un día concreto, comparar con `WHERE (e.time AT TIME ZONE 'America/Bogota')::date = '2026-10-16'`.
- **Resultados coherentes:** cada fila de `metric_analyses` cuelga de la dimensión que le corresponde en el catálogo; el puntaje de cada fila de dimensión es el promedio de sus métricas; la criticidad corresponde al puntaje.
- **El backend ve analítica:** `GET /api/equipo/integrantes/:id/analitica` con la sesión de un líder devuelve `correlaciones` distinto de `null` y las 28 métricas repartidas en las cinco dimensiones. Si analítica no responde, esa ruta contesta 503 (sin catálogo) o entrega `correlaciones: null`.
- **El frontend ve al backend:** el líder abre la fila de un integrante y ve sus dimensiones, y al elegir una, sus gráficas.

## 9. Acuerdos abiertos entre equipos

Cosas que hoy no son del todo coherentes entre componentes y necesitan una decisión:

1. **Jira y `tiempo_bloqueado_pct`.** Analítica calcula esta métrica con `blocked_time_hours` y `resolution_time_hours` del evento que resuelve el ticket. El conversor de Jira del backend envía `blocked_time_hours: null` y calcula `resolution_time_hours` desde la creación hasta la resolución (no desde "In Progress"). Con eventos reales de Jira, la métrica no se podría calcular. Además `story_points` solo llega si el campo configurado en Jira lo trae. *Equipos: backend (conector de Jira) y analítica.*
2. **Asignación de eventos de Jira a personas.** El backend ubica cada evento por el `accountId` del responsable del ticket y busca la fuente `jira` de esa persona. Si una persona no tiene fuente `jira`, sus eventos no se asignan. El seed del backend crea una fuente `jira` del proyecto (`SCRUM`) anclada al gerente y solo la fuente por persona de `empleado1`; faltan las de las demás personas. *Equipos: backend y base de datos.*
3. **Jornada real.** `data_guide.md` define el evento `working_session` con `start_time` y `end_time`, que es el que analítica usa; el diagrama de la base habla de un evento `working_hours` con `{inicio, fin}`. Hay que confirmar cuál es el real. Tampoco hay formato definido para `employee_profiles.work_schedule`, por lo que analítica usa una jornada de 8 horas y un horario de lunes a viernes de 8:00 a 16:00 para todos. *Equipos: base de datos, backend y analítica.*
4. **Usuario de la base para analítica.** Hoy se conecta como `postgres` (superusuario). Debería tener un usuario con `SELECT` en `events` y `data_sources` y `SELECT`/`INSERT` en `dimension_analyses` y `metric_analyses`. *Equipo: base de datos.*
5. **Cierres perdidos.** Si analítica o la base están caídas a la hora de un cierre, ese cierre no se recupera solo. Hace falta ejecutarlo a mano o añadir una recuperación al arrancar. *Equipo: analítica.*
6. **`/health` de analítica** responde `ok` aunque la base esté caída, y analítica no tiene autenticación. *Equipo: analítica y quien mantiene el compose.*
7. **`dias_sin_commits` en fines de semana.** Se guarda también sábados y domingos, así que la dimensión A tiene filas diarias en días en que ninguna otra dimensión tiene. El backend toma como "último día" el último con resultado de al menos dos dimensiones para no mostrarlo como el día actual. Decidir si analítica debe guardarla solo en días laborables. *Equipo: analítica.*
8. **Sprint.** Es la semana calendario hasta conocer las fechas reales; cuando existan, hay que pasarlas a analítica (`etl.cierre_ciclo`). *Equipos: analítica y quien tenga los datos de sprints en Jira.*
9. **Resumen y detalle muestran periodos distintos.** En el resumen del equipo, A y E muestran el resultado semanal (el de sus métricas semanales y por sprint), mientras que la fila abierta de una persona empieza en la pestaña Día. Por eso los números pueden diferir (por ejemplo A 5.7 frente a 10.0). Ambos son correctos. Está documentado en el README del backend. *Equipos: backend y frontend.*
10. **Frontend: vista de Operación.** En el entorno de prueba se queda en "Cargando operación..." aunque el backend responde bien; ocurre también con el frontend de la rama original, sin los cambios de analítica. Sin diagnosticar. *Equipo: frontend.*

Las limitaciones propias de analítica (programador en memoria, `existe_analisis` por persona y no por dimensión, validación solo con datos sintéticos) están en el [README de analítica, sección 9](../server/analytics/README.md#9-límites-conocidos).
