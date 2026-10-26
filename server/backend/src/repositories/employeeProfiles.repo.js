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

// Crea el perfil de un empleado. team_role_id es obligatorio en el esquema; el
// horario y los umbrales llegan ya resueltos (por defecto si el admin no los da).
async function crear(pool, { userId, teamRoleId, workSchedule, ambientThresholds, captureActive = true }) {
  const r = await pool.query(
    `INSERT INTO employee_profiles (user_id, team_role_id, work_schedule, ambient_thresholds, capture_active)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
     RETURNING user_id, team_role_id, work_schedule, ambient_thresholds, capture_active`,
    [userId, teamRoleId, JSON.stringify(workSchedule), JSON.stringify(ambientThresholds), captureActive]
  );
  return r.rows[0];
}

// Resuelve un team_role por su nombre (backend, frontend, arquitecto, analitica).
async function obtenerTeamRolePorNombre(pool, nombre) {
  const r = await pool.query('SELECT id, name FROM team_roles WHERE name = $1', [nombre]);
  return r.rows[0] || null;
}

// team_role de respaldo cuando no se pide uno y no existe el por defecto: el primero.
async function primerTeamRole(pool) {
  const r = await pool.query('SELECT id, name FROM team_roles ORDER BY id LIMIT 1');
  return r.rows[0] || null;
}

module.exports = { obtenerPorUsuario, guardarUmbrales, crear, obtenerTeamRolePorNombre, primerTeamRole };
