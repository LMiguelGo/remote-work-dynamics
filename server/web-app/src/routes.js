// API con control de acceso por rol. El filtro se aplica siempre en el servidor.

const express = require('express');
const { db } = require('./db');
const { PERIODO, UMBRALES_DEFECTO } = require('./config');
const { iniciarSesion, exigeSesion, exigeRol } = require('./auth');
const { calcularEquipo, calcularOrganizacion, tiempoExtralaboral } = require('./scoring');
const { umbralesDe } = require('./alertas');

const router = express.Router();

// Fecha del dia en formato AAAA-MM-DD, para amarrar la jornada y la encuesta a la fecha local.
function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function horasEntre(inicio, fin) {
  return Math.round(((new Date(fin) - new Date(inicio)) / 3.6e6) * 10) / 10;
}

router.post('/login', (req, res) => {
  const { usuario, clave } = req.body || {};
  const sesion = iniciarSesion(usuario, clave);
  if (!sesion) return res.status(401).json({ error: 'Usuario o clave incorrectos.' });
  res.json(sesion);
});

// Solo para el selector de la demo. No expone metricas.
router.get('/usuarios-demo', (req, res) => {
  res.json(db.prepare('SELECT nombre, rol FROM usuarios ORDER BY id').all());
});

// El empleado no ve metricas de productividad. Solo el contexto de su espacio,
// sus alertas y que datos se recogen sobre el.
router.get('/mi-panel', exigeSesion, exigeRol('empleado'), (req, res) => {
  const id = req.usuario.id;
  const u = db.prepare('SELECT id, nombre, captura_activa, horas_pactadas FROM usuarios WHERE id = ?').get(id);
  const alertas = db
    .prepare('SELECT tipo, mensaje, ts FROM alertas WHERE usuario_id = ? ORDER BY ts DESC')
    .all(id);
  const queSeCaptura = db
    .prepare('SELECT DISTINCT fuente, tipo FROM eventos WHERE usuario_id = ?')
    .all(id);

  const ultimo = (metrica) => {
    const r = db
      .prepare('SELECT valor FROM contexto WHERE usuario_id = ? AND metrica = ? ORDER BY ts DESC LIMIT 1')
      .get(id, metrica);
    return r ? Math.round(r.valor * 10) / 10 : null;
  };
  const serieTemp = db
    .prepare("SELECT valor FROM contexto WHERE usuario_id = ? AND metrica = 'temperatura' ORDER BY ts ASC")
    .all(id)
    .map((r) => Math.round(r.valor * 10) / 10);

  const temperatura = ultimo('temperatura');
  const humedad = ultimo('humedad');
  const presion = ultimo('presion');
  const calidad = ultimo('calidad_conexion');

  const ambienteOk =
    temperatura != null && temperatura >= 18 && temperatura <= 26 && (humedad == null || (humedad >= 30 && humedad <= 70));
  const estadoAmbiental = ambienteOk ? 'Normal' : 'Atención';

  let conexionEstado;
  let vpn;
  if (calidad == null) {
    conexionEstado = 'Sin datos';
    vpn = false;
  } else if (calidad >= 70) {
    conexionEstado = 'Conexión activa y protegida';
    vpn = true;
  } else if (calidad >= 55) {
    conexionEstado = 'Conexión estable';
    vpn = true;
  } else {
    conexionEstado = 'Conexión inestable';
    vpn = false;
  }

  const bienestar = alertas.length === 0 && estadoAmbiental === 'Normal' ? 92 : alertas.length ? 62 : 78;
  const bienestarTexto = bienestar >= 80 ? 'Entorno saludable' : 'Requiere atención';

  // Estado de la jornada: si hay una abierta, cuenta desde su inicio; si no, toma la ultima del dia.
  const abierta = db
    .prepare('SELECT id, inicio FROM jornadas WHERE usuario_id = ? AND fin IS NULL ORDER BY inicio DESC LIMIT 1')
    .get(id);
  const ultimaHoy = db
    .prepare("SELECT inicio, fin FROM jornadas WHERE usuario_id = ? AND fin IS NOT NULL AND substr(inicio,1,10) = ? ORDER BY inicio DESC LIMIT 1")
    .get(id, hoy());
  let horasHoy = null;
  if (abierta) horasHoy = horasEntre(abierta.inicio, new Date().toISOString());
  else if (ultimaHoy) horasHoy = horasEntre(ultimaHoy.inicio, ultimaHoy.fin);

  const encuestaHoy = db
    .prepare('SELECT 1 FROM encuestas_diarias WHERE usuario_id = ? AND fecha = ?')
    .get(id, hoy());

  res.json({
    nombre: u.nombre,
    capturaActiva: !!u.captura_activa,
    mensaje: 'Este panel no muestra metricas de productividad. Solo el contexto de tu espacio, tus alertas y que datos se recogen.',
    ambiente: { temperatura, humedad, presion, estado: estadoAmbiental, serieTemp },
    conexion: { calidad, estado: conexionEstado, vpn },
    bienestar: { nivel: bienestar, texto: bienestarTexto },
    jornada: {
      estado: abierta ? 'abierta' : 'cerrada',
      inicio: abierta ? abierta.inicio : null,
      horasHoy,
      horasPactadas: u.horas_pactadas,
      extralaboralPct: tiempoExtralaboral(db, u, PERIODO),
    },
    encuestaPendiente: !encuestaHoy,
    umbrales: umbralesDe(db, id),
    queSeCaptura,
    alertas,
  });
});

