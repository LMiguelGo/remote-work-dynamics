// Acceso a datos de usuarios. SQL siempre parametrizado ($1, $2), nunca concatenado.

async function buscarPorUsername(pool, username) {
  const r = await pool.query(
    `SELECT u.id, u.username, u.password_hash, u.full_name, rol.name AS role_name
       FROM users u
       JOIN roles rol ON rol.id = u.role_id
      WHERE u.username = $1`,
    [username]
  );
  return r.rows[0] || null;
}

async function listarDemo(pool) {
  // Pantalla de demo: nunca devuelve password_hash.
  const r = await pool.query(
    `SELECT u.username, u.full_name, rol.name AS role_name
       FROM users u
       JOIN roles rol ON rol.id = u.role_id
      ORDER BY u.username`
  );
  return r.rows;
}

async function obtenerPorId(pool, id) {
  const r = await pool.query(
    `SELECT u.id, u.username, u.password_hash, u.full_name, rol.name AS role_name
       FROM users u
       JOIN roles rol ON rol.id = u.role_id
      WHERE u.id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

module.exports = { buscarPorUsername, listarDemo, obtenerPorId };
