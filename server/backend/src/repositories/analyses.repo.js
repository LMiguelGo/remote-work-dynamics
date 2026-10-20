// Acceso de LECTURA a las analiticas ya calculadas. SQL siempre parametrizado.
// El backend no calcula puntajes SPACE: eso corre en el contenedor de analitica.

// Une dimension_analyses (filtrando por frequency) con sus metric_analyses,
// para la lista de userIds dada. Devuelve una fila por metrica, con los datos
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
      WHERE d.user_id = ANY($1) AND d.frequency = $2
      ORDER BY d.user_id, d.dimension, d.calculated_at DESC, m.metric_name`,
    [userIds, frequency]
  );
  return r.rows;
}

module.exports = { deUsuarios };
