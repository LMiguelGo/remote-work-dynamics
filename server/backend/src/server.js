const config = require('./config/index');
const { pool } = require('./db/pool');
const app = require('./app');
const dataSources = require('./repositories/dataSources.repo');
const events = require('./repositories/events.repo');
const { iniciarSuscriptor } = require('./mqtt/subscriber');

const server = app.listen(config.PORT, () => {
  console.log(`Backend escuchando en http://localhost:${config.PORT}`);
});

// Suscriptor MQTT con dependencias reales atadas al pool. Si el broker no esta
// disponible, la libreria reconecta sola y el proceso sigue vivo.
const clienteMqtt = iniciarSuscriptor({
  buscarFuentePorIdentifier: (identifier) => dataSources.buscarPorIdentifier(pool, identifier),
  insertar: (evento) => events.insertar(pool, evento),
});

function apagar() {
  try {
    clienteMqtt.end(true);
  } catch (_) {
    // El cierre del broker no debe impedir el apagado del servidor.
  }
  server.close(() => pool.end().finally(() => process.exit(0)));
}
process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);
