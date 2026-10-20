// Acceso a la estructura de equipos. SQL siempre parametrizado.

// Integrantes del equipo que lidera `liderId`, sin incluir al propio lider.
async function miembrosDeLider(pool, liderId) {
  const r = await pool.query(
    `SELECT u.id, u.username, u.full_name
       FROM users u
       JOIN teams t ON t.id = u.team_id
      WHERE t.leader_id = $1 AND u.id <> $1
      ORDER BY u.id`,
    [liderId]
  );
  return r.rows;
}

// Lideres que dependen del gerente. En el modelo de dos niveles el gerente
// encabeza el equipo de tipo 'lideres' y los lideres son sus miembros. Se
// devuelven esos miembros sin incluir al propio gerente. Cada uno de ellos
// encabeza luego su equipo de empleados (ver miembrosDeLider).
async function lideresDeGerente(pool, gerenteId) {
  const r = await pool.query(
    `SELECT u.id, u.username, u.full_name
       FROM teams t
       JOIN users u ON u.team_id = t.id
      WHERE t.team_type = 'lideres' AND t.leader_id = $1 AND u.id <> $1
      ORDER BY u.id`,
    [gerenteId]
  );
  return r.rows;
}

module.exports = { miembrosDeLider, lideresDeGerente };
