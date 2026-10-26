const test = require('node:test');
const assert = require('node:assert/strict');

const { construirPanel } = require('../src/services/panelEmpleado.service');
const { horasEntre } = require('../src/utils/fechas');
const { sePuedeEncuestaSemanal } = require('../src/services/encuestas.service');
const {
  validarEncuestaDiaria,
  validarUmbrales,
} = require('../src/utils/validacion');

// Umbrales de referencia (misma forma que el seed): claves en espanol.
const UMBRALES = {
  temperatura_c: { min: 20, max: 26 },
  humedad_pct: { min: 30, max: 60 },
  ruido_db: { min: 0, max: 55 },
};

test('construirPanel con ambiente normal: estado Normal y sin metricas de productividad', () => {
  const r = construirPanel({
    usuario: { id: 3, rol: 'empleado' },
    profile: { ambient_thresholds: UMBRALES, work_schedule: {}, capture_active: true },
    ambiente: [{ time: '2026-10-20T10:00:00Z', temperature: 23, humidity: 45, noise_level: 40 }],
    conexion: null,
    alertas: [],
    jornada: null,
    encuestaDiariaPendiente: true,
    encuestaSemanalPendiente: false,
  });

  assert.equal(r.ambiente.estado, 'Normal');
  // El backend no calcula productividad: eso es trabajo de la analitica.
  assert.equal(r.metricas, undefined);
  assert.equal(r.productividad, undefined);
  assert.equal(r.score, undefined);
  assert.equal(r.puntaje, undefined);
});

test('construirPanel sin fuente de red: estado sin datos', () => {
  const r = construirPanel({
    usuario: { id: 3, rol: 'empleado' },
    profile: { ambient_thresholds: UMBRALES, work_schedule: {}, capture_active: true },
    ambiente: [{ time: '2026-10-20T10:00:00Z', temperature: 23, humidity: 45, noise_level: 40 }],
    conexion: null,
    alertas: [],
    jornada: null,
    encuestaDiariaPendiente: false,
    encuestaSemanalPendiente: false,
  });

  assert.equal(r.conexion.estado, 'sin datos');
  assert.equal(r.conexion.qos, null);
  assert.equal(r.conexion.interrupcion, null);
});

test('construirPanel con medicion de red: estado con datos y qos tal cual', () => {
  const qos = { latency_ms: 24.5, download_speed_mbps: 95, upload_speed_mbps: 22, packet_loss_percentage: 0, time: '2026-10-18T15:00:00Z' };
  const r = construirPanel({
    usuario: { id: 3, rol: 'empleado' },
    profile: { ambient_thresholds: UMBRALES, work_schedule: {}, capture_active: true },
    ambiente: [],
    conexion: { estado: 'con datos', qos, interrupcion: null },
    alertas: [],
    jornada: null,
    encuestaDiariaPendiente: false,
    encuestaSemanalPendiente: false,
  });

  assert.equal(r.conexion.estado, 'con datos');
  assert.deepEqual(r.conexion.qos, qos);
  assert.equal(r.conexion.interrupcion, null);
});

test('construirPanel expone los dos avisos de encuesta tal cual entran', () => {
  const r = construirPanel({
    usuario: { id: 3, rol: 'empleado' },
    profile: { ambient_thresholds: UMBRALES, work_schedule: {}, capture_active: true },
    ambiente: [],
    conexion: null,
    alertas: [],
    jornada: null,
    encuestaDiariaPendiente: true,
    encuestaSemanalPendiente: true,
  });

  assert.equal(r.encuestaDiariaPendiente, true);
  assert.equal(r.encuestaSemanalPendiente, true);
});

test('horasEntre calcula bien la diferencia en horas', () => {
  assert.equal(horasEntre('2026-10-20T08:00:00Z', '2026-10-20T17:30:00Z'), 9.5);
  assert.equal(horasEntre('2026-10-20T08:00:00Z', '2026-10-20T08:00:00Z'), 0);
});

test('sePuedeEncuestaSemanal: falso en la misma semana ISO, verdadero en semana anterior o sin dato', () => {
  // 2026-10-20 es martes; 2026-10-19 (lunes) es su misma semana ISO.
  assert.equal(sePuedeEncuestaSemanal('2026-10-19T09:00:00Z', '2026-10-20T09:00:00Z'), false);
  // 2026-10-12 es la semana ISO anterior.
  assert.equal(sePuedeEncuestaSemanal('2026-10-12T09:00:00Z', '2026-10-20T09:00:00Z'), true);
  // Sin encuesta previa: se puede.
  assert.equal(sePuedeEncuestaSemanal(null, '2026-10-20T09:00:00Z'), true);
});

test('validarEncuestaDiaria: rechaza un valor en 6, acepta los 4 en rango, rechaza campo faltante', () => {
  const fuera = validarEncuestaDiaria({
    satisfaction_level: 6,
    tools_perception: 3,
    fatigue_level: 3,
    concentration_perception: 3,
  });
  assert.equal(fuera.ok, false);

  const ok = validarEncuestaDiaria({
    satisfaction_level: 5,
    tools_perception: 4,
    fatigue_level: 2,
    concentration_perception: 3,
  });
  assert.equal(ok.ok, true);

  const falta = validarEncuestaDiaria({
    satisfaction_level: 5,
    tools_perception: 4,
    fatigue_level: 2,
  });
  assert.equal(falta.ok, false);
});

test('validarUmbrales: rechaza un numero fuera de rango', () => {
  const malo = validarUmbrales({
    temperatura_c: { min: 20, max: 200 },
    humedad_pct: { min: 30, max: 60 },
    ruido_db: { min: 0, max: 55 },
  });
  assert.equal(malo.ok, false);

  const bueno = validarUmbrales({
    temperatura_c: { min: 20, max: 26 },
    humedad_pct: { min: 30, max: 60 },
    ruido_db: { min: 0, max: 55 },
  });
  assert.equal(bueno.ok, true);
});
