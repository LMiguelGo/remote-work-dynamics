// Servicio PURO que arma el detalle de analitica de una persona, listo para que el frontend lo dibuje sin calcular nada:
// por dimension, el puntaje diario y semanal con su historial, y por metrica su valor, nivel, puntos, historial y las
// franjas del catalogo. El backend SOLO LEE y da forma: los puntajes y las criticidades vienen de analitica.
// Nunca lanza por falta de datos: una dimension o metrica sin filas queda con null o con historial vacio.

const DIMENSIONES_SPACE = ['S', 'P', 'A', 'C', 'E'];

function aNumero(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// Suma `n` dias a una fecha 'YYYY-MM-DD' y devuelve otra 'YYYY-MM-DD'.
function sumarDias(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function redondear1(n) {
  return Math.round(n * 10) / 10;
}

// Dia de referencia: el ultimo dia con resultado de al menos dos dimensiones. Un dia suelto con una sola dimension (por
// ejemplo un fin de semana en que solo se guarda "dias sin commits") no cuenta como "el ultimo dia".
function diaDeReferencia(filasDia) {
  const dimsPorDia = new Map();
  for (const f of filasDia) {
    if (!dimsPorDia.has(f.start_date)) dimsPorDia.set(f.start_date, new Set());
    dimsPorDia.get(f.start_date).add(f.dimension);
  }
  const dias = [...dimsPorDia.keys()].sort().reverse();
  if (dias.length === 0) return null;
  return dias.find((d) => dimsPorDia.get(d).size >= 2) || dias[0];
}

const puntoDimension = (r) => ({
  start_date: r.start_date,
  end_date: r.end_date,
  normalized_score: aNumero(r.normalized_score),
  criticality_status: r.criticality_status ?? null,
});

const puntoMetrica = (r) => ({
  start_date: r.start_date,
  end_date: r.end_date,
  raw_value: aNumero(r.raw_value),
  normalized_value: aNumero(r.normalized_value),
  criticality: r.criticality ?? null,
});

// Bloque { ultimo, anterior, variacion, historial } de una serie ordenada de puntajes de dimension. `medidas(fecha)` dice
// cuantas metricas aportaron ese periodo y `total` cuantas tiene la dimension en esa frecuencia.
function bloque(historial, medidas, total) {
  if (historial.length === 0) return null;
  const ultimo = historial[historial.length - 1];
  const anterior = historial.length > 1 ? historial[historial.length - 2] : null;
  const variacion =
    anterior && ultimo.normalized_score != null && anterior.normalized_score != null
      ? redondear1(ultimo.normalized_score - anterior.normalized_score)
      : null;
  return {
    ultimo: { ...ultimo, metricas_medidas: medidas(ultimo.start_date), metricas_total: total },
    anterior,
    variacion,
    historial,
  };
}

// construirAnalitica({ usuario, catalogo, dimensiones, metricas, correlaciones, dias, semanas }) -> respuesta
//   catalogo: respuesta de analitica /metricas/catalogo (obligatorio).
//   dimensiones, metricas: filas de analyses.repo.historialDePersona.
//   correlaciones: { calculado_en, metricas, dimensiones } o null.
function construirAnalitica({ usuario, catalogo, dimensiones, metricas, correlaciones, dias = 30, semanas = 8 }) {
  const filasDimension = dimensiones || [];
  const filasMetrica = metricas || [];

  const filasDia = filasDimension.filter((r) => r.frequency === 'day' && r.start_date === r.end_date);
  const referencia = diaDeReferencia(filasDia);
  const desdeDia = referencia ? sumarDias(referencia, -(dias - 1)) : null;
  const desdeSemana = referencia ? sumarDias(referencia, -(7 * semanas - 1)) : null;

  // Una fila entra a una ventana si empieza dentro de ella y no despues del dia de referencia.
  const enDias = (r) => referencia && r.start_date >= desdeDia && r.start_date <= referencia;
  const enSemanas = (r) => referencia && r.start_date >= desdeSemana && r.start_date <= referencia;

  const filasPorMetrica = new Map();
  for (const r of filasMetrica) {
    if (!filasPorMetrica.has(r.metric_name)) filasPorMetrica.set(r.metric_name, []);
    filasPorMetrica.get(r.metric_name).push(r);
  }

  const salida = DIMENSIONES_SPACE.map((dim) => {
    const delCatalogo = (catalogo.metricas || []).filter((m) => m.dimension === dim);

    const metricasSalida = delCatalogo.map((m) => {
      const diaria = m.frecuencia === 'diaria';
      const historial = (filasPorMetrica.get(m.metric_name) || [])
        .filter((r) => (diaria ? r.start_date === r.end_date && enDias(r) : r.start_date !== r.end_date && enSemanas(r)))
        .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
        .map(puntoMetrica);
      const entrada = {
        metric_name: m.metric_name,
        nombre: m.nombre,
        unidad: m.unidad,
        formato: m.formato,
        decimales: m.decimales,
        mejor: m.mejor,
        frecuencia: m.frecuencia,
        escala: m.escala,
        franjas: m.franjas,
        ultimo: historial.length ? historial[historial.length - 1] : null,
        historial,
      };
      if (m.umbrales_relativos) entrada.umbrales_relativos = m.umbrales_relativos;
      return entrada;
    });

    const medidasEn = (frecuencia) => (fecha) =>
      metricasSalida.filter((m) => m.frecuencia === frecuencia && m.historial.some((p) => p.start_date === fecha)).length;
    const totalEn = (frecuencia) => metricasSalida.filter((m) => m.frecuencia === frecuencia).length;

    const historialDia = filasDia
      .filter((r) => r.dimension === dim && enDias(r))
      .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
      .map(puntoDimension);
    const historialSemana = filasDimension
      .filter((r) => r.dimension === dim && r.frequency === 'week' && enSemanas(r))
      .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
      .map(puntoDimension);
    // Resultado semanal de las metricas diarias: es el promedio de la semana de los puntos diarios (frecuencia 'day' con
    // rango lunes-domingo). No se mezcla con el historial diario ni con el semanal.
    const promediosSemanales = filasDimension
      .filter((r) => r.dimension === dim && r.frequency === 'day' && r.start_date !== r.end_date && enSemanas(r))
      .sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
      .map(puntoDimension);

    const diaria = bloque(historialDia, medidasEn('diaria'), totalEn('diaria'));
    if (diaria) diaria.promedios_semanales = promediosSemanales;

    return {
      dimension: dim,
      nombre: (catalogo.dimensiones || {})[dim] || dim,
      diaria,
      semanal: bloque(historialSemana, medidasEn('semanal'), totalEn('semanal')),
      metricas: metricasSalida,
    };
  });

  return {
    usuario: usuario
      ? { id: usuario.id, username: usuario.username, full_name: usuario.full_name }
      : null,
    referencia,
    ventana: { dias, semanas },
    catalogo_version: catalogo.version ?? null,
    dimensiones: salida,
    correlaciones: correlaciones || null,
  };
}

module.exports = { construirAnalitica, diaDeReferencia, sumarDias };
