// Acceso a employee_profiles. SQL siempre parametrizado.

async function obtenerPorUsuario(pool, userId) {
  const r = await pool.query(
    `SELECT user_id, team_role_id, work_schedule, ambient_thresholds, capture_active
       FROM employee_profiles
      WHERE user_id = $1`,
    [userId]
  );
  return r.rows[0] || null;
}

async function guardarUmbrales(pool, userId, thresholds) {
  const r = await pool.query(
    `UPDATE employee_profiles
        SET ambient_thresholds = $2::jsonb
      WHERE user_id = $1
      RETURNING ambient_thresholds`,
    [userId, JSON.stringify(thresholds)]
  );
  return r.rows[0] ? r.rows[0].ambient_thresholds : null;
}

module.exports = { obtenerPorUsuario, guardarUmbrales };
