const config = require('./config/index');
const { pool } = require('./db/pool');
const app = require('./app');

const server = app.listen(config.PORT, () => {
  console.log(`Backend escuchando en http://localhost:${config.PORT}`);
});

function apagar() {
  server.close(() => pool.end().finally(() => process.exit(0)));
}
process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);
