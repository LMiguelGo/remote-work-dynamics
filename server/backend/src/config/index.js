const ahora = new Date();
const periodoActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  DATABASE_URL:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres_password@database:5432/rwd_database',
  JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-cambiar-en-produccion',
  MQTT_URL: process.env.MQTT_URL || 'mqtt://broker-mqtt:1883',
  PERIODO: process.env.PERIODO || periodoActual,
};
