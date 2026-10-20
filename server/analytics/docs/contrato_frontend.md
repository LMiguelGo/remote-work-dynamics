# Contrato con el frontend: correlaciones

El contenedor de analítica entrega **solo las correlaciones**. Los puntajes de métricas y dimensiones, su criticidad y los valores crudos se leen directamente de la DB (ver el final).

## Cómo se consumen

API REST (FastAPI) en el puerto 8000 del contenedor de analítica. Solo `GET`, respuestas JSON, CORS configurable con la variable `CORS_ORIGINS`. La URL base depende de cómo se nombre el servicio en el despliegue.

| Endpoint | Qué devuelve |
|---|---|
| `GET /correlaciones/metricas` | Una fila por usuario y por par de métricas (11 relaciones del marco SPACE) |
| `GET /correlaciones/dimensiones` | Una fila por usuario y par de dimensiones (S, P, A, C, E), semanal |
| `GET /health` | `{"estado": "ok"}` |

Parámetros opcionales de los dos primeros: `usuario_id`, `desde` y `hasta` (fechas `AAAA-MM-DD`). Sin parámetros devuelven todos los usuarios y todo el historial. Se calculan al momento de la consulta, así que siempre reflejan los últimos datos guardados; no hay que refrescar nada más que llamar de nuevo.

## `GET /correlaciones/metricas`

```json
{
  "usuario_id": 7,
  "id": 1,
  "dimension_a": "S",
  "dimension_b": "P",
  "contexto": "Satisfacción vs. Rendimiento (Salud Laboral y Calidad)",
  "metrica_a": "tiempo_extralaboral_pct",
  "metrica_b": "fiabilidad_prs",
  "relacion_esperada": "inversa",
  "periodo": "dia",
  "periodo_referencia": "2026-10-19",
  "a": {"valor": 18.5, "habitual": 7.2, "criticidad": "critico"},
  "b": {"valor": 62.0, "habitual": 85.0, "criticidad": "critico"},
  "serie": [["2026-10-05", 2.0, 90.0], ["2026-10-06", 3.0, 86.0]],
  "n_muestras": 12,
  "coeficiente": -0.71,
  "fuerza": "fuerte",
  "significativa": true,
  "estado": "diagnostico",
  "mensaje": "El usuario ha trabajado 1.5 h extra por día, 1.0 h más de lo habitual, por lo que su calidad de entrega se ha visto afectada: el 62% de sus PRs fue aprobado al primer intento, 23.0 pp menos de lo habitual.",
  "aviso": "Una correlación no implica causalidad.",
  "conclusion": "(igual a mensaje cuando estado es diagnostico)",
  "detalle": "Relación significativa (r = -0.71, n = 12). Una correlación no implica causalidad."
}
```
(Ejemplo con valores inventados.)

| Campo | Significado |
|---|---|
| `id` | Número de la relación (1 a 11, ver `correlaciones.md`) |
| `dimension_a`, `dimension_b` | Dimensiones SPACE de las dos métricas (S, P, A, C, E) |
| `contexto` | Título legible de la relación |
| `metrica_a`, `metrica_b` | Nombres de las métricas, iguales a `metric_analyses.metric_name` |
| `relacion_esperada` | `directa` o `inversa`, el sentido que plantea el marco |
| `periodo` | `dia` o `semana`: con qué frecuencia se alinean las muestras |
| `periodo_referencia` | Fecha del periodo más reciente con ambas métricas (en semanal, el lunes) |
| `a`, `b` | Valores del periodo más reciente: `valor`, `habitual` (promedio de los periodos anteriores del propio usuario) y `criticidad` (`optimo`, `precaucion`, `critico` o `sin_historico`). Son `null` si no hay periodos con ambas |
| `serie` | **Datos de la gráfica de la correlación**: una lista de `[fecha, valor_a, valor_b]` con los periodos que se usaron para el coeficiente, en orden cronológico. En relaciones diarias la fecha es el día; en las semanales es el lunes de la semana. Los valores son los crudos (por ejemplo, la temperatura real, no la distancia a 22 °C) y ya vienen resumidos por periodo. Es `[]` si no hay periodos con ambas métricas |
| `n_muestras` | Periodos con ambas métricas usados para el coeficiente; coincide con el largo de `serie` |
| `coeficiente` | Pearson entre -1 y 1; `null` si no se pudo calcular |
| `fuerza` | `fuerte` (≥ 0.7), `moderada` (≥ 0.4), `debil` o `sin_datos` |
| `significativa` | `true` si la relación supera la prueba estadística al 95 % |
| `estado` | Cómo tratar la tarjeta (tabla siguiente) |
| `mensaje` | **El texto que la tarjeta imprime, siempre.** Es la conclusión redactada cuando hay diagnóstico y, si no, el texto neutro que explica el estado. El frontend no tiene que elegir entre campos |
| `aviso` | "Una correlación no implica causalidad." con `diagnostico` y `patron_distinto`; `null` en los demás. Mostrarlo junto al mensaje cuando venga |
| `conclusion` | Solo la conclusión redactada (`estado = diagnostico`); si no, `null`. Ya está dentro de `mensaje`, no hace falta usarlo |
| `detalle` | Texto técnico corto con el coeficiente y las muestras; ya está dentro de `mensaje` cuando no hay diagnóstico |

