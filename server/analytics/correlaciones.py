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
        "id": 1, "dimension_a": "S", "dimension_b": "P", "contexto": "Horas extra y calidad del código",
        "metricas_a": ["tiempo_extralaboral_pct"], "metricas_b": ["fiabilidad_prs"], "relacion": "inversa",
        "hipotesis": "El agotamiento cognitivo y el exceso de horas extra incrementan los errores de lógica, elevando los rechazos en la primera revisión del código.",
    },
    {
        "id": 2, "dimension_a": "S", "dimension_b": "P", "contexto": "Entorno físico y arreglos pendientes",
        "metricas_a": ["ruido_ambiental", "temperatura"], "metricas_b": ["deuda_tecnica_horas"], "relacion": "directa",
        "hipotesis": "Ambientes ruidosos (> 65 dB) o fuera de rango (> 26 °C) fragmentan la concentración, aumentando los code smells y con ellos las horas estimadas para corregirlos (deuda técnica).",
    },
    {
        "id": 3, "dimension_a": "S", "dimension_b": "P", "contexto": "Ánimo y pruebas del código",
        "metricas_a": ["enps"], "metricas_b": ["cobertura_codigo"], "relacion": "directa",
        "hipotesis": "Desarrolladores desmotivados (eNPS < 3.0) toman atajos en tareas de soporte (refactorización, testing), bajando la cobertura a menos del 80%.",
    },
    {
        "id": 4, "dimension_a": "C", "dimension_b": "E", "contexto": "Revisiones y tiempo de entrega",
        "metricas_a": ["tiempo_respuesta_pr_horas"], "metricas_b": ["tiempo_ciclo_dias"], "relacion": "directa",
        "hipotesis": "Revisiones lentas (> 24 horas) son el principal cuello de botella. Convierten el tiempo activo de desarrollo en tiempo pasivo de espera, inflando el tiempo de ciclo.",
    },
    {
        "id": 5, "dimension_a": "C", "dimension_b": "E", "contexto": "Revisiones y tareas detenidas",
        "metricas_a": ["tiempo_respuesta_pr_horas"], "metricas_b": ["tiempo_bloqueado_pct"], "relacion": "directa",
        "hipotesis": "La demora en revisar código incrementa el tiempo de tareas bloqueadas, forzando al desarrollador al cambio constante de contexto (context switching).",
    },
    {
        "id": 6, "dimension_a": "C", "dimension_b": "P", "contexto": "Documentación y solución de fallos",
        "metricas_a": ["commits_documentacion"], "metricas_b": ["mttr_horas"], "relacion": "inversa",
        "hipotesis": "Una baja tasa de documentación (< 2%) eleva drásticamente el MTTR porque el equipo tarda más en diagnosticar y entender el código fallido en producción.",
    },
    {
        "id": 7, "dimension_a": "A", "dimension_b": "S", "contexto": "Trabajo completado y horas extra",
        "metricas_a": ["story_points_completados_sprint"], "metricas_b": ["tiempo_extralaboral_pct"], "relacion": "inversa",
        "hipotesis": "Caídas bruscas en la velocidad del Sprint acompañadas de horas extra indican sobrecarga de trabajo o impedimentos técnicos no declarados.",
    },
    {
        "id": 8, "dimension_a": "A", "dimension_b": "S", "contexto": "Ritmo de entregas y horas extra",
        "metricas_a": ["dias_sin_commits"], "metricas_b": ["tiempo_extralaboral_pct"], "relacion": "directa",
        "hipotesis": "Entregas concentradas al final del Sprint (tras días sin commits) revelan jornadas nocturnas o de fin de semana para cumplir compromisos.",
    },
    {
        "id": 9, "dimension_a": "E", "dimension_b": "E", "contexto": "Conexión y tareas detenidas",
        "metricas_a": ["latencia_red_ms", "perdida_paquetes_pct"], "metricas_b": ["tiempo_bloqueado_pct"], "relacion": "directa",
        "hipotesis": "Redes inestables (> 150 ms o > 3% pérdida) fallan procesos CI/CD y conexiones remotas, inflando el tiempo bloqueado por causas ajenas al desarrollador.",
    },
    {
        "id": 10, "dimension_a": "E", "dimension_b": "A", "contexto": "Conexión y frecuencia de entregas",
        "metricas_a": ["latencia_red_ms"], "metricas_b": ["dias_sin_commits"], "relacion": "directa",
        "hipotesis": "Entornos de red lentos desincentivan las entregas pequeñas y continuas, haciendo que el desarrollador acumule código masivo en local antes de enviarlo.",
    },
    {
        "id": 11, "dimension_a": "E", "dimension_b": "S", "contexto": "Tareas detenidas y ánimo",
        "metricas_a": ["tiempo_bloqueado_pct"], "metricas_b": ["enps"], "relacion": "inversa",
        "hipotesis": "Estar bloqueado por terceros (dependencias, falta de specs) frustra a los desarrolladores, disminuyendo su nivel de satisfacción general.",
    },
]


