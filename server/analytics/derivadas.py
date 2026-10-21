"""Valor crudo de cada métrica a partir de los eventos de `data_guide.md`.

Cada evento llega con su fuente (`source_type`), su tipo (`event_type`), su marca de tiempo y su payload. Son funciones
puras: reciben una lista de `Evento` ya leídos de la DB y devuelven el valor crudo de la métrica, listo para
`procesar_metrica`. Devuelven None cuando no hay base de cálculo (por ejemplo, ningún PR revisado en el periodo): un
periodo sin datos no se guarda como 0. `calcular_metricas` junta todas.
"""
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from statistics import mean

TZ_LOCAL = timezone(timedelta(hours=-5))  # Colombia, sin horario de verano

DURACION_PACTADA_H = 8.0  # jornada contratada, para el % de tiempo extralaboral
TIPOS_FALLO = ("Bug", "Incident")
ESTADOS_HECHO = ("done", "closed")
ESTADOS_EN_CURSO = ("in progress", "en progreso")
# Un ticket sin eventos durante más de estos días se considera ausencia no declarada y ese intervalo no cuenta.
MAX_DIAS_INACTIVIDAD = 5


@dataclass(frozen=True)
class CalendarioLaboral:
    dias: tuple = (0, 1, 2, 3, 4)  # lunes a viernes (weekday())
    inicio: time = time(8, 0)
    fin: time = time(16, 0)        # 8 horas laborales por día
    festivos: frozenset = frozenset()

    @property
    def horas_dia(self) -> float:
        return (datetime.combine(date.min, self.fin) - datetime.combine(date.min, self.inicio)).total_seconds() / 3600

    def es_laboral(self, dia: date) -> bool:
        return dia.weekday() in self.dias and dia not in self.festivos


# ---------- Eventos ----------

def _fecha(valor) -> datetime:
    """Acepta datetime o ISO 8601 ('2026-10-19T08:00:00Z')."""
    return valor if isinstance(valor, datetime) else datetime.fromisoformat(str(valor).replace("Z", "+00:00"))


@dataclass(frozen=True)
class Evento:
    fuente: str      # data_sources:source_type
    tipo: str        # events:event_type
    fecha: datetime  # instante del evento
    payload: dict

    @classmethod
    def desde_dict(cls, d: dict) -> "Evento":
        """Fila de `events` como diccionario. La marca de tiempo está en `time` (columna de `events`)."""
        marca = next((d[k] for k in ("time", "timestamp", "occurred_at", "created_at") if k in d), None)
        if marca is None:
            raise KeyError("El evento no trae marca de tiempo (time)")
        return cls(d.get("source_type", ""), d["event_type"], _fecha(marca), d.get("payload") or {})


# ---------- Tiempo ----------

def _local(dt: datetime) -> datetime:
    """Hora local de Colombia sin zona. Las marcas guardadas en UTC se convierten; las ingenuas ya son locales."""
    return dt if dt.tzinfo is None else dt.astimezone(TZ_LOCAL).replace(tzinfo=None)


def _en_periodo(fecha: datetime, desde: datetime, hasta: datetime) -> bool:
    return _local(desde) <= _local(fecha) < _local(hasta)


def _seleccion(eventos: list, tipo: str, desde: datetime, hasta: datetime) -> list:
    """Eventos de un tipo dentro de [desde, hasta), en orden cronológico."""
    return sorted((e for e in eventos if e.tipo == tipo and _en_periodo(e.fecha, desde, hasta)),
                  key=lambda e: _local(e.fecha))


def horas_laborales(desde: datetime, hasta: datetime, cal: CalendarioLaboral = CalendarioLaboral()) -> float:
    """Horas entre dos instantes que caen en horario laboral (sin noches, fines de semana ni festivos)."""
    desde, hasta = _local(desde), _local(hasta)
    total, dia = 0.0, desde.date()
    while dia <= hasta.date():
        if cal.es_laboral(dia):
            ini = max(datetime.combine(dia, cal.inicio), desde)
            fin = min(datetime.combine(dia, cal.fin), hasta)
            if fin > ini:
                total += (fin - ini).total_seconds() / 3600
        dia += timedelta(days=1)
    return total


