const ahora = new Date();
const periodoActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;

// Valores por defecto SOLO de desarrollo. En produccion se exigen por entorno
// (ver la guarda de abajo). No son secretos reales y no deben usarse desplegados.
const JWT_SECRET_DEV = 'dev-secret-cambiar-en-produccion';
const INGEST_TOKEN_DEV = 'dev_ingest_token';
const GITHUB_WEBHOOK_SECRET_DEV = 'dev_github_secret';

const config = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 3000,
  DATABASE_URL:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres_password@database:5432/rwd_database',
  JWT_SECRET: process.env.JWT_SECRET || JWT_SECRET_DEV,
  MQTT_URL: process.env.MQTT_URL || 'mqtt://broker-mqtt:1883',
  // Credenciales opcionales del broker. En la demo el broker es anonimo, asi que
  // quedan undefined; el suscriptor solo las pasa si estan definidas.
  MQTT_USERNAME: process.env.MQTT_USERNAME,
  MQTT_PASSWORD: process.env.MQTT_PASSWORD,
  // Topico donde el firmware ESP32 publica sus lecturas ambientales. Reutiliza el
  // del prototipo anterior (src/mqtt.js) y queda configurable por entorno.
  MQTT_TOPIC: process.env.MQTT_TOPIC || 'remote-work/esp32/ambiente',
  // Token compartido para la ingesta HTTP de sensores y conectores. Defecto solo
  // de desarrollo. Lo comparten el firmware ESP32 y el conector de Jira, asi que
  // debe ser estable (no se regenera en cada despliegue) y viajar fuera del repo.
  INGEST_TOKEN: process.env.INGEST_TOKEN || INGEST_TOKEN_DEV,
  PERIODO: process.env.PERIODO || periodoActual,
  // Origenes permitidos para CORS (lista separada por comas). El defecto cubre el
  // nginx del frontend (localhost:80) y el dev-server de Vite (5173). En
  // produccion se fija por entorno para no quedar abierto a cualquier origen.
  CORS_ORIGIN:
    process.env.CORS_ORIGIN || 'http://localhost,http://localhost:80,http://localhost:5173',
  GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET || GITHUB_WEBHOOK_SECRET_DEV,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  JIRA_STORY_POINTS_FIELD: process.env.JIRA_STORY_POINTS_FIELD || 'customfield_10016',
};

// Guarda de arranque (fail-closed): en produccion no se permite arrancar con los
// secretos por defecto de desarrollo. Asi un despliegue real nunca queda con la
// clave JWT ni el token de ingesta de ejemplo, que estan en el repo y serian
// publicos. Los secretos se cargan por entorno (.env fuera de git), no se generan
// en cada arranque porque invalidarian las sesiones vivas y el token que ya tienen
// el ESP32 y el conector de Jira.
if (config.NODE_ENV === 'production') {
  const faltantes = [];
  if (!process.env.JWT_SECRET || config.JWT_SECRET === JWT_SECRET_DEV) {
    faltantes.push('JWT_SECRET');
  }
  if (!process.env.INGEST_TOKEN || config.INGEST_TOKEN === INGEST_TOKEN_DEV) {
    faltantes.push('INGEST_TOKEN');
  }
  if (faltantes.length > 0) {
    throw new Error(
      `No se puede arrancar en produccion con secretos por defecto. ` +
        `Defina por entorno: ${faltantes.join(', ')}. ` +
        `Genere cada uno con una cadena larga y aleatoria, por ejemplo "openssl rand -hex 32".`
    );
  }
}

module.exports = config;