# Nivel de confianza de 95 %. t crítico de Student (dos colas) para 1..30 grados de libertad; más allá se usa 1.96.
_T_CRITICO = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145,
              2.131, 2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048,
              2.045, 2.042]
# Los textos están escritos para quien no sabe estadística: nada de r, n, "significativa", "pp" ni "pts".
# El coeficiente y el número de muestras siguen en los campos numéricos para quien quiera verificarlos.
AVISO_CAUSALIDAD = "Que dos cosas cambien juntas no prueba que una cause la otra."

ETIQUETAS = {
    "tiempo_extralaboral_pct": "las horas extra", "fiabilidad_prs": "las revisiones aprobadas a la primera",
    "ruido_ambiental": "el ruido", "temperatura": "la temperatura", "deuda_tecnica_horas": "los arreglos pendientes en su código",
    "enps": "su ánimo", "cobertura_codigo": "las pruebas de su código",
    "tiempo_respuesta_pr_horas": "el tiempo para responder revisiones", "tiempo_ciclo_dias": "el tiempo que tardan sus tareas",
    "tiempo_bloqueado_pct": "el tiempo de tareas detenidas", "commits_documentacion": "la documentación",
    "mttr_horas": "el tiempo para resolver fallos", "story_points_completados_sprint": "el trabajo completado por sprint",
    "dias_sin_commits": "los días sin subir cambios", "latencia_red_ms": "la demora de su conexión",
    "perdida_paquetes_pct": "la pérdida de datos de su conexión",
}

# Cómo se dice que una métrica "sube" en la frase de un patrón opuesto al esperado. La temperatura se correlaciona
# transformada (distancia a TEMPERATURA_CONFORT), así que lo que "sube" es lo lejos que está de esa temperatura.
SUBE = {"temperatura": f"la temperatura se aleja de {TEMPERATURA_CONFORT:.0f} °C"}


def _num(v: float, decimales: int = 0) -> str:
    """Número con coma decimal, como se escribe en español."""
    return f"{v:.{decimales}f}".replace(".", ",")


def _hab(h, texto) -> str:
    """Valor habitual de la propia persona entre paréntesis; vacío si aún no hay histórico."""
    return "" if h is None else f" (normalmente, {texto(h)})"


def _de(etiqueta: str) -> str:
    """'de' + etiqueta, con la contracción 'del' cuando la etiqueta empieza por 'el '."""
    return f"del {etiqueta[3:]}" if etiqueta.startswith("el ") else f"de {etiqueta}"


def _dias_sin_subir(v, h) -> str:
    """Racha de días sin subir cambios; con 0 se dice en positivo en vez de 'hasta 0 días'."""
    if v < 0.5:
        texto = "subió cambios de código todos los días"
    else:
        texto = f"pasó hasta {_num(v)} días seguidos sin subir cambios de código"
    if h is None:
        return texto
    return texto + (" (como de costumbre)" if h < 0.5 and v < 0.5 else
                    " (normalmente, los subía todos los días)" if h < 0.5 else f" (normalmente, hasta {_num(h)})")


