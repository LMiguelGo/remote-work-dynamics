from collections import defaultdict
from datetime import timedelta
from itertools import combinations
from math import sqrt
from statistics import StatisticsError, correlation, mean

from etl_procesador import procesar_metrica

# Mínimo de periodos (días o semanas) de un mismo usuario para reportar su coeficiente de apoyo.
MIN_MUESTRAS = 5

# Métricas que se miden una vez por semana/sprint; el resto se mide a diario o con más frecuencia.
# Las de SonarQube (cobertura, duplicadas, deuda, rating) se calculan con cada análisis, es decir con cada subida de código, y se reportan por día.
METRICAS_SEMANALES = {
    "story_points_completados_sprint", "commits_documentacion",
    "tiempo_respuesta_pr_horas", "tiempo_ciclo_dias", "tiempo_bloqueado_pct", "encuestas_tcs",
    "percepcion_documentacion", "prs_cerrados_sprint", "tickets_resueltos_sprint",
}

# Cómo se resume una métrica dentro de un periodo (por defecto, el promedio).
AGREGACION = {"dias_sin_commits": max}  # lo relevante de la semana es la racha más larga

# Métricas que no se relacionan linealmente con su valor crudo y se transforman antes de correlacionar.
TEMPERATURA_CONFORT = 22.0
TRANSFORMACIONES = {"temperatura": lambda t: abs(t - TEMPERATURA_CONFORT)}  # frío y calor extremos son igual de malos

# "relacion" es el signo esperado entre las métricas tal como se guardan en la DB.
# Frecuencia de commits se mide con dias_sin_commits (más días = menos frecuencia),
# por eso las relaciones 8 y 10 aparecen con el signo invertido respecto a correlaciones.md.
CORRELACIONES = [
    {
        "id": 1, "dimension_a": "S", "dimension_b": "P", "contexto": "Salud Laboral y Calidad",
        "metricas_a": ["tiempo_extralaboral_pct"], "metricas_b": ["fiabilidad_prs"], "relacion": "inversa",
        "hipotesis": "El agotamiento cognitivo y el exceso de horas extra incrementan los errores de lógica, elevando los rechazos en la primera revisión del código.",
    },
    {
        "id": 2, "dimension_a": "S", "dimension_b": "P", "contexto": "Entorno Físico y Calidad",
        "metricas_a": ["ruido_ambiental", "temperatura"], "metricas_b": ["deuda_tecnica_horas"], "relacion": "directa",
        "hipotesis": "Ambientes ruidosos (> 65 dB) o fuera de rango (> 26 °C) fragmentan la concentración, aumentando los code smells y con ellos las horas estimadas para corregirlos (deuda técnica).",
    },
    {
        "id": 3, "dimension_a": "S", "dimension_b": "P", "contexto": "Motivación y Calidad",
        "metricas_a": ["enps"], "metricas_b": ["cobertura_codigo"], "relacion": "directa",
        "hipotesis": "Desarrolladores desmotivados (eNPS < 3.0) toman atajos en tareas de soporte (refactorización, testing), bajando la cobertura a menos del 80%.",
    },
    {
        "id": 4, "dimension_a": "C", "dimension_b": "E", "contexto": "Respuesta y Entrega",
        "metricas_a": ["tiempo_respuesta_pr_horas"], "metricas_b": ["tiempo_ciclo_dias"], "relacion": "directa",
        "hipotesis": "Revisiones lentas (> 24 horas) son el principal cuello de botella. Convierten el tiempo activo de desarrollo en tiempo pasivo de espera, inflando el tiempo de ciclo.",
    },
    {
        "id": 5, "dimension_a": "C", "dimension_b": "E", "contexto": "Respuesta y Fricción",
        "metricas_a": ["tiempo_respuesta_pr_horas"], "metricas_b": ["tiempo_bloqueado_pct"], "relacion": "directa",
        "hipotesis": "La demora en revisar código incrementa el tiempo de tareas bloqueadas, forzando al desarrollador al cambio constante de contexto (context switching).",
    },
    {
        "id": 6, "dimension_a": "C", "dimension_b": "P", "contexto": "Documentación y Recuperación",
        "metricas_a": ["commits_documentacion"], "metricas_b": ["mttr_horas"], "relacion": "inversa",
        "hipotesis": "Una baja tasa de documentación (< 2%) eleva drásticamente el MTTR porque el equipo tarda más en diagnosticar y entender el código fallido en producción.",
    },
    {
        "id": 7, "dimension_a": "A", "dimension_b": "S", "contexto": "Velocidad y Sobrecarga",
        "metricas_a": ["story_points_completados_sprint"], "metricas_b": ["tiempo_extralaboral_pct"], "relacion": "inversa",
        "hipotesis": "Caídas bruscas en la velocidad del Sprint acompañadas de horas extra indican sobrecarga de trabajo o impedimentos técnicos no declarados.",
    },
    {
        "id": 8, "dimension_a": "A", "dimension_b": "S", "contexto": "Patrón de Trabajo",
        "metricas_a": ["dias_sin_commits"], "metricas_b": ["tiempo_extralaboral_pct"], "relacion": "directa",
        "hipotesis": "Entregas concentradas al final del Sprint (tras días sin commits) revelan jornadas nocturnas o de fin de semana para cumplir compromisos.",
    },
    {
        "id": 9, "dimension_a": "E", "dimension_b": "E", "contexto": "Infraestructura y Fricción",
        "metricas_a": ["latencia_red_ms", "perdida_paquetes_pct"], "metricas_b": ["tiempo_bloqueado_pct"], "relacion": "directa",
        "hipotesis": "Redes inestables (> 150 ms o > 3% pérdida) fallan procesos CI/CD y conexiones remotas, inflando el tiempo bloqueado por causas ajenas al desarrollador.",
    },
    {
        "id": 10, "dimension_a": "E", "dimension_b": "A", "contexto": "Infraestructura y Entrega",
        "metricas_a": ["latencia_red_ms"], "metricas_b": ["dias_sin_commits"], "relacion": "directa",
        "hipotesis": "Entornos de red lentos desincentivan las entregas pequeñas y continuas, haciendo que el desarrollador acumule código masivo en local antes de enviarlo.",
    },
    {
        "id": 11, "dimension_a": "E", "dimension_b": "S", "contexto": "Flujo y Motivación",
        "metricas_a": ["tiempo_bloqueado_pct"], "metricas_b": ["enps"], "relacion": "inversa",
        "hipotesis": "Estar bloqueado por terceros (dependencias, falta de specs) frustra a los desarrolladores, disminuyendo su nivel de satisfacción general.",
    },
]


