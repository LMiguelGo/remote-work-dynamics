const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('../config/index');
const { pool } = require('../db/pool');
const usersRepo = require('../repositories/users.repo');
const authService = require('../services/auth.service');
const { validarPoliticaClave, generarClaveTemporal } = require('../utils/password');

const COSTO_BCRYPT = 10;

function firmar(payload) {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: '8h' });
}

async function iniciarSesion(req, res) {
  const { username, clave } = req.body || {};

  const resultado = await authService.login(
    {
      buscarPorUsername: (u) => usersRepo.buscarPorUsername(pool, u),
      verificarClave: (hash, c) => bcrypt.compare(c, hash),
      firmar,
    },
    username,
    clave
  );

  // Mensaje genérico: no se revela si falló el usuario, la clave o la cuenta inactiva.
  if (!resultado) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  return res.json(resultado);
}

// Lista de usuarios para el selector de la demo. ENUMERA cuentas, asi que en
// produccion se apaga (OWASP: evitar enumeracion de usuarios). Solo vive en la demo.
async function usuariosDemo(req, res) {
  if (config.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'No disponible' });
  }
  const lista = await usersRepo.listarDemo(pool);
  return res.json(lista);
}

// Cambio de clave del usuario en sesion. Exige la clave actual y una nueva que
// cumpla la politica. Devuelve un token nuevo (ya sin la marca de cambio obligatorio).
async function cambiarClave(req, res) {
  const { clave_actual, clave_nueva } = req.body || {};
  if (typeof clave_actual !== 'string' || typeof clave_nueva !== 'string') {
    return res.status(400).json({ error: 'clave_actual y clave_nueva son obligatorias' });
  }

  const resultado = await authService.cambiarClave(
    {
      obtenerPorId: (id) => usersRepo.obtenerPorId(pool, id),
      verificarClave: (hash, c) => bcrypt.compare(c, hash),
      hash: (c) => bcrypt.hash(c, COSTO_BCRYPT),
      actualizarClave: (datos) => usersRepo.actualizarClave(pool, datos),
      firmar,
    },
    { userId: req.usuario.id, claveActual: clave_actual, claveNueva: clave_nueva }
  );

  if (!resultado.ok) {
    if (resultado.codigo === 'clave_actual_invalida') {
      return res.status(401).json({ error: 'La clave actual no es correcta' });
    }
    if (resultado.codigo === 'politica') {
      return res.status(400).json({ error: 'La clave nueva no cumple la politica', detalles: resultado.errores });
    }
    return res.status(400).json({ error: 'No se pudo cambiar la clave' });
  }

  return res.json({ ok: true, token: resultado.token });
}

// Provision de cuentas por el administrador del sistema. Crea el usuario con el
// rol indicado y una clave temporal que el usuario debe cambiar en el primer
// ingreso. Si no se envia clave_temporal, se genera una. La clave se devuelve UNA
// sola vez para que el administrador la entregue por un canal privado.
async function crearUsuario(req, res) {
  const { username, full_name, rol, team_id, clave_temporal } = req.body || {};

  if (typeof username !== 'string' || username.trim() === '') {
    return res.status(400).json({ error: 'username es obligatorio' });
  }
  if (typeof rol !== 'string' || rol.trim() === '') {
    return res.status(400).json({ error: 'rol es obligatorio' });
  }

  const rolFila = await usersRepo.obtenerRolPorNombre(pool, rol);
  if (!rolFila) {
    return res.status(400).json({ error: `rol '${rol}' no existe` });
  }

  // Clave temporal: la dada por el admin (validada) o una generada.
  let claveTemporal = clave_temporal;
  if (claveTemporal === undefined || claveTemporal === null || claveTemporal === '') {
    claveTemporal = generarClaveTemporal();
  } else {
    const politica = validarPoliticaClave(claveTemporal);
    if (!politica.ok) {
      return res.status(400).json({ error: 'La clave temporal no cumple la politica', detalles: politica.errores });
    }
  }

  const passwordHash = await bcrypt.hash(claveTemporal, COSTO_BCRYPT);

  try {
    const creado = await usersRepo.crear(pool, {
      username: username.trim(),
      fullName: full_name,
      roleId: rolFila.id,
      teamId: team_id,
      passwordHash,
      mustChange: true,
    });
    return res.status(201).json({
      id: creado.id,
      username: creado.username,
      rol: rolFila.name,
      clave_temporal: claveTemporal,
      aviso: 'Entregue esta clave por un canal privado. El usuario debe cambiarla al ingresar.',
    });
  } catch (err) {
    // 23505 = violacion de unicidad (username ya existe).
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'El username ya existe' });
    }
    throw err;
  }
}

// Restablece la clave de una cuenta (lo hace el administrador). Genera una clave
// temporal nueva y vuelve a exigir el cambio en el proximo ingreso.
async function restablecerClave(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'id invalido' });
  }
  const usuario = await usersRepo.obtenerPorId(pool, id);
  if (!usuario) {
    return res.status(404).json({ error: 'Usuario no encontrado' });
  }

  const claveTemporal = generarClaveTemporal();
  const passwordHash = await bcrypt.hash(claveTemporal, COSTO_BCRYPT);
  await usersRepo.actualizarClave(pool, { userId: id, passwordHash, mustChange: true });

  return res.json({
    id,
    username: usuario.username,
    clave_temporal: claveTemporal,
    aviso: 'Entregue esta clave por un canal privado. El usuario debe cambiarla al ingresar.',
  });
}

module.exports = { iniciarSesion, usuariosDemo, cambiarClave, crearUsuario, restablecerClave };
