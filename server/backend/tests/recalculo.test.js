// Pruebas de la configuracion del recalculo de la analitica desde el panel del administrador. No usan base de datos:
// el cliente de analitica se reemplaza por dobles.
//   node --test tests/recalculo.test.js
process.env.JWT_SECRET = 'secreto_de_prueba_recalculo';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');

const analitica = require('../src/services/analitica.client');
const app = require('../src/app');

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

function pedir(method, path, tk, cuerpo) {
  return new Promise((resolve, reject) => {
    const datos = cuerpo === undefined ? null : JSON.stringify(cuerpo);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        headers: {
          ...(tk ? { authorization: `Bearer ${tk}` } : {}),
          ...(datos ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(datos) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, json: data ? JSON.parse(data) : null }));
      }
    );
    req.on('error', reject);
    if (datos) req.write(datos);
    req.end();
  });
}

const ESTADO = { intervalo_minutos: 1440, minimo: 1, maximo: 1440, modo: 'diario' };

test('el administrador ve la configuracion vigente', async (t) => {
  t.mock.method(analitica, 'verRecalculo', async () => ESTADO);
  const r = await pedir('GET', '/api/admin/analitica/recalculo', token(1, 'admin'));
  assert.equal(r.status, 200);
  assert.equal(r.json.intervalo_minutos, 1440);
});

test('el administrador cambia el intervalo a 1 minuto y se reenvia a analitica', async (t) => {
  const enviados = [];
  t.mock.method(analitica, 'cambiarRecalculo', async (m) => {
    enviados.push(m);
    return { ...ESTADO, intervalo_minutos: m, modo: 'periodico' };
  });
  const r = await pedir('PUT', '/api/admin/analitica/recalculo', token(1, 'admin'), { intervalo_minutos: 1 });
  assert.equal(r.status, 200);
  assert.equal(r.json.modo, 'periodico');
  assert.deepEqual(enviados, [1]);
});

test('valores fuera de 1 a 1440 o no enteros se rechazan sin llamar a analitica', async (t) => {
  const llamada = t.mock.method(analitica, 'cambiarRecalculo', async () => ESTADO);
  for (const malo of [0, 1441, 2.5, '30', null]) {
    const r = await pedir('PUT', '/api/admin/analitica/recalculo', token(1, 'admin'), { intervalo_minutos: malo });
    assert.equal(r.status, 400, String(malo));
  }
  assert.equal(llamada.mock.callCount(), 0);
});

test('solo el administrador puede verla o cambiarla', async (t) => {
  t.mock.method(analitica, 'verRecalculo', async () => ESTADO);
  assert.equal((await pedir('GET', '/api/admin/analitica/recalculo')).status, 401);
  for (const rol of ['lider', 'gerente', 'empleado']) {
    assert.equal((await pedir('GET', '/api/admin/analitica/recalculo', token(2, rol))).status, 403, rol);
    assert.equal(
      (await pedir('PUT', '/api/admin/analitica/recalculo', token(2, rol), { intervalo_minutos: 5 })).status,
      403,
      rol
    );
  }
});

test('si analitica no responde se informa con 503', async (t) => {
  t.mock.method(analitica, 'verRecalculo', async () => {
    throw new Error('sin conexion');
  });
  const r = await pedir('GET', '/api/admin/analitica/recalculo', token(1, 'admin'));
  assert.equal(r.status, 503);
});