def _plural(etiqueta: str) -> bool:
    return etiqueta.startswith(("los ", "las "))


def _sube(metrica: str) -> str:
    e = ETIQUETAS[metrica]
    return SUBE.get(metrica, f"{e} {'suben' if _plural(e) else 'sube'}")


def _se_mueve(metrica: str, sube: bool) -> str:
    e = ETIQUETAS[metrica]
    if sube:
        return f"{e} también {'suben' if _plural(e) else 'sube'}"
    return f"{e} {'bajan' if _plural(e) else 'baja'}"


def _unidad(n: int, periodo: str) -> str:
    if periodo == "dia":
        return "día" if n == 1 else "días"
    return "semana" if n == 1 else "semanas"


def _ultimos(n: int, periodo: str) -> str:
    """'sus últimos 9 días' / 'sus últimas 9 semanas' (n >= MIN_MUESTRAS, siempre plural)."""
    return f"sus últimos {n} días" if periodo == "dia" else f"sus últimas {n} semanas"


def _estos(n: int, periodo: str) -> str:
    return f"estos {n} días" if periodo == "dia" else f"estas {n} semanas"


# Cómo se describe cada métrica en una frase (v = valor actual de la persona, h = su promedio habitual o None).
FRASES = {
    "tiempo_extralaboral_pct": lambda v, h: f"trabajó un {_num(v)} % más de su jornada pactada{_hab(h, lambda x: f'{_num(x)} %')}",
    "fiabilidad_prs": lambda v, h: f"el {_num(v)} % de sus cambios de código se aprobó en la primera revisión{_hab(h, lambda x: f'{_num(x)} %')}",
    "ruido_ambiental": lambda v, h: f"el ruido en su puesto promedia {_num(v)} dB{_hab(h, lambda x: f'{_num(x)} dB')}",
    "temperatura": lambda v, h: f"la temperatura de su puesto promedia {_num(v, 1)} °C{_hab(h, lambda x: f'{_num(x, 1)} °C')}",
    "deuda_tecnica_horas": lambda v, h: f"su código acumula {_num(v)} h de arreglos pendientes{_hab(h, lambda x: f'{_num(x)} h')}",
    "enps": lambda v, h: f"su ánimo está en {_num(v, 1)} de 5{_hab(h, lambda x: _num(x, 1))}",
    "cobertura_codigo": lambda v, h: f"las pruebas automáticas revisan el {_num(v)} % de su código{_hab(h, lambda x: f'{_num(x)} %')}",
    "tiempo_respuesta_pr_horas": lambda v, h: f"tarda {_num(v)} h en responder las revisiones de código{_hab(h, lambda x: f'{_num(x)} h')}",
    "tiempo_ciclo_dias": lambda v, h: f"sus tareas tardan {_num(v, 1)} días en terminarse{_hab(h, lambda x: _num(x, 1))}",
    "tiempo_bloqueado_pct": lambda v, h: f"sus tareas pasan el {_num(v)} % del tiempo detenidas, esperando algo{_hab(h, lambda x: f'{_num(x)} %')}",
    "commits_documentacion": lambda v, h: f"el {_num(v)} % de sus cambios de código es documentación{_hab(h, lambda x: f'{_num(x)} %')}",
    "mttr_horas": lambda v, h: f"tarda {_num(v)} h laborales en resolver un fallo{_hab(h, lambda x: f'{_num(x)} h')}",
    "story_points_completados_sprint": lambda v, h: f"completó {_num(v)} puntos de trabajo en el sprint{_hab(h, _num)}",
    "dias_sin_commits": _dias_sin_subir,
    "latencia_red_ms": lambda v, h: f"su conexión tarda {_num(v)} ms en responder{_hab(h, lambda x: f'{_num(x)} ms')}",
    "perdida_paquetes_pct": lambda v, h: f"su conexión pierde el {_num(v, 1)} % de los datos{_hab(h, lambda x: f'{_num(x, 1)} %')}",
}

