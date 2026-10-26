# Contenedor de analítica

Calcula, para cada persona monitoreada, las 28 métricas del marco SPACE a partir de los eventos que guarda el sistema, les asigna un puntaje de 0 a 10 y un nivel de criticidad (óptimo, precaución, crítico), las agrupa en las 5 dimensiones (S, P, A, C, E), guarda los resultados en la base de datos y calcula correlaciones que sirve por HTTP al backend.

Este documento describe cómo se comporta el contenedor. El acuerdo entre la base de datos, la analítica, el backend y el frontend (quién escribe y quién lee cada cosa, convenciones comunes y qué revisar cuando algo cambia) está en [`docs/interoperabilidad.md`](../../docs/interoperabilidad.md). El contrato HTTP con el backend está en [`docs/contrato_backend.md`](docs/contrato_backend.md).

## Resumen

```
 fuentes ──► backend (ingesta) ──► events ──► ANALÍTICA ──► metric_analyses ──► backend ──► frontend
 ESP32, web, GitHub,               (DB)      lee, calcula   dimension_analyses   lee y arma    dibuja
 Jira, SonarQube, red                        y guarda       (DB)                 el JSON
                                                │
                                                └──► API HTTP :8000 (solo red interna) ──► backend
                                                     correlaciones y catálogo de métricas
```

| Entra | Sale |
|---|---|
| Filas de `events` (cada una con un `payload` JSON) unidas con `data_sources` para saber de quién son | Filas en `metric_analyses` (una por métrica y periodo) y en `dimension_analyses` (una por dimensión y periodo) |
| Nada más: no lee usuarios, equipos ni perfiles | Correlaciones y catálogo de métricas por HTTP. Las correlaciones **no se guardan en la base de datos** |

## 1. Ejecución

- Imagen `python:3.11-slim` con FastAPI y uvicorn en el puerto **8000**. En el compose del proyecto no publica el puerto: solo el backend lo alcanza, por la red interna (`http://analytics:8000`).
- **Un solo proceso, sin réplicas.** El programador de tareas corre dentro del mismo proceso; si se levantaran dos contenedores, cada cierre se ejecutaría dos veces.
- Sin autenticación ni CORS: ningún navegador la llama. Cualquier contenedor de la red puede pedirle datos de cualquier persona, así que no debe exponerse fuera de la red interna.
- `GET /health` responde `ok` aunque la base esté caída: no la consulta.

Variables de entorno (la conexión se arma sola con las mismas variables que usa el resto del proyecto):

| Variable | Defecto | Uso |
|---|---|---|
| `DATABASE_URL` | (vacía) | Si existe, se usa tal cual (`postgresql+psycopg2://usuario:clave@host:5432/base`) |
| `POSTGRES_HOST` | `database` | Servidor de la base |
| `POSTGRES_PORT` | `5432` | Puerto |
| `POSTGRES_USER` | `postgres` | Usuario |
| `POSTGRES_PASSWORD` | `postgres_password` | Clave (puede llevar cualquier carácter) |
| `POSTGRES_DB` | `rwd_database` | Base |

El usuario necesita: `SELECT` en `events` y `data_sources`, y `SELECT` e `INSERT` en `dimension_analyses` y `metric_analyses`. Hoy el compose usa el superusuario `postgres`; en producción conviene un usuario con solo esos permisos.

### Cargar datos de prueba

`load_data.py` carga un conjunto de datos sintéticos de ocho semanas que corresponden a dos personas, una cuyo desempeño se deteriora y otra que se mantiene estable, y deja los resultados ya calculados. Con un solo comando carga los eventos, vuelve a procesar el periodo con `etl.rellenar` y le pide a la API que recalcule las correlaciones.

```bash
docker compose exec -e ALLOW_DEMO_DATA=1 analytics python load_data.py
```

Este comando es solo para entornos de prueba, por eso exige la variable `ALLOW_DEMO_DATA=1`. Antes de correrlo hay que haber ejecutado el seed del backend con `npm run seed`, porque reutiliza los usuarios `empleado1` y `empleado2`. Si esos usuarios no existen, el comando avisa y no hace nada. Además es idempotente, de modo que repetir el comando no duplica los eventos.

## 2. De dónde salen los datos

### Qué lee

Una sola consulta de eventos (`db.cargar_eventos`):

```sql
SELECT d.user_id, d.source_type, e.event_type, e.time, e.payload
  FROM events e JOIN data_sources d ON d.id = e.source_id
 WHERE e.time >= :desde AND e.time < :hasta
 ORDER BY e.time
```

