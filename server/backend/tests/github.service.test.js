// Pruebas puras de la traduccion de avisos de GitHub al contrato de eventos.
//   node --test tests/github.service.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

const { githubAEventos } = require('../src/services/github.service');

function prBody(action, extra = {}) {
  return {
    action,
    pull_request: {
      number: 12,
      user: { login: 'BriyithNarvaez04' },
      updated_at: '2026-10-20T15:00:00Z',
      additions: 40,
      deletions: 8,
      changed_files: 3,
      merged: false,
      ...extra,
    },
  };
}

// --- pull_request ---

test('pull_request opened genera un evento pull_request', () => {
  const [ev, ...resto] = githubAEventos('pull_request', prBody('opened'));
  assert.equal(resto.length, 0);
  assert.equal(ev.login, 'BriyithNarvaez04');
  assert.equal(ev.eventType, 'pull_request');
  assert.equal(ev.time, '2026-10-20T15:00:00Z');
  assert.deepEqual(ev.payload, {
    pr_number: 12,
    action: 'opened',
    lines_added: 40,
    lines_deleted: 8,
    files_changed: 3,
  });
});

test('pull_request closed con merged=true se reporta como merged', () => {
  const [ev] = githubAEventos('pull_request', prBody('closed', { merged: true }));
  assert.equal(ev.payload.action, 'merged');
});

test('pull_request closed sin merge se reporta como closed', () => {
  const [ev] = githubAEventos('pull_request', prBody('closed'));
  assert.equal(ev.payload.action, 'closed');
});

test('pull_request con accion no soportada (synchronize) no genera eventos', () => {
  assert.deepEqual(githubAEventos('pull_request', prBody('synchronize')), []);
});

// --- pull_request_review ---

function reviewBody(action = 'submitted') {
  return {
    action,
    review: { user: { login: 'revisora' }, submitted_at: '2026-10-20T10:30:00Z' },
    pull_request: {
      number: 12,
      created_at: '2026-10-20T10:00:00Z',
      review_comments: 4,
    },
  };
}

test('review submitted calcula los minutos de respuesta desde la creacion del PR', () => {
  const [ev] = githubAEventos('pull_request_review', reviewBody());
  assert.equal(ev.login, 'revisora');
  assert.equal(ev.eventType, 'pull_request_review');
  assert.equal(ev.time, '2026-10-20T10:30:00Z');
  assert.equal(ev.payload.pr_number, 12);
  assert.equal(ev.payload.review_responsiveness_minutes, 30);
  assert.equal(ev.payload.pr_comment_density, 4);
});

test('review submitted deja is_first_attempt_approved en null (pendiente)', () => {
  const [ev] = githubAEventos('pull_request_review', reviewBody());
  assert.equal(ev.payload.is_first_attempt_approved, null);
});

test('review con accion distinta de submitted no genera eventos', () => {
  assert.deepEqual(githubAEventos('pull_request_review', reviewBody('edited')), []);
});

// --- push (commits) ---

function pushBody(commits, sender = { login: 'quien-hizo-push' }) {
  return { commits, sender };
}

test('push con dos commits genera dos eventos commit', () => {
  const evs = githubAEventos(
    'push',
    pushBody([
      {
        id: 'abcdef1234567890',
        message: 'feat(api): agrega ingesta',
        timestamp: '2026-10-20T09:00:00Z',
        author: { username: 'BriyithNarvaez04' },
      },
      {
        id: '1234567abcdef890',
        message: 'arreglo rapido sin prefijo',
        timestamp: '2026-10-20T09:05:00Z',
        author: { username: 'BriyithNarvaez04' },
      },
    ])
  );
  assert.equal(evs.length, 2);
  assert.equal(evs[0].eventType, 'commit');
  assert.equal(evs[0].login, 'BriyithNarvaez04');
  assert.equal(evs[0].time, '2026-10-20T09:00:00Z');
  assert.equal(evs[0].payload.commit_hash, 'abcdef1');
  assert.equal(evs[0].payload.conventional_commit_prefix, 'feat');
  assert.equal(evs[1].payload.commit_hash, '1234567');
});

test('un commit sin prefijo convencional deja el prefijo en null', () => {
  const [ev] = githubAEventos(
    'push',
    pushBody([
      { id: 'aaaaaaa1111', message: 'arreglo rapido', timestamp: 't', author: { username: 'u' } },
    ])
  );
  assert.equal(ev.payload.conventional_commit_prefix, null);
});

test('reconoce prefijos con alcance y con signo de ruptura (fix(x)!:)', () => {
  const [ev] = githubAEventos(
    'push',
    pushBody([
      { id: 'bbbbbbb2222', message: 'fix(auth)!: cambia la firma', timestamp: 't', author: { username: 'u' } },
    ])
  );
  assert.equal(ev.payload.conventional_commit_prefix, 'fix');
});

test('lines_added y lines_deleted quedan en null: el push no las trae', () => {
  const [ev] = githubAEventos(
    'push',
    pushBody([{ id: 'ccccccc3333', message: 'chore: x', timestamp: 't', author: { username: 'u' } }])
  );
  assert.equal(ev.payload.lines_added, null);
  assert.equal(ev.payload.lines_deleted, null);
});

test('si el commit no trae author.username usa el login de quien hizo el push', () => {
  const [ev] = githubAEventos(
    'push',
    pushBody(
      [{ id: 'ddddddd4444', message: 'docs: x', timestamp: 't', author: {} }],
      { login: 'quien-hizo-push' }
    )
  );
  assert.equal(ev.login, 'quien-hizo-push');
});

test('push sin commits (p. ej. borrar una rama) no genera eventos', () => {
  assert.deepEqual(githubAEventos('push', { sender: { login: 'x' } }), []);
  assert.deepEqual(githubAEventos('push', pushBody([])), []);
});

// --- otros ---

test('un tipo de aviso no soportado (ping) no genera eventos', () => {
  assert.deepEqual(githubAEventos('ping', { zen: 'hola' }), []);
});
