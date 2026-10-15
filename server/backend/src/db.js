const path = require('path');
const fs = require('fs');
// node:sqlite necesita el flag --experimental-sqlite en Node 22, que ya va en los scripts.
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'prototipo.sqlite');
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

function inicializarEsquema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clientes (
      id            INTEGER PRIMARY KEY,
      nombre        TEXT NOT NULL
    );

    -- Un empleado apunta a su lider y un lider apunta a su gerente (columna lider_id).
    CREATE TABLE IF NOT EXISTS usuarios (
      id            INTEGER PRIMARY KEY,
      nombre        TEXT NOT NULL,
      rol           TEXT NOT NULL CHECK (rol IN ('empleado','lider','gerente')),
      arquetipo     TEXT,
      lider_id      INTEGER REFERENCES usuarios(id),
      cliente_id    INTEGER REFERENCES clientes(id),
      clave_demo    TEXT NOT NULL,
      captura_activa INTEGER NOT NULL DEFAULT 1,
      horas_pactadas REAL NOT NULL DEFAULT 8
    );

    -- Jornada laboral. El empleado abre una fila al iniciar y le pone fin al cerrar.
    CREATE TABLE IF NOT EXISTS jornadas (
      id            INTEGER PRIMARY KEY,
      usuario_id    INTEGER NOT NULL REFERENCES usuarios(id),
      inicio        TEXT NOT NULL,
      fin           TEXT
    );

    -- Microencuesta al cerrar la jornada. Alimenta la dimension S del marco SPACE.
    CREATE TABLE IF NOT EXISTS encuestas_diarias (
      id            INTEGER PRIMARY KEY,
      usuario_id    INTEGER NOT NULL REFERENCES usuarios(id),
      fecha         TEXT NOT NULL,
      enps          INTEGER NOT NULL,
      fatiga        INTEGER NOT NULL,
      flujo         INTEGER NOT NULL,
      ts            TEXT NOT NULL
    );

    -- Umbrales ambientales que define el propio empleado. Disparan las alertas.
    CREATE TABLE IF NOT EXISTS umbrales (
      usuario_id    INTEGER NOT NULL REFERENCES usuarios(id),
      metrica       TEXT NOT NULL,
      minimo        REAL,
      maximo        REAL,
      PRIMARY KEY (usuario_id, metrica)
    );

    CREATE TABLE IF NOT EXISTS eventos (
      id            INTEGER PRIMARY KEY,
      usuario_id    INTEGER NOT NULL REFERENCES usuarios(id),
      fuente        TEXT NOT NULL,
      tipo          TEXT NOT NULL,
      ref           TEXT,
      ts            TEXT NOT NULL,
      meta          TEXT
    );

    CREATE TABLE IF NOT EXISTS despliegues (
      id            INTEGER PRIMARY KEY,
      usuario_id    INTEGER NOT NULL REFERENCES usuarios(id),
      commit_ref    TEXT NOT NULL,
      ok            INTEGER NOT NULL DEFAULT 1,
      ts            TEXT NOT NULL
    );

    -- La autoaprobacion es una fila con autor_id = revisor_id.
    CREATE TABLE IF NOT EXISTS revisiones_pr (
      id            INTEGER PRIMARY KEY,
      pr_ref        TEXT NOT NULL,
      autor_id      INTEGER NOT NULL REFERENCES usuarios(id),
      revisor_id    INTEGER NOT NULL REFERENCES usuarios(id),
      aprobado      INTEGER NOT NULL DEFAULT 0,
      comentarios   INTEGER NOT NULL DEFAULT 0,
      ts            TEXT NOT NULL
    );

    -- Ambiente y conexion. No entran al puntaje, solo dan contexto.
    CREATE TABLE IF NOT EXISTS contexto (
      id            INTEGER PRIMARY KEY,
      usuario_id    INTEGER NOT NULL REFERENCES usuarios(id),
      tipo          TEXT NOT NULL,
      metrica       TEXT NOT NULL,
      valor         REAL NOT NULL,
      ts            TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pesos (
      cliente_id    INTEGER NOT NULL REFERENCES clientes(id),
      rol           TEXT NOT NULL,
      dimension     TEXT NOT NULL,
      peso          REAL NOT NULL,
      PRIMARY KEY (cliente_id, rol, dimension)
    );

    CREATE TABLE IF NOT EXISTS alertas (
      id            INTEGER PRIMARY KEY,
      usuario_id    INTEGER NOT NULL REFERENCES usuarios(id),
      tipo          TEXT NOT NULL,
      mensaje       TEXT NOT NULL,
      ts            TEXT NOT NULL
    );

    -- Cada dispositivo fisico (el ESP32) se asocia a un empleado. El suscriptor MQTT
    -- usa este mapa para saber a quien pertenece una lectura que llega sin usuario_id.
    CREATE TABLE IF NOT EXISTS dispositivos (
      dispositivo     TEXT PRIMARY KEY,
      usuario_id      INTEGER NOT NULL REFERENCES usuarios(id),
      descripcion     TEXT,
      ultima_lectura  TEXT
    );

    -- Configuracion de monitoreo que ajusta el gerente. Clave-valor para no atarse a columnas.
    CREATE TABLE IF NOT EXISTS config_monitoreo (
      clave   TEXT PRIMARY KEY,
      valor   TEXT NOT NULL
    );
  `);
}

module.exports = { db, inicializarEsquema, DB_PATH };
