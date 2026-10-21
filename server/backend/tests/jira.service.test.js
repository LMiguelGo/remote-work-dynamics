// Pruebas puras de la traduccion de avisos de Jira Automation al contrato.
//   node --test tests/jira.service.test.js
// El campo de story points se fija ANTES de requerir el servicio, porque
// config/index.js lee process.env una sola vez al cargarse.
process.env.JIRA_STORY_POINTS_FIELD = 'customfield_20000';

const test = require('node:test');
const assert = require('node:assert/strict');

const { jiraAEventos } = require('../src/services/jira.service');

function issue(campos = {}) {
  return {
    key: 'SCRUM-7',
    fields: {
      issuetype: { name: 'Task' },
      created: '2026-10-19T08:00:00.000+0000',
      assignee: { accountId: 'cuenta-asignada' },
      reporter: { accountId: 'cuenta-reportera' },
      customfield_20000: 5,
      ...campos,
    },
  };
}

// --- issue_created ---

test('issue_created genera un evento con clave, tipo y story points', () => {
  const [ev, ...resto] = jiraAEventos({ webhookEvent: 'jira:issue_created', issue: issue() });
  assert.equal(resto.length, 0);
  assert.equal(ev.accountId, 'cuenta-asignada');
  assert.equal(ev.eventType, 'issue_created');
  assert.equal(ev.time, '2026-10-19T08:00:00.000Z');
  assert.deepEqual(ev.payload, { issue_key: 'SCRUM-7', issue_type: 'Task', story_points: 5 });
});

test('lee los story points del campo configurado en JIRA_STORY_POINTS_FIELD', () => {
  const [ev] = jiraAEventos({
    webhookEvent: 'jira:issue_created',
    // customfield_10016 (el valor por defecto) se ignora porque el campo es otro.
    issue: issue({ customfield_20000: 8, customfield_10016: 99 }),
  });
  assert.equal(ev.payload.story_points, 8);
});

test('story points vacios, ausentes o no numericos quedan en null', () => {
  for (const valor of ['', null, undefined, 'no-es-numero']) {
    const [ev] = jiraAEventos({
      webhookEvent: 'jira:issue_created',
      issue: issue({ customfield_20000: valor }),
    });
    assert.equal(ev.payload.story_points, null, `valor: ${String(valor)}`);
  }
});

test('story points como texto numerico se convierten a numero', () => {
  const [ev] = jiraAEventos({
    webhookEvent: 'jira:issue_created',
    issue: issue({ customfield_20000: '3' }),
  });
  assert.equal(ev.payload.story_points, 3);
});

test('una fecha created invalida deja time en null', () => {
  const [ev] = jiraAEventos({
    webhookEvent: 'jira:issue_created',
    issue: issue({ created: 'ayer por la tarde' }),
  });
  assert.equal(ev.time, null);
});

test('un created en null deja time en null (no 1970)', () => {
  const [ev] = jiraAEventos({
    webhookEvent: 'jira:issue_created',
    issue: issue({ created: null }),
  });
  assert.equal(ev.time, null);
});

test('sin asignado usa el reportero como accountId', () => {
  const [ev] = jiraAEventos({
    webhookEvent: 'jira:issue_created',
    issue: issue({ assignee: null }),
  });
  assert.equal(ev.accountId, 'cuenta-reportera');
});

// --- issue_updated ---

function cambioDeEstado(desde = 'En curso', hacia = 'Hecho') {
  return { items: [{ field: 'status', fromString: desde, toString: hacia }] };
}

test('issue_updated con cambio de estado genera el evento con los estados', () => {
  const [ev] = jiraAEventos({
    webhookEvent: 'jira:issue_updated',
    issue: issue({ resolutiondate: '2026-10-19T14:30:00.000+0000' }),
    changelog: cambioDeEstado('En curso', 'Hecho'),
  });
  assert.equal(ev.eventType, 'issue_updated');
  assert.equal(ev.accountId, 'cuenta-asignada');
  assert.equal(ev.payload.issue_key, 'SCRUM-7');
  assert.equal(ev.payload.status_from, 'En curso');
  assert.equal(ev.payload.status_to, 'Hecho');
  assert.equal(ev.payload.story_points, 5);
});

test('calcula las horas de resolucion entre created y resolutiondate', () => {
  const [ev] = jiraAEventos({
    webhookEvent: 'jira:issue_updated',
    issue: issue({ resolutiondate: '2026-10-19T14:30:00.000+0000' }),
    changelog: cambioDeEstado(),
  });
  assert.equal(ev.payload.resolution_time_hours, 6.5);
});

test('sin resolutiondate las horas de resolucion quedan en null', () => {
  const [ev] = jiraAEventos({
    webhookEvent: 'jira:issue_updated',
    issue: issue({ resolutiondate: null }),
    changelog: cambioDeEstado(),
  });
  assert.equal(ev.payload.resolution_time_hours, null);
});

test('blocked_time_hours queda en null (Jira no lo entrega)', () => {
  const [ev] = jiraAEventos({
    webhookEvent: 'jira:issue_updated',
    issue: issue(),
    changelog: cambioDeEstado(),
  });
  assert.equal(ev.payload.blocked_time_hours, null);
});

test('issue_updated sin cambio de estado no genera eventos', () => {
  const sinEstado = { items: [{ field: 'summary', fromString: 'a', toString: 'b' }] };
  assert.deepEqual(
    jiraAEventos({ webhookEvent: 'jira:issue_updated', issue: issue(), changelog: sinEstado }),
    []
  );
  assert.deepEqual(jiraAEventos({ webhookEvent: 'jira:issue_updated', issue: issue() }), []);
});

// --- casos que no deben generar eventos ---

test('un aviso sin issue no genera eventos', () => {
  assert.deepEqual(jiraAEventos({}), []);
  assert.deepEqual(jiraAEventos(undefined), []);
});

test('un webhookEvent no soportado no genera eventos', () => {
  assert.deepEqual(jiraAEventos({ webhookEvent: 'jira:issue_deleted', issue: issue() }), []);
});
