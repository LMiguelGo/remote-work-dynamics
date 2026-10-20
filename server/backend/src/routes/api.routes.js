const express = require('express');
const { query } = require('../db/pool');
const { construirSalud } = require('../controllers/salud.controller');
const authController = require('../controllers/auth.controller');

const router = express.Router();

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

router.post('/login', async (req, res, next) => {
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

module.exports = router;
