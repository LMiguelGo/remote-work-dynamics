const { pool } = require('../db/pool');
const events = require('../repositories/events.repo');
const {
  LIMITE_REGISTROS,
  TIPOS_REGISTRO,
  esTipoRegistro,
  construirRegistros,
} = require('../services/registros.service');

// Responde los ultimos registros de un tipo de dato de una persona (?tipo=commit).
// Quien llama ya comprobo que la persona pertenece al equipo u organizacion de la
// sesion; aqui no se vuelve a decidir quien puede verla.
async function registrosDePersona(req, res, personaId) {
  const { tipo } = req.query;
  if (!esTipoRegistro(tipo)) {
    return res.status(400).json({
      error: `tipo invalido. Valores permitidos: ${TIPOS_REGISTRO.join(', ')}`,
    });
  }
  const filas = await events.recientesDeUsuario(pool, personaId, tipo, LIMITE_REGISTROS);
  return res.json(construirRegistros(filas, tipo));
}

module.exports = { registrosDePersona };
