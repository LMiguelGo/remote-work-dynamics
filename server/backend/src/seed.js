// Genera los datos sinteticos. Reemplaza los anteriores, asi que se puede repetir.

const { db, inicializarEsquema } = require('./db');
const { PERIODO, HORAS_PACTADAS, UMBRALES_DEFECTO } = require('./config');
const { evaluarLectura } = require('./alertas');

// Semilla fija para que la demo salga siempre igual.
function rng(semilla) {
  let a = semilla >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20260918);
const enteroEntre = (min, max) => Math.floor(rand() * (max - min + 1)) + min;
const ts = () => `${PERIODO}-${String(enteroEntre(1, 28)).padStart(2, '0')}T${String(enteroEntre(8, 18)).padStart(2, '0')}:00:00`;
const dia = (d) => `${PERIODO}-${String(d).padStart(2, '0')}T09:00:00`;
const clamp15 = (v) => Math.max(1, Math.min(5, v));
// Jornada del dia d que empieza a las 08:00 y dura las horas indicadas. Devuelve marcas naturales.
const jornadaDia = (d, horas) => {
  const finMin = 8 * 60 + Math.round(horas * 60);
  const hh = String(Math.floor(finMin / 60)).padStart(2, '0');
  const mm = String(finMin % 60).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return { inicio: `${PERIODO}-${dd}T08:00:00`, fin: `${PERIODO}-${dd}T${hh}:${mm}:00` };
};

inicializarEsquema();

for (const t of ['alertas', 'dispositivos', 'config_monitoreo', 'umbrales', 'encuestas_diarias', 'jornadas', 'pesos', 'contexto', 'revisiones_pr', 'despliegues', 'eventos', 'usuarios', 'clientes']) {
  db.prepare(`DELETE FROM ${t}`).run();
}

db.prepare('INSERT INTO clientes (id, nombre) VALUES (?, ?)').run(1, 'Cliente Norte');
db.prepare('INSERT INTO clientes (id, nombre) VALUES (?, ?)').run(2, 'Cliente Sur');

// Pesos por cliente y rol. Cada combinacion suma 1.
const PESOS = {
  1: {
    empleado: { S: 0.1, P: 0.2, A: 0.3, C: 0.15, E: 0.25 },
    lider: { S: 0.25, P: 0.2, A: 0.15, C: 0.3, E: 0.1 },
    gerente: { S: 0.25, P: 0.3, A: 0.15, C: 0.2, E: 0.1 },
  },
  2: {
    empleado: { S: 0.15, P: 0.25, A: 0.2, C: 0.25, E: 0.15 },
    lider: { S: 0.2, P: 0.25, A: 0.15, C: 0.3, E: 0.1 },
    gerente: { S: 0.2, P: 0.35, A: 0.15, C: 0.2, E: 0.1 },
  },
};
const insPeso = db.prepare('INSERT INTO pesos (cliente_id, rol, dimension, peso) VALUES (?, ?, ?, ?)');
for (const cid of [1, 2])
  for (const rol of Object.keys(PESOS[cid]))
    for (const [dim, peso] of Object.entries(PESOS[cid][rol])) insPeso.run(Number(cid), rol, dim, peso);