### Qué mostrar según `estado`

| `estado` | Significado | Qué mostrar |
|---|---|---|
| `diagnostico` | Significativa y en el sentido esperado | `mensaje` como diagnóstico destacado, más `aviso`, con las dos gráficas y `a` y `b` frente a su valor habitual. Es lo que más importa al usuario |
| `patron_distinto` | Significativa pero en sentido opuesto al marco | `mensaje` como aviso neutro, más `aviso`; sin tono de alerta |
| `no_significativa` | Hay datos pero la relación puede ser casualidad | `mensaje` de forma discreta, con las gráficas |
| `datos_insuficientes` | Menos de 5 periodos con ambas métricas, o una serie no varía | `mensaje` de forma discreta; las gráficas pueden venir vacías o con pocos puntos |

### Cómo dibujar la gráfica de una correlación

- Cada relación siempre lleva su tarjeta con dos líneas, una por métrica (`metrica_a` y `metrica_b`), dibujadas con `serie`. **No hay que consultar la DB ni agrupar nada**: la serie ya coincide con la que se usó para el coeficiente.
- Cada línea puede llevar una referencia punteada con el `habitual` de `a` y de `b`, y un resalte del último punto (`periodo_referencia`).
- Al pasar el cursor por la gráfica se muestra la fecha y los dos valores.
- Todas las tarjetas imprimen `mensaje`; lo que cambia con `estado` es el énfasis visual. Cuando no hay diagnóstico, el texto es neutro (por ejemplo, que aún no se ve una relación) y las gráficas se conservan.
- Las relaciones 2 y 9 agrupan dos pares de métricas, así que llegan como dos filas con el mismo `id`.

Reglas de contenido:
- `mensaje` no incluye el aviso de causalidad; viene aparte en `aviso`. Cuando `aviso` no es `null`, debe verse junto al mensaje.
- El texto de la conclusión cambia según el estado de las dos métricas (ambas fuera de zona, ambas en zona, solo una). El frontend lo muestra tal cual, no lo interpreta.
- Los textos hablan de datos del usuario frente a su propio comportamiento habitual, sin comparar con otras personas.
- Colores sugeridos para `criticidad`: 🟢 `optimo`, 🟡 `precaucion`, 🔴 `critico`, gris `sin_historico`.

## `GET /correlaciones/dimensiones`

```json
{"usuario_id": 7, "dimension_a": "S", "dimension_b": "P", "periodo": "semana",
 "n_muestras": 9, "coeficiente": 0.62, "fuerza": "moderada", "significativa": true}
```
Hay 10 pares por usuario. No trae texto de diagnóstico: sirve para una matriz o mapa de calor entre dimensiones. Con `coeficiente = null` o `significativa = false`, mostrarlo atenuado.

## Lo que el frontend lee directamente de la DB

Esto **no** pasa por el contenedor de analítica. Todo está en escala 0-10 y con la criticidad `optimo` / `precaucion` / `critico` (🟢 8.0-10, 🟡 6.0-7.9, 🔴 0-5.9).

- **`dimension_analyses`**: puntaje por dimensión (`normalized_score`) y `criticality_status`, para el rango `start_date` a `end_date`. La columna `frequency` indica qué promedia la fila:
  - `day` con `start_date = end_date`: el resultado de ese día.
  - `day` con rango de la semana (lunes a domingo): promedio semanal de las métricas diarias.
  - `week` (rango de la semana): promedio de las métricas semanales y por sprint.
  - Al cierre de cada semana aparecen, por tanto, **dos resultados por dimensión**. Una dimensión sin métricas semanales (S) solo tiene el `daily`.
- **`metric_analyses`**: por métrica, `raw_value`, `normalized_value`, `criticality` y su periodo (`start_date`, `end_date`). Las métricas diarias del día están ligadas a su fila diaria; las semanales, a la fila `weekly`.

Los datos del día aparecen después de la medianoche (el cierre diario corre a las 00:00) y los semanales el lunes a las 00:10.

## Cómo mostrarlo: vista del día y vista de la semana

Referencia visual: el panel de ejemplo https://claude.ai/artifact/JdDskUCCYTDsKWDpY54gwm (privado, con datos simulados; hay que compartirlo para que lo abra otra persona). Ese panel es la **vista semanal**. Muestra, de arriba abajo: radar de las 5 dimensiones (semana actual frente a la primera), una tarjeta por dimensión con puntaje, estado y variación, una tarjeta por correlación con dos mini gráficas diarias, y una tabla "de dato crudo a puntaje" agrupada por dimensión. Las dos vistas siguientes reutilizan esos componentes. Una diferencia con el panel de ejemplo: ahí la semana tenía un solo puntaje por dimensión; ahora son dos resultados (ver "Vista de la semana").

