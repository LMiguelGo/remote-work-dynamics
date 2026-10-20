// Acceso a data_sources. SQL siempre parametrizado, nunca concatenado.

async function obtenerPorUsuarioYTipo(pool, userId, sourceType) {
  const r = await pool.query(
    `SELECT id, user_id, source_type, identifier, is_active
       FROM data_sources
      WHERE user_id = $1 AND source_type = $2
      ORDER BY id
      LIMIT 1`,
    [userId, sourceType]
  );
  return r.rows[0] || null;
}

module.exports = { obtenerPorUsuarioYTipo };
