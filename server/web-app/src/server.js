// Sirve la API y el dashboard estatico desde un solo proceso.

const path = require('path');
const express = require('express');
const { inicializarEsquema, db } = require('./db');
const rutasApi = require('./routes');
const { rutasIngesta } = require('./ingest');
const iniciarSuscriptor = require('./mqtt');

inicializarEsquema();

const app = express();
app.use(express.json());
app.use('/', express.static(path.join(__dirname, '..', 'public')));
app.use('/api', rutasApi);
app.use('/ingesta', rutasIngesta);

app.get('/api/estado', (req, res) => {
  const n = db.prepare('SELECT COUNT(*) n FROM usuarios').get().n;
  res.json({ ok: true, usuarios: n, sembrado: n > 0 });
});

iniciarSuscriptor();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const n = db.prepare('SELECT COUNT(*) n FROM usuarios').get().n;
  console.log(`Prototipo Actividad 6 escuchando en http://localhost:${PORT}`);
  if (n === 0) console.log('Aviso: la base esta vacia. Correr "npm run seed" antes de la demo.');
});
