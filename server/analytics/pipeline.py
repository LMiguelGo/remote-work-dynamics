from datetime import date

from db import guardar_analisis
from etl_procesador import procesar_mediciones


def analizar_y_guardar(usuario_id: int, fecha_inicio: date, fecha_fin: date, valores: dict,
                       historicos: dict | None = None, periodos: dict | None = None,
                       previas: dict | None = None, frecuencia: str = "daily") -> dict:
    """Núcleo del contenedor: valores crudos de un usuario en un periodo -> puntaje y criticidad
    por métrica y por dimensión -> guardado en la DB. Devuelve {dimension: id de dimension_analyses}.

    `historicos` es {metrica: [valores de los sprints anteriores]} para las métricas relativas
    (story points, PRs y tickets por sprint). El ETL lo calcula desde los datos de origen aplicando la misma función
    de `derivadas.py` a las ventanas de los sprints anteriores; no se lee de la DB porque el primer sprint de un
    usuario no tiene puntaje y no se guarda, así que la DB nunca acumularía el histórico.

    `periodos` es {metrica: (fecha_inicio, fecha_fin)} para las métricas cuyo periodo difiere del de la dimensión
    (p. ej. una métrica diaria dentro de una dimensión semanal). Las que no aparecen heredan el de la dimensión.

    `previas` es {dimension: [{"metrica", "valor_normalizado"}]} con métricas ya guardadas que cuentan en el puntaje
    de la dimensión sin volver a insertarse (las diarias, al cerrar la semana). Una dimensión que solo tiene
    `previas` también se guarda. `frecuencia` ("daily" o "weekly") se guarda en `dimension_analyses.frequency`."""
    periodos, previas = periodos or {}, previas or {}
    por_dimension = procesar_mediciones(valores, historicos)
    resultado = {}
    for dimension in por_dimension.keys() | previas.keys():
        metricas = por_dimension.get(dimension, [])
        for m in metricas:
            if m["metrica"] in periodos:
                m["fecha_inicio"], m["fecha_fin"] = periodos[m["metrica"]]
        resultado[dimension] = guardar_analisis(usuario_id, dimension, fecha_inicio, fecha_fin, metricas,
                                                previas.get(dimension), frecuencia)
    return resultado