def _activos(inicio: datetime, fin: datetime, actividad: list, max_dias: int) -> list:
    """Tramos entre `inicio` y `fin` sin los huecos mayores a `max_dias` entre eventos consecutivos."""
    inicio, fin = _local(inicio), _local(fin)
    puntos = sorted({inicio, fin, *[_local(m) for m in actividad if inicio < _local(m) < fin]})
    return [(a, b) for a, b in zip(puntos, puntos[1:]) if b - a <= timedelta(days=max_dias)]


def _horas(intervalos: list, cal: CalendarioLaboral) -> float:
    return sum(horas_laborales(a, b, cal) for a, b in intervalos)


# ---------- S: jornada (web_app / working_session) ----------

def sesiones_trabajo(eventos: list, desde: datetime, hasta: datetime) -> list:
    """[(inicio, fin)] de las sesiones de trabajo que empiezan en el periodo. También son las ventanas en las que
    se promedian los sensores y se cuentan las interrupciones de red."""
    sesiones = [(_fecha(e.payload["start_time"]), _fecha(e.payload["end_time"]))
                for e in eventos if e.tipo == "working_session" and "start_time" in e.payload and "end_time" in e.payload]
    return sorted((a, b) for a, b in sesiones if _en_periodo(a, desde, hasta))


def pct_tiempo_extralaboral(eventos: list, desde: datetime, hasta: datetime,
                            duracion_pactada_h: float = DURACION_PACTADA_H) -> float | None:
    """(Horas trabajadas en el periodo - jornada pactada) / jornada pactada x 100. No baja de 0: trabajar menos
    no es extralaboral. Se suman las sesiones del periodo (una jornada puede tener varias)."""
    sesiones = sesiones_trabajo(eventos, desde, hasta)
    if not sesiones or duracion_pactada_h <= 0:
        return None
    real = sum((_local(b) - _local(a)).total_seconds() / 3600 for a, b in sesiones)
    return max(0.0, (real - duracion_pactada_h) / duracion_pactada_h * 100)


# ---------- Métricas que son el promedio de un campo del payload ----------

# métrica: (tipo de evento, campo del payload, factor, solo dentro de la jornada)
CAMPOS_PROMEDIO = {
    # web_app: encuestas diarias y semanales (escala 1-5)
    "enps": ("daily_survey", "satisfaction_level", 1, False),
    "percepcion_herramientas": ("daily_survey", "tools_perception", 1, False),
    "fatiga": ("daily_survey", "fatigue_level", 1, False),
    "encuestas_tcs": ("weekly_survey", "team_coordination", 1, False),
    "percepcion_documentacion": ("weekly_survey", "documentation_perception", 1, False),
    # esp32 y agente de red: lecturas durante la jornada registrada
    "ruido_ambiental": ("ambiental_reading", "noise_level", 1, True),
    "temperatura": ("ambiental_reading", "temperature", 1, True),
    "humedad": ("ambiental_reading", "humidity", 1, True),
    "latencia_red_ms": ("qos_measurement", "latency_ms", 1, True),
    "perdida_paquetes_pct": ("qos_measurement", "packet_loss_percentage", 1, True),
    "velocidad_descarga_mbps": ("qos_measurement", "download_speed_mbps", 1, True),
    "velocidad_carga_mbps": ("qos_measurement", "upload_speed_mbps", 1, True),
    # sonarqube: una medición por análisis (cada subida de código); la deuda llega en minutos
    "cobertura_codigo": ("pull_request_quality", "code_coverage_percentage", 1, False),
    "lineas_duplicadas": ("pull_request_quality", "duplicated_lines_percentage", 1, False),
    "deuda_tecnica_horas": ("pull_request_quality", "technical_debt_minutes", 1 / 60, False),
}


def promedio_campo(eventos: list, metrica: str, desde: datetime, hasta: datetime, ventanas: list | None = None) -> float | None:
    """Promedio del campo de `CAMPOS_PROMEDIO[metrica]` en el periodo. Las lecturas de sensores y de red solo cuentan
    dentro de `ventanas` (la jornada); sin jornada no hay dato."""
    tipo, campo, factor, solo_jornada = CAMPOS_PROMEDIO[metrica]
    valores = []
    for e in _seleccion(eventos, tipo, desde, hasta):
        valor = e.payload.get(campo)
        if valor is None:
            continue
        if solo_jornada and not any(_local(a) <= _local(e.fecha) <= _local(b) for a, b in ventanas or []):
            continue
        valores.append(valor * factor)
    return mean(valores) if valores else None


