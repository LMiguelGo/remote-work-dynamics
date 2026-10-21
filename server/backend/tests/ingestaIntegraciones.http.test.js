// Prueba de extremo a extremo (HTTP real) de las rutas de GitHub y Jira.
//   node --test tests/ingestaIntegraciones.http.test.js
// No usa base de datos: levanta la app real en un puerto efimero y reemplaza los
// repositorios (data_sources y events) por dobles. Verifica toda la cadena:
// autenticacion -> traduccion -> busqueda de la fuente -> guardado del evento.
// Tambien comprueba que las rutas de main (/esp32 y la generica) siguen en pie.

// Entorno ANTES de requerir la app: config/index.js lee process.env una sola vez.
process.env.GITHUB_WEBHOOK_SECRET = 'secreto_de_prueba_github';
process.env.INGEST_TOKEN = 'token_de_prueba_123';
process.env.JIRA_STORY_POINTS_FIELD = 'customfield_10016';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');

const app = require('../src/app');
const dataSources = require('../src/repositories/dataSources.repo');
const events = require('../src/repositories/events.repo');

let server;
let port;
let insertados;

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

// Antes de cada prueba: dobles limpios. Por defecto la fuente existe (id 42).
test.beforeEach((t) => {
  insertados = [];
  t.mock.method(dataSources, 'buscarPorIdentifierYTipo', async (_pool, identifier, tipo) => ({
    id: 42,
    identifier,
    source_type: tipo,
  }));
  t.mock.method(dataSources, 'buscarPorIdentifier', async (_pool, identifier) => ({
    id: 99,
    identifier,
  }));
  t.mock.method(events, 'insertar', async (_pool, datos) => {
    insertados.push(datos);
    return { id: insertados.length, ...datos };
  });
});

function pedir({ path, headers = {}, body }) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method: 'POST', path, headers },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch (e) {
            // la respuesta no era JSON
          }
          resolve({ statusCode: res.statusCode, json, texto: data });
        });
      }
    );
    req.on('error', reject);
    req.end(body);
  });
}

function firmar(cuerpo) {
  return 'sha256=' + crypto.createHmac('sha256', 'secreto_de_prueba_github').update(cuerpo).digest('hex');
}

function pedirGithub(evento, objeto, { firma, cuerpoEnviado } = {}) {
  const cuerpo = JSON.stringify(objeto);
  return pedir({
    path: '/api/ingesta/github',
    headers: {
      'content-type': 'application/json',
      'x-github-event': evento,
      'x-hub-signature-256': firma === undefined ? firmar(cuerpo) : firma,
    },
    body: cuerpoEnviado === undefined ? cuerpo : cuerpoEnviado,
  });
}

function pedirJira(objeto, { token = 'token_de_prueba_123', contentType = 'application/json' } = {}) {
  const headers = { 'content-type': contentType };
  if (token) headers['x-ingest-token'] = token;
  return pedir({ path: '/api/ingesta/jira', headers, body: JSON.stringify(objeto) });
}

const PUSH = {
  sender: { login: 'quien-hizo-push' },
  commits: [
    { id: 'abcdef1234567', message: 'feat: a', timestamp: '2026-10-20T09:00:00Z', author: { username: 'BriyithNarvaez04' } },
    { id: '7654321fedcba', message: 'fix: b', timestamp: '2026-10-20T09:05:00Z', author: { username: 'BriyithNarvaez04' } },
  ],
};

const JIRA_CREADA = {
  webhookEvent: 'jira:issue_created',
  issue: {
    key: 'SCRUM-7',
    fields: {
      issuetype: { name: 'Task' },
      created: '2026-10-19T08:00:00.000+0000',
      assignee: { accountId: '712020:cuenta' },
      customfield_10016: 3,
    },
  },
};

// --- GitHub ---

test('GitHub: sin firma responde 401 y no guarda nada', async () => {
  const r = await pedirGithub('push', PUSH, { firma: null });
  assert.equal(r.statusCode, 401);
  assert.equal(insertados.length, 0);
});

test('GitHub: firma incorrecta responde 401 y no guarda nada', async () => {
  const r = await pedirGithub('push', PUSH, { firma: 'sha256=' + '0'.repeat(64) });
  assert.equal(r.statusCode, 401);
  assert.equal(insertados.length, 0);
});

test('GitHub: cuerpo alterado despues de firmar responde 401', async () => {
  const firma = firmar(JSON.stringify(PUSH));
  const alterado = JSON.stringify({ ...PUSH, sender: { login: 'otro' } });
  const r = await pedirGithub('push', PUSH, { firma, cuerpoEnviado: alterado });
  assert.equal(r.statusCode, 401);
  assert.equal(insertados.length, 0);
});

