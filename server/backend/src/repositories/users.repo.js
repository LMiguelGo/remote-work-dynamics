// Acceso a datos de usuarios. SQL siempre parametrizado ($1, $2), nunca concatenado.

async function buscarPorUsername(pool, username) {
  const r = await pool.query(
    `SELECT u.id, u.username, u.password_hash, u.full_name,
            u.must_change_password, u.is_active, rol.name AS role_name
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

// Lista de cuentas para el administrador del sistema. Nunca devuelve password_hash.
// Sirve para que el admin encuentre el id de una cuenta ya existente, por ejemplo
// para restablecerle la clave. Solo la usa una ruta protegida de rol admin.
async function listar(pool) {
  const r = await pool.query(
    `SELECT u.id, u.username, u.full_name, rol.name AS rol, u.team_id, u.is_active
       FROM users u
       JOIN roles rol ON rol.id = u.role_id
      ORDER BY u.username`
  );
  return r.rows;
}

async function obtenerPorId(pool, id) {
  const r = await pool.query(
    `SELECT u.id, u.username, u.password_hash, u.full_name,
            u.must_change_password, u.is_active, rol.name AS role_name
       FROM users u
       JOIN roles rol ON rol.id = u.role_id
      WHERE u.id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

// Resuelve el id de un rol por su nombre. Lo usa la provision de cuentas del
// administrador para validar el rol pedido antes de crear al usuario.
async function obtenerRolPorNombre(pool, nombre) {
  const r = await pool.query('SELECT id, name FROM roles WHERE name = $1', [nombre]);
  return r.rows[0] || null;
}

// Crea una cuenta. must_change_password queda en true por defecto del esquema,
// salvo que se indique lo contrario (p. ej. el propio administrador del seed).
async function crear(pool, { username, fullName, roleId, teamId, passwordHash, mustChange = true }) {
  const r = await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role_id, team_id, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, username`,
    [username, passwordHash, fullName || null, roleId, teamId || null, mustChange]
  );
  return r.rows[0];
}

// Actualiza la clave y marca si el usuario debe volver a cambiarla. En un cambio
// voluntario mustChange es false; en un restablecimiento del administrador es true.
async function actualizarClave(pool, { userId, passwordHash, mustChange }) {
  const r = await pool.query(
    `UPDATE users SET password_hash = $2, must_change_password = $3
      WHERE id = $1
      RETURNING id`,
    [userId, passwordHash, mustChange]
  );
  return r.rows[0] || null;
}

module.exports = {
  buscarPorUsername,
  listarDemo,
  listar,
  obtenerPorId,
  obtenerRolPorNombre,
  crear,
  actualizarClave,
};
