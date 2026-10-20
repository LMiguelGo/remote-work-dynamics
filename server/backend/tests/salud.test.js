const test = require('node:test');
const assert = require('node:assert/strict');
const { construirSalud } = require('../src/controllers/salud.controller');

test('estado ok con usuarios', async () => {
  const r = await construirSalud({
    contarUsuarios: async () => 3,
    ultimasIngestas: async () => [],
  });
  assert.equal(r.estado, 'ok');
  assert.equal(r.usuarios, 3);
});

test('estado degradado si la base falla, sin relanzar', async () => {
  const r = await construirSalud({
    contarUsuarios: async () => {
      throw new Error('sin conexion');
    },
    ultimasIngestas: async () => [],
  });
  assert.equal(r.estado, 'degradado');
  assert.equal(r.base, 'sin datos');
});