def rating_seguridad(eventos: list, desde: datetime, hasta: datetime) -> str | None:
    """Rating de seguridad (A-E) del último análisis de SonarQube del periodo: una letra no se promedia."""
    analisis = [e for e in _seleccion(eventos, "pull_request_quality", desde, hasta) if e.payload.get("security_rating")]
    return analisis[-1].payload["security_rating"] if analisis else None


def interrupciones_red(eventos: list, desde: datetime, hasta: datetime, ventanas: list) -> int | None:
    """Caídas de red dentro de la jornada. Sin jornada no hay dato; con jornada y sin caídas el resultado es 0,
    que es un dato válido."""
    if not ventanas:
        return None
    return sum(int(e.payload.get("interruption_count", 1)) for e in _seleccion(eventos, "interruption", desde, hasta)
               if any(_local(a) <= _local(e.fecha) <= _local(b) for a, b in ventanas))


# ---------- P y C: revisiones de PRs (github / pull_request_review) ----------

def _primera_revision_por_pr(eventos: list, desde: datetime, hasta: datetime) -> list:
    """Una revisión por PR (la primera del periodo): 'aprobado al primer intento' es una propiedad del PR."""
    vistos = {}
    for e in _seleccion(eventos, "pull_request_review", desde, hasta):
        vistos.setdefault(e.payload.get("pr_number", id(e)), e)
    return list(vistos.values())


def fiabilidad_prs(eventos: list, desde: datetime, hasta: datetime) -> float | None:
    """% de PRs revisados en el periodo que se aprobaron al primer intento."""
    revisiones = [r for r in _primera_revision_por_pr(eventos, desde, hasta) if "is_first_attempt_approved" in r.payload]
    if not revisiones:
        return None
    return sum(1 for r in revisiones if r.payload["is_first_attempt_approved"]) / len(revisiones) * 100


def tiempo_respuesta_pr_horas(eventos: list, desde: datetime, hasta: datetime) -> float | None:
    """Promedio de horas que tardó la primera respuesta a una revisión de PR. El payload ya trae el tiempo en minutos."""
    minutos = [r.payload["review_responsiveness_minutes"] for r in _primera_revision_por_pr(eventos, desde, hasta)
               if r.payload.get("review_responsiveness_minutes") is not None]
    return mean(minutos) / 60 if minutos else None


# ---------- A y C: commits (github / commit) ----------

def pct_commits_documentacion(eventos: list, desde: datetime, hasta: datetime) -> float | None:
    """% de commits con prefijo `docs` sobre el total de commits del periodo (los sin prefijo también cuentan en el total)."""
    commits = _seleccion(eventos, "commit", desde, hasta)
    if not commits:
        return None
    return sum(1 for c in commits if (c.payload.get("conventional_commit_prefix") or "").lower() == "docs") / len(commits) * 100


def dias_sin_commits(eventos: list, hasta: date, cal: CalendarioLaboral = CalendarioLaboral()) -> int | None:
    """Días laborables consecutivos, hasta `hasta` inclusive, sin commits ni PRs integrados. Necesita el historial
    reciente (no solo el día): sin ninguna actividad en los eventos recibidos no hay dato."""
    activos = {_local(e.fecha).date() for e in eventos
               if e.tipo == "commit" or (e.tipo == "pull_request" and e.payload.get("action") == "merged")}
    if not activos:
        return None
    dia, n = hasta, 0
    for _ in range(366):
        if dia in activos:
            break
        n += cal.es_laboral(dia)
        dia -= timedelta(days=1)
    return n


# ---------- P, E y A: tickets de Jira ----------

@dataclass
class Ticket:
    id: str
    tipo: str | None = None                        # Bug, Incident, Story, Task
    creado: datetime | None = None                 # issue_created
    resuelto: datetime | None = None               # última transición a Done/Closed (None si se reabrió)
    inicio_trabajo: datetime | None = None         # primera transición a "In Progress"
    actividad: list = field(default_factory=list)  # fecha de cada issue_updated
    story_points: float | None = None              # estimación en issue_created
    horas_resolucion: float | None = None          # resolution_time_hours del evento que lo resolvió
    horas_bloqueado: float | None = None           # blocked_time_hours del evento que lo resolvió


