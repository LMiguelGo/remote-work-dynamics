"""Cadena completa de un cierre: eventos de la DB -> valores crudos -> puntaje -> guardado.

Cierre de día: métricas diarias del día que termina (una fila de dimensión por día).
Cierre de ciclo: métricas semanales y por sprint de la semana que termina (una fila de dimensión por semana).
Al cierre de semana hay dos resultados por dimensión (frecuencia "daily" y "weekly"), ver `cierre_ciclo`. El de las
métricas diarias promedia los puntajes ya guardados por `cierre_dia` (cada métrica pesa igual), por eso el cierre de
ciclo debe correr después del cierre de día del domingo.
El sprint es la semana calendario (lunes a domingo) hasta que se conozcan las fechas reales de los sprints."""
from datetime import date, datetime, timedelta

from correlaciones import METRICAS_SEMANALES
from db import cargar_eventos, existe_analisis, puntajes_diarios
from derivadas import calcular_metricas, historicos_sprints
from pipeline import analizar_y_guardar

LOOKBACK_DIAS = 90        # historial que piden commits, tickets y sprints anteriores
SPRINTS_HISTORICO = 8     # sprints anteriores que forman el promedio de las métricas relativas


def _inicio_dia(dia: date) -> datetime:
    return datetime.combine(dia, datetime.min.time())


def cierre_dia(dia: date) -> dict[int, dict]:
    """Calcula y guarda las métricas diarias de `dia` para cada usuario con eventos ese día.
    Devuelve {usuario_id: {dimension: id}}; los usuarios ya analizados ese día se omiten."""
    desde, hasta = _inicio_dia(dia), _inicio_dia(dia + timedelta(days=1))
    guardados = {}
    for usuario, eventos in cargar_eventos(desde - timedelta(days=LOOKBACK_DIAS), hasta).items():
        if existe_analisis(usuario, dia, dia):
            continue
        valores = {m: v for m, v in calcular_metricas(eventos, desde, hasta).items() if m not in METRICAS_SEMANALES}
        if valores:
            guardados[usuario] = analizar_y_guardar(usuario, dia, dia, valores)
    return guardados


def cierre_ciclo(lunes: date) -> dict[int, dict]:
    """Al cerrar la semana que empieza en `lunes` guarda, por usuario y dimensión, dos resultados con rango [lunes, domingo]:
    - frecuencia "daily": promedio de las métricas diarias de la semana (no inserta filas de métrica, ya existen).
    - frecuencia "weekly": promedio de las métricas semanales y por sprint (las inserta con su periodo semanal).
    Devuelve {usuario_id: {"daily": {dimension: id}, "weekly": {dimension: id}}}."""
    domingo = lunes + timedelta(days=6)
    desde, hasta = _inicio_dia(lunes), _inicio_dia(domingo + timedelta(days=1))
    anteriores = [(desde - timedelta(weeks=n), hasta - timedelta(weeks=n)) for n in range(SPRINTS_HISTORICO, 0, -1)]
    guardados = {}
    for usuario, eventos in cargar_eventos(desde - timedelta(days=LOOKBACK_DIAS), hasta).items():
        resultado = {}
        previas = {} if existe_analisis(usuario, lunes, domingo, "daily") else puntajes_diarios(usuario, lunes, domingo)
        if previas:
            resultado["daily"] = analizar_y_guardar(usuario, lunes, domingo, {}, previas=previas, frecuencia="daily")
        if not existe_analisis(usuario, lunes, domingo, "weekly"):
            valores = {m: v for m, v in calcular_metricas(eventos, desde, hasta, sprint=(desde, hasta)).items()
                       if m in METRICAS_SEMANALES}
            if valores:
                resultado["weekly"] = analizar_y_guardar(usuario, lunes, domingo, valores,
                                                         historicos_sprints(eventos, anteriores), frecuencia="weekly")
        if resultado:
            guardados[usuario] = resultado
    return guardados


def rellenar(desde: date, hasta: date) -> None:
    """Reprocesa el historial entre `desde` y `hasta` (ambos incluidos), por ejemplo al cargar datos antiguos:
    el cierre de día de cada día y, después, el de ciclo de cada semana completa. Repetirlo no duplica."""
    dia = desde
    while dia <= hasta:
        cierre_dia(dia)
        dia += timedelta(days=1)
    lunes = desde + timedelta(days=(7 - desde.weekday()) % 7)
    while lunes + timedelta(days=6) <= hasta:
        cierre_ciclo(lunes)
        lunes += timedelta(days=7)


if __name__ == "__main__":
    import sys
    uso = "Uso: python etl.py dia AAAA-MM-DD | semana AAAA-MM-DD (lunes) | rango AAAA-MM-DD AAAA-MM-DD"
    try:
        orden, *fechas = sys.argv[1:]
        f = [date.fromisoformat(x) for x in fechas]
        if orden == "dia" and len(f) == 1:
            print(cierre_dia(f[0]))
        elif orden == "semana" and len(f) == 1:
            print(cierre_ciclo(f[0]))
        elif orden == "rango" and len(f) == 2:
            rellenar(*f)
            print("Listo.")
        else:
            raise ValueError
    except ValueError:
        sys.exit(uso)