# Nivel de confianza de 95 %. t crítico de Student (dos colas) para 1..30 grados de libertad; más allá se usa 1.96.
_T_CRITICO = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145,
              2.131, 2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048,
              2.045, 2.042]
AVISO_CAUSALIDAD = "Una correlación no implica causalidad."

ETIQUETAS = {
    "tiempo_extralaboral_pct": "el tiempo extralaboral", "fiabilidad_prs": "la fiabilidad de los PRs",
    "ruido_ambiental": "el ruido ambiental", "temperatura": "la temperatura", "deuda_tecnica_horas": "la deuda técnica",
    "enps": "el ánimo (eNPS)", "cobertura_codigo": "la cobertura de pruebas",
    "tiempo_respuesta_pr_horas": "el tiempo de respuesta a PRs", "tiempo_ciclo_dias": "el tiempo de ciclo",
    "tiempo_bloqueado_pct": "el tiempo bloqueado", "commits_documentacion": "los commits de documentación",
    "mttr_horas": "el MTTR", "story_points_completados_sprint": "los story points completados por sprint",
    "dias_sin_commits": "los días sin commits", "latencia_red_ms": "la latencia de red",
    "perdida_paquetes_pct": "la pérdida de paquetes",
}

JORNADA_HORAS = 8.0  # base para convertir % extralaboral en horas (<= 5 % equivale a 8.4 h en metricas_umbrales.md)


def _comp(v, h, unidad, factor=1.0):
    """Texto que compara el valor actual con lo habitual del propio usuario."""
    if h is None:
        return ""
    d = (v - h) * factor
    if round(abs(d), 1) == 0:
        return ", en línea con lo habitual"
    return f", {abs(d):.1f} {unidad} {'más' if d > 0 else 'menos'} de lo habitual"