// El empleado inicia su jornada. Si ya tiene una abierta, se devuelve esa misma.
router.post('/jornada/iniciar', exigeSesion, exigeRol('empleado'), (req, res) => {
  const id = req.usuario.id;
  const abierta = db.prepare('SELECT id, inicio FROM jornadas WHERE usuario_id = ? AND fin IS NULL ORDER BY inicio DESC LIMIT 1').get(id);
  if (abierta) return res.json({ estado: 'abierta', inicio: abierta.inicio, yaAbierta: true });
  const inicio = new Date().toISOString();
  db.prepare('INSERT INTO jornadas (usuario_id, inicio) VALUES (?, ?)').run(id, inicio);
  res.json({ estado: 'abierta', inicio });
});

// El empleado finaliza su jornada abierta.
router.post('/jornada/finalizar', exigeSesion, exigeRol('empleado'), (req, res) => {
  const id = req.usuario.id;
  const abierta = db.prepare('SELECT id, inicio FROM jornadas WHERE usuario_id = ? AND fin IS NULL ORDER BY inicio DESC LIMIT 1').get(id);
  if (!abierta) return res.status(409).json({ error: 'No tienes una jornada abierta.' });
  const fin = new Date().toISOString();
  db.prepare('UPDATE jornadas SET fin = ? WHERE id = ?').run(fin, abierta.id);
  res.json({ estado: 'cerrada', inicio: abierta.inicio, fin, horas: horasEntre(abierta.inicio, fin) });
});

// Microencuesta al cerrar la jornada. Los tres items van de 1 a 5 y alimentan la dimension S.
router.post('/encuesta-diaria', exigeSesion, exigeRol('empleado'), (req, res) => {
  const id = req.usuario.id;
  const { enps, fatiga, flujo } = req.body || {};
  const enRango = (v) => Number.isInteger(v) && v >= 1 && v <= 5;
  if (![enps, fatiga, flujo].every(enRango)) {
    return res.status(400).json({ error: 'Cada respuesta debe ser un entero de 1 a 5 (enps, fatiga, flujo).' });
  }
  db.prepare('DELETE FROM encuestas_diarias WHERE usuario_id = ? AND fecha = ?').run(id, hoy());
  db.prepare('INSERT INTO encuestas_diarias (usuario_id, fecha, enps, fatiga, flujo, ts) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    hoy(),
    enps,
    fatiga,
    flujo,
    new Date().toISOString()
  );
  res.json({ ok: true });
});

// El empleado consulta y ajusta sus propios umbrales ambientales.
router.get('/umbrales', exigeSesion, exigeRol('empleado'), (req, res) => {
  res.json(umbralesDe(db, req.usuario.id));
});

router.put('/umbrales', exigeSesion, exigeRol('empleado'), (req, res) => {
  const id = req.usuario.id;
  const cuerpo = req.body || {};
  const guardar = db.prepare(
    'INSERT INTO umbrales (usuario_id, metrica, minimo, maximo) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(usuario_id, metrica) DO UPDATE SET minimo = excluded.minimo, maximo = excluded.maximo'
  );
  for (const metrica of Object.keys(UMBRALES_DEFECTO)) {
    if (!cuerpo[metrica]) continue;
    const min = cuerpo[metrica].minimo;
    const max = cuerpo[metrica].maximo;
    guardar.run(id, metrica, min == null || min === '' ? null : Number(min), max == null || max === '' ? null : Number(max));
  }
  res.json(umbralesDe(db, id));
});

// El lider ve su propio equipo, individual y agregado.
router.get('/equipo', exigeSesion, exigeRol('lider'), (req, res) => {
  const lider = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
  res.json(calcularEquipo(db, lider));
});

// El gerente ve la organizacion en cascada.
router.get('/organizacion', exigeSesion, exigeRol('gerente'), (req, res) => {
  const gerente = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.usuario.id);
  res.json(calcularOrganizacion(db, gerente));
});

// El gerente baja a un equipo solo si ese lider depende de el.
router.get('/organizacion/equipo/:liderId', exigeSesion, exigeRol('gerente'), (req, res) => {
  const lider = db.prepare('SELECT * FROM usuarios WHERE id = ? AND rol = ?').get(Number(req.params.liderId), 'lider');
  if (!lider || lider.lider_id !== req.usuario.id) {
    return res.status(403).json({ error: 'Ese equipo no esta bajo tu cadena de mando.' });
  }
  res.json(calcularEquipo(db, lider));
});

// Comprobacion de estado. Reporta si la base responde y cuando entro por ultima vez cada conector.
router.get('/salud', (req, res) => {
  let base = 'ok';
  let usuarios = 0;
  try {
    usuarios = db.prepare('SELECT COUNT(*) n FROM usuarios').get().n;
  } catch {
    base = 'sin datos';
  }
  const ultimo = (tabla, filtro) => {
    try {
      const r = db.prepare(`SELECT MAX(ts) t FROM ${tabla}${filtro || ''}`).get();
      return r && r.t ? r.t : null;
    } catch {
      return null;
    }
  };
  const conectores = [
    { nombre: 'github', ultimaIngesta: ultimo('eventos', " WHERE fuente = 'github'") },
    { nombre: 'jira', ultimaIngesta: ultimo('eventos', " WHERE fuente = 'jira'") },
    { nombre: 'sensores', ultimaIngesta: ultimo('contexto') },
  ].map((c) => ({ ...c, estado: c.ultimaIngesta ? 'activo' : 'sin datos' }));

  res.json({
    estado: base === 'ok' && usuarios > 0 ? 'ok' : 'degradado',
    base,
    periodo: PERIODO,
    usuarios,
    conectores,
    ts: new Date().toISOString(),
  });
});

module.exports = router;
