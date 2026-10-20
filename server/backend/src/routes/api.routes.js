const express = require('express');
const { query } = require('../db/pool');
const { construirSalud } = require('../controllers/salud.controller');
const authController = require('../controllers/auth.controller');
const empleadoController = require('../controllers/empleado.controller');
const liderController = require('../controllers/lider.controller');
const gerenteController = require('../controllers/gerente.controller');
const operacionController = require('../controllers/operacion.controller');
const { exigeSesion, exigeRol } = require('../middlewares/auth.middleware');
const { exigeJson, validarCon } = require('../middlewares/validacion.middleware');
const { crearLimitador } = require('../middlewares/rateLimit.middleware');
const {
  validarEncuestaDiaria,
  validarEncuestaSemanal,
  validarJornadaFin,
  validarUmbrales,
} = require('../utils/validacion');

const router = express.Router();

// Todas las rutas de empleado exigen sesion con rol empleado.
const soloEmpleado = [exigeSesion, exigeRol('empleado')];

// Anti fuerza bruta en el login (OWASP ASVS): 10 intentos por IP cada 15 min.
const limitadorLogin = crearLimitador({
  windowMs: 15 * 60 * 1000,
  max: 10,
  mensaje: 'Demasiados intentos de inicio de sesion. Espere unos minutos e intente de nuevo.',
});

async function contarUsuarios() {
  const r = await query('SELECT count(*)::int AS n FROM users');
  return r.rows[0].n;
}

router.get('/salud', async (req, res, next) => {
  try {
    const salud = await construirSalud({
      contarUsuarios,
      ultimasIngestas: async () => [],
    });
    res.json(salud);
  } catch (err) {
    next(err);
  }
});

router.get('/estado', async (req, res, next) => {
  try {
    const n = await contarUsuarios();
    res.json({ ok: true, usuarios: n, sembrado: n > 0 });
  } catch (err) {
    next(err);
  }
});

router.post('/login', limitadorLogin, async (req, res, next) => {
  try {
    await authController.iniciarSesion(req, res);
  } catch (err) {
    next(err);
  }
});

router.get('/usuarios-demo', async (req, res, next) => {
  try {
    await authController.usuariosDemo(req, res);
  } catch (err) {
    next(err);
  }
});

// --- Rutas del panel de empleado ---

router.get('/mi-panel', soloEmpleado, async (req, res, next) => {
  try {
    await empleadoController.miPanel(req, res);
  } catch (err) {
    next(err);
  }
});

router.post('/jornada/iniciar', soloEmpleado, async (req, res, next) => {
  try {
    await empleadoController.iniciarJornada(req, res);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/jornada/finalizar',
  [...soloEmpleado, exigeJson, validarCon(validarJornadaFin)],
  async (req, res, next) => {
    try {
      await empleadoController.finalizarJornada(req, res);
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/encuesta-diaria',
  [...soloEmpleado, exigeJson, validarCon(validarEncuestaDiaria)],
  async (req, res, next) => {
    try {
      await empleadoController.encuestaDiaria(req, res);
    } catch (err) {
      next(err);
    }
  }
);

router.get('/encuesta-semanal/estado', soloEmpleado, async (req, res, next) => {
  try {
    await empleadoController.estadoEncuestaSemanal(req, res);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/encuesta-semanal',
  [...soloEmpleado, exigeJson, validarCon(validarEncuestaSemanal)],
  async (req, res, next) => {
    try {
      await empleadoController.encuestaSemanal(req, res);
    } catch (err) {
      next(err);
    }
  }
);

router.get('/umbrales', soloEmpleado, async (req, res, next) => {
  try {
    await empleadoController.obtenerUmbrales(req, res);
  } catch (err) {
    next(err);
  }
});

router.put(
  '/umbrales',
  [...soloEmpleado, exigeJson, validarCon(validarUmbrales)],
  async (req, res, next) => {
    try {
      await empleadoController.actualizarUmbrales(req, res);
    } catch (err) {
      next(err);
    }
  }
);

// --- Rutas del lider ---

router.get('/equipo', [exigeSesion, exigeRol('lider')], async (req, res, next) => {
  try {
    await liderController.miEquipo(req, res);
  } catch (err) {
    next(err);
  }
});

// Conectividad de solo lectura de los integrantes del lider, acotada a su equipo.
router.get('/equipo/conectividad', [exigeSesion, exigeRol('lider')], async (req, res, next) => {
  try {
    await liderController.conectividadEquipo(req, res);
  } catch (err) {
    next(err);
  }
});

// --- Rutas del gerente ---

router.get('/organizacion', [exigeSesion, exigeRol('gerente')], async (req, res, next) => {
  try {
    await gerenteController.organizacion(req, res);
  } catch (err) {
    next(err);
  }
});

router.get(
  '/organizacion/equipo/:liderId',
  [exigeSesion, exigeRol('gerente')],
  async (req, res, next) => {
    try {
      await gerenteController.equipoDeLider(req, res);
    } catch (err) {
      next(err);
    }
  }
);

// --- Rutas de operacion del gerente ---

const soloGerente = [exigeSesion, exigeRol('gerente')];

router.get('/operacion/dispositivos', soloGerente, async (req, res, next) => {
  try {
    await operacionController.dispositivos(req, res);
  } catch (err) {
    next(err);
  }
});

router.get('/operacion/conectividad', soloGerente, async (req, res, next) => {
  try {
    await operacionController.conectividad(req, res);
  } catch (err) {
    next(err);
  }
});

router.get('/operacion/config', soloGerente, async (req, res, next) => {
  try {
    await operacionController.obtenerConfig(req, res);
  } catch (err) {
    next(err);
  }
});

router.put('/operacion/config', [...soloGerente, exigeJson], async (req, res, next) => {
  try {
    await operacionController.actualizarConfig(req, res);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