test('GitHub: push firmado con 2 commits guarda 2 eventos en la fuente correcta', async (t) => {
  const r = await pedirGithub('push', PUSH);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json, { ok: true, guardados: 2 });
  assert.equal(insertados.length, 2);
  assert.equal(insertados[0].sourceId, 42);
  assert.equal(insertados[0].eventType, 'commit');
  assert.equal(insertados[0].payload.commit_hash, 'abcdef1');
  assert.equal(insertados[0].time, '2026-10-20T09:00:00Z');

  // La fuente se busca por login y por tipo 'github'.
  const llamadas = dataSources.buscarPorIdentifierYTipo.mock.calls;
  assert.equal(llamadas.length, 2);
  assert.equal(llamadas[0].arguments[1], 'BriyithNarvaez04');
  assert.equal(llamadas[0].arguments[2], 'github');
});

test('GitHub: si el login no tiene data_source el aviso se ignora con 200', async (t) => {
  t.mock.method(console, 'warn', () => {});
  dataSources.buscarPorIdentifierYTipo.mock.mockImplementation(async () => null);
  const r = await pedirGithub('push', PUSH);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json, { ok: true, guardados: 0 });
  assert.equal(insertados.length, 0);
});

test('GitHub: el evento ping de configuracion responde 200 sin guardar', async () => {
  const r = await pedirGithub('ping', { zen: 'hola' });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json, { ok: true, guardados: 0 });
  assert.equal(insertados.length, 0);
});

test('GitHub: pull_request merged firmado guarda un evento pull_request', async () => {
  const cuerpo = {
    action: 'closed',
    pull_request: {
      number: 5,
      user: { login: 'BriyithNarvaez04' },
      updated_at: '2026-10-20T15:00:00Z',
      additions: 10,
      deletions: 2,
      changed_files: 1,
      merged: true,
    },
  };
  const r = await pedirGithub('pull_request', cuerpo);
  assert.equal(r.statusCode, 200);
  assert.equal(r.json.guardados, 1);
  assert.equal(insertados[0].eventType, 'pull_request');
  assert.equal(insertados[0].payload.action, 'merged');
});

// --- Jira ---

test('Jira: sin token responde 401 y no guarda nada', async () => {
  const r = await pedirJira(JIRA_CREADA, { token: null });
  assert.equal(r.statusCode, 401);
  assert.equal(insertados.length, 0);
});

test('Jira: token incorrecto responde 401', async () => {
  const r = await pedirJira(JIRA_CREADA, { token: 'token_malo' });
  assert.equal(r.statusCode, 401);
  assert.equal(insertados.length, 0);
});

test('Jira: Content-Type que no es JSON responde 415', async () => {
  const r = await pedirJira(JIRA_CREADA, { contentType: 'text/plain' });
  assert.equal(r.statusCode, 415);
  assert.equal(insertados.length, 0);
});

test('Jira: issue_created guarda un evento buscando la fuente por accountId y tipo jira', async () => {
  const r = await pedirJira(JIRA_CREADA);
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json, { ok: true, guardados: 1 });
  assert.equal(insertados[0].sourceId, 42);
  assert.equal(insertados[0].eventType, 'issue_created');
  assert.deepEqual(insertados[0].payload, { issue_key: 'SCRUM-7', issue_type: 'Task', story_points: 3 });

  const llamada = dataSources.buscarPorIdentifierYTipo.mock.calls[0];
  assert.equal(llamada.arguments[1], '712020:cuenta');
  assert.equal(llamada.arguments[2], 'jira');
});

test('Jira: un aviso sin issue responde 200 sin guardar', async () => {
  const r = await pedirJira({ webhookEvent: 'jira:issue_created' });
  assert.equal(r.statusCode, 200);
  assert.deepEqual(r.json, { ok: true, guardados: 0 });
  assert.equal(insertados.length, 0);
});

// --- Las rutas de main siguen funcionando junto a las nuevas ---

test('main: POST /api/ingesta (contrato generico) sigue guardando eventos', async () => {
  const r = await pedir({
    path: '/api/ingesta',
    headers: { 'content-type': 'application/json', 'x-ingest-token': 'token_de_prueba_123' },
    body: JSON.stringify({
      identifier: 'SCRUM',
      event_type: 'issue_updated',
      payload: { issue_key: 'SCRUM-3', status_from: 'Bloqueado', status_to: 'En curso' },
    }),
  });
  assert.equal(r.statusCode, 200);
  assert.equal(insertados.length, 1);
  assert.equal(insertados[0].sourceId, 99);
  assert.equal(insertados[0].eventType, 'issue_updated');
});

test('main: POST /api/ingesta/esp32 sigue exigiendo token', async () => {
  const r = await pedir({
    path: '/api/ingesta/esp32',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(r.statusCode, 401);
});
