// Pruebas puras del validador de la ingesta generica por contrato.
//   node --test tests/ingestaEvento.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { validarEventoIngesta } = require('../src/utils/validacion');

test('acepta un issue_updated de Jira bien formado', () => {
  const r = validarEventoIngesta({
    identifier: 'SCRUM',
    event_type: 'issue_updated',
    time: '2026-10-20T22:30:00Z',
    payload: { issue_key: 'SCRUM-3', status_from: 'Bloqueado', status_to: 'En curso' },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errores, []);
});

test('acepta sin time (lo pone la base)', () => {
  const r = validarEventoIngesta({
    identifier: 'SCRUM',
    event_type: 'issue_created',
    payload: { issue_key: 'SCRUM-20', issue_type: 'Task', story_points: 5 },
  });
  assert.equal(r.ok, true);
});

test('rechaza identifier vacio', () => {
  const r = validarEventoIngesta({ identifier: '  ', event_type: 'x', payload: {} });
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((e) => e.includes('identifier')));
});

test('rechaza event_type ausente', () => {
  const r = validarEventoIngesta({ identifier: 'SCRUM', payload: {} });
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((e) => e.includes('event_type')));
});

test('rechaza time con formato invalido', () => {
  const r = validarEventoIngesta({
    identifier: 'SCRUM',
    event_type: 'issue_updated',
    time: 'no-es-fecha',
    payload: {},
  });
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((e) => e.includes('time')));
});

test('rechaza payload que no es objeto', () => {
  const r = validarEventoIngesta({ identifier: 'SCRUM', event_type: 'x', payload: 'hola' });
  assert.equal(r.ok, false);
  assert.ok(r.errores.some((e) => e.includes('payload')));
});

test('rechaza payload como arreglo', () => {
  const r = validarEventoIngesta({ identifier: 'SCRUM', event_type: 'x', payload: [1, 2] });
  assert.equal(r.ok, false);
});