- **El dueño de un evento** es `events.source_id → data_sources.user_id`. Una persona puede tener varias fuentes (una por tipo: `web_app`, `esp32`, `github`, `jira`, `network`, `sonarqube`).
- **Ventana de tiempo `[desde, hasta)`.** `events.time` es `TIMESTAMPTZ`. Los límites se envían **con la zona de Colombia (UTC-5) explícita**; sin eso, PostgreSQL los interpretaría en la zona de su sesión (UTC) y los días se correrían 5 horas. Un "día" de analítica es el día calendario de Colombia.
- **Historial.** Cada cierre pide `LOOKBACK_DIAS = 90` días hacia atrás desde el fin del periodo, porque algunas métricas lo necesitan: `dias_sin_commits` (racha), los tickets (su `issue_created` puede ser anterior al periodo) y los sprints anteriores.
- Cada fila se convierte en un `Evento(fuente, tipo, fecha, payload)`. El `payload` JSONB llega ya como diccionario. Las marcas de tiempo dentro del payload (`start_time`, `end_time`) son texto ISO 8601 en UTC.

### Qué espera encontrar en la base

| Tabla | Columnas que usa | Para qué |
|---|---|---|
| `events` | `id`, `time`, `source_id`, `event_type`, `payload` | Entrada de todos los cálculos |
| `data_sources` | `id`, `user_id`, `source_type`, `identifier`, `is_active` | Saber de quién es cada evento |
| `dimension_analyses` | `id`, `user_id`, `dimension`, `start_date`, `end_date`, `normalized_score`, `criticality_status`, `calculated_at`, `frequency` | Resultado por dimensión |
| `metric_analyses` | `id`, `dimension_analysis_id`, `user_id`, `start_date`, `end_date`, `metric_name`, `raw_value`, `normalized_value`, `criticality` | Resultado por métrica |

Enums: `criticality` = `optimo`, `precaucion`, `critico`; `space_dimension` = `S`, `P`, `A`, `C`, `E`; `source_type` = `web_app`, `esp32`, `github`, `jira`, `network`, `sonarqube`. El esquema lo crea el contenedor de la base de datos (`server/database/init/02-schema.sql`); analítica no crea ni modifica tablas.

### Qué eventos y campos interpreta

Los eventos que entran los define [`docs/data_guide.md`](../../docs/data_guide.md). Analítica solo usa estos; cualquier otro campo del `payload` se ignora (por ejemplo `concentration_perception`, `pr_comment_density`, `lines_added`, `files_changed` y `reliability_rating` no alimentan ninguna métrica):

| Fuente (`source_type`) | `event_type` | Campos del `payload` que usa |
|---|---|---|
| `web_app` | `working_session` | `start_time`, `end_time` |
| `web_app` | `daily_survey` | `satisfaction_level`, `tools_perception`, `fatigue_level` |
| `web_app` | `weekly_survey` | `team_coordination`, `documentation_perception` |
| `esp32` | `ambiental_reading` | `noise_level`, `temperature`, `humidity` |
| `network` | `qos_measurement` | `latency_ms`, `packet_loss_percentage`, `download_speed_mbps`, `upload_speed_mbps` |
| `network` | `interruption` | `interruption_count` (por defecto 1) |
| `github` | `commit` | `conventional_commit_prefix` |
| `github` | `pull_request` | `pr_number`, `action` (`opened`, `closed`, `merged`) |
| `github` | `pull_request_review` | `pr_number`, `is_first_attempt_approved`, `review_responsiveness_minutes` |
| `jira` | `issue_created` | `issue_key`, `issue_type`, `story_points` |
| `jira` | `issue_updated` | `issue_key`, `status_to`, `resolution_time_hours`, `blocked_time_hours` |
| `sonarqube` | `pull_request_quality` | `code_coverage_percentage`, `duplicated_lines_percentage`, `technical_debt_minutes`, `security_rating` |

Un campo ausente o nulo hace que ese evento no aporte a la métrica; si ningún evento del periodo aporta, la métrica no se calcula (ver 4.1).

## 3. Cuándo se calcula

El programador interno (APScheduler, zona `America/Bogota`) dispara dos cierres. Guarda sus tareas **en memoria**: si el contenedor está apagado o reiniciándose a la hora de un cierre, ese cierre no se ejecuta al volver (ver el comando de abajo).

| Cierre | Cuándo | Qué procesa | Qué guarda |
|---|---|---|---|
| **Cierre de día** (`etl.cierre_dia`) | Todos los días a las 00:00 | El día anterior | Las métricas diarias de ese día y una fila de dimensión por día |
| **Cierre de ciclo** (`etl.cierre_ciclo`) | Los lunes a las 00:10 | La semana anterior, de lunes a domingo | Las métricas semanales y por sprint, y los dos resultados semanales por dimensión |

