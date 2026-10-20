// Middleware de autenticacion de la ingesta de sensores. Un token compartido
// protege el endpoint de ingesta (no hay sesion de usuario: lo invoca el gateway
// del dispositivo). El token llega en el header 'X-Ingest-Token' o como
// 'Authorization: Bearer <token>'.

const crypto = require('crypto');
const config = require('../config/index');

// Compara en tiempo constante para no filtrar el token por el tiempo de respuesta.
// timingSafeEqual exige buffers de igual longitud; si difieren, no lanza: devuelve
// false. Tambien devuelve false si falta el token.
function tokensCoinciden(recibido, esperado) {
  if (typeof recibido !== 'string' || recibido.length === 0) {
    return false;
  }
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

// Lee el token del header dedicado o del Authorization: Bearer.
function extraerToken(req) {
  const headers = req.headers || {};
  const directo = headers['x-ingest-token'];
  if (typeof directo === 'string' && directo.length > 0) {
    return directo;
  }
  const auth = headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim();
  }
  return null;
}

function exigeTokenIngesta(req, res, next) {
  const recibido = extraerToken(req);
  if (!tokensCoinciden(recibido, config.INGEST_TOKEN)) {
    return res.status(401).json({ error: 'Token de ingesta invalido o ausente' });
  }
  return next();
}

module.exports = { exigeTokenIngesta };
