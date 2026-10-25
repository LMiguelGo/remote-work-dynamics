"""Catálogo de las 28 métricas para quien las dibuja: nombre, unidad, dirección (qué es mejor), frecuencia, escala sugerida y
franjas de criticidad en la unidad de cada métrica. Sale de `CONFIGURACION_METRICAS`, la misma tabla con que se puntúa, así que
las franjas no pueden desincronizarse de la criticidad que se guarda. Lo sirve `GET /metricas/catalogo`.
`version` cambia sola cuando cambia cualquier umbral, nombre o escala: quien lo guarde en memoria sabe cuándo volver a pedirlo."""
import hashlib
import json

from correlaciones import METRICAS_SEMANALES
from etl_procesador import CONFIGURACION_METRICAS, MAPA_SONAR, METRICA_DIMENSION

DIMENSIONES = {"S": "Satisfacción y bienestar", "P": "Rendimiento", "A": "Actividad",
               "C": "Comunicación y colaboración", "E": "Eficiencia y flujo"}

# clave: (nombre para mostrar, unidad, formato del valor con {v}, decimales). Es el orden en que se listan dentro de su dimensión.
DEFINICIONES = {
    "tiempo_extralaboral_pct": ("Tiempo extralaboral", "% de la jornada", "{v} %", 1),
    "enps": ("Ánimo (eNPS)", "/5", "{v} / 5", 1),
    "fatiga": ("Fatiga", "/5", "{v} / 5", 1),
    "percepcion_herramientas": ("Percepción de herramientas", "/5", "{v} / 5", 1),
    "ruido_ambiental": ("Ruido ambiental", "dB", "{v} dB", 0),
    "temperatura": ("Temperatura", "°C", "{v} °C", 1),
    "humedad": ("Humedad", "%", "{v} %", 0),
    "fiabilidad_prs": ("PRs aprobados al primer intento", "%", "{v} %", 0),
    "mttr_horas": ("MTTR (tiempo de reparación)", "horas", "{v} h", 1),
    "cobertura_codigo": ("Cobertura de pruebas", "%", "{v} %", 0),
    "lineas_duplicadas": ("Líneas duplicadas", "%", "{v} %", 1),
    "deuda_tecnica_horas": ("Deuda técnica", "horas", "{v} h", 1),
    "rating_seguridad_sonarqube": ("Rating de seguridad", "A-E", "{v}", 0),
    "story_points_completados_sprint": ("Story points completados por sprint", "puntos", "{v} pts", 0),
    "dias_sin_commits": ("Días sin commits", "días", "{v} días", 0),
    "prs_cerrados_sprint": ("PRs cerrados por sprint", "conteo", "{v}", 0),
    "tickets_resueltos_sprint": ("Tickets resueltos por sprint", "conteo", "{v}", 0),
    "tiempo_respuesta_pr_horas": ("Respuesta a revisiones de PR", "horas", "{v} h", 1),
    "commits_documentacion": ("Commits de documentación", "%", "{v} %", 0),
    "encuestas_tcs": ("Encuesta TCS", "/5", "{v} / 5", 1),
    "percepcion_documentacion": ("Percepción de documentación", "/5", "{v} / 5", 1),
    "tiempo_ciclo_dias": ("Tiempo de ciclo", "días", "{v} días", 1),
    "tiempo_bloqueado_pct": ("Tiempo bloqueado", "% del tiempo de ciclo", "{v} %", 0),
    "latencia_red_ms": ("Latencia de red", "ms", "{v} ms", 0),
    "perdida_paquetes_pct": ("Pérdida de paquetes", "%", "{v} %", 1),
    "velocidad_descarga_mbps": ("Velocidad de descarga", "Mbps", "{v} Mbps", 0),
    "velocidad_carga_mbps": ("Velocidad de carga", "Mbps", "{v} Mbps", 0),
    "interrupciones_red_dia": ("Interrupciones de red", "por día", "{v} por día", 0),
}

