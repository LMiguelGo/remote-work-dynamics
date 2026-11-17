// Pruebas del dia de referencia del detalle de analitica. No usan base de datos.
//   node --test tests/analitica.service.test.js
// Caso real (2026-11-17, produccion): el panel tomaba el ultimo dia con al menos dos dimensiones y ocultaba lo posterior.
// Cuando solo llegaba "dias sin commits" (A), los cierres se guardaban cada noche pero el detalle seguia en el 16 de
// octubre, como si la analitica no se actualizara.
const test = require('node:test');
const assert = require('node:assert/strict');

const { construirAnalitica, diaDeReferencia } = require('../src/services/analitica.service');

const CATALOGO = {
  version: 'prueba',
  dimensiones: { S: 'Satisfacción', A: 'Actividad' },
  metricas: [
    { metric_name: 'enps', dimension: 'S', frecuencia: 'diaria', nombre: 'Ánimo' },
    { metric_name: 'dias_sin_commits', dimension: 'A', frecuencia: 'diaria', nombre: 'Días sin commits' },
  ],
};

const dia = (dimension, fecha, score = 7) => ({
  dimension,
  frequency: 'day',
  start_date: fecha,
  end_date: fecha,
  normalized_score: score,
  criticality_status: 'precaucion',
});

const metrica = (metric_name, fecha, raw = 1) => ({
  metric_name,
  start_date: fecha,
  end_date: fecha,
  raw_value: raw,
  normalized_value: 5,
  criticality: 'precaucion',
});

test('el dia de referencia es el ultimo calculado, aunque solo tenga una dimension', () => {
  const filas = [dia('S', '2026-10-16'), dia('A', '2026-10-16'), dia('A', '2026-11-16')];
  assert.equal(diaDeReferencia(filas), '2026-11-16');
  assert.equal(diaDeReferencia([]), null);
});

test('una dimension sin dato el ultimo dia conserva su ultimo valor con su fecha', () => {
  const r = construirAnalitica({
    usuario: { id: 4 },
    catalogo: CATALOGO,
    dimensiones: [dia('S', '2026-11-10', 5.6), dia('A', '2026-11-10'), dia('A', '2026-11-16', 9)],
    metricas: [metrica('enps', '2026-11-10'), metrica('dias_sin_commits', '2026-11-10'), metrica('dias_sin_commits', '2026-11-16', 3)],
    correlaciones: null,
  });
  assert.equal(r.referencia, '2026-11-16');
  const S = r.dimensiones.find((d) => d.dimension === 'S');
  const A = r.dimensiones.find((d) => d.dimension === 'A');
  // S no tuvo dato el 16: su ultimo punto es el del 10, que el panel muestra como "Sin datos desde el 10".
  assert.equal(S.diaria.ultimo.start_date, '2026-11-10');
  assert.equal(S.diaria.ultimo.normalized_score, 5.6);
  // A si avanza hasta el 16, y su metrica tambien.
  assert.equal(A.diaria.ultimo.start_date, '2026-11-16');
  const dsc = A.metricas.find((m) => m.metric_name === 'dias_sin_commits');
  assert.equal(dsc.ultimo.start_date, '2026-11-16');
  assert.equal(dsc.historial.length, 2);
});

test('una serie sin datos desde hace un mes conserva sus ultimas muestras', () => {
  // Como Elena en produccion: S tiene datos hasta el 16 de octubre y A sigue hasta el 16 de noviembre. Antes la ventana
  // eran los ultimos 30 dias de calendario y S quedaba vacia; ahora entrega sus ultimas muestras y la grafica comprime el
  // mes sin datos.
  const r = construirAnalitica({
    usuario: { id: 4 },
    catalogo: CATALOGO,
    dimensiones: [dia('S', '2026-10-15'), dia('S', '2026-10-16'), dia('A', '2026-10-16'), dia('A', '2026-11-16')],
    metricas: [metrica('enps', '2026-10-15', 3), metrica('enps', '2026-10-16', 4)],
    correlaciones: null,
  });
  assert.equal(r.referencia, '2026-11-16');
  const S = r.dimensiones.find((d) => d.dimension === 'S');
  assert.equal(S.diaria.ultimo.start_date, '2026-10-16');
  assert.equal(S.diaria.historial.length, 2);
  const enps = S.metricas.find((m) => m.metric_name === 'enps');
  assert.deepEqual(enps.historial.map((p) => p.start_date), ['2026-10-15', '2026-10-16']);
});

test('cada serie entrega como maximo sus ultimas `dias` muestras', () => {
  const fechas = Array.from({ length: 40 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`).slice(0, 30)
    .concat(Array.from({ length: 10 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`));
  const r = construirAnalitica({
    usuario: { id: 4 },
    catalogo: CATALOGO,
    dimensiones: fechas.map((f) => dia('A', f)),
    metricas: fechas.map((f) => metrica('dias_sin_commits', f)),
    correlaciones: null,
    dias: 30,
  });
  const A = r.dimensiones.find((d) => d.dimension === 'A');
  assert.equal(A.diaria.historial.length, 30);
  assert.equal(A.diaria.historial[0].start_date, '2026-09-11');
  assert.equal(A.metricas.find((m) => m.metric_name === 'dias_sin_commits').historial.length, 30);
});
