const test = require('node:test');
const assert = require('node:assert/strict');
const { login } = require('../src/services/auth.service');
const { exigeRol } = require('../src/middlewares/auth.middleware');

test('login con usuario inexistente retorna null', async () => {
  const deps = {
    buscarPorUsername: async () => null,
    verificarClave: async () => true,
    firmar: () => 't',
  };
  const r = await login(deps, 'nadie', 'clave');
  assert.equal(r, null);
});

test('login con clave equivocada retorna null', async () => {
  const deps = {
    buscarPorUsername: async () => ({
      id: 1,
      username: 'ana',
      password_hash: 'hash',
      full_name: 'Ana Perez',
      role_name: 'lider',
    }),
    verificarClave: async () => false,
    firmar: () => 't',
  };
  const r = await login(deps, 'ana', 'malaclave');
  assert.equal(r, null);
});

test('login valido retorna token y usuario sin password_hash', async () => {
  const deps = {
    buscarPorUsername: async () => ({
      id: 1,
      username: 'ana',
      password_hash: 'hash',
      full_name: 'Ana Perez',
      role_name: 'lider',
    }),
    verificarClave: async () => true,
    firmar: () => 't',
  };
  const r = await login(deps, 'ana', 'buenaclave');
  assert.ok(r);
  assert.equal(r.token, 't');
  assert.ok(r.usuario);
  assert.equal(r.usuario.password_hash, undefined);
  assert.equal(r.usuario.id, 1);
});

test('exigeRol rechaza con 403 cuando el rol no coincide', () => {
  const middleware = exigeRol('lider');
  let statusRecibido = null;
  let nextLlamado = false;
  const res = {
    status(code) {
      statusRecibido = code;
      return { json() {} };
    },
  };
  const next = () => {
    nextLlamado = true;
  };
  const req = { usuario: { rol: 'empleado' } };
  middleware(req, res, next);
  assert.equal(statusRecibido, 403);
  assert.equal(nextLlamado, false);
});
