"""Recálculo configurable de las métricas, sus gráficas y las relaciones.

Por defecto la analítica calcula una vez al día (00:00, el día que terminó). El administrador puede pedir que además se
recalcule cada N minutos, entre 1 minuto y 24 horas: en cada vuelta se borra y se vuelve a calcular el resultado del día
en curso con los eventos que hayan llegado, y se renueva la caché de correlaciones. Así un dato nuevo se ve en el panel
sin esperar a la medianoche. Con 24 horas (1440 min) no hay recálculo intermedio: queda solo el cierre de las 00:00.

La configuración vive en memoria del proceso: al reiniciar el contenedor vuelve a `ANALITICA_RECALCULO_MIN`
(1440 si no está definida). El esquema de la base no tiene tabla de configuración y no se agrega una.
"""
import os
import traceback
from datetime import datetime
from threading import Lock

from derivadas import TZ_LOCAL

INTERVALO_MIN = 1
INTERVALO_MAX = 1440  # 24 horas
JOB_ID = "job_recalculo_periodico"

_bloqueo = Lock()
_programador = None


def _intervalo_inicial() -> int:
    try:
        valor = int(os.environ.get("ANALITICA_RECALCULO_MIN", INTERVALO_MAX))
    except ValueError:
        return INTERVALO_MAX
    return min(max(valor, INTERVALO_MIN), INTERVALO_MAX)


_estado = {"intervalo_minutos": _intervalo_inicial(), "ultimo_recalculo": None, "ultimo_error": None}


def recalcular_hoy() -> dict:
    """Una vuelta del recálculo: el día en curso (hora de Colombia) y las correlaciones."""
    import cache_correlaciones  # import tardío: cache_correlaciones importa db, que importa etl_procesador
    from etl import recalcular_dia

    hoy = datetime.now(TZ_LOCAL).date()
    with _bloqueo:  # una sola vuelta a la vez
        try:
            usuarios = recalcular_dia(hoy)
            cache_correlaciones.recalcular()
            _estado["ultimo_recalculo"] = datetime.now(TZ_LOCAL).isoformat(timespec="seconds")
            _estado["ultimo_error"] = None
            print(f"[{datetime.now()}] Recálculo del día {hoy}: {len(usuarios)} usuarios analizados.", flush=True)
            return {"dia": hoy.isoformat(), "usuarios": len(usuarios)}
        except Exception:
            _estado["ultimo_error"] = datetime.now(TZ_LOCAL).isoformat(timespec="seconds")
            print(f"[{datetime.now()}] Falló el recálculo del día {hoy}:\n{traceback.format_exc()}", flush=True)
            raise


def _aplicar() -> None:
    """Deja el trabajo periódico del programador de acuerdo con el intervalo vigente."""
    if _programador is None:
        return
    if _programador.get_job(JOB_ID):
        _programador.remove_job(JOB_ID)
    minutos = _estado["intervalo_minutos"]
    if minutos < INTERVALO_MAX:
        _programador.add_job(_vuelta_programada, trigger="interval", minutes=minutos, id=JOB_ID,
                             next_run_time=datetime.now(TZ_LOCAL))


def _vuelta_programada() -> None:
    try:
        recalcular_hoy()
    except Exception:
        pass  # ya quedó en el log y en `ultimo_error`; la siguiente vuelta lo vuelve a intentar


def registrar(programador) -> None:
    """Lo llama `iniciar_programador_etl` al arrancar."""
    global _programador
    _programador = programador
    _aplicar()


def configurar(minutos) -> dict:
    """Cambia el intervalo (minutos enteros entre 1 y 1440). Lanza ValueError si no es válido."""
    if isinstance(minutos, bool) or not isinstance(minutos, int) or not INTERVALO_MIN <= minutos <= INTERVALO_MAX:
        raise ValueError(f"intervalo_minutos debe ser un entero entre {INTERVALO_MIN} y {INTERVALO_MAX}")
    _estado["intervalo_minutos"] = minutos
    _aplicar()
    return estado()


def estado() -> dict:
    trabajo = _programador.get_job(JOB_ID) if _programador else None
    proximo = trabajo.next_run_time.isoformat(timespec="seconds") if trabajo and trabajo.next_run_time else None
    minutos = _estado["intervalo_minutos"]
    return {
        "intervalo_minutos": minutos,
        "minimo": INTERVALO_MIN,
        "maximo": INTERVALO_MAX,
        "modo": "diario" if minutos >= INTERVALO_MAX else "periodico",
        "ultimo_recalculo": _estado["ultimo_recalculo"],
        "ultimo_error": _estado["ultimo_error"],
        "proximo_recalculo": proximo,
    }
