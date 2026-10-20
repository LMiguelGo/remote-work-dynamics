// El token de ingesta se fija por entorno ANTES de requerir config/middleware,
// porque config/index.js lee process.env una sola vez al cargarse.
process.env.INGEST_TOKEN = 'token_de_prueba_123';

const test = require('node:test');
const assert = require('node:assert/strict');

const { exigeTokenIngesta } = require('../src/middlewares/ingesta.middleware');

// res falso minimo: captura el status y el json; encadenable como Express.
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

test('exigeTokenIngesta sin header responde 401 y no llama next', () => {
  const req = { headers: {} };
  const { res, estado } = resFalso();
  let llamoNext = false;

  exigeTokenIngesta(req, res, () => {
    llamoNext = true;
  });

  assert.equal(estado.statusCode, 401);
  assert.equal(llamoNext, false);
});

test('exigeTokenIngesta con token correcto en X-Ingest-Token llama next', () => {
  const req = { headers: { 'x-ingest-token': 'token_de_prueba_123' } };
  const { res, estado } = resFalso();
  let llamoNext = false;

  exigeTokenIngesta(req, res, () => {
    llamoNext = true;
  });

  assert.equal(llamoNext, true);
  assert.equal(estado.statusCode, null);
});

test('exigeTokenIngesta acepta el token por Authorization: Bearer', () => {
  const req = { headers: { authorization: 'Bearer token_de_prueba_123' } };
  const { res, estado } = resFalso();
  let llamoNext = false;

  exigeTokenIngesta(req, res, () => {
    llamoNext = true;
  });

  assert.equal(llamoNext, true);
  assert.equal(estado.statusCode, null);
});

test('exigeTokenIngesta con token incorrecto responde 401 y no llama next', () => {
  const req = { headers: { 'x-ingest-token': 'equivocado' } };
  const { res, estado } = resFalso();
  let llamoNext = false;

  exigeTokenIngesta(req, res, () => {
    llamoNext = true;
  });

  assert.equal(estado.statusCode, 401);
  assert.equal(llamoNext, false);
});

test('exigeTokenIngesta con longitud distinta no lanza y responde 401', () => {
  const req = { headers: { 'x-ingest-token': 'x' } };
  const { res, estado } = resFalso();
  let llamoNext = false;

  assert.doesNotThrow(() => {
    exigeTokenIngesta(req, res, () => {
      llamoNext = true;
    });
  });

  assert.equal(estado.statusCode, 401);
  assert.equal(llamoNext, false);
});