- Procesa solo a las personas con algún evento en los 90 días de historial leídos, y solo guarda lo que tiene datos: nunca guarda un 0 por falta de datos.
- **Es idempotente.** Antes de guardar consulta si esa persona ya tiene filas de dimensión para ese periodo y frecuencia (`db.existe_analisis`); si existen, no las repite. Repetir un cierre no duplica nada.
- El cierre de ciclo promedia puntajes que dejó el cierre de día del domingo, por eso corre 10 minutos después.
- Al terminar cada cierre se recalcula la caché de correlaciones (sección 6).
- **Un cierre perdido o fallido no se recupera solo.** Si el contenedor estaba apagado o la base caída a la medianoche, ese día queda sin calcular hasta que alguien lo ejecute a mano:

```bash
docker exec analytics python etl.py dia 2026-10-23        # un día
docker exec analytics python etl.py semana 2026-10-19      # una semana (la fecha es un lunes)
docker exec analytics python etl.py rango 2026-08-24 2026-10-18   # días y semanas completas del rango
curl -X POST http://localhost:8000/correlaciones/recalcular        # el CLI corre en otro proceso: renueva la caché de la API
```

- **Sprint.** Los eventos no traen el sprint, así que por ahora un sprint es la semana calendario (lunes a domingo). Cuando se conozcan las fechas reales se pasan a `calcular_metricas(sprint=...)` desde `etl.cierre_ciclo`.

## 4. Cómo se calculan las métricas

Cada métrica pasa por tres pasos: valor crudo, puntaje y criticidad, y promedio por dimensión.

### 4.1 Valor crudo (`derivadas.py`)

Funciones puras sin acceso a la base: reciben los eventos ya leídos y un periodo `[desde, hasta)` y devuelven el valor, o `None` si no hay base de cálculo (por ejemplo, ningún PR revisado en el periodo).

**S: Satisfacción y bienestar**

| Métrica | Evento y campo | Cálculo |
|---|---|---|
| `tiempo_extralaboral_pct` | `working_session`: `start_time`, `end_time` | (horas de las sesiones del periodo − 8) / 8 × 100, mínimo 0 |
| `enps` | `daily_survey.satisfaction_level` | promedio del periodo |
| `fatiga` | `daily_survey.fatigue_level` | promedio |
| `percepcion_herramientas` | `daily_survey.tools_perception` | promedio |
| `ruido_ambiental`, `temperatura`, `humedad` | `ambiental_reading`: `noise_level`, `temperature`, `humidity` | promedio de las lecturas que caen dentro de una sesión de trabajo |

**P: Rendimiento**

| Métrica | Evento y campo | Cálculo |
|---|---|---|
| `fiabilidad_prs` | `pull_request_review.is_first_attempt_approved` | % de PRs revisados con `true` (se toma la primera revisión de cada `pr_number`) |
| `mttr_horas` | `issue_created` (tipo y fecha) + `issue_updated` (paso a Done/Closed) | Promedio de (resolución − creación) de los Bug e Incident resueltos, en horas laborales y sin intervalos de inactividad larga |
| `cobertura_codigo` | `pull_request_quality.code_coverage_percentage` | promedio del periodo |
| `lineas_duplicadas` | `pull_request_quality.duplicated_lines_percentage` | promedio |
| `deuda_tecnica_horas` | `pull_request_quality.technical_debt_minutes` | promedio ÷ 60 |
| `rating_seguridad_sonarqube` | `pull_request_quality.security_rating` | letra del último análisis del periodo |

**A: Actividad**

| Métrica | Evento y campo | Cálculo |
|---|---|---|
| `dias_sin_commits` | `commit` y `pull_request` con `action = merged` | Días laborables consecutivos sin ninguno, hasta el último día del periodo |
| `story_points_completados_sprint` | `issue_created.story_points` + `issue_updated.status_to` Done/Closed | Suma de los puntos de los tickets resueltos en el sprint |
| `prs_cerrados_sprint` | `pull_request.action` closed o merged | PRs distintos (`pr_number`) cerrados en el sprint |
| `tickets_resueltos_sprint` | `issue_updated.status_to` Done/Closed | Tickets resueltos en el sprint |

**C: Comunicación y colaboración**

| Métrica | Evento y campo | Cálculo |
|---|---|---|
| `tiempo_respuesta_pr_horas` | `pull_request_review.review_responsiveness_minutes` | promedio ÷ 60 (el payload ya trae el tiempo) |
| `commits_documentacion` | `commit.conventional_commit_prefix` | commits con prefijo `docs` / total de commits × 100 |
| `encuestas_tcs` | `weekly_survey.team_coordination` | promedio |
| `percepcion_documentacion` | `weekly_survey.documentation_perception` | promedio |

**E: Eficiencia y flujo**

| Métrica | Evento y campo | Cálculo |
|---|---|---|
| `tiempo_ciclo_dias` | `issue_updated` (primer paso a "In Progress" y paso a Done/Closed) | Promedio de días laborales entre ambos, sin intervalos de inactividad larga (horas laborales ÷ 8) |
| `tiempo_bloqueado_pct` | `issue_updated.blocked_time_hours` y `resolution_time_hours` del paso a Done | Σ horas bloqueado / Σ horas de resolución × 100 |
| `latencia_red_ms`, `perdida_paquetes_pct`, `velocidad_descarga_mbps`, `velocidad_carga_mbps` | `qos_measurement` | promedio de las mediciones dentro de una sesión de trabajo |
| `interrupciones_red_dia` | `interruption.interruption_count` | suma dentro de una sesión de trabajo; con sesión y sin caídas es 0, sin sesión no hay dato |

