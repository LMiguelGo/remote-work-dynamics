// Pruebas puras de la politica de contrasenas.
//   node --test tests/password.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validarPoliticaClave,
  generarClaveTemporal,
  LONGITUD_MINIMA,
} = require('../src/utils/password');

test('rechaza una clave demasiado corta', () => {
  const r = validarPoliticaClave('corta123');
  assert.equal(r.ok, false);
});

test('rechaza una clave comun', () => {
  const r = validarPoliticaClave('password1234');
  assert.equal(r.ok, false);
});

test('rechaza un solo caracter repetido', () => {
  const r = validarPoliticaClave('aaaaaaaaaaaa');
  assert.equal(r.ok, false);
});

test('acepta una frase larga', () => {
  const r = validarPoliticaClave('camino azul en octubre');
  assert.equal(r.ok, true);
  assert.deepEqual(r.errores, []);
});

test('rechaza algo que no es texto', () => {
  const r = validarPoliticaClave(12345678);
  assert.equal(r.ok, false);
});

test('la clave temporal generada cumple la politica', () => {
  for (let i = 0; i < 20; i += 1) {
    const clave = generarClaveTemporal();
    assert.ok(clave.length >= LONGITUD_MINIMA);
    assert.equal(validarPoliticaClave(clave).ok, true);
  }
});