def construir_tickets(eventos: list) -> list:
    """Une issue_created e issue_updated por `issue_key`. Para que un ticket aparezca con su creación, `eventos` debe
    incluir el evento issue_created aunque sea anterior al periodo."""
    por_clave = {}
    for e in sorted((e for e in eventos if e.tipo in ("issue_created", "issue_updated")), key=lambda e: _local(e.fecha)):
        clave = e.payload.get("issue_key")
        if not clave:
            continue
        t = por_clave.setdefault(clave, Ticket(clave))
        if e.tipo == "issue_created":
            t.creado, t.tipo, t.story_points = e.fecha, e.payload.get("issue_type"), e.payload.get("story_points")
            continue
        t.actividad.append(e.fecha)
        destino = str(e.payload.get("status_to", "")).casefold()
        if destino in ESTADOS_HECHO:
            t.resuelto = e.fecha
            t.horas_resolucion = e.payload.get("resolution_time_hours")
            t.horas_bloqueado = e.payload.get("blocked_time_hours")
        else:
            t.resuelto = t.horas_resolucion = t.horas_bloqueado = None  # se reabrió
            if destino in ESTADOS_EN_CURSO and t.inicio_trabajo is None:
                t.inicio_trabajo = e.fecha
    return list(por_clave.values())


def _resueltos(tickets: list, desde: datetime, hasta: datetime) -> list:
    return [t for t in tickets if t.resuelto and _en_periodo(t.resuelto, desde, hasta)]


def mttr_horas(tickets: list, desde: datetime, hasta: datetime, cal: CalendarioLaboral = CalendarioLaboral(),
               max_dias: int = MAX_DIAS_INACTIVIDAD) -> float | None:
    """Promedio de (resolución - creación) de los Bug/Incident resueltos en el periodo, en horas laborales
    y sin los intervalos de inactividad larga. Se calcula con las marcas de tiempo de los eventos, no con
    `resolution_time_hours`, porque esa cifra no distingue horas laborales."""
    trs = [_horas(_activos(t.creado, t.resuelto, t.actividad, max_dias), cal)
           for t in _resueltos(tickets, desde, hasta) if t.tipo in TIPOS_FALLO and t.creado and t.creado < t.resuelto]
    return mean(trs) if trs else None


def tiempo_ciclo_dias(tickets: list, desde: datetime, hasta: datetime, cal: CalendarioLaboral = CalendarioLaboral(),
                   max_dias: int = MAX_DIAS_INACTIVIDAD) -> float | None:
    """Tiempo de ciclo: promedio, en días laborales, entre que el ticket pasa a "In Progress" y llega a Done/Closed.
    No hay evento de producción, por eso no es el Lead Time de Jira a producción. Tickets que nunca pasaron por
    "In Progress" no tienen inicio y no cuentan."""
    ciclos = [_horas(_activos(t.inicio_trabajo, t.resuelto, t.actividad, max_dias), cal)
              for t in _resueltos(tickets, desde, hasta) if t.inicio_trabajo and t.inicio_trabajo < t.resuelto]
    return mean(ciclos) / cal.horas_dia if ciclos else None


def tiempo_bloqueado_pct(tickets: list, desde: datetime, hasta: datetime) -> float | None:
    """Horas en estado bloqueado como % del tiempo de resolución, ambas del evento que resolvió el ticket
    (`blocked_time_hours` / `resolution_time_hours`). Es un cociente de dos cifras de la misma fuente."""
    pares = [(t.horas_bloqueado, t.horas_resolucion) for t in _resueltos(tickets, desde, hasta)
             if t.horas_bloqueado is not None and t.horas_resolucion]
    total = sum(r for _, r in pares)
    return sum(b for b, _ in pares) / total * 100 if total > 0 else None


# ---------- A: trabajo completado por sprint ----------

def desviacion_porcentual(actual: float, anteriores: list) -> float | None:
    """% de diferencia (en valor absoluto) del periodo frente al promedio histórico del propio usuario.
    Sin periodos anteriores no hay histórico y devuelve None. Es lo que puntúa a las métricas "relativa"."""
    if not anteriores or mean(anteriores) == 0:
        return None
    historico = mean(anteriores)
    return abs(actual - historico) / historico * 100


