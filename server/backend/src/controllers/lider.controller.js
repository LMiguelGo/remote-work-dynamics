const { pool } = require('../db/pool');
const teams = require('../repositories/teams.repo');
const analyses = require('../repositories/analyses.repo');
const usuarios = require('../repositories/users.repo');
const events = require('../repositories/events.repo');
const { construirEquipo } = require('../services/equipo.service');
const { construirConectividad } = require('../services/operacion.service');
const { detalleDePersona } = require('./analitica.controller');

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

// GET /equipo/conectividad -> conectividad (solo lectura) de los integrantes del
// lider en sesion. Reusa el mismo armado que el gerente, pero acotado a su equipo.
async function conectividadEquipo(req, res) {
  const liderId = req.usuario.id;
  const integrantes = await teams.miembrosDeLider(pool, liderId);
  const ids = integrantes.map((u) => u.id);
  const eventosRed = ids.length ? await events.ultimaRedPorFuenteDeUsuarios(pool, ids) : [];
  return res.json(construirConectividad(eventosRed));
}

// GET /equipo/integrantes/:id/analitica -> historial por dimension y por metrica de un integrante del equipo del lider
// en sesion. Si la persona no es de su equipo responde 404, igual que si no existiera.
async function analiticaIntegrante(req, res) {
  const personaId = Number(req.params.id);
  if (!Number.isInteger(personaId)) {
    return res.status(400).json({ error: 'id invalido' });
  }
  const integrantes = await teams.miembrosDeLider(pool, req.usuario.id);
  if (!integrantes.some((u) => u.id === personaId)) {
    return res.status(404).json({ error: 'La persona no pertenece a su equipo' });
  }
  return detalleDePersona(req, res, personaId);
}

module.exports = { miEquipo, conectividadEquipo, analiticaIntegrante };
