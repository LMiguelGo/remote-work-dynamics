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

// Lideres que dependen del gerente. En el prototipo de dos niveles el gerente
// encabeza el unico equipo de tipo 'lideres'; los lideres son quienes encabezan
// los equipos de tipo 'empleados'. El seed no coloca a los lideres como
// miembros del equipo 'lideres' (quedan en su propio equipo de empleados), por
// lo que un "miembros del equipo que lidera el gerente" literal daria vacio.
// Se resuelve devolviendo a los lideres de los equipos de empleados para que el
// gerente vea su organizacion con datos. `gerenteId` se conserva en la firma
// (modelo de una sola organizacion en el prototipo).
async function lideresDeGerente(pool, gerenteId) {
  const r = await pool.query(
    `SELECT DISTINCT u.id, u.username, u.full_name
       FROM teams t
       JOIN users u ON u.id = t.leader_id
      WHERE t.team_type = 'empleados' AND u.id <> $1
      ORDER BY u.id`,
    [gerenteId]
  );
  return r.rows;
}

module.exports = { miembrosDeLider, lideresDeGerente };
