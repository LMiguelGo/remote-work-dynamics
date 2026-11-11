// Pruebas de la tarjeta de ultimos registros del lider y del gerente, y del orden
// del estado de dispositivos. No usan base de datos.
//   node --test tests/registros.test.js
process.env.JWT_SECRET = 'secreto_de_prueba_registros';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

const {
  LIMITE_REGISTROS,
  TIPOS_REGISTRO,
  esTipoRegistro,
  construirRegistros,
} = require('../src/services/registros.service');
const events = require('../src/repositories/events.repo');
const dataSources = require('../src/repositories/dataSources.repo');
const teams = require('../src/repositories/teams.repo');
const app = require('../src/app');

// --- Servicio puro ---

test('los tipos del MVP son exactamente los nueve de la tarjeta, sin red ni SonarQube', () => {
  assert.deepEqual([...TIPOS_REGISTRO].sort(), [
    'ambiental_reading',
    'commit',
    'daily_survey',
    'issue_created',
    'issue_updated',
    'pull_request',
    'pull_request_review',
    'weekly_survey',
    'working_session',
  ]);
  assert.equal(esTipoRegistro('qos_measurement'), false);
  assert.equal(esTipoRegistro('constructor'), false);
  assert.equal(esTipoRegistro(undefined), false);
});

test('construirRegistros conserva el orden recibido y solo deja los campos del contrato', () => {
  const r = construirRegistros(
    [
      { id: '12', time: new Date('2026-11-10T15:00:00Z'), payload: { commit_hash: 'abc1234', conventional_commit_prefix: 'feat', texto: 'secreto' } },
      { id: '9', time: '2026-11-09T10:00:00Z', payload: { commit_hash: 'def5678', conventional_commit_prefix: { x: 1 } } },
    ],
    'commit'
  );
  assert.equal(r.tipo, 'commit');
  assert.equal(r.limite, LIMITE_REGISTROS);
  assert.deepEqual(r.registros.map((x) => x.id), ['12', '9']);
  assert.equal(r.registros[0].time, '2026-11-10T15:00:00.000Z');
  assert.deepEqual(r.registros[0].datos, { commit_hash: 'abc1234', conventional_commit_prefix: 'feat' });
  // Un objeto en lugar de un valor simple no se reenvia.
  assert.equal(r.registros[1].datos.conventional_commit_prefix, null);
});

test('construirRegistros tolera filas vacias y payload ausente', () => {
  assert.deepEqual(construirRegistros([], 'daily_survey').registros, []);
  const r = construirRegistros([{ id: 1, time: null, payload: null }], 'working_session');
  assert.deepEqual(r.registros[0], { id: '1', time: null, datos: { start_time: null, end_time: null } });
});

// --- Repositorios (pool falso) ---

test('recientesDeUsuario ordena por id (orden de llegada) y filtra por persona y tipo', async () => {
  let consulta = null;
  const pool = { async query(sql, params) { consulta = { sql, params }; return { rows: [] }; } };
  await events.recientesDeUsuario(pool, 7, 'commit', 10);
  assert.deepEqual(consulta.params, [7, 'commit', 10]);
  assert.match(consulta.sql, /ds\.user_id\s*=\s*\$1/);
  assert.match(consulta.sql, /e\.event_type\s*=\s*\$2/);
  assert.match(consulta.sql, /ORDER BY e\.id DESC/);
  assert.match(consulta.sql, /LIMIT \$3/);
});

test('estadoDeFuentes pone primero la fuente con la actividad mas reciente', async () => {
  let sql = '';
  const pool = { async query(s) { sql = s; return { rows: [] }; } };
  await dataSources.estadoDeFuentes(pool);
  assert.match(sql, /ORDER BY ultima_actividad DESC NULLS LAST/);
});

// --- Rutas HTTP (app real, repositorios reemplazados por dobles) ---

let server;
let port;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    });
  });
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

function token(id, rol) {
  return jwt.sign({ id, rol }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

function pedir(path, tk) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method: 'GET', path, headers: tk ? { authorization: `Bearer ${tk}` } : {} },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, json: data ? JSON.parse(data) : null }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// Lider 2 con integrantes 10 y 11; gerente 1 con el lider 2.
function dobles(t) {
  const llamadas = [];
  t.mock.method(teams, 'miembrosDeLider', async (_pool, liderId) =>
    liderId === 2 ? [{ id: 10 }, { id: 11 }] : []
  );
  t.mock.method(teams, 'lideresDeGerente', async (_pool, gerenteId) =>
    gerenteId === 1 ? [{ id: 2 }] : []
  );
  t.mock.method(events, 'recientesDeUsuario', async (_pool, userId, tipo, limite) => {
    llamadas.push({ userId, tipo, limite });
    return [{ id: '5', time: '2026-11-10T12:00:00Z', payload: { issue_key: 'RWD-1', issue_type: 'Story', story_points: 3 } }];
  });
  return llamadas;
}

test('el lider ve los registros de un integrante de su equipo', async (t) => {
  const llamadas = dobles(t);
  const r = await pedir('/api/equipo/integrantes/10/registros?tipo=issue_created', token(2, 'lider'));
  assert.equal(r.status, 200);
  assert.deepEqual(llamadas, [{ userId: 10, tipo: 'issue_created', limite: LIMITE_REGISTROS }]);
  assert.equal(r.json.registros[0].datos.issue_key, 'RWD-1');
});

test('el lider recibe 404 por una persona de otro equipo y no se consulta nada', async (t) => {
  const llamadas = dobles(t);
  const r = await pedir('/api/equipo/integrantes/99/registros?tipo=commit', token(2, 'lider'));
  assert.equal(r.status, 404);
  assert.equal(llamadas.length, 0);
});

test('un tipo fuera de la lista responde 400', async (t) => {
  const llamadas = dobles(t);
  const r = await pedir('/api/equipo/integrantes/10/registros?tipo=qos_measurement', token(2, 'lider'));
  assert.equal(r.status, 400);
  const sinTipo = await pedir('/api/equipo/integrantes/10/registros', token(2, 'lider'));
  assert.equal(sinTipo.status, 400);
  assert.equal(llamadas.length, 0);
});

test('el gerente ve los registros de cualquier integrante de su organizacion', async (t) => {
  const llamadas = dobles(t);
  const r = await pedir('/api/organizacion/integrantes/11/registros?tipo=commit', token(1, 'gerente'));
  assert.equal(r.status, 200);
  assert.deepEqual(llamadas, [{ userId: 11, tipo: 'commit', limite: LIMITE_REGISTROS }]);
  const fuera = await pedir('/api/organizacion/integrantes/99/registros?tipo=commit', token(1, 'gerente'));
  assert.equal(fuera.status, 404);
});

test('sin sesion responde 401 y un empleado recibe 403', async (t) => {
  dobles(t);
  assert.equal((await pedir('/api/equipo/integrantes/10/registros?tipo=commit')).status, 401);
  const r = await pedir('/api/organizacion/integrantes/10/registros?tipo=commit', token(10, 'empleado'));
  assert.equal(r.status, 403);
});
