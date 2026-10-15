// web-app/src/mqtt.js
const mqtt = require('mqtt');
const { db } = require('./db');
const { evaluarLectura } = require('./alertas');
const { usuarioDeDispositivo, registrarLecturaDispositivo } = require('./operacion');

// El potenciometro del ESP32 entrega un crudo de 0 a 4095. Se lleva a una escala de decibeles
// aproximada (30 a 90 dB) para poder compararlo con el umbral de ruido del diccionario.
function rawADecibeles(raw) {
  return Math.round((30 + (Number(raw) / 4095) * 60) * 10) / 10;
}

// Persiste una lectura del ESP32 por el mismo camino que /ingesta/sensor: la guarda en
// contexto y evalua los umbrales. Nunca entra al puntaje. Va envuelta en try/catch para
// que un problema de base de datos jamas tumbe el suscriptor.
function persistirLectura(datos) {
  try {
    const dispositivo = datos.dispositivo || 'desconocido';
    const usuarioId = usuarioDeDispositivo(db, dispositivo);
    if (!usuarioId) {
      console.warn(`   ⚠️  Dispositivo '${dispositivo}' sin empleado asignado. No se guarda.`);
      return;
    }

    const lecturas = [
      { metrica: 'temperatura', valor: datos.temperatura },
      { metrica: 'humedad', valor: datos.humedad },
      { metrica: 'ruido', valor: datos.ruido_raw != null ? rawADecibeles(datos.ruido_raw) : undefined },
    ];

    const insertar = db.prepare('INSERT INTO contexto (usuario_id, tipo, metrica, valor, ts) VALUES (?, ?, ?, ?, ?)');
    let guardadas = 0;
    for (const { metrica, valor } of lecturas) {
      const n = Number(valor);
      if (!Number.isFinite(n)) continue;
      insertar.run(usuarioId, 'ambiente', metrica, n, new Date().toISOString());
      evaluarLectura(db, usuarioId, metrica, n);
      guardadas++;
    }

    registrarLecturaDispositivo(db, dispositivo, usuarioId);
    console.log(`   💾 Guardado en la base: ${guardadas} lectura(s) del empleado #${usuarioId}.`);
  } catch (error) {
    console.error(`   ❌ No se pudo guardar la lectura en la base: ${error.message}`);
  }
}

function iniciarSuscriptor() {
    // 🔥 CONFIGURACIÓN CORREGIDA: El host debe ser solo el dominio limpio
    const client = mqtt.connect({
        host: 'broker.hivemq.com',
        port: 1883,
        protocol: 'mqtt'
    });

    client.on('connect', () => {
        console.log('🤖 Suscriptor MQTT de Node.js conectado exitosamente a HiveMQ.');

        const TOPIC = "remote-work/esp32/ambiente";
        client.subscribe(TOPIC, (err) => {
            if (!err) {
                console.log(`📡 Escuchando mensajes en el tópico: '${TOPIC}'...\n`);
            } else {
                console.error('❌ Error al suscribirse al tópico:', err);
            }
        });
    });

    client.on('message', (topic, message) => {
        try {
            const payload_str = message.toString();
            const datos = JSON.parse(payload_str);

            console.log("📨 [NUEVO MENSAJE RECIBIDO EN NODE.JS]");
            console.log(`   Tópico:       ${topic}`);
            console.log(`   Dispositivo: ${datos.dispositivo || 'N/A'}`);
            console.log(`   Lectura N°:  ${datos.lectura_id || 'N/A'}`);
            console.log(`   Temperatura: ${datos.temperatura} °C`);
            console.log(`   Humedad:     ${datos.humedad} %`);
            console.log("-".repeat(40));

            // Guarda la lectura en SQLite reutilizando la ingesta de contexto.
            persistirLectura(datos);

        } catch (error) {
            console.error(`⚠️ Error al procesar el mensaje raw en Node.js: ${message.toString()}`);
        }
    });

    client.on('error', (error) => {
        console.error('❌ Error de conexión en el cliente MQTT de Node.js:', error.message);
    });
}

module.exports = iniciarSuscriptor;