# Conclusión por correlación: (A y B fuera de su zona óptima, A y B en zona óptima). Los casos mixtos usan
# PLANTILLA_SOLO_A y PLANTILLA_SOLO_B, más abajo.
# {A} = frase de la métrica A con mayúscula inicial, {b} = frase de la métrica B.
PLANTILLAS = {
    1: ("{A}, y su trabajo está pasando menos revisiones a la primera: {b}.",
        "{A}, y la calidad de su trabajo se mantiene: {b}."),
    2: ("{A}. Un entorno así dificulta concentrarse y suele dejar más trabajo por corregir: {b}.",
        "{A}, buenas condiciones para concentrarse; además, {b}."),
    3: ("{A}, y puede estar dejando de lado las pruebas: {b}.",
        "{A}, y {b}."),
    4: ("{A}, así que su trabajo queda en espera y tarda más en terminarse: {b}.",
        "{A}, y {b}."),
    5: ("{A}, y sus tareas pasan más tiempo detenidas: {b}.",
        "{A}, y {b}."),
    6: ("{A}, y eso hace más difícil entender y corregir fallos: {b}.",
        "{A}, y {b}."),
    7: ("{A}, mientras {b}. Puede ser exceso de trabajo o un obstáculo que no ha comentado.",
        "{A}; {b}."),
    8: ("{A}, y {b}. Puede estar acumulando el trabajo y terminándolo con jornadas largas.",
        "{A}; {b}."),
    9: ("{A}, lo que puede estar frenando su trabajo por causas que no dependen de la persona: {b}.",
        "{A}, y {b}."),
    10: ("{A}, y eso lleva a subir cambios con menos frecuencia: {b}.",
         "{A}, y {b}."),
    11: ("{A}, lo que puede estar desmotivando a la persona: {b}.",
         "{A}, y {b}."),
}


# Casos que no son "ambas mal" ni "ambas bien": {ea}/{eb} son las etiquetas de las métricas A y B.
PLANTILLA_SOLO_A = "{A}, aunque {b}. En su historial, {ea} y {eb} suelen ir de la mano, así que conviene estar pendiente {de_eb}."
PLANTILLA_SOLO_B = "{A}, pero {b}. Esta vez el problema en {eb} no parece venir {de_ea}."
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
                            ea=ETIQUETAS[ma], eb=ETIQUETAS[mb], de_ea=_de(ETIQUETAS[ma]), de_eb=_de(ETIQUETAS[mb]))


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
                    n = len(pares)
                    if r is None and n < MIN_MUESTRAS:
                        estado = "datos_insuficientes"
                        detalle = (f"Todavía no hay datos suficientes para saber si {ETIQUETAS[ma]} y {ETIQUETAS[mb]} "
                                   f"van de la mano: se necesitan {MIN_MUESTRAS} {_unidad(MIN_MUESTRAS, periodo)} "
                                   f"con ambas medidas y hay {n}.")
                    elif r is None:  # hay muestras suficientes, pero una de las dos series no cambia
                        estado = "datos_insuficientes"
                        detalle = (f"Una de las dos medidas no ha cambiado en {_estos(n, periodo)}, "
                                   f"así que no se puede saber si se relacionan.")
                    elif not significativa:
                        estado = "no_significativa"
                        detalle = (f"En {_ultimos(n, periodo)}, {ETIQUETAS[ma]} y {ETIQUETAS[mb]} no han cambiado a la par "
                                   f"de forma clara. Por ahora puede ser coincidencia.")
                    elif r * esperado > 0:
                        estado = "diagnostico"
                        detalle = (f"En {_ultimos(n, periodo)}, {ETIQUETAS[ma]} y {ETIQUETAS[mb]} han cambiado a la par, "
                                   f"como se esperaba. {AVISO_CAUSALIDAD}")
                    else:
                        estado = "patron_distinto"
                        detalle = (f"En {_ultimos(n, periodo)}, cuando {_sube(ma)}, {_se_mueve(mb, r > 0)}: lo contrario "
                                   f"de lo esperado. Conviene hablarlo con la persona antes de sacar conclusiones.")

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