const insUsuario = db.prepare(
  'INSERT INTO usuarios (id, nombre, rol, arquetipo, lider_id, cliente_id, clave_demo, captura_activa, horas_pactadas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
insUsuario.run(1, 'Patricia Ruiz', 'gerente', null, null, 1, 'demo123', 1, HORAS_PACTADAS);
insUsuario.run(2, 'Andres Lopez', 'lider', null, 1, 1, 'demo123', 1, HORAS_PACTADAS);
insUsuario.run(3, 'Marcela Diaz', 'lider', null, 1, 2, 'demo123', 1, HORAS_PACTADAS);

// Cada perfil dispara un comportamiento distinto en el motor de puntaje.
const empleados = [
  { id: 4, nombre: 'Juan Perez', arq: 'backend', lider: 2, cli: 1, perfil: 'solido' },
  { id: 5, nombre: 'Sofia Ramirez', arq: 'analista', lider: 2, cli: 1, perfil: 'colaborador' },
  { id: 6, nombre: 'Diego Torres', arq: 'frontend', lider: 2, cli: 1, perfil: 'commits_inflados' },
  { id: 7, nombre: 'Laura Gomez', arq: 'qa', lider: 2, cli: 1, perfil: 'autoaprobacion_y_conexion' },
  { id: 8, nombre: 'Camilo Vargas', arq: 'backend', lider: 3, cli: 2, perfil: 'desajuste_rol' },
  { id: 9, nombre: 'Valentina Rojas', arq: 'analista', lider: 3, cli: 2, perfil: 'solido' },
  { id: 10, nombre: 'Mateo Castro', arq: 'frontend', lider: 3, cli: 2, perfil: 'promedio' },
];
for (const e of empleados) insUsuario.run(e.id, e.nombre, 'empleado', e.arq, e.lider, e.cli, 'demo123', 1, HORAS_PACTADAS);

const insEvento = db.prepare('INSERT INTO eventos (usuario_id, fuente, tipo, ref, ts, meta) VALUES (?, ?, ?, ?, ?, ?)');
const insDesp = db.prepare('INSERT INTO despliegues (usuario_id, commit_ref, ok, ts) VALUES (?, ?, ?, ?)');
const insPR = db.prepare('INSERT INTO revisiones_pr (pr_ref, autor_id, revisor_id, aprobado, comentarios, ts) VALUES (?, ?, ?, ?, ?, ?)');
const insCtx = db.prepare('INSERT INTO contexto (usuario_id, tipo, metrica, valor, ts) VALUES (?, ?, ?, ?, ?)');
const insJornada = db.prepare('INSERT INTO jornadas (usuario_id, inicio, fin) VALUES (?, ?, ?)');
const insEnc = db.prepare('INSERT INTO encuestas_diarias (usuario_id, fecha, enps, fatiga, flujo, ts) VALUES (?, ?, ?, ?, ?, ?)');
const insUmbral = db.prepare('INSERT INTO umbrales (usuario_id, metrica, minimo, maximo) VALUES (?, ?, ?, ?)');

// Cada perfil trae ademas su patron de jornada (horasDia) y su animo tipico en la microencuesta.
const PARAMS = {
  solido: { commits: 22, despliegaP: 0.9, tickets: 14, lead: 20, revisiones: 12, horasDia: 8.0, animo: { enps: 5, flujo: 4, fatiga: 2 } },
  colaborador: { commits: 12, despliegaP: 0.85, tickets: 10, lead: 30, revisiones: 20, horasDia: 8.2, animo: { enps: 4, flujo: 4, fatiga: 2 } },
  commits_inflados: { commits: 30, despliegaP: 0.25, tickets: 6, lead: 55, revisiones: 4, horasDia: 10.5, animo: { enps: 3, flujo: 3, fatiga: 4 } },
  autoaprobacion_y_conexion: { commits: 14, despliegaP: 0.8, tickets: 9, lead: 40, revisiones: 6, horasDia: 9.2, animo: { enps: 3, flujo: 3, fatiga: 3 } },
  desajuste_rol: { commits: 6, despliegaP: 0.8, tickets: 5, lead: 35, revisiones: 22, horasDia: 8.1, animo: { enps: 4, flujo: 4, fatiga: 3 } },
  promedio: { commits: 12, despliegaP: 0.7, tickets: 8, lead: 45, revisiones: 8, horasDia: 8.3, animo: { enps: 3, flujo: 4, fatiga: 3 } },
};

// Umbrales de arranque para cada empleado (los mismos por defecto que luego pueden ajustar).
for (const e of empleados)
  for (const [metrica, def] of Object.entries(UMBRALES_DEFECTO)) insUmbral.run(e.id, metrica, def.minimo, def.maximo);

const otrosDelEquipo = (e) => empleados.filter((o) => o.lider === e.lider && o.id !== e.id);

for (const e of empleados) {
  const p = PARAMS[e.perfil];

  for (let i = 0; i < p.commits; i++) {
    const ref = `c-${e.id}-${i}`;
    insEvento.run(e.id, 'github', 'commit', ref, ts(), JSON.stringify({ lineas: enteroEntre(5, 200) }));
    if (rand() < p.despliegaP) insDesp.run(e.id, ref, 1, ts());
  }

  for (let i = 0; i < p.tickets; i++) {
    const reabierto = rand() < 0.08;
    insEvento.run(
      e.id,
      'jira',
      'ticket',
      `t-${e.id}-${i}`,
      ts(),
      JSON.stringify({
        estado: 'done',
        story_points: enteroEntre(1, 8),
        lead_time_h: Math.max(4, Math.round(p.lead + (rand() * 30 - 15))),
        reabierto,
      })
    );
  }

  const companeros = otrosDelEquipo(e);
  for (let i = 0; i < p.revisiones; i++) {
    const autor = companeros[enteroEntre(0, companeros.length - 1)];
    insPR.run(`pr-${e.id}-${i}`, autor.id, e.id, 1, enteroEntre(0, 5), ts());
  }

  const baseTemp = 22 + rand() * 2;
  const connBase = e.perfil === 'autoaprobacion_y_conexion' ? 46 : 88;
  for (let k = 0; k < 8; k++) {
    const d = 3 + k * 3;

    // Jornada del dia. La duracion frente a la pactada da el tiempo extralaboral, que es contexto.
    const j = jornadaDia(d, p.horasDia + (rand() * 0.4 - 0.2));
    insJornada.run(e.id, j.inicio, j.fin);

    // Microencuesta del dia. Sus tres items alimentan la dimension S.
    const enps = clamp15(p.animo.enps + enteroEntre(-1, 1));
    const flujo = clamp15(p.animo.flujo + enteroEntre(-1, 1));
    const fatiga = clamp15(p.animo.fatiga + enteroEntre(-1, 1));
    insEnc.run(e.id, `${PERIODO}-${String(d).padStart(2, '0')}`, enps, fatiga, flujo, dia(d));

    const temp = Math.round((baseTemp + Math.sin(k / 2) * 0.8 + (rand() - 0.5)) * 10) / 10;
    const conn = Math.max(20, Math.min(100, Math.round(connBase + (rand() * 8 - 4))));
    insCtx.run(e.id, 'ambiente', 'temperatura', temp, dia(d));
    insCtx.run(e.id, 'conexion', 'calidad_conexion', conn, dia(d));
    // La alerta no se pone a mano: cada lectura se evalua contra el umbral del empleado.
    evaluarLectura(db, e.id, 'temperatura', temp);
    evaluarLectura(db, e.id, 'calidad_conexion', conn);
  }
  insCtx.run(e.id, 'ambiente', 'humedad', Math.round(50 + rand() * 15), dia(24));
  insCtx.run(e.id, 'ambiente', 'presion', Math.round(1008 + rand() * 12), dia(24));
}

// Laura intenta aprobar su propio PR. Su conexion degradada dispara sola la alerta de umbral.
insPR.run('pr-7-self', 7, 7, 1, 0, ts());

// El ESP32 del tablero Wokwi queda asociado a Juan Perez. El suscriptor MQTT escribira sus
// lecturas por este mapa. Arranca sin ultima_lectura hasta que llegue el primer mensaje real.
db.prepare('INSERT INTO dispositivos (dispositivo, usuario_id, descripcion, ultima_lectura) VALUES (?, ?, ?, ?)').run(
  'ESP32_Wokwi',
  4,
  'Sensor ambiental ESP32 (DHT22 + ruido)',
  null
);

const total = db.prepare('SELECT COUNT(*) n FROM usuarios').get().n;
const ev = db.prepare('SELECT COUNT(*) n FROM eventos').get().n;
console.log(`Datos sinteticos listos: ${total} usuarios, ${ev} eventos, periodo ${PERIODO}.`);
console.log('Usuarios para entrar (clave demo123):');
for (const u of db.prepare('SELECT nombre, rol FROM usuarios ORDER BY id').all()) {
  console.log(`  - ${u.nombre} (${u.rol})`);
}
