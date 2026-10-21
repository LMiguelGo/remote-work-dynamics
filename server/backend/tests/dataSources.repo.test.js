// Prueba de buscarPorIdentifierYTipo con un pool falso (sin base de datos).
//   node --test tests/dataSources.repo.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const dataSources = require('../src/repositories/dataSources.repo');

test('consulta por identifier Y por tipo de fuente, en ese orden de parametros', async () => {
  let consulta = null;
  const pool = {
    async query(sql, params) {
      consulta = { sql, params };
      return { rows: [{ id: 7, user_id: 1, source_type: 'github', identifier: 'BriyithNarvaez04', is_active: true }] };
    },
  };

  const fuente = await dataSources.buscarPorIdentifierYTipo(pool, 'BriyithNarvaez04', 'github');

  assert.deepEqual(consulta.params, ['BriyithNarvaez04', 'github']);
  assert.match(consulta.sql, /identifier\s*=\s*\$1/);
  assert.match(consulta.sql, /source_type\s*=\s*\$2/);
  assert.equal(fuente.id, 7);
});

test('devuelve null si no hay una fuente con ese identifier y tipo', async () => {
  const pool = { async query() { return { rows: [] }; } };
  assert.equal(await dataSources.buscarPorIdentifierYTipo(pool, 'nadie', 'jira'), null);
});

test('sigue exportando las funciones que ya existian en main', () => {
  for (const nombre of ['obtenerPorUsuarioYTipo', 'estadoDeFuentes', 'buscarPorIdentifier']) {
    assert.equal(typeof dataSources[nombre], 'function', nombre);
  }
});
