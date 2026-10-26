// Prueba smoke del seed. Necesita la base, asi que se corre DENTRO del
// contenedor backend, DESPUES de haber ejecutado scripts/seed.js.
//   node --test tests/seed.smoke.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { pool, query } = require('../src/db/pool');

test.after(async () => {
  await pool.end();
});

test('hay 4 roles base (admin, gerente, lider, empleado)', async () => {
  const r = await query('SELECT count(*)::int AS n FROM roles;');
  assert.equal(r.rows[0].n, 4);
});

test('hay 5 cuentas iniciales', async () => {
  const r = await query('SELECT count(*)::int AS n FROM users;');
  assert.equal(r.rows[0].n, 5);
});

test('todas las cuentas se crean con cambio de clave obligatorio', async () => {
  const r = await query(
    'SELECT count(*)::int AS n FROM users WHERE must_change_password = false;',
  );
  assert.equal(r.rows[0].n, 0);
});

test('cada empleado tiene su perfil (2 employee_profiles)', async () => {
  const r = await query('SELECT count(*)::int AS n FROM employee_profiles;');
  assert.equal(r.rows[0].n, 2);
});

test('cada empleado tiene su fuente web_app (2 fuentes web_app)', async () => {
  const r = await query(
    "SELECT count(*)::int AS n FROM data_sources WHERE source_type = 'web_app';",
  );
  assert.equal(r.rows[0].n, 2);
});

// El seed de produccion no siembra telemetria ni analitica: esos datos llegan de
// las fuentes reales y, para las pruebas con datos sinteticos, los produce
// load_data.py de analitica. No se valida con un conteo en cero, porque esa carga
// de prueba puede correr antes que estas pruebas y agregar eventos y resultados;
// que el seed no los crea se comprueba en scripts/seed.js, que no los inserta.
