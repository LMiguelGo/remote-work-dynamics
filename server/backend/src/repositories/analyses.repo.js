// Acceso de LECTURA a las analiticas ya calculadas. SQL siempre parametrizado.
// El backend no calcula puntajes SPACE: eso corre en el contenedor de analitica.

// Une dimension_analyses (filtrando por frequency) con sus metric_analyses,
// para la lista de userIds dada. Solo trae el periodo mas reciente de cada
// dimension: analitica guarda una fila por semana, y sin este filtro las metricas
// de todas las semanas se juntaban en una sola lista.
// Resultado de la semana de cada dimension: el de sus metricas semanales y por sprint
// (frecuencia $2) si lo tiene; si no, el promedio de la semana de sus metricas diarias
// (fila 'day' con rango lunes-domingo). Asi S y P, que solo tienen metricas diarias,
// tambien aparecen en el resumen del equipo. Las dos filas no se mezclan: gana la primera. Devuelve una fila por metrica, con los datos
// de la dimension repetidos; una dimension sin metricas vuelve con las
// columnas de metrica en null (LEFT JOIN).
async function deUsuarios(pool, userIds, frequency = 'week') {
  if (!userIds || userIds.length === 0) return [];

  const r = await pool.query(
    `SELECT
         d.id                 AS dimension_analysis_id,
         d.user_id,
         d.dimension,
         d.start_date::text   AS dim_start_date,
         d.end_date::text     AS dim_end_date,
         d.frequency,
         d.normalized_score,
         d.criticality_status,
         m.metric_name,
         m.raw_value,
         m.normalized_value,
         m.start_date::text   AS metric_start_date,
         m.end_date::text     AS metric_end_date,
         m.criticality
       FROM dimension_analyses d
       LEFT JOIN metric_analyses m ON m.dimension_analysis_id = d.id
      WHERE d.user_id = ANY($1)
        AND (d.frequency = $2 OR (d.frequency = 'day' AND d.start_date <> d.end_date))
        AND d.end_date = (SELECT max(x.end_date) FROM dimension_analyses x
                           WHERE x.user_id = d.user_id AND x.dimension = d.dimension AND x.frequency = d.frequency
                             AND (d.frequency <> 'day' OR x.start_date <> x.end_date))
      ORDER BY d.user_id, d.dimension, (d.frequency = $2) DESC, d.calculated_at DESC, m.metric_name`,
    [userIds, frequency]
  );
  return r.rows;
}

// Historial de una persona para las graficas: filas de dimension (frecuencias 'day' y 'week') y de metrica de los ultimos
// `dias` / `semanas` contados hacia atras desde su ultimo dia con datos. El servicio afina despues el dia de referencia y
// recorta cada serie; aqui solo se acota la lectura. Sin ningun dato devuelve listas vacias.
async function historialDePersona(pool, userId, dias, semanas) {
  const tope = await pool.query(
    `SELECT max(start_date)::text AS ultima
       FROM dimension_analyses
      WHERE user_id = $1 AND frequency = 'day' AND start_date = end_date`,
    [userId]
  );
  const ultima = tope.rows[0] && tope.rows[0].ultima;
  if (!ultima) return { dimensiones: [], metricas: [] };

  const atras = Math.max(dias - 1, 7 * semanas - 1);
  const dims = await pool.query(
    `SELECT dimension, frequency, start_date::text AS start_date, end_date::text AS end_date,
            normalized_score, criticality_status
       FROM dimension_analyses
      WHERE user_id = $1 AND start_date <= $2::date AND start_date >= $2::date - $3::int
      ORDER BY start_date, dimension`,
    [userId, ultima, atras]
  );
  const mets = await pool.query(
    `SELECT metric_name, start_date::text AS start_date, end_date::text AS end_date,
            raw_value, normalized_value, criticality
       FROM metric_analyses
      WHERE user_id = $1 AND start_date <= $2::date AND start_date >= $2::date - $3::int
      ORDER BY start_date, metric_name`,
    [userId, ultima, atras]
  );
  return { dimensiones: dims.rows, metricas: mets.rows };
}

module.exports = { deUsuarios, historialDePersona };
