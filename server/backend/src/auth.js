// Sesion con JWT y verificacion de rol. El secreto y las claves son de demostracion.

const jwt = require('jsonwebtoken');
const { db } = require('./db');

const SECRETO = 'prototipo-actividad6-demo';
const EXPIRA = '2h';

function iniciarSesion(usuario, clave) {
  const u = db.prepare('SELECT * FROM usuarios WHERE nombre = ?').get(usuario);
  if (!u || u.clave_demo !== clave) return null;
  const token = jwt.sign({ id: u.id, rol: u.rol, nombre: u.nombre }, SECRETO, { expiresIn: EXPIRA });
  return { token, usuario: { id: u.id, nombre: u.nombre, rol: u.rol } };
}

function exigeSesion(req, res, next) {
  const cabecera = req.headers.authorization || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Falta el token de sesion.' });
  try {
    req.usuario = jwt.verify(token, SECRETO);
    next();
  } catch {
    return res.status(401).json({ error: 'Sesion invalida o vencida.' });
  }
}

function exigeRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: 'Tu rol no tiene acceso a esta informacion.' });
    }
    next();
  };
}

module.exports = { iniciarSesion, exigeSesion, exigeRol };
