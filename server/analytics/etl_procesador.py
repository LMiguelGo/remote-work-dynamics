from apscheduler.schedulers.background import BackgroundScheduler
from datetime import datetime

from derivadas import desviacion_porcentual

# ==========================================
# 1. DEFINICIÓN DE LAS TAREAS ETL
# ==========================================

def etl_cierre_dia():
    """Ejecución diaria a medianoche: métricas diarias del día que terminó."""
    from datetime import date, timedelta
    from etl import cierre_dia  # import tardío: etl importa pipeline, que importa este módulo
    dia = date.today() - timedelta(days=1)
    print(f"[{datetime.now()}] Cierre de día {dia}: {len(cierre_dia(dia))} usuarios analizados.")

def etl_cierre_ciclo():
    """Ejecución semanal (lunes 00:10): métricas semanales y por sprint de la semana que terminó."""
    from datetime import date, timedelta
    from etl import cierre_ciclo
    hoy = date.today()
    lunes = hoy - timedelta(days=hoy.weekday() + 7)
    print(f"[{datetime.now()}] Cierre de ciclo {lunes}: {len(cierre_ciclo(lunes))} usuarios analizados.")


# ==========================================
# 2. CONFIGURACIÓN DEL RELOJ (SCHEDULER)
# ==========================================

def iniciar_programador_etl():
    # coalesce + misfire_grace_time: si el servidor estuvo apagado a la hora del cierre, se ejecuta una vez al volver
    scheduler = BackgroundScheduler(
        timezone="America/Bogota",
        job_defaults={"coalesce": True, "misfire_grace_time": 3600},
    )
    
    # Tarea 1: Cron - Todos los días a la medianoche (00:00), procesa el día anterior
    scheduler.add_job(etl_cierre_dia, trigger='cron', hour=0, minute=0, id='job_cierre_dia')

    # Tarea 2: Cron - Todos los lunes a las 00:10, procesa la semana anterior (lunes a domingo)
    scheduler.add_job(etl_cierre_ciclo, trigger='cron', day_of_week='mon', hour=0, minute=10, id='job_cierre_ciclo')
    
    # Encender el reloj
    scheduler.start()
    print("⏱️ Programador APScheduler iniciado correctamente.")
    return scheduler

def escala_inversa(valor: float, limite_optimo: float, limite_precaucion: float, maximo_teorico: float) -> dict:
    """Métricas donde MENOS es MEJOR (Ej: MTTR, Ruido, Fatiga)"""
    if valor <= limite_optimo:
        criticidad = "optimo"
        # Escala 8.0 a 10.0
        rango_valor = limite_optimo if limite_optimo > 0 else 1
        puntaje = 10.0 - ((valor / rango_valor) * 2.0)
    elif valor <= limite_precaucion:
        criticidad = "precaucion"
        # Escala 6.0 a 7.9
        rango = limite_precaucion - limite_optimo
        puntaje = 7.9 - (((valor - limite_optimo) / rango) * 1.9)
    else:
        criticidad = "critico"
        # Escala 0.0 a 5.9
        rango = maximo_teorico - limite_precaucion
        exceso = min(valor, maximo_teorico) - limite_precaucion
        puntaje = 5.9 - ((exceso / rango) * 5.9)
        
    return {"valor_normalizado": round(min(10.0, max(0.0, puntaje)), 1), "criticidad": criticidad}

def escala_directa(valor: float, limite_optimo: float, limite_precaucion: float, minimo_teorico: float,
                   valor_pleno: float | None = None) -> dict:
    """Métricas donde MÁS es MEJOR (Ej: eNPS, Cobertura, Fiabilidad PRs).
    Por defecto toda la banda óptima vale 10. Con `valor_pleno` (ej. velocidad de red) la banda óptima es gradual:
    8.0 en el límite óptimo y 10.0 desde `valor_pleno`."""
    if valor >= limite_optimo:
        criticidad = "optimo"
        if valor_pleno is None:
            puntaje = 10.0
        else:
            puntaje = 8.0 + min(1.0, (valor - limite_optimo) / (valor_pleno - limite_optimo)) * 2.0
    elif valor >= limite_precaucion:
        criticidad = "precaucion"
        rango = limite_optimo - limite_precaucion
        puntaje = 6.0 + (((valor - limite_precaucion) / rango) * 1.9)
    else:
        criticidad = "critico"
        rango = limite_precaucion - minimo_teorico
        puntaje = 0.0 + (((valor - minimo_teorico) / rango) * 5.9)
        
    return {"valor_normalizado": round(min(10.0, max(0.0, puntaje)), 1), "criticidad": criticidad}

