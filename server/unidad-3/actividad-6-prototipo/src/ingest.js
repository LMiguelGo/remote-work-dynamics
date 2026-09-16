// Puntos de entrada de datos. Hoy los alimentan el seed y el simulador, pero son
// el mismo lugar donde despues se conectarian GitHub, Jira y el broker MQTT.
// En produccion irian autenticados. En la demo quedan abiertos a proposito.

const express = require('express');
const { db } = require('./db');

const rutasIngesta = express.Router();

rutasIngesta.post('/evento', (req, res) => {
  const { usuario_id, fuente, tipo, ref, meta } = req.body || {};
  if (!usuario_id || !fuente || !tipo) return res.status(400).json({ error: 'Faltan campos: usuario_id, fuente, tipo.' });
  db.prepare('INSERT INTO eventos (usuario_id, fuente, tipo, ref, ts, meta) VALUES (?, ?, ?, ?, ?, ?)').run(
    usuario_id,
    fuente,
    tipo,
    ref || null,
    new Date().toISOString(),
    JSON.stringify(meta || {})
  );
  res.json({ ok: true });
});

rutasIngesta.post('/despliegue', (req, res) => {
  const { usuario_id, commit_ref, ok } = req.body || {};
  if (!usuario_id || !commit_ref) return res.status(400).json({ error: 'Faltan campos: usuario_id, commit_ref.' });
  db.prepare('INSERT INTO despliegues (usuario_id, commit_ref, ok, ts) VALUES (?, ?, ?, ?)').run(
    usuario_id,
    commit_ref,
    ok === false ? 0 : 1,
    new Date().toISOString()
  );
  res.json({ ok: true });
});

// Camino que hoy simula el broker MQTT. El contexto nunca entra al puntaje.
rutasIngesta.post('/sensor', (req, res) => {
  const { usuario_id, tipo, metrica, valor } = req.body || {};
  if (!usuario_id || !tipo || !metrica || valor == null)
    return res.status(400).json({ error: 'Faltan campos: usuario_id, tipo, metrica, valor.' });
  db.prepare('INSERT INTO contexto (usuario_id, tipo, metrica, valor, ts) VALUES (?, ?, ?, ?, ?)').run(
    usuario_id,
    tipo,
    metrica,
    Number(valor),
    new Date().toISOString()
  );
  res.json({ ok: true });
});

module.exports = { rutasIngesta };
