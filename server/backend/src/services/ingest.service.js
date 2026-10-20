// Servicio de ingesta de lecturas ambientales del firmware ESP32.
// Traduce el crudo del dispositivo al contrato data_guide y lo persiste por
// inyeccion de dependencias, para poder probarlo sin base ni broker.
//
// Contrato data_guide (evento 'ambiental_reading'):
//   payload = { temperature, humidity, noise_level }
// Crudo del firmware: { dispositivo, temperatura, humedad, ruido_raw }

const { validarLecturaIngesta } = require('../utils/validacion');

// El potenciometro del ESP32 entrega un crudo de 0 a 4095. Se lleva a una escala
// aproximada de decibeles (30 a 90 dB) con una interpolacion lineal, igual que el
// prototipo anterior: noise_level = 30 + (ruido_raw / 4095) * 60, redondeado a 1
// decimal. Es una aproximacion para comparar contra el umbral de ruido del puesto,
// no una medicion calibrada.
function rawADecibeles(raw) {
  const n = Number(raw);
  return Math.round((30 + (n / 4095) * 60) * 10) / 10;
}

// PURA: traduce el crudo del firmware al evento del contrato. Renombra llaves y
// convierte ruido_raw a dB. No valida (eso lo hace validarLecturaIngesta aparte).
function lecturaAEvento(datos) {
  return {
    eventType: 'ambiental_reading',
    payload: {
      temperature: datos.temperatura,
      humidity: datos.humedad,
      noise_level: rawADecibeles(datos.ruido_raw),
    },
  };
}

// Procesa una lectura cruda llegada por MQTT o HTTP:
//  - resuelve la fuente por su identifier (= datos.dispositivo);
//  - si no existe, avisa y retorna SIN insertar y SIN lanzar;
//  - valida la lectura; si esta mal formada, descarta SIN lanzar;
//  - traduce e inserta via deps.insertar.
// deps = { buscarFuentePorIdentifier(identifier) -> fuente|null, insertar(evento) }
async function procesarLectura(deps, datos) {
  const validacion = validarLecturaIngesta(datos);
  if (!validacion.ok) {
    console.warn(
      `Lectura de ingesta descartada por mal formada: ${validacion.errores.join(' ')}`
    );
    return;
  }

  const fuente = await deps.buscarFuentePorIdentifier(datos.dispositivo);
  if (!fuente) {
    console.warn(
      `Dispositivo '${datos.dispositivo}' sin data_source asignada. No se inserta.`
    );
    return;
  }

  const { eventType, payload } = lecturaAEvento(datos);
  await deps.insertar({ sourceId: fuente.id, eventType, payload, time: null });
}

module.exports = { lecturaAEvento, procesarLectura, rawADecibeles };