def escala_rango(valor: float, min_opt: float, max_opt: float, min_prec: float, max_prec: float) -> dict:
    """Métricas con ZONAS DE CONFORT (Ej: Temperatura, Humedad)"""
    if min_opt <= valor <= max_opt:
        return {"valor_normalizado": 10.0, "criticidad": "optimo"}

    # Distancia a la zona óptima y ancho de la banda de precaución en el lado correspondiente
    if valor < min_opt:
        distancia, ancho = min_opt - valor, min_opt - min_prec
    else:
        distancia, ancho = valor - max_opt, max_prec - max_opt

    if min_prec <= valor <= max_prec:
        # Escala 7.9 a 6.0, igual que las otras escalas
        return {"valor_normalizado": round(7.9 - (distancia / ancho) * 1.9, 1), "criticidad": "precaucion"}

    # Crítico: baja de 5.9 a 0.0 en una distancia igual al ancho de la banda de precaución
    exceso = min(distancia - ancho, ancho)
    return {"valor_normalizado": round(5.9 - (exceso / ancho) * 5.9, 1), "criticidad": "critico"}

CONFIGURACION_METRICAS = {
    # ==========================================
    # S - SATISFACCIÓN Y BIENESTAR
    # ==========================================
    "tiempo_extralaboral_pct": {"tipo": "inversa", "args": (5.0, 15.0, 50.0)}, # % sobre la jornada
    "enps": {"tipo": "directa", "args": (4.0, 3.0, 1.0)},
    "fatiga": {"tipo": "inversa", "args": (2.0, 3.5, 5.0)},
    "percepcion_herramientas": {"tipo": "directa", "args": (4.0, 3.0, 1.0)},
    "ruido_ambiental": {"tipo": "inversa", "args": (50.0, 65.0, 90.0)},
    "temperatura": {"tipo": "rango", "args": (20.0, 24.0, 18.0, 26.0)},
    "humedad": {"tipo": "rango", "args": (40.0, 60.0, 30.0, 70.0)},
    
    # ==========================================
    # P - RENDIMIENTO
    # ==========================================
    "fiabilidad_prs": {"tipo": "directa", "args": (80.0, 60.0, 0.0)}, # Porcentajes
    "mttr_horas": {"tipo": "inversa", "args": (8.0, 24.0, 72.0)},
    "cobertura_codigo": {"tipo": "directa", "args": (80.0, 60.0, 0.0)},
    "lineas_duplicadas": {"tipo": "inversa", "args": (3.0, 5.0, 15.0)},
    "deuda_tecnica_horas": {"tipo": "inversa", "args": (8.0, 40.0, 120.0)},
    
    # ==========================================
    # A - ACTIVIDAD
    # ==========================================
    # Las tres métricas "relativa" guardan el conteo del sprint; su puntaje sale de la diferencia (%) con el promedio
    # histórico del propio usuario: ±15 % óptimo, hasta 30 % precaución, más de 30 % crítico.
    "story_points_completados_sprint": {"tipo": "relativa", "args": (15.0, 30.0, 100.0)},
    "dias_sin_commits": {"tipo": "inversa", "args": (2.0, 4.0, 7.0)},
    "prs_cerrados_sprint": {"tipo": "relativa", "args": (15.0, 30.0, 100.0)},
    "tickets_resueltos_sprint": {"tipo": "relativa", "args": (15.0, 30.0, 100.0)},
    
    # ==========================================
    # C - COMUNICACIÓN Y COLABORACIÓN
    # ==========================================
    "tiempo_respuesta_pr_horas": {"tipo": "inversa", "args": (12.0, 24.0, 72.0)},
    "commits_documentacion": {"tipo": "directa", "args": (5.0, 2.0, 0.0)},
    "encuestas_tcs": {"tipo": "directa", "args": (4.0, 3.0, 1.0)},
    "percepcion_documentacion": {"tipo": "directa", "args": (4.0, 3.0, 1.0)},
    
    # ==========================================
    # E - EFICIENCIA Y FLUJO
    # ==========================================
    "tiempo_ciclo_dias": {"tipo": "inversa", "args": (2.0, 5.0, 15.0)},
    "tiempo_bloqueado_pct": {"tipo": "inversa", "args": (10.0, 25.0, 100.0)},
    "latencia_red_ms": {"tipo": "inversa", "args": (50.0, 150.0, 500.0)},
    "perdida_paquetes_pct": {"tipo": "inversa", "args": (1.0, 3.0, 10.0)},
    "velocidad_descarga_mbps": {"tipo": "directa", "args": (50.0, 20.0, 0.0, 100.0)},
    "velocidad_carga_mbps": {"tipo": "directa", "args": (15.0, 5.0, 0.0, 30.0)},
    "interrupciones_red_dia": {"tipo": "inversa", "args": (2.0, 5.0, 12.0)},
}

