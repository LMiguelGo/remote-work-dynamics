// Seed de provision inicial del sistema: catalogos (roles y team_roles), la
// estructura de equipos y las cuentas iniciales de la organizacion. NO siembra
// telemetria ni analitica: en produccion esos datos llegan de las fuentes reales
// y, para las pruebas con datos sinteticos, los produce load_data.py de analitica.
// Idempotente: trunca y vuelve a insertar en una transaccion.
// Se ejecuta DENTRO del contenedor backend, que alcanza la base como database:5432.
//   npm run seed   (o)   node scripts/seed.js

const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { pool, query } = require('../src/db/pool');
const { generarClaveTemporal } = require('../src/utils/password');

// Cuentas iniciales de la organizacion: un administrador del sistema, un gerente,
// un lider y dos empleados (la estructura minima para operar). Cada una se crea con
// una clave temporal aleatoria y cambio obligatorio en el primer ingreso
// (must_change_password en true), la postura de produccion. Las claves NO se
// imprimen ni van al repo: se escriben en un archivo local ignorado por git
// (.seed-credenciales.txt) para que el operador las entregue una sola vez por un
// canal privado; cada persona la cambia al ingresar.
const USUARIOS_INICIALES = [
  { username: 'admin1',    full_name: 'Administrador del sistema', rol: 'admin' },
  { username: 'gerente1',  full_name: 'Gabriela Mejia',           rol: 'gerente' },
  { username: 'lider1',    full_name: 'Luis Ibarra',              rol: 'lider' },
  { username: 'empleado1', full_name: 'Elena Castro',             rol: 'empleado' },
  { username: 'empleado2', full_name: 'Esteban Ruiz',             rol: 'empleado' },
];

const ARCHIVO_CREDENCIALES = path.join(__dirname, '..', '.seed-credenciales.txt');

// Tablas a vaciar antes de insertar. RESTART IDENTITY reinicia los seriales
// y CASCADE arrastra las dependientes (events, alerts) para dejar todo limpio.
const TABLAS = [
  'roles',
  'team_roles',
  'teams',
  'users',
  'employee_profiles',
  'data_sources',
  'events',
  'alerts',
  'dimension_analyses',
  'metric_analyses',
];

