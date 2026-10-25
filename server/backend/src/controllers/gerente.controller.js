const { pool } = require('../db/pool');
const teams = require('../repositories/teams.repo');
const analyses = require('../repositories/analyses.repo');
const usuarios = require('../repositories/users.repo');
const { construirEquipo } = require('../services/equipo.service');
const { construirOrganizacion } = require('../services/organizacion.service');
const { detalleDePersona } = require('./analitica.controller');

// Arma la lista de equipos (lider + integrantes) de los lideres dados y reune
// los ids de todos los integrantes para una sola lectura de analiticas.
async function reunirEquipos(lideres) {
  const equipos = [];
  const idsIntegrantes = [];
  for (const lider of lideres) {
    const integrantes = await teams.miembrosDeLider(pool, lider.id);
    equipos.push({ lider, integrantes });
    for (const u of integrantes) idsIntegrantes.push(u.id);
  }
  return { equipos, idsIntegrantes };
}

// GET /organizacion -> todos los equipos de los lideres bajo el gerente.
async function organizacion(req, res) {
  const gerenteId = req.usuario.id;
  const gerente = await usuarios.obtenerPorId(pool, gerenteId);

  const lideres = await teams.lideresDeGerente(pool, gerenteId);
  const { equipos, idsIntegrantes } = await reunirEquipos(lideres);
  const analiticas = await analyses.deUsuarios(pool, idsIntegrantes, 'week');

  const respuesta = construirOrganizacion(
    gerente
      ? { id: gerente.id, username: gerente.username, full_name: gerente.full_name }
      : { id: gerenteId },
    equipos,
    analiticas
  );
  return res.json(respuesta);
}

// GET /organizacion/equipo/:liderId -> un equipo concreto, validando que ese
// lider dependa del gerente en sesion. Si no, 404 coherente.
async function equipoDeLider(req, res) {
  const gerenteId = req.usuario.id;
  const liderId = Number(req.params.liderId);

  if (!Number.isInteger(liderId)) {
    return res.status(400).json({ error: 'liderId invalido' });
  }

  const lideres = await teams.lideresDeGerente(pool, gerenteId);
  const lider = lideres.find((l) => l.id === liderId);
  if (!lider) {
    return res.status(404).json({ error: 'El lider no pertenece a su organizacion' });
  }

  const integrantes = await teams.miembrosDeLider(pool, liderId);
  const ids = integrantes.map((u) => u.id);
  const analiticas = await analyses.deUsuarios(pool, ids, 'week');

  const respuesta = construirEquipo(lider, integrantes, analiticas);
  return res.json(respuesta);
}

// GET /organizacion/integrantes/:id/analitica -> historial por dimension y por metrica de un integrante de cualquier
// equipo de la cadena de mando del gerente en sesion. Si no es de su organizacion responde 404.
async function analiticaIntegrante(req, res) {
  const personaId = Number(req.params.id);
  if (!Number.isInteger(personaId)) {
    return res.status(400).json({ error: 'id invalido' });
  }
  const lideres = await teams.lideresDeGerente(pool, req.usuario.id);
  const { idsIntegrantes } = await reunirEquipos(lideres);
  if (!idsIntegrantes.includes(personaId)) {
    return res.status(404).json({ error: 'La persona no pertenece a su organizacion' });
  }
  return detalleDePersona(req, res, personaId);
}

module.exports = { organizacion, equipoDeLider, analiticaIntegrante };