METRICAS_RELATIVAS = [m for m, c in CONFIGURACION_METRICAS.items() if c["tipo"] == "relativa"]


def procesar_metrica(nombre_metrica: str, valor_crudo: float, historico: list | None = None) -> dict | None:
    """Orquestador que normaliza cualquier métrica basándose en el diccionario.
    Las métricas "relativa" se puntúan contra `historico` (valores de sus periodos anteriores); sin histórico
    no hay con qué comparar y devuelve None."""
    
    # 1. Casos Especiales (Métricas Categóricas como SonarQube)
    if nombre_metrica in METRICAS_RATING_SONAR:
        # Acepta la letra (A-E) o el número con que se guarda en la DB (A=5 ... E=1)
        letra = str(valor_crudo).upper()
        if letra not in RATING_SONAR_NUMERICO:
            letra = next((l for l, n in RATING_SONAR_NUMERICO.items() if n == valor_crudo), "E")
        val, crit = MAPA_SONAR[letra]
        return {"metrica": nombre_metrica, "valor_crudo": valor_crudo, "valor_normalizado": val, "criticidad": crit}

    # 2. Búsqueda en el Diccionario
    config = CONFIGURACION_METRICAS.get(nombre_metrica)
    if not config:
        raise ValueError(f"Métrica {nombre_metrica} no configurada.")
        
    # 3. Enrutamiento al Helper Matemático
    if config["tipo"] == "relativa":
        desviacion = desviacion_porcentual(valor_crudo, historico or [])
        if desviacion is None:
            return None
        resultado = escala_inversa(desviacion, *config["args"])
        return {"metrica": nombre_metrica, "valor_crudo": valor_crudo, "valor_normalizado": resultado["valor_normalizado"],
                "criticidad": resultado["criticidad"], "desviacion_pct": round(desviacion, 1)}
    elif config["tipo"] == "inversa":
        resultado = escala_inversa(valor_crudo, *config["args"])
    elif config["tipo"] == "directa":
        resultado = escala_directa(valor_crudo, *config["args"])
    elif config["tipo"] == "rango":
        resultado = escala_rango(valor_crudo, *config["args"])
    else:
        raise ValueError(f"Tipo de escala '{config['tipo']}' no soportado para {nombre_metrica}.")

    return {
        "metrica": nombre_metrica,
        "valor_crudo": valor_crudo,
        "valor_normalizado": resultado["valor_normalizado"],
        "criticidad": resultado["criticidad"]
    }

