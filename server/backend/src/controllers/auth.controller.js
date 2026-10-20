const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config/index');
const { pool } = require('../db/pool');
const usersRepo = require('../repositories/users.repo');
const authService = require('../services/auth.service');

async function iniciarSesion(req, res) {
  const { username, clave } = req.body || {};

  const resultado = await authService.login(
    {
      buscarPorUsername: (u) => usersRepo.buscarPorUsername(pool, u),
      verificarClave: (hash, c) => bcrypt.compare(c, hash),
      firmar: (payload) => jwt.sign(payload, config.JWT_SECRET, { expiresIn: '8h' }),
    },
    username,
    clave
  );

  // Mensaje genérico: no se revela si falló el usuario o la clave.
  if (!resultado) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  return res.json(resultado);
}

async function usuariosDemo(req, res) {
  const lista = await usersRepo.listarDemo(pool);
  return res.json(lista);
}

module.exports = { iniciarSesion, usuariosDemo };
