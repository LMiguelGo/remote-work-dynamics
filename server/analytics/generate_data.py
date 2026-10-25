"""Genera datos de prueba para el contenedor de analítica: 8 semanas de eventos de dos usuarios.

Usuario 1 (ana) empeora poco a poco: más horas extra, menos PRs aprobados, peor entorno y red.
Usuario 2 (luis) se mantiene estable.
Uso: python generar_datos.py  ->  escribe seed.sql (usuarios, fuentes y eventos)."""
import json
import random
from datetime import date, datetime, timedelta
from pathlib import Path

INICIO = date(2026, 8, 24)  # lunes
SEMANAS = 8
USUARIOS = {1: ("ana", "Ana Torres", 1.0), 2: ("luis", "Luis Rojas", 0.0)}  # id: (usuario, nombre, deterioro)
FUENTES = ["web_app", "esp32", "github", "jira", "network", "sonarqube"]


def fuente(usuario: int, tipo: str) -> int:
    return (usuario - 1) * len(FUENTES) + FUENTES.index(tipo) + 1


def utc(dt: datetime) -> str:
    """Los payloads traen UTC (data_guide.md); events.time es hora de Colombia."""
    return (dt + timedelta(hours=5)).strftime("%Y-%m-%dT%H:%M:%SZ")


def acotar(x, lo, hi):
    return max(lo, min(hi, x))


def generar() -> list[tuple]:
    """[(hora local, source_id, event_type, payload)] ordenado por hora."""
    eventos = []
    dias = [INICIO + timedelta(days=7 * s + d) for s in range(SEMANAS) for d in range(5)]
    for usuario, (_, _, deterioro) in USUARIOS.items():
        pr = 0
        for i, dia in enumerate(dias):
            rnd = random.Random(f"{usuario}-{dia}")
            k = deterioro * i / (len(dias) - 1)
            t = lambda h, m=0: datetime.combine(dia, datetime.min.time()) + timedelta(hours=h, minutes=m)

            def add(tipo, hora, evento, payload):
                eventos.append((hora, fuente(usuario, tipo), evento, payload))

            # web_app: jornada y encuestas
            extra = max(0.0, rnd.gauss(0.2 + 3.3 * k, 0.4))
            fin = t(16) + timedelta(hours=extra)
            add("web_app", fin, "working_session", {"start_time": utc(t(8)), "end_time": utc(fin)})
            add("web_app", t(18, 30), "daily_survey", {
                "satisfaction_level": int(acotar(round(4.7 - 2.0 * k + rnd.gauss(0, 0.3)), 1, 5)),
                "tools_perception": int(acotar(round(4.3 - 1.0 * k + rnd.gauss(0, 0.3)), 1, 5)),
                "fatigue_level": int(acotar(round(1.8 + 2.4 * k + rnd.gauss(0, 0.3)), 1, 5)),
                "concentration_perception": int(acotar(round(4.2 - 1.2 * k + rnd.gauss(0, 0.3)), 1, 5))})
            if dia.weekday() == 4:
                add("web_app", t(17), "weekly_survey", {
                    "communication_quality": int(acotar(round(4.3 - 1.0 * k + rnd.gauss(0, 0.3)), 1, 5)),
                    "team_coordination": int(acotar(round(4.4 - 1.6 * k + rnd.gauss(0, 0.3)), 1, 5)),
                    "documentation_perception": int(acotar(round(4.0 - 1.5 * k + rnd.gauss(0, 0.3)), 1, 5))})

            # esp32: ambiente dentro de la jornada
            for h in (10, 14):
                add("esp32", t(h), "ambiental_reading", {
                    "temperature": round(22 + 4.5 * k + rnd.gauss(0, 0.6), 1),
                    "humidity": round(50 + rnd.gauss(0, 4), 1),
                    "noise_level": round(42 + 22 * k + rnd.gauss(0, 3), 1)})

            # github: commits, PR y revisión
            for _ in range(0 if rnd.random() < 0.55 * k else rnd.randint(1, 4)):
                prefijo = rnd.choices(["docs", "feat", "fix", "chore"], [0.25 - 0.2 * k, 0.4, 0.25, 0.1])[0]
                add("github", t(11, rnd.randint(0, 59)), "commit", {
                    "commit_hash": "%07x" % rnd.getrandbits(28), "conventional_commit_prefix": prefijo,
                    "lines_added": rnd.randint(5, 120), "lines_deleted": rnd.randint(0, 40)})
            if rnd.random() < 0.75:
                pr += 1
                aprobado = rnd.random() < 0.93 - 0.45 * k
                add("github", t(9), "pull_request", {"pr_number": pr, "action": "opened", "lines_added": rnd.randint(20, 200),
                                                     "lines_deleted": rnd.randint(0, 50), "files_changed": rnd.randint(1, 8)})
                add("github", t(12), "pull_request_review", {
                    "pr_number": pr, "is_first_attempt_approved": aprobado,
                    "review_responsiveness_minutes": round(max(5.0, rnd.gauss(60 + 600 * k, 20)), 1),
                    "pr_comment_density": rnd.randint(0, 6)})
                add("github", t(15), "pull_request", {"pr_number": pr, "action": "merged" if aprobado else "closed"})

            # network: calidad y caídas dentro de la jornada
            for h, m in ((10, 30), (14, 30)):
                add("network", t(h, m), "qos_measurement", {
                    "latency_ms": round(max(5.0, 30 + 150 * k + rnd.gauss(0, 8)), 1),
                    "download_speed_mbps": round(max(5.0, 95 - 60 * k + rnd.gauss(0, 6)), 1),
                    "upload_speed_mbps": round(max(2.0, 25 - 15 * k + rnd.gauss(0, 2)), 1),
                    "packet_loss_percentage": round(max(0.0, 0.2 + 3.0 * k + rnd.gauss(0, 0.2)), 2)})
            for j in range(int(max(0, round(0.5 + 6 * k + rnd.gauss(0, 0.7))))):
                add("network", t(11, 10 * j), "interruption", {"interruption_duration_seconds": rnd.randint(10, 120), "interruption_count": 1})

            # sonarqube: un análisis en el 70 % de los días
            if rnd.random() < 0.7:
                add("sonarqube", t(15, 30), "pull_request_quality", {
                    "code_coverage_percentage": round(acotar(85 - 30 * k + rnd.gauss(0, 2), 20, 100), 1),
                    "duplicated_lines_percentage": round(max(0.0, 2 + 4 * k + rnd.gauss(0, 0.3)), 1),
                    "reliability_rating": "A",
                    "security_rating": "A" if k < 0.4 else "B" if k < 0.75 else "C",
                    "technical_debt_minutes": int(max(0, (6 + 36 * k) * 60 + rnd.gauss(0, 40)))})

        # jira: cada semana 3 historias (lunes), 1 bug (miércoles); se cierran menos conforme empeora
        n = 0
        for s in range(SEMANAS):
            lunes = INICIO + timedelta(days=7 * s)
            k = deterioro * (7 * s + 2) / (len(dias) - 1 + 4)
            hechas = max(1, 3 - round(2 * k))
            L = lambda d, h: datetime.combine(lunes + timedelta(days=d), datetime.min.time()) + timedelta(hours=h)
            for j in range(3):
                n += 1
                clave = f"U{usuario}-{n}"
                puntos = [3, 5, 8][j]
                eventos.append((L(0, 9), fuente(usuario, "jira"), "issue_created", {"issue_key": clave, "issue_type": "Story", "story_points": puntos}))
                eventos.append((L(1, 10), fuente(usuario, "jira"), "issue_updated", {"issue_key": clave, "status_from": "To Do", "status_to": "In Progress"}))
                if j < hechas:
                    resolucion = 20.0 + 10 * k
                    eventos.append((L(3, 15), fuente(usuario, "jira"), "issue_updated", {
                        "issue_key": clave, "status_from": "In Progress", "status_to": "Done",
                        "resolution_time_hours": resolucion, "blocked_time_hours": round(resolucion * (0.08 + 0.35 * k), 1)}))
            n += 1
            clave = f"U{usuario}-{n}"
            eventos.append((L(2, 10), fuente(usuario, "jira"), "issue_created", {"issue_key": clave, "issue_type": "Bug", "story_points": None}))
            eventos.append((L(2, 11), fuente(usuario, "jira"), "issue_updated", {"issue_key": clave, "status_from": "To Do", "status_to": "In Progress"}))
            eventos.append((L(4, 10), fuente(usuario, "jira"), "issue_updated", {
                "issue_key": clave, "status_from": "In Progress", "status_to": "Done",
                "resolution_time_hours": 10.0 + 25 * k, "blocked_time_hours": round(1 + 8 * k, 1)}))
    return sorted(eventos, key=lambda e: (e[0], e[1]))


