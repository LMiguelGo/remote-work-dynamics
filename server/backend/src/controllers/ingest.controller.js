// Controlador HTTP de la ingesta de sensores. Recibe el cuerpo YA validado por el
// middleware (validarLecturaIngesta), resuelve la fuente por 'dispositivo',
// traduce el crudo al contrato e inserta. Responde 200 con el evento insertado,
// o 404 si el dispositivo no tiene fuente registrada.

const { pool } = require('../db/pool');
const dataSources = require('../repositories/dataSources.repo');
const events = require('../repositories/events.repo');
const { lecturaAEvento } = require('../services/ingest.service');

async function ingestarEsp32(req, res) {
  const datos = req.body;
  const fuente = await dataSources.buscarPorIdentifier(pool, datos.dispositivo);
  if (!fuente) {
    return res.status(404).json({ error: `Dispositivo '${datos.dispositivo}' sin fuente registrada` });
  }
  const { eventType, payload } = lecturaAEvento(datos);
  const evento = await events.insertar(pool, {
    sourceId: fuente.id,
    eventType,
    payload,
    time: null,
  });
  return res.status(200).json({ ok: true, evento });
}

module.exports = { ingestarEsp32 };
