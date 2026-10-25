const { pool } = require('../db/pool');
const analyses = require('../repositories/analyses.repo');
const usuarios = require('../repositories/users.repo');
const analitica = require('../services/analitica.client');
const { construirAnalitica } = require('../services/analitica.service');
const { validarVentana } = require('../utils/validacion');

// Responde el detalle de analitica de una persona (historial por dimension y por metrica, mas sus correlaciones).
// Quien llama ya comprobo que la persona pertenece al equipo u organizacion de la sesion; aqui no se vuelve a decidir
// quien puede verla.
async function detalleDePersona(req, res, personaId) {
  const ventana = validarVentana(req.query);
  if (!ventana.ok) {
    return res.status(400).json({ error: ventana.errores.join(' ') });
  }

  const catalogo = await analitica.catalogo();
  if (!catalogo) {
    const err = new Error('La analitica no esta disponible en este momento');
    err.status = 503;
    throw err;
  }

  const persona = await usuarios.obtenerPorId(pool, personaId);
  const { dimensiones, metricas } = await analyses.historialDePersona(
    pool,
    personaId,
    ventana.dias,
    ventana.semanas
  );
  const correlaciones = await analitica.correlaciones(personaId);

  return res.json(
    construirAnalitica({
      usuario: persona,
      catalogo,
      dimensiones,
      metricas,
      correlaciones,
      dias: ventana.dias,
      semanas: ventana.semanas,
    })
  );
}

module.exports = { detalleDePersona };