### Vista del día (después del cierre diario)

Datos: `dimension_analyses` con `frequency = 'day'` y `start_date = end_date = día`, y `metric_analyses` de ese día.

- **Tarjetas por dimensión (S, P, A, C, E):** `normalized_score`, estado (`criticality_status`) y variación frente al día anterior (la calcula el frontend con la fila del día previo). La dimensión C no tiene métricas diarias, así que no aparece en la vista del día.
- **Tabla de métricas:** agrupada por dimensión, con `raw_value`, `normalized_value` (barra 0-10) y `criticality`. Solo las métricas que tienen fila ese día; las que no se midieron no se muestran (no valen 0).
- **Correlaciones:** las de `periodo = "dia"` de `/correlaciones/metricas`, como tarjetas. Aparecen con diagnóstico solo cuando `estado = diagnostico`.

### Vista de la semana (lunes a domingo, disponible el lunes a las 00:10)

Datos: filas de `dimension_analyses` con `start_date` = lunes y `end_date` = domingo. Hay dos por dimensión, diferenciadas por `frequency`, y **no se deben mezclar ni promediar entre sí**:

| `frequency` | Rótulo sugerido | Qué promedia | Dimensiones |
|---|---|---|---|
| `day` | "Métricas diarias (promedio de la semana)" | Las métricas que se miden cada día | S, P, A, E |
| `week` | "Métricas semanales y por sprint" | Las que se miden una vez por semana o sprint | A, C, E |

- Cada tarjeta de dimensión muestra los dos resultados cuando existen (A y E tienen ambos; S y P solo el diario; C solo el semanal).
- **Radar:** puede usar el resultado `day` para S, P, A y E, y el `week` para C. Si se hace así, indicarlo en la leyenda.
- **Variación:** frente a la semana anterior, comparando la misma `frequency`.
- **Tabla de métricas:** las diarias con el último valor de la semana (o su promedio, a decisión de quien diseñe); las semanales con su valor de la semana. Las filas de `metric_analyses` semanales tienen `start_date` lunes y `end_date` domingo.
- **Correlaciones:** las de `periodo = "semana"` (se actualizan al cierre de cada semana) y las diarias con sus mini gráficas. Las gráficas de cada tarjeta se dibujan con el campo `serie` del endpoint, no con consultas a la DB.

### Reglas comunes

- Escala 0-10; 🟢 8.0-10 óptimo, 🟡 6.0-7.9 precaución, 🔴 0-5.9 crítico.
- Una métrica sin medición en el periodo no se muestra; no se rellena con 0 ni con el valor anterior.
- Los diagnósticos se redactan sobre los datos del usuario frente a su propio historial y siempre llevan el aviso de que correlación no implica causalidad.

## Nombres y unidades de las métricas

`metrica_a`, `metrica_b` y los valores de `serie` llegan en estas unidades. El nombre de la columna es el texto para mostrar al usuario.

| `metric_name` | Nombre | Unidad |
|---|---|---|
| `tiempo_extralaboral_pct` | Tiempo extralaboral | % de la jornada |
| `enps` | Ánimo (eNPS) | /5 |
| `fatiga` | Fatiga | /5 |
| `percepcion_herramientas` | Percepción de herramientas | /5 |
| `ruido_ambiental` | Ruido ambiental | dB |
| `temperatura` | Temperatura | °C |
| `humedad` | Humedad | % |
| `fiabilidad_prs` | PRs aprobados al primer intento | % |
| `mttr_horas` | MTTR (tiempo de reparación) | horas |
| `cobertura_codigo` | Cobertura de pruebas | % |
| `lineas_duplicadas` | Líneas duplicadas | % |
| `deuda_tecnica_horas` | Deuda técnica | horas |
| `rating_seguridad_sonarqube` | Rating de seguridad | letra A-E (se guarda como número, A = 5 … E = 1) |
| `story_points_completados_sprint` | Story points completados por sprint | puntos |
| `prs_cerrados_sprint` | PRs cerrados por sprint | conteo |
| `tickets_resueltos_sprint` | Tickets resueltos por sprint | conteo |
| `dias_sin_commits` | Días sin commits (frecuencia de commits) | días |
| `tiempo_respuesta_pr_horas` | Respuesta a revisiones de PR | horas |
| `commits_documentacion` | Commits de documentación | % |
| `encuestas_tcs` | Encuesta TCS | /5 |
| `percepcion_documentacion` | Percepción de documentación | /5 |
| `tiempo_ciclo_dias` | Tiempo de ciclo | días |
| `tiempo_bloqueado_pct` | Tiempo bloqueado | % del tiempo de ciclo |
| `latencia_red_ms` | Latencia de red | ms |
| `perdida_paquetes_pct` | Pérdida de paquetes | % |
| `velocidad_descarga_mbps` | Velocidad de descarga | Mbps |
| `velocidad_carga_mbps` | Velocidad de carga | Mbps |
| `interrupciones_red_dia` | Interrupciones de red | por día |