# El rating de seguridad de SonarQube se guarda como número (mayor = mejor) porque valor_crudo es REAL en la DB
RATING_SONAR_NUMERICO = {"A": 5.0, "B": 4.0, "C": 3.0, "D": 2.0, "E": 1.0}
MAPA_SONAR = {"A": (10.0, "optimo"), "B": (7.5, "precaucion"), "C": (6.0, "precaucion"), "D": (3.0, "critico"), "E": (0.0, "critico")}
METRICAS_RATING_SONAR = ("rating_seguridad_sonarqube",)

# Dimensión a la que pertenece cada métrica (según metricas_umbrales.md)
METRICA_DIMENSION = {
    **dict.fromkeys(["tiempo_extralaboral_pct", "enps", "fatiga", "percepcion_herramientas",
                     "ruido_ambiental", "temperatura", "humedad"], "S"),
    **dict.fromkeys(["fiabilidad_prs", "mttr_horas", "cobertura_codigo", "lineas_duplicadas",
                     "deuda_tecnica_horas", "rating_seguridad_sonarqube"], "P"),
    **dict.fromkeys(["story_points_completados_sprint", "dias_sin_commits", "prs_cerrados_sprint",
                     "tickets_resueltos_sprint"], "A"),
    **dict.fromkeys(["tiempo_respuesta_pr_horas", "commits_documentacion", "encuestas_tcs",
                     "percepcion_documentacion"], "C"),
    **dict.fromkeys(["tiempo_ciclo_dias", "tiempo_bloqueado_pct", "latencia_red_ms",
                     "perdida_paquetes_pct", "velocidad_descarga_mbps",
                     "velocidad_carga_mbps", "interrupciones_red_dia"], "E"),
}

def procesar_mediciones(valores: dict, historicos: dict | None = None) -> dict:
    """{metrica: valor_crudo} -> {dimension: [resultado de procesar_metrica, ...]}.
    Aplica a cada métrica su función de escala y las agrupa por dimensión. `historicos` trae, para las métricas
    relativas, los valores de periodos anteriores; si no hay con qué comparar, la métrica se omite este periodo."""
    por_dimension = {}
    for nombre, valor in valores.items():
        dimension = METRICA_DIMENSION.get(nombre)
        if dimension is None:
            raise ValueError(f"Métrica {nombre} sin dimensión asignada.")
        resultado = procesar_metrica(nombre, valor, (historicos or {}).get(nombre))
        if resultado is not None:
            por_dimension.setdefault(dimension, []).append(resultado)
    return por_dimension

# Bandas de criticidad del puntaje 0-10, iguales para cada métrica y para cada dimensión (promedio de sus métricas):
# óptimo 8.0 a 10, precaución 6.0 a 7.9, crítico 0.0 a 5.9.
PUNTAJE_MIN_OPTIMO = 8.0
PUNTAJE_MIN_PRECAUCION = 6.0

def consolidar_dimension(metricas: list[dict]) -> dict:
    """Promedia los puntajes de las métricas de una dimensión y le asigna criticidad."""
    puntaje = round(sum(m["valor_normalizado"] for m in metricas) / len(metricas), 1)
    if puntaje >= PUNTAJE_MIN_OPTIMO:
        criticidad = "optimo"
    elif puntaje >= PUNTAJE_MIN_PRECAUCION:
        criticidad = "precaucion"
    else:
        criticidad = "critico"
    return {"puntaje_normalizado": puntaje, "estado_criticidad": criticidad}


if __name__ == "__main__":
    # --- PRUEBAS DEL ETL ---
    print(procesar_metrica("mttr_horas", 16.5))
    # Salida: {'metrica': 'mttr_horas', 'valor_crudo': 16.5, 'valor_normalizado': 6.9, 'criticidad': 'precaucion'}

    print(procesar_metrica("cobertura_codigo", 55.0))
    # Salida: {'metrica': 'cobertura_codigo', 'valor_crudo': 55.0, 'valor_normalizado': 5.4, 'criticidad': 'critico'}

    print(procesar_metrica("temperatura", 22.5))
    # Salida: {'metrica': 'temperatura', 'valor_crudo': 22.5, 'valor_normalizado': 10.0, 'criticidad': 'optimo'}