async function sembrar() {
  await query('BEGIN');
  try {
    await query(`TRUNCATE ${TABLAS.join(', ')} RESTART IDENTITY CASCADE;`);

    // 1. roles base del sistema. admin es el administrador del sistema: crea las
    //    cuentas y asigna roles, distinto del gerente, que es direccion de negocio.
    const roles = await query(
      `INSERT INTO roles (name, description) VALUES
         ($1, $2), ($3, $4), ($5, $6), ($7, $8)
       RETURNING id, name;`,
      [
        'admin', 'Administrador del sistema. Crea cuentas y asigna roles.',
        'gerente', 'Direccion general. Ve el tablero de lideres.',
        'lider', 'Lidera un equipo de empleados y ve su analitica.',
        'empleado', 'Persona monitoreada por las fuentes de datos.',
      ],
    );
    const rolId = Object.fromEntries(roles.rows.map((r) => [r.name, r.id]));

    // 2. team_roles con pesos SPACE que suman 1 por especialidad.
    // Las dimensiones son S (satisfaccion/bienestar), P (performance/rendimiento),
    // A (actividad), C (comunicacion/colaboracion) y E (eficiencia/flujo).
    // El reparto refleja el enfasis de cada perfil:
    //   backend    -> mas peso a rendimiento y eficiencia (trabajo de implementacion).
    //   frontend   -> mas peso a actividad y comunicacion (iteracion visible y revision).
    //   arquitecto -> mas peso a comunicacion y satisfaccion (coordinacion y vision).
    //   analitica  -> mas peso a rendimiento y actividad (produccion de datos y modelos).
    const teamRoles = await query(
      `INSERT INTO team_roles (name, description, weights) VALUES
         ($1, $2, $3),
         ($4, $5, $6),
         ($7, $8, $9),
         ($10, $11, $12)
       RETURNING id, name;`,
      [
        'backend', 'Desarrollo de servicios y datos.',
        JSON.stringify({ S: 0.15, P: 0.30, A: 0.20, C: 0.15, E: 0.20 }),
        'frontend', 'Desarrollo de interfaces.',
        JSON.stringify({ S: 0.15, P: 0.20, A: 0.25, C: 0.25, E: 0.15 }),
        'arquitecto', 'Diseno de la solucion y guia tecnica.',
        JSON.stringify({ S: 0.25, P: 0.15, A: 0.15, C: 0.30, E: 0.15 }),
        'analitica', 'Modelado y analisis de metricas.',
        JSON.stringify({ S: 0.15, P: 0.30, A: 0.25, C: 0.15, E: 0.15 }),
      ],
    );
    const teamRoleId = Object.fromEntries(teamRoles.rows.map((r) => [r.name, r.id]));

    // 3. users con team_id en NULL por ahora (la FK circular se resuelve despues).
    //    Cada usuario con su clave temporal aleatoria y su hash bcrypt, y con
    //    must_change_password en true: debe cambiarla en el primer ingreso.
    const credenciales = [];
    const filasUsuarios = [];
    for (const u of USUARIOS_INICIALES) {
      const clave = generarClaveTemporal();
      const passwordHash = await bcrypt.hash(clave, 10);
      const r = await query(
        `INSERT INTO users (username, password_hash, full_name, role_id, team_id, must_change_password)
         VALUES ($1, $2, $3, $4, NULL, true)
         RETURNING id, username;`,
        [u.username, passwordHash, u.full_name, rolId[u.rol]],
      );
      filasUsuarios.push(r.rows[0]);
      credenciales.push({ username: u.username, rol: u.rol, clave });
    }
    const userId = Object.fromEntries(filasUsuarios.map((u) => [u.username, u.id]));

    // 4. teams con leader_id en NULL por ahora. En el equipo de lideres el "lider"
    // es el gerente, segun el modelo de dos niveles.
    const teams = await query(
      `INSERT INTO teams (name, description, team_type, leader_id) VALUES
         ($1, $2, 'empleados', NULL),
         ($3, $4, 'lideres', NULL)
       RETURNING id, team_type;`,
      [
        'Equipo de Empleados', 'Personas monitoreadas por el prototipo.',
        'Equipo de Lideres', 'Capa de direccion que agrupa a los lideres.',
      ],
    );
    const teamId = Object.fromEntries(teams.rows.map((t) => [t.team_type, t.id]));

    // 5. asignar team_id a los usuarios. Modelo de dos niveles:
    //    - los empleados son miembros del equipo de empleados.
    //    - los lideres son miembros del equipo de lideres (no del de empleados).
    //    - el gerente tambien pertenece al equipo de lideres, que encabeza.
    //    Cada equipo de empleados tiene como lider a uno de esos miembros del
    //    equipo de lideres (se fija en el paso 6).
    await query('UPDATE users SET team_id = $1 WHERE id = ANY($2::int[]);', [
      teamId.empleados,
      [userId.empleado1, userId.empleado2],
    ]);
    await query('UPDATE users SET team_id = $1 WHERE id = ANY($2::int[]);', [
      teamId.lideres,
      [userId.lider1, userId.gerente1],
    ]);

    // 6. asignar leader_id a los equipos. El lider encabeza el equipo de empleados;
    //    el gerente encabeza el equipo de lideres.
    await query('UPDATE teams SET leader_id = $1 WHERE id = $2;', [
      userId.lider1,
      teamId.empleados,
    ]);
    await query('UPDATE teams SET leader_id = $1 WHERE id = $2;', [
      userId.gerente1,
      teamId.lideres,
    ]);

    // 7. employee_profiles de los dos empleados (backend y frontend).
    const jornada = {
      zona_horaria: 'America/Bogota',
      hora_inicio: '08:00',
      hora_fin: '17:00',
      descansos: [
        { nombre: 'almuerzo', inicio: '12:00', fin: '13:00' },
        { nombre: 'pausa_activa', inicio: '15:30', fin: '15:45' },
      ],
    };
    const umbrales = {
      temperatura_c: { min: 20, max: 26 },
      humedad_pct: { min: 30, max: 60 },
      ruido_db: { min: 0, max: 55 },
    };
    await query(
      `INSERT INTO employee_profiles
         (user_id, team_role_id, work_schedule, ambient_thresholds, capture_active) VALUES
         ($1, $2, $3, $4, true),
         ($5, $6, $7, $8, true);`,
      [
        userId.empleado1, teamRoleId.backend, JSON.stringify(jornada), JSON.stringify(umbrales),
        userId.empleado2, teamRoleId.frontend, JSON.stringify(jornada), JSON.stringify(umbrales),
      ],
    );

    // 8. data_sources: por cada empleado una fuente esp32 y una web_app.
    await query(
      `INSERT INTO data_sources (user_id, source_type, identifier, description, is_active) VALUES
         ($1, 'esp32',   $2, 'Sensor ambiental del puesto.', true),
         ($1, 'web_app', $3, 'Actividad en la aplicacion web.', true),
         ($4, 'esp32',   $5, 'Sensor ambiental del puesto.', true),
         ($4, 'web_app', $6, 'Actividad en la aplicacion web.', true);`,
      [
        userId.empleado1, 'esp32_empleado1', 'web_app_empleado1',
        userId.empleado2, 'esp32_empleado2', 'web_app_empleado2',
      ],
    );

    // 8b. fuente 'network' por empleado (la alimenta la sonda de red via ingesta).
    await query(
      `INSERT INTO data_sources (user_id, source_type, identifier, description, is_active) VALUES
         ($1, 'network', $2, 'Sonda de red del puesto (QoS e interrupciones).', true),
         ($3, 'network', $4, 'Sonda de red del puesto (QoS e interrupciones).', true);`,
      [
        userId.empleado1, 'network_empleado1',
        userId.empleado2, 'network_empleado2',
      ],
    );

    // 8d. fuente 'jira' a nivel de proyecto para la ingesta del conector de Karol.
    // identifier = 'SCRUM' (la clave del proyecto en Jira). Los eventos de Jira son
    // del proyecto, no de una persona, pero data_sources exige user_id; se ancla
    // PROVISIONAL al gerente (no se mide por SPACE) mientras Martin y Karol deciden
    // como mapear el responsable de cada incidencia a un user_id.
    await query(
      `INSERT INTO data_sources (user_id, source_type, identifier, description, is_active) VALUES
         ($1, 'jira', $2, 'Proyecto Jira SCRUM (incidencias e historias). Fuente a nivel de proyecto.', true);`,
      [userId.gerente1, 'SCRUM'],
    );

    // 8e. fuentes por persona de empleado1: github (identifier = login) y jira
    // (identifier = accountId completo). Las usan /api/ingesta/github y /ingesta/jira.
    await query(
      `INSERT INTO data_sources (user_id, source_type, identifier, description, is_active) VALUES
         ($1, 'github', $2, 'Cuenta GitHub.', true),
         ($1, 'jira',   $3, 'Cuenta Jira.', true);`,
      [userId.empleado1, 'BriyithNarvaez04', '712020:8437f9f2-9c48-4ebc-83ff-eb44cb5a597a']
    );

    // La analitica (dimension_analyses y metric_analyses) y los eventos de
    // telemetria NO se siembran a mano: en produccion llegan de las fuentes reales
    // y, para las pruebas con datos sinteticos, los produce load_data.py de
    // analitica, que carga los eventos y corre el reprocesado del etl.

    await query('COMMIT');

    // Resumen de conteos (sin imprimir la clave).
    const conteos = await query(
      `SELECT
         (SELECT count(*) FROM roles)              AS roles,
         (SELECT count(*) FROM team_roles)         AS team_roles,
         (SELECT count(*) FROM teams)              AS teams,
         (SELECT count(*) FROM users)              AS users,
         (SELECT count(*) FROM employee_profiles)  AS employee_profiles,
         (SELECT count(*) FROM data_sources)       AS data_sources,
         (SELECT count(*) FROM events)             AS events,
         (SELECT count(*) FROM dimension_analyses) AS dimension_analyses,
         (SELECT count(*) FROM metric_analyses)    AS metric_analyses;`,
    );

    // Claves temporales a un archivo local ignorado por git. Nunca a consola ni al
    // repo. El operador las entrega una sola vez por un canal privado; cada persona
    // la cambia en el primer ingreso (must_change_password en true).
    const lineas = [
      '# Claves temporales de la provision inicial. Generadas por el seed. NO subir al repositorio.',
      '# Cada clave es distinta por usuario y se debe cambiar en el primer ingreso. Regeneradas en cada corrida del seed.',
      '',
      ...credenciales.map((c) => `${c.username} (${c.rol}): ${c.clave}`),
      '',
    ];
    fs.writeFileSync(ARCHIVO_CREDENCIALES, lineas.join('\n'), { encoding: 'utf8' });

    const usernames = filasUsuarios.map((u) => u.username);
    console.log('Seed completado. Usuarios creados:', usernames.join(', '));
    console.log('Credenciales escritas en:', ARCHIVO_CREDENCIALES);
    console.log('Conteos:', conteos.rows[0]);
  } catch (err) {
    await query('ROLLBACK');
    throw err;
  }
}

sembrar()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error('Fallo el seed:', err.message);
    await pool.end();
    process.exit(1);
  });