Reglas:

- **Horas laborales.** MTTR y tiempo de ciclo cuentan solo lunes a viernes de 8:00 a 16:00 (hora de Colombia), sin festivos. Las marcas en UTC se convierten.
- **Ausencias no declaradas.** Si un ticket pasa más de 5 días corridos sin eventos, ese intervalo no cuenta.
- **Tickets reabiertos.** Un ticket que vuelve de Done a otro estado deja de contar como resuelto hasta que se cierre de nuevo.
- **Sensores y red.** Solo cuentan las lecturas que caen dentro de una sesión de trabajo (`working_session`) de ese día; sin sesión no hay dato.
- **SonarQube.** Se calcula con cada análisis (cada subida de código) y se reporta por día. Con varios análisis en un día se promedian cobertura, duplicadas y deuda, y el rating toma el último. Los días sin subidas no tienen valor.
- **`dias_sin_commits`** necesita los commits recientes (historial de 90 días), por eso se calcula también para días sin eventos propios, **incluidos fines de semana**, mientras la persona tenga actividad previa en la ventana.

### 4.2 Puntaje 0 a 10 y criticidad (`etl_procesador.py`)

Cada métrica tiene una escala en `CONFIGURACION_METRICAS` que convierte el valor crudo en un puntaje de 0 a 10 y en una criticidad. Las bandas son iguales para métricas y dimensiones:

| Criticidad | Puntaje |
|---|---|
| `optimo` | 8.0 a 10 |
| `precaucion` | 6.0 a 7.9 |
| `critico` | 0 a 5.9 |

Tipos de escala (todas con un decimal):

- **`inversa`** (menos es mejor). Óptimo hasta el primer umbral (puntaje 10 − valor/umbral × 2), precaución hasta el segundo (7.9 a 6.0) y crítico después (5.9 a 0, tope en el máximo teórico).
- **`directa`** (más es mejor). Óptimo desde el primer umbral (10; en la velocidad de red baja gradualmente de 10 a 8 entre el valor pleno y el umbral), precaución desde el segundo (6.0 a 7.9) y crítico por debajo (0 a 5.9).
- **`rango`** (temperatura y humedad). Óptimo dentro de la zona de confort (10); precaución y crítico según la distancia a la zona.
- **`relativa`** (story points, PRs cerrados y tickets resueltos por sprint). Se guarda el **conteo**; el puntaje sale de la diferencia porcentual en valor absoluto con el promedio de los hasta 8 sprints anteriores de la misma persona, evaluada con una escala inversa de 15 % y 30 %. El primer sprint de una persona no tiene con qué compararse: no recibe puntaje ni se guarda. El histórico se reconstruye desde los eventos, no desde la base de resultados (que nunca lo acumularía por esa misma razón).
- **Rating de SonarQube** (categórico): A = 10, B = 7.5, C = 6.0, D = 3.0, E = 0. El valor crudo se guarda como número, A = 5 hasta E = 1.

### 4.3 Umbrales de las 28 métricas

Es lo mismo que sirve `GET /metricas/catalogo` (que es la fuente a consultar por programas). Generada desde `CONFIGURACION_METRICAS`.

