const test = require('node:test');
const assert = require('node:assert/strict');

const { lecturaAEvento, procesarLectura } = require('../src/services/ingest.service');
const { validarLecturaIngesta } = require('../src/utils/validacion');

// lecturaAEvento es PURA: traduce el crudo del firmware ESP32 al contrato
// data_guide. Renombra llaves y convierte ruido_raw (0-4095) a dB.
test('lecturaAEvento traduce el crudo del ESP32 a ambiental_reading', () => {
  const datos = { dispositivo: 'esp32_empleado1', temperatura: 23.5, humedad: 45, ruido_raw: 1200 };
  const r = lecturaAEvento(datos);

  assert.equal(r.eventType, 'ambiental_reading');
  assert.equal(r.payload.temperature, 23.5);
  assert.equal(r.payload.humidity, 45);
  // ruido_raw 1200 -> 30 + (1200/4095)*60 = 47.58... -> redondeo a 1 decimal.
  assert.equal(r.payload.noise_level, 47.6);
  // Las llaves crudas no deben filtrarse al payload traducido.
  assert.equal('temperatura' in r.payload, false);
  assert.equal('ruido_raw' in r.payload, false);
});

test('lecturaAEvento mapea los extremos del ruido_raw a 30 y 90 dB', () => {
  assert.equal(lecturaAEvento({ ruido_raw: 0 }).payload.noise_level, 30);
  assert.equal(lecturaAEvento({ ruido_raw: 4095 }).payload.noise_level, 90);
});

test('procesarLectura con dispositivo sin data_source no inserta ni lanza', async () => {
  let inserto = false;
  const deps = {
    buscarFuentePorIdentifier: async () => null, // no existe la fuente
    insertar: async () => {
      inserto = true;
    },
  };
  const datos = { dispositivo: 'esp32_desconocido', temperatura: 22, humedad: 50, ruido_raw: 1000 };

  await assert.doesNotReject(procesarLectura(deps, datos));
  assert.equal(inserto, false);
});

test('procesarLectura con fuente existente inserta el evento traducido', async () => {
  const inserciones = [];
  const deps = {
    buscarFuentePorIdentifier: async (identifier) => ({ id: 7, identifier }),
    insertar: async (evento) => {
      inserciones.push(evento);
    },
  };
  const datos = { dispositivo: 'esp32_empleado1', temperatura: 23.5, humedad: 45, ruido_raw: 1200 };

  await procesarLectura(deps, datos);

  assert.equal(inserciones.length, 1);
  assert.equal(inserciones[0].sourceId, 7);
  assert.equal(inserciones[0].eventType, 'ambiental_reading');
  assert.equal(inserciones[0].payload.temperature, 23.5);
  assert.equal(inserciones[0].payload.noise_level, 47.6);
});

test('procesarLectura descarta sin lanzar una lectura mal formada', async () => {
  let inserto = false;
  const deps = {
    buscarFuentePorIdentifier: async (identifier) => ({ id: 7, identifier }),
    insertar: async () => {
      inserto = true;
    },
  };
  // temperatura no numerica: la lectura es invalida.
  const datos = { dispositivo: 'esp32_empleado1', temperatura: 'x', humedad: 45, ruido_raw: 1200 };

  await assert.doesNotReject(procesarLectura(deps, datos));
  assert.equal(inserto, false);
});

test('validarLecturaIngesta con dispositivo faltante da ok:false', () => {
  const r = validarLecturaIngesta({ temperatura: 23.5, humedad: 45, ruido_raw: 1200 });
  assert.equal(r.ok, false);
  assert.ok(r.errores.length > 0);
});

test('validarLecturaIngesta exige temperatura/humedad/ruido_raw numericos', () => {
  const malo = validarLecturaIngesta({ dispositivo: 'esp32_empleado1', temperatura: '23', humedad: 45, ruido_raw: 1200 });
  assert.equal(malo.ok, false);

  const bueno = validarLecturaIngesta({ dispositivo: 'esp32_empleado1', temperatura: 23.5, humedad: 45, ruido_raw: 1200 });
  assert.equal(bueno.ok, true);
  assert.deepEqual(bueno.errores, []);
});
