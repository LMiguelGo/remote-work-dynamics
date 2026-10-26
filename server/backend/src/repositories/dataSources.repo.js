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

// Estado de TODAS las fuentes para el panel del gerente: fuente, su dueno
// (username/full_name) y la ultima actividad (MAX(events.time)) de esa fuente.
// LEFT JOIN a events para que una fuente sin eventos salga con ultima_actividad
// en null. SQL parametrizado (aqui sin parametros, solo lectura agregada).
async function estadoDeFuentes(pool) {
  const r = await pool.query(
    `SELECT ds.id,
            ds.source_type,
            ds.identifier,
            ds.is_active,
            u.username,
            u.full_name,
            MAX(e.time) AS ultima_actividad
       FROM data_sources ds
       JOIN users u ON u.id = ds.user_id
       LEFT JOIN events e ON e.source_id = ds.id
      GROUP BY ds.id, ds.source_type, ds.identifier, ds.is_active, u.username, u.full_name
      ORDER BY ds.id`
  );
  return r.rows;
}

// Busca una fuente por su identifier unico (p. ej. 'esp32_empleado1'). La usa la
// ingesta para resolver a que fuente pertenece una lectura cruda del firmware.
async function buscarPorIdentifier(pool, identifier) {
  const r = await pool.query(
    `SELECT id, user_id, source_type, identifier, is_active
       FROM data_sources
      WHERE identifier = $1
      LIMIT 1`,
    [identifier]
  );
  return r.rows[0] || null;
}

async function buscarPorIdentifierYTipo(pool, identifier, sourceType) {
  const r = await pool.query(
    `SELECT id, user_id, source_type, identifier, is_active
       FROM data_sources
      WHERE identifier = $1 AND source_type = $2
      LIMIT 1`,
    [identifier, sourceType]
  );
  return r.rows[0] || null;
}

// Crea una fuente de datos para un usuario. La usa la provision de cuentas para
// registrar la fuente web_app del empleado al crearlo.
async function crear(pool, { userId, sourceType, identifier, description = null, isActive = true }) {
  const r = await pool.query(
    `INSERT INTO data_sources (user_id, source_type, identifier, description, is_active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, user_id, source_type, identifier, is_active`,
    [userId, sourceType, identifier, description, isActive]
  );
  return r.rows[0];
}

module.exports = { obtenerPorUsuarioYTipo, estadoDeFuentes, buscarPorIdentifier, buscarPorIdentifierYTipo, crear };