| Dim. | Métrica (`clave`) | Unidad | Frecuencia | 🟢 Óptimo | 🟡 Precaución | 🔴 Crítico |
|---|---|---|---|---|---|---|
| S | Tiempo extralaboral (`tiempo_extralaboral_pct`) | % de la jornada | diaria | ≤ 5 | > 5 y ≤ 15 | > 15 |
| S | Ánimo (eNPS) (`enps`) | /5 | diaria | ≥ 4 | ≥ 3 y < 4 | < 3 |
| S | Fatiga (`fatiga`) | /5 | diaria | ≤ 2 | > 2 y ≤ 3.5 | > 3.5 |
| S | Percepción de herramientas (`percepcion_herramientas`) | /5 | diaria | ≥ 4 | ≥ 3 y < 4 | < 3 |
| S | Ruido ambiental (`ruido_ambiental`) | dB | diaria | ≤ 50 | > 50 y ≤ 65 | > 65 |
| S | Temperatura (`temperatura`) | °C | diaria | 20 a 24 | 18 a 20 o 24 a 26 | < 18 o > 26 |
| S | Humedad (`humedad`) | % | diaria | 40 a 60 | 30 a 40 o 60 a 70 | < 30 o > 70 |
| P | PRs aprobados al primer intento (`fiabilidad_prs`) | % | diaria | ≥ 80 | ≥ 60 y < 80 | < 60 |
| P | MTTR (tiempo de reparación) (`mttr_horas`) | horas | diaria | ≤ 8 | > 8 y ≤ 24 | > 24 |
| P | Cobertura de pruebas (`cobertura_codigo`) | % | diaria | ≥ 80 | ≥ 60 y < 80 | < 60 |
| P | Líneas duplicadas (`lineas_duplicadas`) | % | diaria | ≤ 3 | > 3 y ≤ 5 | > 5 |
| P | Deuda técnica (`deuda_tecnica_horas`) | horas | diaria | ≤ 8 | > 8 y ≤ 40 | > 40 |
| P | Rating de seguridad (`rating_seguridad_sonarqube`) | A-E | diaria | A | B y C | D y E |
| A | Story points completados por sprint (`story_points_completados_sprint`) | puntos | semanal | ≤ 15 % de diferencia | ≤ 30 % | > 30 % |
| A | Días sin commits (`dias_sin_commits`) | días | diaria | ≤ 2 | > 2 y ≤ 4 | > 4 |
| A | PRs cerrados por sprint (`prs_cerrados_sprint`) | conteo | semanal | ≤ 15 % de diferencia | ≤ 30 % | > 30 % |
| A | Tickets resueltos por sprint (`tickets_resueltos_sprint`) | conteo | semanal | ≤ 15 % de diferencia | ≤ 30 % | > 30 % |
| C | Respuesta a revisiones de PR (`tiempo_respuesta_pr_horas`) | horas | semanal | ≤ 12 | > 12 y ≤ 24 | > 24 |
| C | Commits de documentación (`commits_documentacion`) | % | semanal | ≥ 5 | ≥ 2 y < 5 | < 2 |
| C | Encuesta TCS (`encuestas_tcs`) | /5 | semanal | ≥ 4 | ≥ 3 y < 4 | < 3 |
| C | Percepción de documentación (`percepcion_documentacion`) | /5 | semanal | ≥ 4 | ≥ 3 y < 4 | < 3 |
| E | Tiempo de ciclo (`tiempo_ciclo_dias`) | días | semanal | ≤ 2 | > 2 y ≤ 5 | > 5 |
| E | Tiempo bloqueado (`tiempo_bloqueado_pct`) | % del tiempo de ciclo | semanal | ≤ 10 | > 10 y ≤ 25 | > 25 |
| E | Latencia de red (`latencia_red_ms`) | ms | diaria | ≤ 50 | > 50 y ≤ 150 | > 150 |
| E | Pérdida de paquetes (`perdida_paquetes_pct`) | % | diaria | ≤ 1 | > 1 y ≤ 3 | > 3 |
| E | Velocidad de descarga (`velocidad_descarga_mbps`) | Mbps | diaria | ≥ 50 | ≥ 20 y < 50 | < 20 |
| E | Velocidad de carga (`velocidad_carga_mbps`) | Mbps | diaria | ≥ 15 | ≥ 5 y < 15 | < 5 |
| E | Interrupciones de red (`interrupciones_red_dia`) | por día | diaria | ≤ 2 | > 2 y ≤ 5 | > 5 |

### 4.4 Dimensión

El puntaje de una dimensión es el **promedio simple** de los puntos de las métricas que tuvieron dato en ese periodo, con un decimal y las mismas bandas. Una métrica sin dato no cuenta (no se promedia como 0). El promedio puede ocultar una métrica crítica: se aceptó así. No hay pesos por rol (`team_roles.weights` no se usa).

### 4.5 Frecuencia: métricas diarias y semanales

- **Diarias (19)**: **S**: `tiempo_extralaboral_pct`, `enps`, `fatiga`, `percepcion_herramientas`, `ruido_ambiental`, `temperatura`, `humedad`; **P**: `fiabilidad_prs`, `mttr_horas`, `cobertura_codigo`, `lineas_duplicadas`, `deuda_tecnica_horas`, `rating_seguridad_sonarqube`; **A**: `dias_sin_commits`; **E**: `latencia_red_ms`, `perdida_paquetes_pct`, `velocidad_descarga_mbps`, `velocidad_carga_mbps`, `interrupciones_red_dia`.
- **Semanales o por sprint (9)**: **A**: `story_points_completados_sprint`, `prs_cerrados_sprint`, `tickets_resueltos_sprint`; **C**: `tiempo_respuesta_pr_horas`, `commits_documentacion`, `encuestas_tcs`, `percepcion_documentacion`; **E**: `tiempo_ciclo_dias`, `tiempo_bloqueado_pct`.

Las métricas diarias se miden cada día y se guardan en el cierre de las 00:00. Las semanales dependen de encuestas semanales, de conteos por sprint o de pocos eventos, y calcularlas por día no tendría sentido: se guardan el lunes a las 00:10, con la semana anterior. La dimensión C solo tiene métricas semanales; S y P solo diarias; A y E, de las dos clases.

