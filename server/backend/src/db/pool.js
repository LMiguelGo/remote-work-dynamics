const { Pool } = require('pg');
const config = require('../config/index');

const pool = new Pool({ connectionString: config.DATABASE_URL });

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de Postgres:', err.message);
});

function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
