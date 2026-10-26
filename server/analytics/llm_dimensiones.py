"""Interpretación con un LLM de las correlaciones entre dimensiones. El LLM no calcula nada: recibe los coeficientes y puntajes que
ya salieron de `conclusion_dimensiones` (sin nombres ni ids de personas) y los redacta como una lectura breve para el líder.
El proveedor es Groq (API compatible con OpenAI, SDK `groq`).

Está apagado mientras no haya clave: sin `GROQ_API_KEY` `interpretar` devuelve None y el frontend no muestra la sección. Lo mismo
pasa si el proveedor falla, la respuesta se corta o el texto no pasa la validación; nunca se sustituye por otro texto.
Variables: `LLM_MODEL` (por defecto `openai/gpt-oss-120b`; los Llama de Groq piden plan Enterprise) y `LLM_TIMEOUT_S`.

Se llama al recalcular la caché de correlaciones (cada cierre), no en cada petición, y se recuerda el texto de cada resultado
idéntico para no pedir dos veces lo mismo."""
import hashlib
import json
import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

from catalogo import DIMENSIONES

log = logging.getLogger(__name__)

MODELO = os.getenv("LLM_MODEL", "openai/gpt-oss-120b")
TIMEOUT_S = float(os.getenv("LLM_TIMEOUT_S", "60"))
HILOS = 4  # personas redactadas a la vez
VERSION_PROMPT = "2"  # cambia con el texto de SISTEMA o el proveedor: invalida los textos recordados

SISTEMA = """Eres un analista que ayuda a un líder de equipo de desarrollo de software a leer cómo se mueven juntas las dimensiones \
SPACE de una persona (bienestar, rendimiento, actividad, comunicación y eficiencia), a partir de correlaciones semanales ya calculadas.

Recibirás un JSON con: semanas_con_datos, dimensiones (letra y nombre), relaciones (pares con su coeficiente r, su fuerza y si se \
mueven juntas o en sentido contrario), puntajes de la última semana (de 0 a 10, con su nivel: óptimo desde 8, precaución desde 6, \
crítico por debajo) y las dimensiones sin semanas suficientes.

Escribe un solo párrafo en español, de 2 a 4 oraciones y máximo 90 palabras: qué dimensiones se mueven juntas o en sentido \
contrario, cómo está hoy cada una de las involucradas y qué conviene revisar primero. Si no hay relaciones, di que no se ve una \
relación clara.

Reglas:
- Usa solo los números y dimensiones del JSON, escritos tal cual vienen (sin redondear distinto ni inventar otros).
- Una correlación es una pista, no una causa: no afirmes que una dimensión provoca, genera o explica a otra. Usa expresiones como \
"se mueven juntas", "suele coincidir con" o "conviene revisar".
- Habla de las dimensiones y de las condiciones de trabajo; no juzgues a la persona ni uses su nombre.
- Si son pocas semanas, recuérdalo.
- Sin viñetas, sin markdown, sin saludos. Responde solo con el párrafo."""

_memo: dict[str, str] = {}  # clave del resultado -> texto ya validado (los fallos no se guardan: se reintentan en el siguiente cierre)

_NUMERO = re.compile(r"\d+(?:[.,]\d+)?")
_CAUSAL = re.compile(r"\b(causa|causan|provoca|provocan|genera|generan|origina|originan|debido a|por culpa)\b", re.IGNORECASE)
_NUMEROS_FIJOS = {6.0, 8.0, 10.0}  # cortes de nivel y «/10», que el propio prompt menciona
TOLERANCIA = 0.0051  # un coeficiente de tres decimales escrito con dos (0.975 -> 0.97 o 0.98) sigue siendo el mismo dato
MAX_PALABRAS = 140  # el prompt pide 90; con holgura para no descartar textos buenos


def hay_clave() -> bool:
    return bool(os.getenv("GROQ_API_KEY"))


@lru_cache(maxsize=1)
def _cliente():
    from groq import Groq  # perezoso: sin clave nunca se importa
    return Groq(api_key=os.getenv("GROQ_API_KEY"), timeout=TIMEOUT_S, max_retries=2)  # el SDK reintenta 408/429/5xx


