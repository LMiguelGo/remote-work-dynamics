// Pruebas del middleware que valida la firma HMAC de los webhooks de GitHub.
//   node --test tests/githubFirma.middleware.test.js
// El secreto se fija ANTES de requerir el middleware: config/index.js lee
// process.env una sola vez al cargarse.
process.env.GITHUB_WEBHOOK_SECRET = 'secreto_de_prueba_github';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { exigeFirmaGithub } = require('../src/middlewares/githubFirma.middleware');

function firmar(cuerpo, secreto = 'secreto_de_prueba_github') {
  return 'sha256=' + crypto.createHmac('sha256', secreto).update(cuerpo).digest('hex');
}

// res falso minimo: captura status y json; encadenable como Express.
function resFalso() {
  const estado = { statusCode: null, body: null };
  const res = {
    status(code) {
      estado.statusCode = code;
      return res;
    },
    json(payload) {
      estado.body = payload;
      return res;
    },
  };
  return { res, estado };
}

function ejecutar(req) {
  const { res, estado } = resFalso();
  let llamoNext = false;
  exigeFirmaGithub(req, res, () => {
    llamoNext = true;
  });
  return { estado, llamoNext };
}

test('sin cabecera de firma responde 401 y no llama next', () => {
  const { estado, llamoNext } = ejecutar({ headers: {}, rawBody: Buffer.from('{}') });
  assert.equal(estado.statusCode, 401);
  assert.equal(estado.body.error, 'Firma ausente');
  assert.equal(llamoNext, false);
});

test('con firma pero sin rawBody responde 401 (p. ej. Content-Type que no es JSON)', () => {
  const { estado, llamoNext } = ejecutar({
    headers: { 'x-hub-signature-256': firmar('{}') },
  });
  assert.equal(estado.statusCode, 401);
  assert.equal(estado.body.error, 'Firma ausente');
  assert.equal(llamoNext, false);
});

test('firma calculada con otro secreto responde 401', () => {
  const cuerpo = Buffer.from('{"a":1}');
  const { estado, llamoNext } = ejecutar({
    headers: { 'x-hub-signature-256': firmar(cuerpo, 'otro_secreto') },
    rawBody: cuerpo,
  });
  assert.equal(estado.statusCode, 401);
  assert.equal(estado.body.error, 'Firma invalida');
  assert.equal(llamoNext, false);
});

test('firma de longitud distinta responde 401 sin lanzar excepcion', () => {
  const { estado, llamoNext } = ejecutar({
    headers: { 'x-hub-signature-256': 'sha256=corta' },
    rawBody: Buffer.from('{"a":1}'),
  });
  assert.equal(estado.statusCode, 401);
  assert.equal(llamoNext, false);
});

test('firma valida pero de otro cuerpo (cuerpo alterado) responde 401', () => {
  const { estado, llamoNext } = ejecutar({
    headers: { 'x-hub-signature-256': firmar('{"monto":1}') },
    rawBody: Buffer.from('{"monto":999}'),
  });
  assert.equal(estado.statusCode, 401);
  assert.equal(llamoNext, false);
});

test('firma correcta llama next y no responde', () => {
  const cuerpo = Buffer.from('{"ref":"refs/heads/main"}');
  const { estado, llamoNext } = ejecutar({
    headers: { 'x-hub-signature-256': firmar(cuerpo) },
    rawBody: cuerpo,
  });
  assert.equal(llamoNext, true);
  assert.equal(estado.statusCode, null);
});