def story_points_completados_sprint(tickets: list, desde: datetime, hasta: datetime) -> float | None:
    """Suma de Story Points de los tickets que pasaron a Done/Closed dentro del sprint [desde, hasta).
    Sin ningún ticket estimado no hay base de cálculo."""
    if not any(t.story_points is not None for t in tickets):
        return None
    return sum(t.story_points or 0 for t in _resueltos(tickets, desde, hasta))


def tickets_resueltos_sprint(tickets: list, desde: datetime, hasta: datetime) -> int:
    """Tickets que pasaron a Done/Closed dentro del sprint."""
    return len(_resueltos(tickets, desde, hasta))


def prs_cerrados_sprint(eventos: list, desde: datetime, hasta: datetime) -> int:
    """PRs cerrados (integrados o no) dentro del sprint, contados una vez por `pr_number`."""
    return len({e.payload.get("pr_number", id(e)) for e in _seleccion(eventos, "pull_request", desde, hasta)
                if e.payload.get("action") in ("closed", "merged")})


# ---------- Todas las métricas ----------

def calcular_metricas(eventos: list, desde: datetime, hasta: datetime, sprint: tuple | None = None,
                      cal: CalendarioLaboral = CalendarioLaboral()) -> dict:
    """{métrica: valor crudo} de todas las métricas con datos en [desde, hasta), listo para `analizar_y_guardar`.
    `sprint` = (desde, hasta) del sprint cuando se cierra uno; sin él no se calculan las tres métricas por sprint.
    `eventos` debe traer también el historial reciente (commits para `dias_sin_commits`, issue_created de los tickets
    resueltos). Las métricas sin base de cálculo se omiten."""
    tickets = construir_tickets(eventos)
    ventanas = sesiones_trabajo(eventos, desde, hasta)
    valores = {
        "tiempo_extralaboral_pct": pct_tiempo_extralaboral(eventos, desde, hasta),
        "rating_seguridad_sonarqube": rating_seguridad(eventos, desde, hasta),
        "fiabilidad_prs": fiabilidad_prs(eventos, desde, hasta),
        "tiempo_respuesta_pr_horas": tiempo_respuesta_pr_horas(eventos, desde, hasta),
        "commits_documentacion": pct_commits_documentacion(eventos, desde, hasta),
        "dias_sin_commits": dias_sin_commits(eventos, (_local(hasta) - timedelta(seconds=1)).date(), cal),
        "mttr_horas": mttr_horas(tickets, desde, hasta, cal),
        "tiempo_ciclo_dias": tiempo_ciclo_dias(tickets, desde, hasta, cal),
        "tiempo_bloqueado_pct": tiempo_bloqueado_pct(tickets, desde, hasta),
        "interrupciones_red_dia": interrupciones_red(eventos, desde, hasta, ventanas),
        **{m: promedio_campo(eventos, m, desde, hasta, ventanas) for m in CAMPOS_PROMEDIO},
        **(_metricas_sprint(eventos, tickets, *sprint) if sprint else {}),
    }
    return {m: v for m, v in valores.items() if v is not None}


def _metricas_sprint(eventos: list, tickets: list, desde: datetime, hasta: datetime) -> dict:
    return {
        "story_points_completados_sprint": story_points_completados_sprint(tickets, desde, hasta),
        "prs_cerrados_sprint": prs_cerrados_sprint(eventos, desde, hasta),
        "tickets_resueltos_sprint": tickets_resueltos_sprint(tickets, desde, hasta),
    }


def historicos_sprints(eventos: list, sprints_anteriores: list) -> dict:
    """{métrica: [valor de cada sprint anterior]} para puntuar las métricas "relativa". Un sprint sin ningún evento
    (anterior a que el usuario empezara) no entra al histórico."""
    tickets = construir_tickets(eventos)
    historicos = {}
    for desde, hasta in sprints_anteriores:
        if not any(_en_periodo(e.fecha, desde, hasta) for e in eventos):
            continue
        for metrica, valor in _metricas_sprint(eventos, tickets, desde, hasta).items():
            if valor is not None:
                historicos.setdefault(metrica, []).append(valor)
    return historicos
