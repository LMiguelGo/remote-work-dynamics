const { pool } = require('../db/pool');
const teams = require('../repositories/teams.repo');
const analyses = require('../repositories/analyses.repo');
const usuarios = require('../repositories/users.repo');
const { construirEquipo } = require('../services/equipo.service');

// GET /equipo -> arma el equipo del lider en sesion.
async function miEquipo(req, res) {
  const liderId = req.usuario.id;

  const lider = await usuarios.obtenerPorId(pool, liderId);
  const integrantes = await teams.miembrosDeLider(pool, liderId);
  const ids = integrantes.map((u) => u.id);
  const analiticas = await analyses.deUsuarios(pool, ids, 'week');

  const respuesta = construirEquipo(
    lider ? { id: lider.id, username: lider.username, full_name: lider.full_name } : { id: liderId },
    integrantes,
    analiticas
  );
  return res.json(respuesta);
}

module.exports = { miEquipo };