def _payload(c: dict) -> dict:
    """Lo único que sale del contenedor: números y letras de dimensión, sin identificar a la persona."""
    return {
        "semanas_con_datos": c["semanas"],
        "dimensiones": DIMENSIONES,
        "relaciones": [{"a": r["dimension_a"], "b": r["dimension_b"], "r": r["coeficiente"], "fuerza": r["fuerza"],
                        "sentido": r["sentido"]} for r in c["relaciones"]],
        "puntajes_ultima_semana": c.get("puntajes", {}),
        "dimensiones_sin_semanas_suficientes": c["sin_datos"],
    }


def _permitidos(payload: dict) -> set[float]:
    numeros = set(_NUMEROS_FIJOS) | {float(payload["semanas_con_datos"])}
    for r in payload["relaciones"]:
        numeros |= {abs(r["r"]), r["r"]}
    numeros |= {p["valor"] for p in payload["puntajes_ultima_semana"].values()}
    return numeros


def _valido(texto: str, payload: dict) -> bool:
    """Descarta lo que no se puede comprobar: números que no vienen del dato, causalidad afirmada, formato raro o demasiado largo."""
    if not texto or len(texto.split()) > MAX_PALABRAS or any(m in texto for m in ("*", "#", "`", "|")) or _CAUSAL.search(texto):
        return False
    permitidos = _permitidos(payload)
    return all(any(abs(float(n.replace(",", ".")) - p) <= TOLERANCIA for p in permitidos) for n in _NUMERO.findall(texto))


def _llamar(payload: dict) -> str | None:
    try:
        r = _cliente().chat.completions.create(
            model=MODELO,
            messages=[{"role": "system", "content": SISTEMA},
                      {"role": "user", "content": json.dumps(payload, ensure_ascii=False, sort_keys=True)}],
            temperature=0.2,  # redactar cifras dadas: poca variación
            max_completion_tokens=2000,  # el párrafo mide unos cientos de tokens; un modelo de razonamiento gasta además los que piensa
            **({"reasoning_effort": "low"} if MODELO.startswith("openai/gpt-oss") else {}),  # redactar no necesita razonar a fondo
        )
    except Exception as e:  # cualquier fallo del proveedor deja la sección vacía; el SDK ya reintentó lo reintentable
        log.warning("El LLM no respondió (%s): %s", type(e).__name__, e)
        return None
    eleccion = r.choices[0]
    if eleccion.finish_reason != "stop":  # "length": el texto se cortó
        log.warning("El LLM no terminó el texto (finish_reason=%s, id %s)", eleccion.finish_reason, getattr(r, "id", "?"))
        return None
    return (eleccion.message.content or "").strip() or None


def interpretar(c: dict) -> str | None:
    """Texto del LLM para una conclusión de `conclusion_dimensiones`, o None si no hay clave, no hay nada que interpretar, falló
    o no pasó la validación."""
    if not hay_clave() or c["estado"] == "datos_insuficientes":
        return None
    payload = _payload(c)
    clave = hashlib.sha256(json.dumps([VERSION_PROMPT, MODELO, payload], sort_keys=True).encode()).hexdigest()
    if clave in _memo:
        return _memo[clave]
    texto = _llamar(payload)
    if texto is None:
        return None
    if not _valido(texto, payload):
        log.warning("El texto del LLM no pasó la validación y se descarta: %r", texto)
        return None
    _memo[clave] = texto
    return texto


def redactar(conclusiones: list[dict]) -> list[dict]:
    """Copia de las conclusiones con `interpretacion` rellena donde el LLM respondió. Nunca lanza: a lo sumo deja `None`."""
    if not hay_clave():
        return conclusiones

    def una(c: dict) -> dict:
        try:
            return {**c, "interpretacion": interpretar(c)}
        except Exception:
            log.exception("No se pudo interpretar la conclusión del usuario %s", c.get("usuario_id"))
            return c

    with ThreadPoolExecutor(max_workers=HILOS) as pool:
        return list(pool.map(una, conclusiones))
