const jwt = require('jsonwebtoken');
const config = require('../config/index');

// Exige sesión: valida el Bearer token y expone req.usuario = { id, rol }.
// Ante token ausente o inválido responde 401, nunca 500.
function exigeSesion(req, res, next) {
  const cabecera = req.headers && req.headers.authorization;
  if (!cabecera || !cabecera.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const token = cabecera.slice('Bearer '.length).trim();
  try {
    const payload = jwt.verify(token, config.JWT_SECRET);
    req.usuario = { id: payload.id, rol: payload.rol };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión inválida' });
  }
}

// Exige un rol concreto. Responde 403 si no coincide.
function exigeRol(rol) {
  return function (req, res, next) {
    if (!req.usuario || req.usuario.rol !== rol) {
      return res.status(403).json({ error: 'Sin permiso' });
    }
    return next();
  };
}

module.exports = { exigeSesion, exigeRol };
