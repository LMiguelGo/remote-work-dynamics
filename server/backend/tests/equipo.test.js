const test = require('node:test');
const assert = require('node:assert/strict');

const {
  construirEquipo,
} = require('../src/services/equipo.service');
const {
  construirOrganizacion,
} = require('../src/services/organizacion.service');

// Datos de referencia reutilizados por varios casos.
const LIDER = { id: 2, username: 'lider1', full_name: 'Luis Ibarra' };
const INTEGRANTES = [
  { id: 3, username: 'empleado1', full_name: 'Elena Castro' },
  { id: 4, username: 'empleado2', full_name: 'Esteban Ruiz' },
];

// Filas tal como las entrega analyses.repo.deUsuarios: una fila por metrica,
// con los datos de la dimension repetidos. La dimension S de empleado1 trae
// dos metricas; el resto de dimensiones no tiene filas.
const ANALITICAS_S = [
  {
    user_id: 3,
    dimension: 'S',
    dim_start_date: '2026-10-12',
    dim_end_date: '2026-10-18',
    frequency: 'week',
    normalized_score: 0.72,
    criticality_status: 'optimo',
    metric_name: 'horas_foco',
    raw_value: 28.5,
    normalized_value: 0.76,
    metric_start_date: '2026-10-12',
    metric_end_date: '2026-10-18',
    criticality: 'optimo',
  },
  {
    user_id: 3,
    dimension: 'S',
    dim_start_date: '2026-10-12',
    dim_end_date: '2026-10-18',
    frequency: 'week',
    normalized_score: 0.72,
    criticality_status: 'optimo',
    metric_name: 'interrupciones',
    raw_value: 12,
    normalized_value: 0.68,
    metric_start_date: '2026-10-12',
    metric_end_date: '2026-10-18',
    criticality: 'precaucion',
  },
];

const DIMENSIONES_SPACE = ['S', 'P', 'A', 'C', 'E'];

test('construirEquipo con analiticas vacio: integrantes presentes, dimensiones en null, sin lanzar', () => {
  const r = construirEquipo(LIDER, INTEGRANTES, []);

  assert.equal(r.lider.id, 2);
  assert.equal(r.integrantes.length, 2);

  for (const it of r.integrantes) {
    assert.ok(it.usuario && typeof it.usuario.id === 'number');
    assert.equal(it.dimensiones.length, 5);
    for (const d of it.dimensiones) {
      assert.ok(DIMENSIONES_SPACE.includes(d.dimension));
      assert.equal(d.normalized_score, null);
      assert.equal(d.criticality_status, null);
      assert.equal(d.frequency, null);
      assert.deepEqual(d.metricas, []);
    }
  }

  // Sin analiticas, el agregado del equipo queda en null.
  assert.equal(r.equipo.agregado, null);
});

test('construirEquipo con analiticas de ejemplo: dimension con datos trae score y metricas; las demas en null', () => {
  const r = construirEquipo(LIDER, INTEGRANTES, ANALITICAS_S);

  const emp1 = r.integrantes.find((i) => i.usuario.id === 3);
  assert.ok(emp1);

  // Dimension S: con datos.
  const dimS = emp1.dimensiones.find((d) => d.dimension === 'S');
  assert.equal(dimS.normalized_score, 0.72);
  assert.equal(dimS.criticality_status, 'optimo');
  assert.equal(dimS.frequency, 'week');
  assert.equal(dimS.periodo.start_date, '2026-10-12');
  assert.equal(dimS.periodo.end_date, '2026-10-18');
  assert.equal(dimS.metricas.length, 2);
  const foco = dimS.metricas.find((m) => m.metric_name === 'horas_foco');
  assert.equal(foco.raw_value, 28.5);
  assert.equal(foco.normalized_value, 0.76);
  assert.equal(foco.criticality, 'optimo');

  // Dimension P: sin datos, queda en null.
  const dimP = emp1.dimensiones.find((d) => d.dimension === 'P');
  assert.equal(dimP.normalized_score, null);
  assert.deepEqual(dimP.metricas, []);

  // empleado2 no tiene analitica: todas las dimensiones en null.
  const emp2 = r.integrantes.find((i) => i.usuario.id === 4);
  assert.ok(emp2.dimensiones.every((d) => d.normalized_score === null));
  assert.ok(emp2.dimensiones.every((d) => d.metricas.length === 0));

  // El agregado del equipo existe y trae la dimension S promediada.
  assert.ok(Array.isArray(r.equipo.agregado));
  const aggS = r.equipo.agregado.find((a) => a.dimension === 'S');
  assert.equal(aggS.normalized_score, 0.72);
});

test('construirOrganizacion arma una estructura valida aunque este casi vacia', () => {
  const gerente = { id: 1, username: 'gerente1', full_name: 'Gabriela Mejia' };
  const r = construirOrganizacion(gerente, [], []);
  assert.equal(r.gerente.id, 1);
  assert.deepEqual(r.equipos, []);
});

test('construirOrganizacion arma cada equipo con el mismo resumen por dimension', () => {
  const gerente = { id: 1, username: 'gerente1', full_name: 'Gabriela Mejia' };
  const equipos = [{ lider: LIDER, integrantes: INTEGRANTES }];
  const r = construirOrganizacion(gerente, equipos, ANALITICAS_S);

  assert.equal(r.equipos.length, 1);
  const eq = r.equipos[0];
  assert.equal(eq.lider.id, 2);
  const emp1 = eq.integrantes.find((i) => i.usuario.id === 3);
  const dimS = emp1.dimensiones.find((d) => d.dimension === 'S');
  assert.equal(dimS.normalized_score, 0.72);
  assert.equal(dimS.metricas.length, 2);
});
