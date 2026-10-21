// Pruebas del servicio de cambio de clave con dependencias simuladas (sin base).
//   node --test tests/cambiarClave.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { cambiarClave, login } = require('../src/services/auth.service');

function depsBase(overrides = {}) {
  return {
    obtenerPorId: async () => ({ id: 7, role_name: 'empleado', password_hash: 'HASH_ACTUAL' }),
    verificarClave: async (hash, clave) => hash === 'HASH_ACTUAL' && clave === 'claveActualOk',
    hash: async (clave) => `HASH(${clave})`,
    actualizarClave: async () => ({ id: 7 }),
    firmar: (payload) => JSON.stringify(payload),
    ...overrides,
  };
}

test('rechaza si la clave actual no coincide', async () => {
  const r = await cambiarClave(depsBase(), {
    userId: 7,
    claveActual: 'equivocada',
    claveNueva: 'camino azul en octubre',
  });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 'clave_actual_invalida');
});

test('rechaza si la clave nueva no cumple la politica', async () => {
  const r = await cambiarClave(depsBase(), {
    userId: 7,
    claveActual: 'claveActualOk',
    claveNueva: 'corta',
  });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 'politica');
});

test('cambia la clave y emite token con mc en false', async () => {
  let guardado = null;
  const deps = depsBase({ actualizarClave: async (d) => { guardado = d; return { id: 7 }; } });
  const r = await cambiarClave(deps, {
    userId: 7,
    claveActual: 'claveActualOk',
    claveNueva: 'camino azul en octubre',
  });
  assert.equal(r.ok, true);
  assert.equal(guardado.mustChange, false);
  assert.ok(r.token.includes('"mc":false'));
});

test('login de cuenta inactiva no entra', async () => {
  const deps = {
    buscarPorUsername: async () => ({ id: 1, role_name: 'empleado', password_hash: 'H', is_active: false, must_change_password: false }),
    verificarClave: async () => true,
    firmar: () => 'tok',
  };
  const r = await login(deps, 'x', 'y');
  assert.equal(r, null);
});

test('login marca debe_cambiar_clave y lo lleva al token', async () => {
  const deps = {
    buscarPorUsername: async () => ({ id: 1, username: 'u', full_name: 'U', role_name: 'empleado', password_hash: 'H', is_active: true, must_change_password: true }),
    verificarClave: async () => true,
    firmar: (p) => JSON.stringify(p),
  };
  const r = await login(deps, 'u', 'y');
  assert.equal(r.debe_cambiar_clave, true);
  assert.ok(r.token.includes('"mc":true'));
});
