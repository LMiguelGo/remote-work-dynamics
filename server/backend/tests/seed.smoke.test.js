// Prueba smoke del seed. Necesita la base, asi que se corre DENTRO del
// contenedor backend, DESPUES de haber ejecutado scripts/seed.js.
//   node --test tests/seed.smoke.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool, query } = require('../src/db/pool');

test.after(async () => {
  await pool.end();
});

test('hay 3 roles base', async () => {
  const r = await query('SELECT count(*)::int AS n FROM roles;');
  assert.equal(r.rows[0].n, 3);
});

test('hay 4 usuarios de demo', async () => {
  const r = await query('SELECT count(*)::int AS n FROM users;');
  assert.equal(r.rows[0].n, 4);
});

test('hay al menos una dimension_analyses con fechas no nulas', async () => {
  const r = await query(
    `SELECT count(*)::int AS n FROM dimension_analyses
       WHERE start_date IS NOT NULL AND end_date IS NOT NULL AND frequency IS NOT NULL;`,
  );
  assert.ok(r.rows[0].n >= 1, 'se esperaba al menos 1 dimension_analyses');
});

test('hay al menos una metric_analyses con start_date y end_date no nulos', async () => {
  const r = await query(
    `SELECT count(*)::int AS n FROM metric_analyses
       WHERE start_date IS NOT NULL AND end_date IS NOT NULL;`,
  );
  assert.ok(r.rows[0].n >= 1, 'se esperaba al menos 1 metric_analyses');
});
