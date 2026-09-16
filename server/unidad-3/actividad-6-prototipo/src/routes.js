// API con control de acceso por rol. El filtro se aplica siempre en el servidor.

const express = require('express');
const { db } = require('./db');
const { iniciarSesion, exigeSesion, exigeRol } = require('./auth');
const { calcularEquipo, calcularOrganizacion } = require('./scoring');

const router = express.Router();

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
  const u = db.prepare('SELECT id, nombre, captura_activa FROM usuarios WHERE id = ?').get(id);
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

  res.json({
    nombre: u.nombre,
    capturaActiva: !!u.captura_activa,
    mensaje: 'Este panel no muestra metricas de productividad. Solo el contexto de tu espacio, tus alertas y que datos se recogen.',
    ambiente: { temperatura, humedad, presion, estado: estadoAmbiental, serieTemp },
    conexion: { calidad, estado: conexionEstado, vpn },
    bienestar: { nivel: bienestar, texto: bienestarTexto },
    queSeCaptura,
    alertas,
  });
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

module.exports = router;
