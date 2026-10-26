"""Lectura de conjunto de las correlaciones entre dimensiones: un texto por persona que resume qué dimensiones se mueven
juntas, sin dibujar la matriz. Parte de los coeficientes que ya calcula `correlacionar_dimensiones` (Pearson entre los puntajes
semanales de cada par de S, P, A, C y E) y solo habla de las relaciones significativas y al menos moderadas. Todos los
puntajes se leen igual (más es mejor), así que un coeficiente positivo es «suben y bajan juntas» y uno negativo, «en sentido
contrario». Es una pista y no una causa: el texto lo dice siempre.
`mensaje` es el texto de plantilla (siempre se calcula). `interpretacion` queda en `None` y la rellena `llm_dimensiones` con la
lectura de un LLM cuando hay uno configurado; el frontend muestra solo esa."""
from collections import defaultdict

from catalogo import DIMENSIONES
from correlaciones import MIN_MUESTRAS, _pivotar, _por_usuario
from etl_procesador import PUNTAJE_MIN_OPTIMO, PUNTAJE_MIN_PRECAUCION

AVISO = "Una correlación no implica causalidad; con pocas semanas es solo una pista."
MAX_RELACIONES = 3  # las más fuertes; el resto no aporta a la lectura


def _nombre(dim: str) -> str:
    return f"{DIMENSIONES[dim]} ({dim})"


def _nivel(puntaje: float) -> str:
    if puntaje >= PUNTAJE_MIN_OPTIMO:
        return "óptimo"
    return "precaución" if puntaje >= PUNTAJE_MIN_PRECAUCION else "crítico"


def _sin_datos(filas: list[dict]) -> list[str]:
    """Dimensiones que no alcanzan el mínimo de semanas con ninguna otra dimensión (por ejemplo, C no tiene métricas diarias)."""
    con_datos = {d for f in filas if f["n_muestras"] >= MIN_MUESTRAS for d in (f["dimension_a"], f["dimension_b"])}
    return [d for d in DIMENSIONES if d not in con_datos]


def _frase_relacion(f: dict) -> str:
    a, b, r = _nombre(f["dimension_a"]), _nombre(f["dimension_b"]), f["coeficiente"]
    sentido = "se mueven juntas" if r > 0 else "se mueven en sentido contrario"
    return f"{a} y {b} {sentido} (r = {r:.2f}, {f['fuerza']})"


def _ultimos_puntajes(semanas: list) -> dict:
    """{dimensión: puntaje de la semana más reciente que la tiene}."""
    ultimos = {}
    for _, puntajes in semanas:  # ya en orden cronológico
        ultimos.update(puntajes)
    return ultimos


def _conclusion(usuario: int, filas: list[dict], semanas: list) -> dict:
    n = max((f["n_muestras"] for f in filas), default=0)
    relevantes = sorted((f for f in filas if f["significativa"] and f["fuerza"] in ("moderada", "fuerte")),
                        key=lambda f: -abs(f["coeficiente"]))[:MAX_RELACIONES]
    sin_datos = _sin_datos(filas)

    if all(f["coeficiente"] is None for f in filas):
        estado = "datos_insuficientes"
        texto = f"Aún no hay semanas suficientes para relacionar las dimensiones (se necesitan al menos {MIN_MUESTRAS} con resultados)."
    elif not relevantes:
        estado = "sin_relacion"
        texto = (f"En las {n} semanas con datos no se ve una relación clara entre las dimensiones: "
                 "sus puntajes no se mueven de forma consistente.")
    else:
        estado = "relacion"
        primera = relevantes[0]
        texto = f"En las {n} semanas con datos, {_frase_relacion(primera)}."
        texto += (" Cuando una baja, la otra tiende a bajar." if primera["coeficiente"] > 0
                  else " Cuando una sube, la otra tiende a bajar.")
        if len(relevantes) > 1:
            texto += " También: " + "; ".join(_frase_relacion(f) for f in relevantes[1:]) + "."
        ultimos = _ultimos_puntajes(semanas)
        da, db = primera["dimension_a"], primera["dimension_b"]
        if primera["coeficiente"] > 0 and da in ultimos and db in ultimos and min(ultimos[da], ultimos[db]) < PUNTAJE_MIN_OPTIMO:
            texto += (f" Esta semana {_nombre(da)} está en {ultimos[da]:.1f}/10 ({_nivel(ultimos[da])}) y "
                      f"{_nombre(db)} en {ultimos[db]:.1f}/10 ({_nivel(ultimos[db])}): conviene mirarlas juntas.")

    if sin_datos and estado != "datos_insuficientes":
        nombres = " y ".join(_nombre(d) for d in sin_datos)
        texto += (f" No hay semanas suficientes de {nombres} para relacionarla con las demás." if len(sin_datos) == 1
                  else f" No hay semanas suficientes de {nombres} para relacionarlas con las demás.")

    ultimos = _ultimos_puntajes(semanas)
    return {
        "usuario_id": usuario,
        "estado": estado,
        "semanas": n,
        "mensaje": texto,
        "interpretacion": None,  # la rellena `llm_dimensiones` cuando hay un LLM configurado
        "aviso": AVISO,
        "puntajes": {d: {"valor": round(v, 1), "nivel": _nivel(v)} for d, v in ultimos.items()},
        "relaciones": [{"dimension_a": f["dimension_a"], "dimension_b": f["dimension_b"], "coeficiente": f["coeficiente"],
                        "fuerza": f["fuerza"], "sentido": "juntas" if f["coeficiente"] > 0 else "contrarias"}
                       for f in relevantes],
        "sin_datos": sin_datos,
    }


def concluir_dimensiones(correlaciones: list[dict], muestras: list[dict]) -> list[dict]:
    """Una conclusión por usuario. `correlaciones` es la salida de `correlacionar_dimensiones` y `muestras` las mismas filas
    (usuario, periodo, dimensión, puntaje) con que se calculó, de donde sale el puntaje más reciente de cada dimensión."""
    por_usuario = defaultdict(list)
    for f in correlaciones:
        por_usuario[f["usuario_id"]].append(f)
    semanas = _por_usuario(_pivotar(muestras, "dimension", "puntaje_normalizado", "semana"))
    return [_conclusion(u, filas, semanas.get(u, [])) for u, filas in sorted(por_usuario.items())]
