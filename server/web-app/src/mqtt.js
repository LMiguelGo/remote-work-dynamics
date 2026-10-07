// web-app/src/mqtt.js
const mqtt = require('mqtt');
const db = require('./db');

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

    client.on('message', async (topic, message) => {
        try {
            const payload_str = message.toString();
            const datos = JSON.parse(payload_str);

            console.log("📨 [NUEVO MENSAJE RECIBIDO EN NODE.JS]");
            console.log(`   Tópico:       ${topic}`);
            console.log(`   Dispositivo: ${datos.dispositivo || 'N/A'}`);
            console.log(`   Lectura N°:  ${datos.lectura_id || 'N/A'}`);
            console.log(`   Temperatura: ${datos.temperatura} °C`);
            console.log(`   CO2:         ${datos.co2} ppm`);
            console.log("-".repeat(40));

            // Aquí llamaremos a la función para insertar en SQLite
            // await db.insertarLectura(datos); 

        } catch (error) {
            console.error(`⚠️ Error al procesar el mensaje raw en Node.js: ${message.toString()}`);
        }
    });

    client.on('error', (error) => {
        console.error('❌ Error de conexión en el cliente MQTT de Node.js:', error.message);
    });
}

module.exports = iniciarSuscriptor;
