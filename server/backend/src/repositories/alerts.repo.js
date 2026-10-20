// Acceso a alerts. SQL siempre parametrizado.

async function deUsuario(pool, userId) {
  const r = await pool.query(
    `SELECT id, user_id, alert_type, message, severity, created_at, resolved_at
       FROM alerts
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [userId]
  );
  return r.rows;
}

module.exports = { deUsuario };
