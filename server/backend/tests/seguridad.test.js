// Prueba autonoma y determinista del endurecimiento de seguridad (Tarea 8B).
// No usa base de datos ni supertest: monta una mini app express con helmet() y
// un limitador de cuota baja, la levanta en un puerto efimero (app.listen(0)) y
// hace peticiones reales con el modulo http nativo.

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const helmet = require('helmet');
const { crearLimitador } = require('../src/middlewares/rateLimit.middleware');

// Hace una peticion HTTP real y resuelve con { statusCode, headers, body }.
function pedir({ port, method = 'GET', path = '/' }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Levanta la mini app en un puerto efimero y devuelve { server, port }.
function levantar(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function cerrar(server) {
  return new Promise((resolve) => server.close(resolve));
}

test('helmet fija cabeceras de seguridad y quita X-Powered-By', async () => {
  const app = express();
  app.use(helmet());
  app.get('/', (req, res) => res.json({ ok: true }));

  const { server, port } = await levantar(app);
  try {
    const r = await pedir({ port, path: '/' });
    assert.equal(r.statusCode, 200);
    // (a) helmet presente: nosniff y x-dns-prefetch-control; ya no expone express.
    assert.equal(r.headers['x-content-type-options'], 'nosniff');
    assert.ok('x-dns-prefetch-control' in r.headers);
    assert.equal(r.headers['x-powered-by'], undefined);
  } finally {
    await cerrar(server);
  }
});

test('el limitador responde 429 al pasar la cuota', async () => {
  const app = express();
  const limitador = crearLimitador({
    windowMs: 60 * 1000,
    max: 2,
    mensaje: 'demasiadas peticiones',
  });
  app.get('/', limitador, (req, res) => res.json({ ok: true }));

  const { server, port } = await levantar(app);
  try {
    const r1 = await pedir({ port, path: '/' });
    const r2 = await pedir({ port, path: '/' });
    const r3 = await pedir({ port, path: '/' });

    // (b) las dos primeras dentro de cuota, la tercera la rechaza con 429.
    assert.equal(r1.statusCode, 200);
    assert.equal(r2.statusCode, 200);
    assert.equal(r3.statusCode, 429);

    // Cabeceras estandar de RateLimit presentes (standardHeaders: true).
    assert.ok('ratelimit-limit' in r3.headers);
    const cuerpo = JSON.parse(r3.body);
    assert.ok(cuerpo.error || cuerpo.mensaje);
  } finally {
    await cerrar(server);
  }
});
