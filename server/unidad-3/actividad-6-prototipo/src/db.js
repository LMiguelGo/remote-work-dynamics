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
      captura_activa INTEGER NOT NULL DEFAULT 1
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

    -- Medida perceptual de la encuesta, que es la dimension S del marco SPACE.
    CREATE TABLE IF NOT EXISTS encuestas (
      usuario_id    INTEGER NOT NULL REFERENCES usuarios(id),
      periodo       TEXT NOT NULL,
      satisfaccion  REAL NOT NULL,
      PRIMARY KEY (usuario_id, periodo)
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
  `);
}

module.exports = { db, inicializarEsquema, DB_PATH };
