const ahora = new Date();
const periodoActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  DATABASE_URL:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres_password@database:5432/rwd_database',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-cambiar-en-produccion',
  MQTT_URL: process.env.MQTT_URL || 'mqtt://broker-mqtt:1883',
  // Credenciales opcionales del broker. En la demo el broker es anonimo, asi que
  // quedan undefined; el suscriptor solo las pasa si estan definidas.
  MQTT_USERNAME: process.env.MQTT_USERNAME,
  MQTT_PASSWORD: process.env.MQTT_PASSWORD,
  // Topico donde el firmware ESP32 publica sus lecturas ambientales. Reutiliza el
  // del prototipo anterior (src/mqtt.js) y queda configurable por entorno.
  MQTT_TOPIC: process.env.MQTT_TOPIC || 'remote-work/esp32/ambiente',
  // Token compartido para la ingesta HTTP de sensores. Defecto solo de desarrollo.
  INGEST_TOKEN: process.env.INGEST_TOKEN || 'dev_ingest_token',
  PERIODO: process.env.PERIODO || periodoActual,
  // Origenes permitidos para CORS (lista separada por comas). El defecto cubre el
  // nginx del frontend (localhost:80) y el dev-server de Vite (5173). En
  // produccion se fija por entorno para no quedar abierto a cualquier origen.
  CORS_ORIGIN:
    process.env.CORS_ORIGIN || 'http://localhost,http://localhost:80,http://localhost:5173',
};