## 5. Cómo se guarda el resultado

Analítica solo escribe en `dimension_analyses` y `metric_analyses`, y siempre las dos en una sola transacción por dimensión.

`dimension_analyses.frequency` toma los valores `day` o `week` (la base admite también `month`, que no se usa), y hay **tres clases de fila de dimensión**:

| Clase | `frequency` | Rango (`start_date` a `end_date`) | Qué es | ¿Tiene métricas ligadas? |
|---|---|---|---|---|
| Resultado del día | `day` | un solo día | Promedio de las métricas diarias de ese día | Sí: sus filas de `metric_analyses` con `start_date = end_date` |
| Promedio de la semana de las métricas diarias | `day` | lunes a domingo | Promedio de la semana de los puntos diarios (cada métrica aporta el promedio de sus puntos de la semana y pesa igual) | No: se calcula a partir de las filas diarias del mismo periodo; no se insertan métricas nuevas |
| Resultado semanal | `week` | lunes a domingo | Promedio de las métricas semanales y por sprint | Sí: sus filas de `metric_analyses` con el rango de la semana |

Por eso, al cerrar una semana, cada dimensión con métricas de las dos clases (A y E) tiene **dos resultados distintos para el mismo rango** (`day` con rango de semana y `week`), que no deben mezclarse ni promediarse entre sí. S y P solo tienen el primero; C solo el segundo.

Qué deja cada cierre, para una persona con datos:

| Cierre | `dimension_analyses` | `metric_analyses` |
|---|---|---|
| Día (00:00) | 1 fila `day` por dimensión con métricas diarias ese día (S, P, A y E) | 1 fila por métrica diaria con dato |
| Ciclo (lunes 00:10) | 1 fila `day` con rango de semana por dimensión con métricas diarias esa semana (S, P, A, E) y 1 fila `week` por dimensión con métricas semanales (A, C, E) | 1 fila por métrica semanal o por sprint con dato (las 3 por sprint no se guardan en el primer sprint de la persona) |

Columnas de `metric_analyses`: `raw_value` (valor crudo, o el número 1 a 5 del rating), `normalized_value` (puntaje 0 a 10), `criticality`, `start_date` y `end_date` (el periodo de la métrica), `metric_name` (la clave de la métrica, por ejemplo `latencia_red_ms`) y `dimension_analysis_id` (la fila de dimensión de la que cuelga).

Reglas de integridad que se cumplen y se verificaron contra la base: cada métrica cuelga de la dimensión que le corresponde; el puntaje de cada dimensión es el promedio de sus métricas; la criticidad corresponde al puntaje; los puntos y la criticidad de cada métrica son los que da su escala aplicada al valor crudo; no hay filas repetidas para la misma persona, métrica y periodo.

## 6. Correlaciones

Son relaciones entre métricas (y entre dimensiones) **de una misma persona a lo largo de su propio historial**. No comparan a una persona con otra.

### 6.1 De dónde salen

Se calculan **desde las filas ya guardadas en `metric_analyses`** (`raw_value` por periodo), no desde los eventos. Solo entran las 28 métricas conocidas; filas con otros nombres se ignoran.

### 6.2 Las 11 relaciones

| # | Dimensiones | Contexto | Métrica A | Métrica B | Relación esperada | Periodo |
|---|---|---|---|---|---|---|
| 1 | S × P | Salud Laboral y Calidad | `tiempo_extralaboral_pct` | `fiabilidad_prs` | inversa | día |
| 2 | S × P | Entorno Físico y Calidad | `ruido_ambiental` y `temperatura` | `deuda_tecnica_horas` | directa | día |
| 3 | S × P | Motivación y Calidad | `enps` | `cobertura_codigo` | directa | día |
| 4 | C × E | Respuesta y Entrega | `tiempo_respuesta_pr_horas` | `tiempo_ciclo_dias` | directa | semana |
| 5 | C × E | Respuesta y Fricción | `tiempo_respuesta_pr_horas` | `tiempo_bloqueado_pct` | directa | semana |
| 6 | C × P | Documentación y Recuperación | `commits_documentacion` | `mttr_horas` | inversa | semana |
| 7 | A × S | Velocidad y Sobrecarga | `story_points_completados_sprint` | `tiempo_extralaboral_pct` | inversa | semana |
| 8 | A × S | Patrón de Trabajo | `dias_sin_commits` | `tiempo_extralaboral_pct` | directa | día |
| 9 | E × E | Infraestructura y Fricción | `latencia_red_ms` y `perdida_paquetes_pct` | `tiempo_bloqueado_pct` | directa | semana |
| 10 | E × A | Infraestructura y Entrega | `latencia_red_ms` | `dias_sin_commits` | directa | día |
| 11 | E × S | Flujo y Motivación | `tiempo_bloqueado_pct` | `enps` | inversa | semana |

