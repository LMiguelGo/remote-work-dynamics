// Dispositivo simulado para la prueba de reconexion (Actividad 5). Corre en el contenedor backend.
// Como el firmware (PubSubClient): QoS 0, sin cola fuera de linea, reintento cada 3 s.
// Publica 1 lectura/s durante DUR segundos y registra connect/close con hora (ms epoch).
const mqtt = require('mqtt');
const BROKER = process.env.MQTT_URL || 'mqtt://broker-mqtt:1883';
const TOPIC = process.env.MQTT_TOPIC || 'remote-work/esp32/ambiente';
const DUR = Number(process.env.DUR || 70);
const RUN = 900;
const log = (ev, extra = {}) => console.log(JSON.stringify({ ev, t: Date.now(), ...extra }));

const c = mqtt.connect(BROKER, { reconnectPeriod: 3000, connectTimeout: 3000, queueQoSZero: false, clientId: 'prueba_reconexion' });
c.on('connect', () => log('connect'));
c.on('close', () => log('close'));
let i = 0, ok = 0, fallidos = 0;
const t = setInterval(() => {
  const idx = i++;
  if (c.connected) {
    c.publish(TOPIC, JSON.stringify({ dispositivo: 'esp32_prueba_rendimiento', lectura_id: idx, temperatura: RUN * 100000 + idx, humedad: 50, ruido_raw: 2048 }), { qos: 0 });
    ok++;
  } else {
    fallidos++;
  }
}, 1000);
setTimeout(() => { clearInterval(t); log('fin', { enviados: ok, no_enviados_sin_conexion: fallidos }); c.end(true); }, DUR * 1000);
