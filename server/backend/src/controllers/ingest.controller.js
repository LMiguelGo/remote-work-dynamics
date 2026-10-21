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

// Ingesta generica del contrato del equipo: { identifier, event_type, time?, payload }.
// La usan los conectores (Jira de Karol, y a futuro GitHub y SonarQube). Resuelve la
// fuente por identifier y guarda el evento tal cual, sin interpretar el payload.
// 404 si el identifier no tiene fuente registrada: el conector lo trata como fallo
// y reintenta, y queda claro que falta sembrar esa data_source.
async function ingestarEvento(req, res) {
  const { identifier, event_type, time, payload } = req.body;
  const fuente = await dataSources.buscarPorIdentifier(pool, identifier);
  if (!fuente) {
    return res.status(404).json({ error: `Fuente '${identifier}' no registrada` });
  }
  const evento = await events.insertar(pool, {
    sourceId: fuente.id,
    eventType: event_type,
    payload,
    time: time || null,
  });
  return res.status(200).json({ ok: true, evento });
}

module.exports = { ingestarEsp32, ingestarEvento };