Las relaciones 2 y 9 agrupan dos métricas en un lado, así que producen **dos filas** cada una: 13 filas por persona. La hipótesis detrás de cada una está en [`docs/correlaciones.md`](docs/correlaciones.md).

### 6.3 Cómo se calcula cada fila

1. **Alinear por periodo.** Si alguna de las dos métricas es semanal, el periodo es la semana (`periodo: "semana"`; las métricas diarias se resumen por semana con el promedio, y `dias_sin_commits` con el máximo, la racha más larga). Si no, es el día (`periodo: "dia"`).
2. **Coeficiente de Pearson** entre los periodos en que la persona tiene ambas métricas. La temperatura se correlaciona como distancia a 22 °C (frío y calor extremos son igual de malos); la serie que se entrega sigue en grados.
3. **Significancia.** Prueba t de dos colas al 95 %. Mínimo 5 periodos con ambas métricas. Una serie constante no tiene coeficiente.
4. **Fuerza** (`fuerte` desde 0.7, `moderada` desde 0.4, `debil`, o `sin_datos`).
5. **Estado**, que decide cómo mostrar la tarjeta:

| `estado` | Cuándo |
|---|---|
| `diagnostico` | Significativa y en el sentido que plantea el marco (`relacion_esperada`) |
| `patron_distinto` | Significativa pero en el sentido opuesto |
| `no_significativa` | Hay datos suficientes pero podría ser casualidad |
| `datos_insuficientes` | Menos de 5 periodos con ambas métricas, o una serie no varía |

6. **Valores de referencia.** `a` y `b` traen, para el periodo más reciente con ambas métricas, el `valor` crudo, el `habitual` (promedio de los periodos anteriores de la misma persona) y la `criticidad` de ese valor, o `sin_historico`.
7. **Texto.** `mensaje` es el texto que se imprime siempre: la conclusión redactada si hay `diagnostico` y, si no, un texto neutro con el coeficiente. La conclusión cambia según el estado de las dos métricas (ambas fuera de la zona óptima, ambas dentro, solo una). `aviso` trae "Una correlación no implica causalidad." con `diagnostico` y `patron_distinto`, y es `null` en los demás.
8. **`serie`.** `[[periodo, valor de A, valor de B], ...]`, con los mismos periodos y valores crudos usados para el coeficiente, para que la gráfica coincida con el diagnóstico sin que nadie reagrupe nada. Cada fila ya viene lista para dibujarse.

**Correlaciones entre dimensiones.** Pearson entre los puntajes diarios de cada par de dimensiones, promediados por semana: 10 pares por persona, sin texto.

### 6.4 Cómo se comparten

No se guardan en ninguna tabla. Se calculan en memoria y se sirven por HTTP (`GET /correlaciones/metricas` y `GET /correlaciones/dimensiones`, ver sección 7). Para no recalcular en cada petición hay una **caché en memoria** (`cache_correlaciones.py`) de todas las personas:

- Se recalcula sola al terminar cada cierre (00:00 y lunes 00:10). Entre cierres, todas las peticiones reciben el mismo resultado, con el campo `calculado_en`.
- Las de `periodo = "dia"` y las de dimensiones cambian cada día; las de `periodo = "semana"`, el lunes.
- Tras reiniciar el contenedor, la primera petición la rellena. Si todavía no hay datos, responde vacío **sin guardar** la caché vacía.
- Si algo carga datos fuera de un cierre (por ejemplo `etl.py` a mano, que corre en otro proceso), `POST /correlaciones/recalcular` la renueva.
- Con `desde` o `hasta` en la consulta se calcula en el momento sobre ese rango, sin usar ni tocar la caché.
- Si un cierre falla al recalcularla, se sigue sirviendo la anterior y el error queda en el log.

## 7. API

Todas devuelven JSON. Detalle de campos en [`docs/contrato_backend.md`](docs/contrato_backend.md).

| Método y ruta | Qué devuelve |
|---|---|
| `GET /correlaciones/metricas` | `{"calculado_en", "correlaciones": [...]}`: una fila por persona y par de métricas. Parámetros opcionales: `usuario_id`, `desde`, `hasta` |
| `GET /correlaciones/dimensiones` | Igual, una fila por persona y par de dimensiones |
| `GET /metricas/catalogo` | Las 28 métricas con nombre, unidad, formato, dirección, frecuencia, dimensión, escala sugerida y franjas de criticidad; `version` cambia sola si cambia algo |
| `POST /correlaciones/recalcular` | Renueva la caché (uso operativo) |
| `GET /health` | `{"estado": "ok"}`; no comprueba la base |

## 8. Valores que se asumieron (configurables)

Se siguen estos valores hasta confirmarlos con datos reales:

