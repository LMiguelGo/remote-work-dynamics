// Servicio PURO que arma la forma JSON del equipo de un lider.
// El backend SOLO LEE analiticas; no calcula puntajes SPACE (eso corre en el
// contenedor de analitica). Aqui solo se agrupa y da forma a filas ya leidas.

// Orden canonico de las 5 dimensiones SPACE.
const DIMENSIONES_SPACE = ['S', 'P', 'A', 'C', 'E'];

// Convierte un valor numerico de Postgres (que node-pg puede entregar como
// string en NUMERIC) a Number, respetando null/undefined.
function aNumero(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// Agrupa las filas planas de analyses.repo por user_id -> dimension.
// Cada entrada acumula los datos de la dimension y la lista de metricas.
function agruparPorUsuario(analiticas) {
  const porUsuario = new Map();

  for (const fila of analiticas || []) {
    if (!porUsuario.has(fila.user_id)) porUsuario.set(fila.user_id, new Map());
    const dims = porUsuario.get(fila.user_id);

    if (!dims.has(fila.dimension)) {
      dims.set(fila.dimension, {
        dimension: fila.dimension,
        frequency: fila.frequency ?? null,
        periodo: {
          start_date: fila.dim_start_date ?? null,
          end_date: fila.dim_end_date ?? null,
        },
        normalized_score: aNumero(fila.normalized_score),
        criticality_status: fila.criticality_status ?? null,
        metricas: [],
      });
    }

    // Una fila sin metric_name es una dimension sin metricas (LEFT JOIN).
    if (fila.metric_name != null) {
      dims.get(fila.dimension).metricas.push({
        metric_name: fila.metric_name,
        raw_value: aNumero(fila.raw_value),
        normalized_value: aNumero(fila.normalized_value),
        criticality: fila.criticality ?? null,
        periodo: {
          start_date: fila.metric_start_date ?? null,
          end_date: fila.metric_end_date ?? null,
        },
      });
    }
  }

  return porUsuario;
}

// Devuelve siempre las 5 dimensiones SPACE para un usuario. Las que no tienen
// datos quedan presentes con valores en null y sin metricas.
function dimensionesDeUsuario(dimsMap) {
  return DIMENSIONES_SPACE.map((dim) => {
    const encontrada = dimsMap && dimsMap.get(dim);
    if (encontrada) return encontrada;
    return {
      dimension: dim,
      frequency: null,
      periodo: { start_date: null, end_date: null },
      normalized_score: null,
      criticality_status: null,
      metricas: [],
    };
  });
}

// Promedio por dimension del normalized_score de los integrantes que tienen
// dato. Devuelve null si ningun integrante aporto analitica.
function agregadoDeEquipo(integrantes) {
  const acumulado = new Map();

  for (const it of integrantes) {
    for (const d of it.dimensiones) {
      if (d.normalized_score == null) continue;
      if (!acumulado.has(d.dimension)) acumulado.set(d.dimension, []);
      acumulado.get(d.dimension).push(d.normalized_score);
    }
  }

  if (acumulado.size === 0) return null;

  return DIMENSIONES_SPACE.filter((dim) => acumulado.has(dim)).map((dim) => {
    const valores = acumulado.get(dim);
    const suma = valores.reduce((a, b) => a + b, 0);
    return {
      dimension: dim,
      normalized_score: suma / valores.length,
      integrantes_con_dato: valores.length,
    };
  });
}

// construirEquipo(lider, integrantes, analiticas) -> respuesta
// PURA. Nunca lanza por falta de datos.
function construirEquipo(lider, integrantes, analiticas) {
  const porUsuario = agruparPorUsuario(analiticas);

  const integrantesSalida = (integrantes || []).map((u) => ({
    usuario: { id: u.id, username: u.username, full_name: u.full_name },
    dimensiones: dimensionesDeUsuario(porUsuario.get(u.id)),
  }));

  return {
    lider: lider
      ? { id: lider.id, username: lider.username, full_name: lider.full_name }
      : null,
    integrantes: integrantesSalida,
    equipo: { agregado: agregadoDeEquipo(integrantesSalida) },
  };
}

module.exports = { construirEquipo, DIMENSIONES_SPACE };
