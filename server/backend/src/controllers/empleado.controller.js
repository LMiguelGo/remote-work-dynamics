const { pool } = require('../db/pool');
const dataSources = require('../repositories/dataSources.repo');
const events = require('../repositories/events.repo');
const employeeProfiles = require('../repositories/employeeProfiles.repo');
const alerts = require('../repositories/alerts.repo');
const { construirPanel } = require('../services/panelEmpleado.service');
const { sePuedeEncuestaSemanal } = require('../services/encuestas.service');
const { horasEntre, mismoDiaUTC } = require('../utils/fechas');

// Aplana las lecturas ambientales ({ time, payload }) a objetos planos para el servicio.
function aplanarAmbiente(filas) {
  return filas.map((f) => ({ time: f.time, ...f.payload }));
}

// Obtiene la fuente web_app del usuario o lanza un error 400 descriptivo.
async function fuenteWeb(userId) {
  const fuente = await dataSources.obtenerPorUsuarioYTipo(pool, userId, 'web_app');
  if (!fuente) {
    const err = new Error('El usuario no tiene una fuente web_app registrada');
    err.status = 400;
    throw err;
  }
  return fuente;
}

async function miPanel(req, res) {
  const userId = req.usuario.id;

  const profile = await employeeProfiles.obtenerPorUsuario(pool, userId);
  const ambienteFilas = await events.ultimasAmbiente(pool, userId, 5);
  const alertasUsuario = await alerts.deUsuario(pool, userId);

  const fuente = await dataSources.obtenerPorUsuarioYTipo(pool, userId, 'web_app');
  let jornada = null;
  let encuestaDiariaPendiente = true;
  let encuestaSemanalPendiente = true;

  if (fuente) {
    const abierta = await events.workingSessionAbierta(pool, fuente.id);
    jornada = abierta ? { start_time: abierta.payload.start_time } : null;

    const ultimaDiaria = await events.ultimo(pool, fuente.id, 'daily_survey');
    encuestaDiariaPendiente = !ultimaDiaria || !mismoDiaUTC(ultimaDiaria.time, new Date());

    const ultimaSemanal = await events.ultimo(pool, fuente.id, 'weekly_survey');
    encuestaSemanalPendiente = sePuedeEncuestaSemanal(
      ultimaSemanal ? new Date(ultimaSemanal.time).toISOString() : null,
      new Date().toISOString()
    );
  }

  const respuesta = construirPanel({
    usuario: req.usuario,
    profile,
    ambiente: aplanarAmbiente(ambienteFilas),
    conexion: [], // no existe fuente de red en el prototipo: queda "Sin datos".
    alertas: alertasUsuario,
    jornada,
    encuestaDiariaPendiente,
    encuestaSemanalPendiente,
  });

  return res.json(respuesta);
}

async function iniciarJornada(req, res) {
  const fuente = await fuenteWeb(req.usuario.id);

  const abierta = await events.workingSessionAbierta(pool, fuente.id);
  if (abierta) {
    return res.status(409).json({ error: 'Ya hay una jornada en curso' });
  }

  const inicioISO = new Date().toISOString();
  const evento = await events.abrirWorkingSession(pool, fuente.id, inicioISO);
  return res.json({ ok: true, jornada: { estado: 'En curso', start_time: evento.payload.start_time } });
}

async function finalizarJornada(req, res) {
  const fuente = await fuenteWeb(req.usuario.id);

  const abierta = await events.workingSessionAbierta(pool, fuente.id);
  if (!abierta) {
    return res.status(409).json({ error: 'No hay una jornada en curso' });
  }

  const { end_time } = req.body;
  const cerrada = await events.cerrarWorkingSession(
    pool,
    { time: abierta.time, id: abierta.id },
    end_time
  );

  const horas = horasEntre(abierta.payload.start_time, end_time);
  return res.json({
    ok: true,
    jornada: { estado: 'Finalizada', start_time: cerrada.payload.start_time, end_time },
    horas,
  });
}

async function encuestaDiaria(req, res) {
  const fuente = await fuenteWeb(req.usuario.id);
  const { satisfaction_level, tools_perception, fatigue_level, concentration_perception } = req.body;

  await events.insertar(pool, {
    sourceId: fuente.id,
    eventType: 'daily_survey',
    payload: { satisfaction_level, tools_perception, fatigue_level, concentration_perception },
  });

  return res.json({ ok: true });
}

async function estadoEncuestaSemanal(req, res) {
  const fuente = await fuenteWeb(req.usuario.id);
  const ultima = await events.ultimo(pool, fuente.id, 'weekly_survey');
  const ultimaISO = ultima ? new Date(ultima.time).toISOString() : null;
  const pendiente = sePuedeEncuestaSemanal(ultimaISO, new Date().toISOString());
  return res.json({ pendiente, ultima: ultimaISO });
}

async function encuestaSemanal(req, res) {
  const fuente = await fuenteWeb(req.usuario.id);
  const { communication_quality, team_coordination, documentation_perception } = req.body;

  await events.insertar(pool, {
    sourceId: fuente.id,
    eventType: 'weekly_survey',
    payload: { communication_quality, team_coordination, documentation_perception },
  });

  return res.json({ ok: true });
}

async function obtenerUmbrales(req, res) {
  const profile = await employeeProfiles.obtenerPorUsuario(pool, req.usuario.id);
  return res.json({ umbrales: profile ? profile.ambient_thresholds : null });
}

async function actualizarUmbrales(req, res) {
  const guardados = await employeeProfiles.guardarUmbrales(pool, req.usuario.id, req.body);
  return res.json({ ok: true, umbrales: guardados });
}

module.exports = {
  miPanel,
  iniciarJornada,
  finalizarJornada,
  encuestaDiaria,
  estadoEncuestaSemanal,
  encuestaSemanal,
  obtenerUmbrales,
  actualizarUmbrales,
};