# Escala sugerida (mínimo, máximo) donde la regla general no es la adecuada. Es una sugerencia: si algún valor la supera,
# quien dibuja amplía el eje; las franjas siguen siendo las mismas.
ESCALAS = {
    "enps": (1, 5), "fatiga": (1, 5), "percepcion_herramientas": (1, 5), "encuestas_tcs": (1, 5), "percepcion_documentacion": (1, 5),
    "fiabilidad_prs": (0, 100), "cobertura_codigo": (0, 100), "commits_documentacion": (0, 30), "tiempo_extralaboral_pct": (0, 50),
    "temperatura": (14, 30), "humedad": (20, 80), "rating_seguridad_sonarqube": (0.5, 5.5),
}


def _franjas_rating() -> list:
    """El rating se guarda como número (A = 5 ... E = 1); cada letra ocupa una franja de ancho 1 con la criticidad de `MAPA_SONAR`."""
    franjas = []
    for numero in range(1, 6):
        estado = MAPA_SONAR["EDCBA"[numero - 1]][1]
        if franjas and franjas[-1]["estado"] == estado:
            franjas[-1]["hasta"] = numero + 0.5
        else:
            franjas.append({"desde": numero - 0.5, "hasta": numero + 0.5, "estado": estado})
    return franjas


def _franjas(tipo: str, a: tuple, lo: float, hi: float) -> list:
    if tipo == "inversa":  # menos es mejor: óptimo hasta el primer umbral
        return [(lo, a[0], "optimo"), (a[0], a[1], "precaucion"), (a[1], hi, "critico")]
    if tipo == "directa":  # más es mejor
        return [(lo, a[1], "critico"), (a[1], a[0], "precaucion"), (a[0], hi, "optimo")]
    min_opt, max_opt, min_prec, max_prec = a  # rango: la zona buena está en el centro
    return [(lo, min_prec, "critico"), (min_prec, min_opt, "precaucion"), (min_opt, max_opt, "optimo"),
            (max_opt, max_prec, "precaucion"), (max_prec, hi, "critico")]


def _metrica(clave: str) -> dict:
    nombre, unidad, formato, decimales = DEFINICIONES[clave]
    cfg = CONFIGURACION_METRICAS.get(clave)
    entrada = {"metric_name": clave, "nombre": nombre, "unidad": unidad, "formato": formato, "decimales": decimales,
               "dimension": METRICA_DIMENSION[clave], "frecuencia": "semanal" if clave in METRICAS_SEMANALES else "diaria"}
    if clave == "rating_seguridad_sonarqube":
        lo, hi = ESCALAS[clave]
        entrada.update(mejor="letra", escala={"min": lo, "max": hi}, franjas=_franjas_rating())
        return entrada
    tipo, a = cfg["tipo"], cfg["args"]
    if tipo == "relativa":  # el puntaje sale de la diferencia (%) con el promedio de sus sprints anteriores, no de rangos del valor
        entrada.update(mejor="relativa", escala=None, franjas=None,
                       umbrales_relativos={"optimo_hasta_pct": a[0], "precaucion_hasta_pct": a[1]})
        return entrada
    if clave in ESCALAS:
        lo, hi = ESCALAS[clave]
    elif tipo == "inversa":
        lo, hi = 0, round(min(a[2], a[1] * 1.5), 2)
    else:
        lo, hi = 0, round(a[3] if len(a) > 3 else a[0] * 1.25, 2)
    entrada.update(mejor={"inversa": "menos", "directa": "mas", "rango": "rango"}[tipo], escala={"min": lo, "max": hi},
                   franjas=[{"desde": d, "hasta": h, "estado": e} for d, h, e in _franjas(tipo, a, lo, hi)])
    return entrada


def construir_catalogo() -> dict:
    metricas = [_metrica(c) for dim in DIMENSIONES for c in DEFINICIONES if METRICA_DIMENSION[c] == dim]
    contenido = {"dimensiones": DIMENSIONES, "metricas": metricas}
    version = hashlib.sha1(json.dumps(contenido, sort_keys=True).encode("utf-8")).hexdigest()[:12]
    return {"version": version, **contenido}


CATALOGO = construir_catalogo()
