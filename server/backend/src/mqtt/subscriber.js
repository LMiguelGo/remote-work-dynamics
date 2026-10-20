// Suscriptor MQTT: escucha el topico del ESP32 y por cada mensaje parsea el JSON
// y lo entrega a procesarLectura. No debe tumbar el proceso si el broker no esta
// disponible: la libreria mqtt reconecta sola y cada error de mensaje se captura
// por separado.

const mqtt = require('mqtt');
const config = require('../config/index');
const { procesarLectura } = require('../services/ingest.service');

// deps = { buscarFuentePorIdentifier, insertar } (los mismos que procesarLectura).
// Devuelve el cliente mqtt por si el servidor quiere cerrarlo al apagar.
function iniciarSuscriptor(deps) {
  const opciones = { reconnectPeriod: 5000 };
  // Credenciales solo si estan definidas (en la demo el broker es anonimo).
  if (config.MQTT_USERNAME) {
    opciones.username = config.MQTT_USERNAME;
  }
  if (config.MQTT_PASSWORD) {
    opciones.password = config.MQTT_PASSWORD;
  }

  const cliente = mqtt.connect(config.MQTT_URL, opciones);

  cliente.on('connect', () => {
    console.log(`Suscriptor MQTT conectado a ${config.MQTT_URL}`);
    cliente.subscribe(config.MQTT_TOPIC, (err) => {
      if (err) {
        console.error(`Error al suscribirse al topico '${config.MQTT_TOPIC}':`, err.message);
        return;
      }
      console.log(`Suscrito al topico MQTT '${config.MQTT_TOPIC}'`);
    });
  });

  cliente.on('message', (topico, mensaje) => {
    let datos;
    try {
      datos = JSON.parse(mensaje.toString());
    } catch (err) {
      console.error(`Mensaje MQTT no es JSON valido en '${topico}': ${err.message}`);
      return;
    }
    // procesarLectura ya es tolerante (no lanza); aun asi se envuelve por si una
    // dependencia real rechaza, para no dejar una promesa sin capturar.
    Promise.resolve(procesarLectura(deps, datos)).catch((err) => {
      console.error(`Error al procesar lectura MQTT: ${err.message}`);
    });
  });

  cliente.on('error', (err) => {
    console.error(`Error del cliente MQTT: ${err.message}`);
  });

  cliente.on('reconnect', () => {
    console.log('Reintentando conexion al broker MQTT...');
  });

  return cliente;
}

module.exports = { iniciarSuscriptor };