# Cómo se describe cada métrica en una frase (v = valor actual del usuario, h = su promedio habitual o None).
FRASES = {
    "tiempo_extralaboral_pct": lambda v, h: f"el usuario ha trabajado {v / 100 * JORNADA_HORAS:.1f} h extra por día{_comp(v, h, 'h', JORNADA_HORAS / 100)}",
    "fiabilidad_prs": lambda v, h: f"el {v:.0f}% de sus PRs fue aprobado al primer intento{_comp(v, h, 'pp')}",
    "ruido_ambiental": lambda v, h: f"el ruido en su puesto promedia {v:.0f} dB{_comp(v, h, 'dB')}",
    "temperatura": lambda v, h: f"la temperatura de su puesto promedia {v:.1f} °C{_comp(v, h, '°C')}",
    "deuda_tecnica_horas": lambda v, h: f"la deuda técnica estimada de su código es de {v:.0f} h{_comp(v, h, 'h')}",
    "enps": lambda v, h: f"su ánimo (eNPS) es {v:.1f}/5{_comp(v, h, 'pts')}",
    "cobertura_codigo": lambda v, h: f"la cobertura de pruebas de su código es {v:.0f}%{_comp(v, h, 'pp')}",
    "tiempo_respuesta_pr_horas": lambda v, h: f"el usuario tarda {v:.0f} h en responder revisiones de PRs{_comp(v, h, 'h')}",
    "tiempo_ciclo_dias": lambda v, h: f"su tiempo de ciclo es de {v:.1f} días{_comp(v, h, 'días')}",
    "tiempo_bloqueado_pct": lambda v, h: f"el usuario pasa el {v:.0f}% de su tiempo de ciclo en estado bloqueado{_comp(v, h, 'pp')}",
    "commits_documentacion": lambda v, h: f"el {v:.0f}% de sus commits es de documentación{_comp(v, h, 'pp')}",
    "mttr_horas": lambda v, h: f"su tiempo de reparación de incidentes (MTTR) es de {v:.0f} h{_comp(v, h, 'h')}",
    "story_points_completados_sprint": lambda v, h: f"el usuario completó {v:.0f} story points en el sprint{_comp(v, h, 'pts')}",
    "dias_sin_commits": lambda v, h: f"el usuario tuvo una racha de {v:.0f} días sin commits",
    "latencia_red_ms": lambda v, h: f"la latencia de su red promedia {v:.0f} ms{_comp(v, h, 'ms')}",
    "perdida_paquetes_pct": lambda v, h: f"su red pierde {v:.1f}% de paquetes{_comp(v, h, 'pp')}",
}

# Conclusión por correlación: (A y B fuera de su zona óptima, A y B en zona óptima). Los casos mixtos usan
# PLANTILLA_SOLO_A y PLANTILLA_SOLO_B, más abajo.
# {A} = frase de la métrica A con mayúscula inicial, {b} = frase de la métrica B.
PLANTILLAS = {
    1: ("{A}, por lo que su calidad de entrega se ha visto afectada: {b}.",
        "{A} y su calidad de entrega se mantiene: {b}."),
    2: ("{A}, lo que puede fragmentar su concentración y acumular deuda técnica: {b}.",
        "{A}, una condición adecuada para concentrarse; además, {b}."),
    3: ("{A}, y eso puede estar llevándolo a descuidar las pruebas: {b}.",
        "{A}, y {b}."),
    4: ("{A}, lo que convierte tiempo de desarrollo en espera y alarga la entrega: {b}.",
        "{A}, y {b}."),
    5: ("{A}, lo que incrementa el tiempo bloqueado: {b}.",
        "{A}, y {b}."),
    6: ("{A}, lo que dificulta diagnosticar fallos en producción: {b}.",
        "{A}, y {b}."),
    7: ("{A}, mientras {b}: puede indicar sobrecarga de trabajo o impedimentos no declarados.",
        "{A}; {b}."),
    8: ("{A} y {b}: puede estar concentrando sus entregas con jornadas extendidas.",
        "{A}; {b}."),
    9: ("{A}, lo que puede inflar el tiempo bloqueado por causas ajenas a él: {b}.",
        "{A}, y {b}."),
    10: ("{A}, lo que desincentiva entregas pequeñas y frecuentes: {b}.",
         "{A}, y {b}."),
    11: ("{A}, lo que puede frustrarlo y reducir su satisfacción: {b}.",
         "{A}, y {b}."),
}


# Casos que no son "ambas mal" ni "ambas bien": {ea}/{eb} son las etiquetas de las métricas A y B.
PLANTILLA_SOLO_A = "{A}, aunque {b}. En su historial hay una relación entre {ea} y {eb}, por lo que conviene vigilar {eb}."
PLANTILLA_SOLO_B = "{A}, pero {b}: esta vez {eb} está fuera de lo esperable aunque {ea} no lo está."
PLANTILLA_SIN_HISTORICO = "{A}; {b}."


def _periodo(c: dict) -> str:
    """Semanal si alguna de las métricas de la correlación solo existe una vez por semana."""
    metricas = c["metricas_a"] + c["metricas_b"]
    return "semana" if any(m in METRICAS_SEMANALES for m in metricas) else "dia"


def _bucket(fecha, periodo: str):
    return fecha - timedelta(days=fecha.weekday()) if periodo == "semana" else fecha


