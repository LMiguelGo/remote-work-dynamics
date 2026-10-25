const express = require('express');
const { query } = require('../db/pool');
const { construirSalud } = require('../controllers/salud.controller');
const authController = require('../controllers/auth.controller');
const empleadoController = require('../controllers/empleado.controller');
const liderController = require('../controllers/lider.controller');
const gerenteController = require('../controllers/gerente.controller');
const operacionController = require('../controllers/operacion.controller');
const { exigeSesion, exigeRol, exigeClaveActualizada } = require('../middlewares/auth.middleware');
const { exigeJson, validarCon } = require('../middlewares/validacion.middleware');
const { crearLimitador } = require('../middlewares/rateLimit.middleware');
const {
  validarEncuestaDiaria,
  validarEncuestaSemanal,
  validarJornadaFin,
  validarUmbrales,
} = require('../utils/validacion');

const router = express.Router();

// Guardas por rol. Todas exigen sesion y que la clave temporal ya se haya
// cambiado antes de usar cualquier ruta de negocio.
const soloEmpleado = [exigeSesion, exigeClaveActualizada, exigeRol('empleado')];
const soloLider = [exigeSesion, exigeClaveActualizada, exigeRol('lider')];
const soloGerente = [exigeSesion, exigeClaveActualizada, exigeRol('gerente')];

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

// Cambio de clave del usuario en sesion. No lleva exigeClaveActualizada: es
// justamente la via para salir del estado de clave temporal.
router.post('/cambiar-clave', [exigeSesion, exigeJson], async (req, res, next) => {
  try {
    await authController.cambiarClave(req, res);
  } catch (err) {
    next(err);
  }
});

// --- Provision de cuentas por el administrador del sistema ---

const soloAdmin = [exigeSesion, exigeClaveActualizada, exigeRol('admin')];

router.post('/usuarios', [...soloAdmin, exigeJson], async (req, res, next) => {
  try {
    await authController.crearUsuario(req, res);
  } catch (err) {
    next(err);
  }
});

router.post('/usuarios/:id/restablecer-clave', soloAdmin, async (req, res, next) => {
  try {
    await authController.restablecerClave(req, res);
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

router.get('/equipo', soloLider, async (req, res, next) => {
  try {
    await liderController.miEquipo(req, res);
  } catch (err) {
    next(err);
  }
});

// Conectividad de solo lectura de los integrantes del lider, acotada a su equipo.
router.get('/equipo/conectividad', soloLider, async (req, res, next) => {
  try {
    await liderController.conectividadEquipo(req, res);
  } catch (err) {
    next(err);
  }
});

// Historial de analitica de un integrante del equipo (graficas por dimension y por metrica).
router.get('/equipo/integrantes/:id/analitica', soloLider, async (req, res, next) => {
  try {
    await liderController.analiticaIntegrante(req, res);
  } catch (err) {
    next(err);
  }
});

// --- Rutas del gerente ---

router.get('/organizacion', soloGerente, async (req, res, next) => {
  try {
    await gerenteController.organizacion(req, res);
  } catch (err) {
    next(err);
  }
});

router.get(
  '/organizacion/equipo/:liderId',
  soloGerente,
  async (req, res, next) => {
    try {
      await gerenteController.equipoDeLider(req, res);
    } catch (err) {
      next(err);
    }
  }
);

// Historial de analitica de un integrante de cualquier equipo de su organizacion.
router.get('/organizacion/integrantes/:id/analitica', soloGerente, async (req, res, next) => {
  try {
    await gerenteController.analiticaIntegrante(req, res);
  } catch (err) {
    next(err);
  }
});

// --- Rutas de operacion del gerente ---

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