| Supuesto | Valor actual | Dónde cambiarlo |
|---|---|---|
| Zona horaria de las marcas | Colombia, UTC-5 sin horario de verano | `derivadas.TZ_LOCAL` |
| Jornada pactada | 8 horas, igual para todos (`employee_profiles.work_schedule` no se lee) | `DURACION_PACTADA_H` |
| Horario laboral | Lunes a viernes, 8:00 a 16:00, sin festivos | `CalendarioLaboral` |
| Inactividad que excluye un intervalo de un ticket | 5 días corridos | `MAX_DIAS_INACTIVIDAD` |
| Estados de Jira resuelto / en curso | Done, Closed / In Progress, En progreso | `ESTADOS_HECHO`, `ESTADOS_EN_CURSO` |
| Respuesta a PRs | Se toma `review_responsiveness_minutes` tal como viene | `tiempo_respuesta_pr_horas` |
| PR cerrado sin integrar | Cuenta en el total de PRs de `fiabilidad_prs` | `fiabilidad_prs` |
| Volumen de tickets | Solo los que pasan a Done o Closed | `_resueltos` |
| Sprint | Semana calendario, lunes a domingo | `etl.cierre_ciclo` |
| Historial leído por cierre | 90 días; 8 sprints previos para las métricas relativas | `etl.LOOKBACK_DIAS`, `etl.SPRINTS_HISTORICO` |
| Pesos por rol | Sin activar (todas las métricas pesan igual) | `team_roles.weights` sin usar |

## 9. Límites conocidos

- **Un cierre perdido o fallido no se reintenta solo** y el programador no recuerda cierres perdidos entre reinicios (ver sección 3).
- **`existe_analisis` compara por persona, periodo y frecuencia, no por dimensión.** Una fila de dimensión ajena con el mismo periodo (por ejemplo una de ejemplo creada a mano) hace que se omita todo el cierre de esa persona en ese periodo.
- **`dias_sin_commits` se guarda también los fines de semana**, por lo que su dimensión (A) tiene filas diarias en días en que ninguna otra dimensión tiene.
- **`tiempo_bloqueado_pct` depende de `blocked_time_hours`.** El conversor de Jira del backend hoy envía ese campo en `null`, así que con eventos reales de Jira la métrica no se podría calcular.
- **Datos sintéticos.** La validación hecha hasta ahora es con datos de prueba; los formatos reales de los payloads de GitHub, Jira y SonarQube siguen sin validarse contra el contrato.
- **Sin autenticación**, y `/health` no revisa la base.
- Los requerimientos de pesos por rol, alinear las series por jornada registrada, elegir Spearman según la distribución y redactar una recomendación de mejora no se aplicaron.

## 10. Pruebas y verificación

Las pruebas automáticas no están en este repositorio. Cubren: escalas y umbrales (que puntaje y criticidad coincidan en todas las métricas), cálculo del valor crudo de cada métrica con casos hechos a mano, el ETL completo con dos resultados por dimensión y sin duplicados, las correlaciones (serie, texto y estados), la caché y el catálogo (cada franja del catálogo debe dar la misma criticidad que la escala).

Para comprobar el contenedor contra la base real basta con revisar: que `GET /health` responda; que el número de filas de `events` leídas por analítica coincida con el de la base; que cada fila de `metric_analyses` cuelgue de la dimensión del catálogo; y que el puntaje de cada dimensión sea el promedio de sus métricas.

## 11. Archivos

| Archivo | Qué contiene |
|---|---|
| `main.py` | API FastAPI y arranque del programador |
| `etl_procesador.py` | Programador, funciones de escala, `CONFIGURACION_METRICAS`, `METRICA_DIMENSION`, `procesar_metrica`, `consolidar_dimension` |
| `derivadas.py` | Valor crudo de las 28 métricas a partir de los eventos (funciones puras) |
| `etl.py` | `cierre_dia`, `cierre_ciclo`, `rellenar` y la línea de comandos |
| `pipeline.py` | `analizar_y_guardar`: procesa los valores de una persona y un periodo y guarda |
| `db.py` | Conexión, descripción de tablas, lectura de eventos y de resultados, escritura |
| `correlaciones.py` | Las 11 relaciones, Pearson, significancia y redacción |
| `cache_correlaciones.py` | Caché en memoria de las correlaciones |
| `catalogo.py` | Catálogo de métricas para el backend |
| `generate_data.py` | Genera los eventos sintéticos de prueba, ocho semanas de dos personas |
| `load_data.py` | Carga los datos sintéticos de prueba y deja los resultados calculados, como se explica en la sección 1 |
| `docs/contrato_backend.md` | Contrato HTTP con el backend |
| `docs/correlaciones.md` | Las 11 relaciones del marco y sus hipótesis |

## 12. Documentos anteriores

`analisis_metricas.md` y `logica_algoritmos.md` describen una versión anterior del diseño (otro conjunto de métricas y de fuentes). Se conservan como historia; **la descripción vigente es este documento**.