def _pearson(pares: list[tuple[float, float]]) -> float | None:
    if len(pares) < MIN_MUESTRAS:
        return None
    try:
        return round(correlation([a for a, _ in pares], [b for _, b in pares]), 3)
    except StatisticsError:  # una de las series es constante
        return None


def _significativa(r: float | None, n: int) -> bool:
    """Prueba t de Pearson al 95 %: con pocas muestras un coeficiente alto puede ser casualidad."""
    if r is None:
        return False
    if abs(r) >= 1:
        return True
    gl = n - 2
    t = abs(r) * sqrt(gl / (1 - r * r))
    return t > (_T_CRITICO[gl - 1] if gl <= len(_T_CRITICO) else 1.96)


def _fuerza(r: float | None) -> str:
    if r is None:
        return "sin_datos"
    if abs(r) >= 0.7:
        return "fuerte"
    if abs(r) >= 0.4:
        return "moderada"
    return "debil"


def _pivotar(filas: list[dict], campo_nombre: str, campo_valor: str, periodo: str, transformar: bool = True) -> dict:
    """{(usuario_id, periodo): {nombre: valor}} para alinear las series de cada usuario."""
    acumulado = defaultdict(lambda: defaultdict(list))
    for f in filas:
        if f[campo_valor] is not None:
            valor = TRANSFORMACIONES.get(f[campo_nombre], lambda v: v)(f[campo_valor]) if transformar else f[campo_valor]
            acumulado[(f["usuario_id"], _bucket(f["fecha_inicio"], periodo))][f[campo_nombre]].append(valor)
    return {k: {n: AGREGACION.get(n, mean)(v) for n, v in d.items()} for k, d in acumulado.items()}


