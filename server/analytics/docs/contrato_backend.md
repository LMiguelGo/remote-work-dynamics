# Contrato entre analítica y backend

Este documento reemplaza al antiguo `contrato_frontend.md`. El **frontend nunca llama a analítica**: pide al backend, y el backend pide a analítica. Aquí está lo que analítica entrega al backend y lo que el backend lee por su cuenta de la base de datos. Cómo se calcula cada cosa está en el [README del contenedor](../README.md); el panorama de los cuatro componentes, en [`docs/interoperabilidad.md`](../../../docs/interoperabilidad.md).

## Cómo se consumen

- API REST (FastAPI) en el puerto 8000 de analítica, alcanzable solo dentro de la red interna del compose: `http://analytics:8000`. El puerto no se publica.
- Respuestas JSON. Sin autenticación ni CORS: ningún navegador la llama.
- El backend la lee con la variable `ANALYTICS_URL` (por defecto la dirección de arriba) y espera como máximo `ANALYTICS_TIMEOUT_MS` (4000) por respuesta.

| Endpoint | Qué devuelve |
|---|---|
| `GET /correlaciones/metricas` | Una fila por persona y par de métricas: las 11 relaciones del marco SPACE, 13 filas por persona (las relaciones 2 y 9 tienen dos pares) |
| `GET /correlaciones/dimensiones` | Una fila por persona y par de dimensiones (10 pares), semanal |
| `GET /metricas/catalogo` | Las 28 métricas con nombre, unidad, dirección, frecuencia, escala y franjas de criticidad |
| `POST /correlaciones/recalcular` | Uso operativo: renueva el resultado guardado en memoria con los datos actuales de la base |
| `GET /health` | `{"estado": "ok"}`. No comprueba la base de datos |

Parámetro opcional de los dos primeros: `usuario_id`. Con `desde` o `hasta` (`AAAA-MM-DD`) se calcula en el momento sobre ese rango, sin usar el resultado guardado. Sin parámetros devuelven todas las personas.

## Correlaciones

**Respuesta:** `{"calculado_en": "2026-10-24T00:10:03-05:00", "correlaciones": [ ... ]}`. `calculado_en` es el instante en que se calculó lo que se entrega.

**Cuándo se calculan.** No se calculan en cada petición. Analítica guarda el resultado en memoria y lo recalcula al terminar el cierre diario (00:00) y el semanal (lunes 00:10). Entre cierres todas las peticiones reciben el mismo resultado, así que el backend puede llamar las veces que necesite. Las de `periodo = "dia"` y las de dimensiones cambian cada día; las de `periodo = "semana"`, el lunes. Si el contenedor se reinicia, se vuelve a calcular en la primera petición; si todavía no hay datos, responde vacío sin guardarlo. Detalle en el README, sección 6.4.

### `GET /correlaciones/metricas`: una fila

```json
{
  "usuario_id": 7,
  "id": 1,
  "dimension_a": "S",
  "dimension_b": "P",
  "contexto": "Salud Laboral y Calidad",
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
| `usuario_id` | Persona a la que pertenece la fila (`users.id`) |
| `id` | Número de la relación (1 a 11, ver [`correlaciones.md`](correlaciones.md)) |
| `dimension_a`, `dimension_b` | Dimensiones SPACE de las dos métricas (`S`, `P`, `A`, `C`, `E`) |
| `contexto` | Título legible de la relación |
| `metrica_a`, `metrica_b` | Claves de las métricas, iguales a `metric_analyses.metric_name` y al catálogo |
| `relacion_esperada` | `directa` o `inversa`: el sentido que plantea el marco |
| `periodo` | `dia` o `semana`: con qué frecuencia se alinean las muestras |
| `periodo_referencia` | Fecha del periodo más reciente con ambas métricas (en semanal, el lunes) |
| `a`, `b` | Del periodo más reciente: `valor` crudo, `habitual` (promedio de los periodos anteriores de la misma persona) y `criticidad` (`optimo`, `precaucion`, `critico` o `sin_historico`). Son `null` si no hay periodos con ambas métricas |
| `serie` | `[[periodo, valor de A, valor de B], ...]` en orden cronológico: los periodos y valores crudos usados para el coeficiente, para dibujar sin consultar nada más. En diarias el periodo es el día; en semanales, el lunes. La temperatura va en grados (el coeficiente usa la distancia a 22 °C). `[]` si no hay periodos con ambas |
| `n_muestras` | Periodos con ambas métricas usados; coincide con el largo de `serie` |
| `coeficiente` | Pearson entre -1 y 1; `null` si no se pudo calcular |
| `fuerza` | `fuerte` (≥ 0.7), `moderada` (≥ 0.4), `debil` o `sin_datos` |
| `significativa` | `true` si supera la prueba estadística al 95 % |
| `estado` | Cómo tratar la tarjeta (tabla siguiente) |
| `mensaje` | **El texto que se imprime siempre**: la conclusión si hay diagnóstico y, si no, el texto neutro que explica el estado |
| `aviso` | "Una correlación no implica causalidad." con `diagnostico` y `patron_distinto`; `null` en los demás. Debe verse junto al mensaje cuando viene |
| `conclusion` | Solo la conclusión redactada (`estado = diagnostico`); si no, `null`. Ya está dentro de `mensaje` |
| `detalle` | Texto técnico corto con el coeficiente y las muestras. Ya está dentro de `mensaje` cuando no hay diagnóstico |

| `estado` | Significado | Cómo mostrarlo |
|---|---|---|
| `diagnostico` | Significativa y en el sentido esperado | `mensaje` destacado, más `aviso`, con las gráficas y `a` y `b` frente a su valor habitual |
| `patron_distinto` | Significativa pero en sentido opuesto al marco | `mensaje` como aviso neutro, más `aviso`; sin tono de alerta |
| `no_significativa` | Hay datos pero la relación puede ser casualidad | `mensaje` de forma discreta, con las gráficas |
| `datos_insuficientes` | Menos de 5 periodos con ambas métricas, o una serie no varía | `mensaje` de forma discreta; las gráficas pueden venir vacías o con pocos puntos |

Las relaciones 2 y 9 llegan como dos filas con el mismo `id`.

### `GET /correlaciones/dimensiones`: una fila

```json
{"usuario_id": 7, "dimension_a": "S", "dimension_b": "P", "periodo": "semana",
 "n_muestras": 9, "coeficiente": 0.62, "fuerza": "moderada", "significativa": true}
