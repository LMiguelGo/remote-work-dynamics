const test = require('node:test');
const assert = require('node:assert/strict');

const {
  construirEstadoDispositivos,
  construirConectividad,
} = require('../src/services/operacion.service');

// "ahora" fijo para que la clasificacion sea determinista.
const AHORA = new Date('2026-10-20T12:00:00.000Z');

// Filas tal como las entrega dataSources.repo.estadoDeFuentes: una por fuente,
// con el dueno y la ultima actividad (MAX(events.time)) o null si nunca hubo.
const FUENTES = [
  {
    id: 1,
    source_type: 'esp32',
    identifier: 'esp32_empleado1',
    username: 'empleado1',
    full_name: 'Elena Castro',
    ultima_actividad: '2026-10-20T11:59:00.000Z', // hace 1 min -> en vivo
  },
  {
    id: 2,
    source_type: 'web_app',
    identifier: 'web_app_empleado1',
    username: 'empleado1',
    full_name: 'Elena Castro',
    ultima_actividad: '2026-10-19T08:00:00.000Z', // hace ~28 h -> con historial
  },
  {
    id: 3,
    source_type: 'network',
    identifier: 'network_empleado2',
    username: 'empleado2',
    full_name: 'Esteban Ruiz',
    ultima_actividad: null, // nunca hubo -> sin datos
  },
];

test('construirEstadoDispositivos clasifica en vivo / con historial / sin datos', () => {
  const r = construirEstadoDispositivos(FUENTES, AHORA, 120);

  assert.equal(r.dispositivos.length, 3);
  assert.equal(r.umbral_en_vivo_segundos, 120);
  assert.equal(r.generado_en, AHORA.toISOString());

  const d1 = r.dispositivos.find((d) => d.id === 1);
  assert.equal(d1.estado, 'en vivo');
  assert.equal(d1.source_type, 'esp32');
  assert.equal(d1.identifier, 'esp32_empleado1');
  assert.equal(d1.dueno.username, 'empleado1');
  assert.equal(d1.dueno.full_name, 'Elena Castro');
  assert.equal(d1.ultima_actividad, '2026-10-20T11:59:00.000Z');

  const d2 = r.dispositivos.find((d) => d.id === 2);
  assert.equal(d2.estado, 'con historial');

  const d3 = r.dispositivos.find((d) => d.id === 3);
  assert.equal(d3.estado, 'sin datos');
  assert.equal(d3.ultima_actividad, null);
});

test('construirEstadoDispositivos trata el limite del umbral como en vivo', () => {
  const fuentes = [
    {
      id: 9,
      source_type: 'network',
      identifier: 'network_empleado1',
      username: 'empleado1',
      full_name: 'Elena Castro',
      ultima_actividad: '2026-10-20T11:58:00.000Z', // exactamente 120 s
    },
  ];
  const r = construirEstadoDispositivos(fuentes, AHORA, 120);
  assert.equal(r.dispositivos[0].estado, 'en vivo');
});

test('construirEstadoDispositivos sin fuentes devuelve lista vacia sin lanzar', () => {
  const r = construirEstadoDispositivos([], AHORA, 120);
  assert.deepEqual(r.dispositivos, []);
});

// Filas tal como las entrega events.repo.ultimaRedPorFuente: una por fuente
// network, con el ultimo interruption y el ultimo qos_measurement (o null).
const EVENTOS_RED = [
  {
    source_id: 10,
    identifier: 'network_empleado1',
    username: 'empleado1',
    full_name: 'Elena Castro',
    interruption_time: '2026-10-20T11:50:00.000Z',
    interruption_payload: { interruption_duration_seconds: 45, interruption_count: 1 },
    qos_time: '2026-10-20T11:55:00.000Z',
    qos_payload: {
      latency_ms: 24.5,
      download_speed_mbps: 95.0,
      upload_speed_mbps: 22.0,
      packet_loss_percentage: 0.0,
    },
  },
  {
    source_id: 11,
    identifier: 'network_empleado2',
    username: 'empleado2',
    full_name: 'Esteban Ruiz',
    interruption_time: null,
    interruption_payload: null,
    qos_time: null,
    qos_payload: null,
  },
];

test('construirConectividad arma el ultimo QoS y la ultima interrupcion de una fuente', () => {
  const r = construirConectividad(EVENTOS_RED);

  assert.equal(r.fuentes.length, 2);

  const f1 = r.fuentes.find((f) => f.id === 10);
  assert.equal(f1.estado, 'con datos');
  assert.equal(f1.identifier, 'network_empleado1');
  assert.equal(f1.dueno.username, 'empleado1');

  assert.equal(f1.qos.latency_ms, 24.5);
  assert.equal(f1.qos.download_speed_mbps, 95.0);
  assert.equal(f1.qos.upload_speed_mbps, 22.0);
  assert.equal(f1.qos.packet_loss_percentage, 0.0);
  assert.equal(f1.qos.time, '2026-10-20T11:55:00.000Z');

  assert.equal(f1.interrupcion.interruption_duration_seconds, 45);
  assert.equal(f1.interrupcion.interruption_count, 1);
  assert.equal(f1.interrupcion.time, '2026-10-20T11:50:00.000Z');
});

test('construirConectividad marca sin datos la fuente network sin eventos', () => {
  const r = construirConectividad(EVENTOS_RED);
  const f2 = r.fuentes.find((f) => f.id === 11);
  assert.equal(f2.estado, 'sin datos');
  assert.equal(f2.qos, null);
  assert.equal(f2.interrupcion, null);
  assert.equal(f2.dueno.username, 'empleado2');
});

test('construirConectividad sin fuentes devuelve lista vacia sin lanzar', () => {
  const r = construirConectividad([]);
  assert.deepEqual(r.fuentes, []);
});
