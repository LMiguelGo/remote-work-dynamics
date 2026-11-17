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
  // Cada cuanto recalcula la analitica: con menos de 24 h el panel se vuelve a consultar solo a ese ritmo. Si analitica no
  // lo dice, se asume el cierre diario y el panel no se refresca solo.
  const recalculo = await analitica.verRecalculo().catch(() => null);

  return res.json({
    ...construirAnalitica({
      usuario: persona,
      catalogo,
      dimensiones,
      metricas,
      correlaciones,
      dias: ventana.dias,
      semanas: ventana.semanas,
    }),
    recalculo_minutos: recalculo ? recalculo.intervalo_minutos : 1440,
  });
}

// GET /admin/analitica/recalculo -> configuracion vigente del recalculo (solo administrador).
async function verRecalculo(req, res) {
  try {
    return res.json(await analitica.verRecalculo());
  } catch (err) {
    console.error('No se pudo leer la configuracion de recalculo:', err.message);
    return res.status(503).json({ error: 'La analitica no esta disponible en este momento' });
  }
}

// PUT /admin/analitica/recalculo { intervalo_minutos } -> entero de 1 a 1440 (solo administrador).
async function cambiarRecalculo(req, res) {
  const minutos = req.body ? req.body.intervalo_minutos : undefined;
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > 1440) {
    return res.status(400).json({ error: 'intervalo_minutos debe ser un entero entre 1 y 1440 (24 horas)' });
  }
  try {
    return res.json(await analitica.cambiarRecalculo(minutos));
  } catch (err) {
    console.error('No se pudo cambiar la configuracion de recalculo:', err.message);
    if (err.status === 400) return res.status(400).json({ error: err.detalle || 'Valor no valido' });
    return res.status(503).json({ error: 'La analitica no esta disponible en este momento' });
  }
}

module.exports = { detalleDePersona, verRecalculo, cambiarRecalculo };