def sql_texto(valor) -> str:
    return "'" + str(valor).replace("'", "''") + "'"


def escribir_seed(ruta: Path):
    lineas = [
        "-- Datos de prueba generados por generar_datos.py. No editar a mano.",
        "INSERT INTO roles (id, name, description) VALUES (1, 'developer', 'Desarrollador');",
        "INSERT INTO team_roles (id, name, description, weights) VALUES (1, 'backend', 'Desarrollo backend', '{}');",
        "INSERT INTO teams (id, name, description, team_type) VALUES (1, 'Equipo A', 'Equipo de prueba', 'empleados');",
    ]
    for uid, (usuario, nombre, _) in USUARIOS.items():
        lineas.append(f"INSERT INTO users (id, username, password_hash, full_name, created_at, role_id, team_id) VALUES "
                      f"({uid}, {sql_texto(usuario)}, 'x', {sql_texto(nombre)}, now(), 1, 1);")
        lineas.append(f"INSERT INTO employee_profiles (user_id, team_role_id, work_schedule, capture_active) VALUES "
                      f"({uid}, 1, '{{\"dias\": [0,1,2,3,4], \"inicio\": \"08:00\", \"fin\": \"16:00\"}}', true);")
        for tipo in FUENTES:
            lineas.append(f"INSERT INTO data_sources (id, user_id, source_type, identifier, is_active, created_at) VALUES "
                          f"({fuente(uid, tipo)}, {uid}, '{tipo}', {sql_texto(usuario + '-' + tipo)}, true, now());")
    lineas.append("SELECT setval('roles_id_seq', 1); SELECT setval('team_roles_id_seq', 1); SELECT setval('teams_id_seq', 1); SELECT setval('users_id_seq', 2); SELECT setval('data_sources_id_seq', 12);")
    for hora, fid, tipo, payload in generar():
        lineas.append(f"INSERT INTO events (time, source_id, event_type, payload) VALUES "
                      f"('{hora:%Y-%m-%d %H:%M:%S}-05', {fid}, '{tipo}', {sql_texto(json.dumps(payload))});")
    ruta.write_text("\n".join(lineas) + "\n", encoding="utf-8")


if __name__ == "__main__":
    ruta = Path(__file__).with_name("seed.sql")
    escribir_seed(ruta)
    print(f"{len(generar())} eventos escritos en {ruta}")