```

Hay 10 pares por persona. Las filas no traen texto. Con `coeficiente = null` o `significativa = false`, el coeficiente es poco confiable. El frontend no dibuja la matriz: muestra solo la conclusión de abajo.

La respuesta de `GET /correlaciones/dimensiones` trae además `conclusiones`, una por persona (con `usuario_id` se filtra igual que las filas):

```json
{"usuario_id": 7, "estado": "relacion", "semanas": 8,
 "mensaje": "En las 8 semanas con datos, Satisfacción y bienestar (S) y Eficiencia y flujo (E) se mueven juntas (r = 0.97, fuerte). Cuando una baja, la otra tiende a bajar. ...",
 "interpretacion": "S y E se mueven juntas (r = 0.97) en las 8 semanas con datos ... Es solo una pista: conviene revisar ambas.",
 "aviso": "Una correlación no implica causalidad; con pocas semanas es solo una pista.",
 "relaciones": [{"dimension_a": "S", "dimension_b": "E", "coeficiente": 0.97, "fuerza": "fuerte", "sentido": "juntas"}],
 "sin_datos": ["C"]}
```

| `estado` | Cuándo | Qué dice `mensaje` |
|---|---|---|
| `relacion` | Hay al menos un par significativo y de fuerza moderada o fuerte (se listan hasta 3, las más fuertes) | Qué dimensiones se mueven juntas o en sentido contrario. Si la relación más fuerte es positiva y alguna de sus dos dimensiones no está en óptimo esta semana, añade sus puntajes actuales |
| `sin_relacion` | Hay coeficientes pero ninguno significativo y al menos moderado | Que no se ve una relación clara |
| `datos_insuficientes` | Ningún par llega a 5 semanas con ambas dimensiones | Que aún no hay semanas suficientes |

`mensaje` es un texto de plantilla, siempre presente, que el frontend no muestra. `interpretacion` es la lectura que redacta un LLM sobre esos mismos números (`null` si no hay clave, no hay nada que interpretar, el proveedor falló o el texto no pasó la validación): **es el único texto que el frontend muestra**, y sin él no aparece la sección. `puntajes` trae el puntaje y el nivel de cada dimensión en la última semana con datos. `sentido` es `juntas` (coeficiente positivo) o `contrarias` (negativo): todos los puntajes se leen igual, más es mejor. `sin_datos` lista las dimensiones que no llegan al mínimo de semanas con ninguna otra (hoy `C`, que no tiene métricas diarias). `mensaje` es el texto que se imprime y `aviso` la advertencia de causalidad, que va siempre.

## Catálogo: `GET /metricas/catalogo`

Describe las 28 métricas. Sale de la misma tabla de umbrales con la que analítica puntúa, así que las franjas no pueden desincronizarse de las criticidades guardadas. Cambia solo al desplegar una versión nueva de analítica; `version` cambia sola si cambia cualquier umbral, nombre o escala, de modo que quien lo guarde en memoria (el backend lo hace, 10 minutos) sabe cuándo volver a pedirlo.

```json
{
  "version": "391e7aa58a63",
  "dimensiones": {"S": "Satisfacción y bienestar", "P": "Rendimiento", "A": "Actividad", "C": "Comunicación y colaboración", "E": "Eficiencia y flujo"},
  "metricas": [
    {
      "metric_name": "latencia_red_ms",
      "nombre": "Latencia de red",
      "unidad": "ms",
      "formato": "{v} ms",
      "decimales": 0,
      "dimension": "E",
      "frecuencia": "diaria",
      "mejor": "menos",
      "escala": {"min": 0, "max": 225},
      "franjas": [
        {"desde": 0, "hasta": 50, "estado": "optimo"},
        {"desde": 50, "hasta": 150, "estado": "precaucion"},
        {"desde": 150, "hasta": 225, "estado": "critico"}
      ]
    }
  ]
}
```

| Campo | Significado |
|---|---|
| `metric_name` | Clave de la métrica (la misma de `metric_analyses.metric_name`) |
| `nombre`, `unidad` | Texto para mostrar |
| `formato`, `decimales` | Cómo escribir un valor: se reemplaza `{v}` por el número con esos decimales (`"{v} / 5"`, `"{v} ms"`). El rating de seguridad es la excepción: se muestra como letra (ver `mejor`) |
| `dimension` | `S`, `P`, `A`, `C` o `E` |
| `frecuencia` | `diaria` (un valor por día) o `semanal` (uno por semana o sprint) |
| `mejor` | `menos`, `mas`, `rango` (estar dentro de una zona), `letra` (rating de seguridad: el valor guardado es 1 a 5 y se muestra E a A) o `relativa` (se compara con los sprints anteriores de la persona) |
| `escala` | Mínimo y máximo **sugeridos** para dibujar el valor. Si algún valor la supera, quien dibuja la amplía. `null` en las `relativa` |
| `franjas` | Zonas de criticidad en la unidad de la métrica, en orden de menor a mayor, contiguas y cubriendo toda la escala. `estado` es `optimo`, `precaucion` o `critico`. `null` en las `relativa` (su puntaje no sale de rangos del valor) |
| `umbrales_relativos` | Solo en las `relativa`: `{"optimo_hasta_pct": 15, "precaucion_hasta_pct": 30}`: la diferencia porcentual con el promedio de sus sprints anteriores |

Los extremos exactos de las franjas siguen la regla de la escala: en `menos`, el valor igual al primer umbral es óptimo; en `mas`, el valor igual al umbral óptimo es óptimo. Quien necesite la criticidad de un valor concreto debe leerla de la base (`criticality`), no recalcularla con las franjas.

## `POST /correlaciones/recalcular`

Renueva las correlaciones guardadas en memoria con los datos actuales y devuelve `{"calculado_en", "metricas": n, "dimensiones": n}` (cuántas filas hay de cada tipo). No lo necesita el backend en su operación normal: sirve tras reprocesar historial con `etl.py` (que corre en otro proceso y no avisa a la API en marcha) o tras cargar datos fuera de los cierres.

## Lo que el backend lee directamente de la base de datos

Esto **no pasa por la API de analítica**: son las tablas que analítica llena. Todo está en escala 0 a 10 y con la criticidad `optimo` / `precaucion` / `critico` (óptimo 8.0 a 10, precaución 6.0 a 7.9, crítico 0 a 5.9).

- **`dimension_analyses`:** puntaje por dimensión (`normalized_score`) y `criticality_status` para el rango `start_date` a `end_date`. `frequency` dice qué promedia la fila:
  - `day` con `start_date = end_date`: el resultado de ese día.
  - `day` con rango de semana (lunes a domingo): el promedio de la semana de las métricas diarias.
  - `week` (rango de la semana): el promedio de las métricas semanales y por sprint.
  - Al cierre de cada semana aparecen, por tanto, **dos resultados por dimensión** (A y E), que no deben mezclarse ni promediarse entre sí. S y P solo tienen el diario; C solo el semanal.
- **`metric_analyses`:** por métrica, `raw_value`, `normalized_value`, `criticality`, su periodo (`start_date`, `end_date`) y la fila de dimensión de la que cuelga (`dimension_analysis_id`). Las diarias cuelgan de la fila diaria de su día; las semanales, de la fila `week`.
- **Los datos aparecen** después de cada cierre: los del día tras las 00:00 y los semanales el lunes a las 00:10.
- Una métrica sin medición en el periodo no tiene fila: **no es 0**. Quien lee debe tratar la ausencia como "sin dato".

La descripción completa de cómo se guardan está en el README, sección 5.

## Qué puede cambiar sin avisar y qué no

Para quien consume este contrato:

- **Cambia libremente:** el texto de `mensaje`, `aviso`, `detalle` y `contexto`; los números; las correlaciones y las métricas que existen; los umbrales y la escala del catálogo (por eso `version`).
- **Hay que avisar al backend y al frontend antes de cambiar:** el nombre o el tipo de cualquier campo de las tablas de arriba, el formato de `serie`, los valores de `estado`, `periodo`, `mejor`, `frecuencia` y de `estado` de las franjas, y las claves de las métricas (`metric_name`). El frontend tolera un `estado` de correlación que no conoce (lo muestra sin énfasis), pero no sabe interpretarlo.
- **Reglas de contenido que debe mantener la redacción:** `mensaje` no incluye el aviso de causalidad (viene aparte en `aviso`); los textos hablan de los datos de la persona frente a su propio comportamiento habitual, sin comparar con otras personas.