def _por_usuario(muestras: dict) -> dict:
    """{usuario_id: [(periodo, {nombre: valor}), ...]} ordenado cronológicamente."""
    por_usuario = defaultdict(list)
    for (usuario, periodo), valores in sorted(muestras.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        por_usuario[usuario].append((periodo, valores))
    return por_usuario


def _estado(metrica: str, historial: list, indice: int) -> dict:
    """Valor del periodo `indice`, el promedio habitual de los periodos anteriores y su criticidad."""
    valor = historial[indice][1][metrica]
    previos = [v[metrica] for _, v in historial[:indice] if metrica in v]
    habitual = round(mean(previos), 2) if previos else None
    resultado = procesar_metrica(metrica, valor, previos)  # None si es relativa y aún no hay histórico
    return {"valor": round(valor, 2), "habitual": habitual,
            "criticidad": resultado["criticidad"] if resultado else "sin_historico"}


def _mal(metrica: str, e: dict) -> bool:
    """La métrica está fuera de su zona óptima de forma que importa para la relación. Una métrica por sprint solo
    cuenta si bajó respecto a lo habitual: completar más story points de lo normal no es un riesgo de sobrecarga."""
    if e["criticidad"] not in ("precaucion", "critico"):
        return False
    if metrica == "story_points_completados_sprint" and e["habitual"] is not None and e["valor"] >= e["habitual"]:
        return False
    return True


def _conclusion(c: dict, ma: str, mb: str, a: dict, b: dict) -> str:
    """El texto depende del estado de las dos métricas: ambas fuera de su zona óptima (plantilla de la relación),
    ambas en zona óptima, solo A o solo B. Si alguna aún no tiene histórico no se afirma nada sobre su estado."""
    if "sin_historico" in (a["criticidad"], b["criticidad"]):
        plantilla = PLANTILLA_SIN_HISTORICO
    else:
        a_mal, b_mal = _mal(ma, a), _mal(mb, b)
        if a_mal and b_mal:
            plantilla = PLANTILLAS[c["id"]][0]
        elif not a_mal and not b_mal:
            plantilla = PLANTILLAS[c["id"]][1]
        else:
            plantilla = PLANTILLA_SOLO_A if a_mal else PLANTILLA_SOLO_B
    frase_a = FRASES[ma](a["valor"], a["habitual"])
    return plantilla.format(A=frase_a[0].upper() + frase_a[1:], b=FRASES[mb](b["valor"], b["habitual"]),
                            ea=ETIQUETAS[ma], eb=ETIQUETAS[mb])


def correlacionar_metricas(filas: list[dict]) -> list[dict]:
    """Una fila por usuario y par de métricas. El diagnóstico (RF-14.2) se redacta solo si la correlación del
    historial del usuario es estadísticamente significativa; el estado dice por qué hay o no diagnóstico:
      diagnostico          significativa y en el sentido que plantea el marco
      patron_distinto      significativa pero en sentido opuesto al esperado (aviso neutro)
      no_significativa     hay datos suficientes pero la relación podría ser casualidad
      datos_insuficientes  menos de MIN_MUESTRAS periodos con ambas métricas, o una serie no varía
    Los valores del periodo más reciente (a, b) se entregan siempre, para las gráficas."""
    resultados = []
    crudo = {p: _por_usuario(_pivotar(filas, "nombre_metrica", "valor_crudo", p, transformar=False))
             for p in ("dia", "semana")}
    transformado = {p: _por_usuario(_pivotar(filas, "nombre_metrica", "valor_crudo", p))
                    for p in ("dia", "semana")}
    usuarios = sorted({f["usuario_id"] for f in filas})
    for c in CORRELACIONES:
        periodo = _periodo(c)
        esperado = 1 if c["relacion"] == "directa" else -1
        for usuario in usuarios:
            historial = crudo[periodo].get(usuario, [])
            for ma in c["metricas_a"]:
                for mb in c["metricas_b"]:
                    pares = [(m[ma], m[mb]) for _, m in transformado[periodo].get(usuario, []) if ma in m and mb in m]
                    r = _pearson(pares)
                    significativa = _significativa(r, len(pares))
                    if r is None:
                        estado = "datos_insuficientes"
                        detalle = (f"Se necesitan al menos {MIN_MUESTRAS} {'días' if periodo == 'dia' else 'semanas'} "
                                   f"con ambas métricas; hay {len(pares)}, o una de las series no varía.")
                    elif not significativa:
                        estado = "no_significativa"
                        detalle = f"La relación aún no es estadísticamente significativa en este usuario (r = {r:.2f}, n = {len(pares)})."
                    elif r * esperado > 0:
                        estado = "diagnostico"
                        detalle = f"Relación significativa (r = {r:.2f}, n = {len(pares)}). {AVISO_CAUSALIDAD}"
                    else:
                        estado = "patron_distinto"
                        detalle = (f"En este usuario la relación entre {ETIQUETAS[ma]} y {ETIQUETAS[mb]} es significativa "
                                   f"pero opuesta a la que plantea el marco (r = {r:.2f}, n = {len(pares)}). {AVISO_CAUSALIDAD}")

                    comunes = [i for i, (_, m) in enumerate(historial) if ma in m and mb in m]
                    # Los mismos periodos y valores crudos (sin transformar) con los que se calculó el coeficiente.
                    serie = [[historial[j][0].isoformat(), round(historial[j][1][ma], 2), round(historial[j][1][mb], 2)] for j in comunes]
                    i = comunes[-1] if comunes else None
                    a = _estado(ma, historial, i) if comunes else None
                    b = _estado(mb, historial, i) if comunes else None
                    conclusion = _conclusion(c, ma, mb, a, b) if estado == "diagnostico" else None
                    resultados.append({
                        "usuario_id": usuario,
                        "id": c["id"],
                        "dimension_a": c["dimension_a"],
                        "dimension_b": c["dimension_b"],
                        "contexto": c["contexto"],
                        "metrica_a": ma,
                        "metrica_b": mb,
                        "relacion_esperada": c["relacion"],
                        "periodo": periodo,
                        "periodo_referencia": historial[i][0].isoformat() if comunes else None,
                        "a": a,
                        "b": b,
                        "serie": serie,
                        "n_muestras": len(pares),
                        "coeficiente": r,
                        "fuerza": _fuerza(r),
                        "significativa": significativa,
                        "estado": estado,
                        "mensaje": conclusion or detalle,  # el texto que la tarjeta imprime siempre
                        "aviso": AVISO_CAUSALIDAD if estado in ("diagnostico", "patron_distinto") else None,
                        "conclusion": conclusion,
                        "detalle": detalle,
                    })
    return resultados


def correlacionar_dimensiones(filas: list[dict]) -> list[dict]:
    """Coeficiente entre los puntajes de cada par de dimensiones (S, P, A, C, E), por usuario y por semana."""
    por_usuario = _por_usuario(_pivotar(filas, "dimension", "puntaje_normalizado", "semana"))
    resultados = []
    for usuario in sorted({f["usuario_id"] for f in filas}):
        for da, db in combinations("SPACE", 2):
            pares = [(m[da], m[db]) for _, m in por_usuario.get(usuario, []) if da in m and db in m]
            r = _pearson(pares)
            resultados.append({
                "usuario_id": usuario,
                "dimension_a": da,
                "dimension_b": db,
                "periodo": "semana",
                "n_muestras": len(pares),
                "coeficiente": r,
                "fuerza": _fuerza(r),
                "significativa": _significativa(r, len(pares)),
            })
    return resultados
