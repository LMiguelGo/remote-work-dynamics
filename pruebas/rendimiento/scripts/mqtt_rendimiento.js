// Pruebas de rendimiento de la ingesta MQTT -> backend -> events (Actividad 5).
// Corre DENTRO del contenedor backend: docker exec -i -e FASE=... backend node - < mqtt_rendimiento.js
// Publica como un ESP32 con el dispositivo temporal 'esp32_prueba_rendimiento'.
// Cada mensaje lleva su numero en "temperatura" (run*1e5 + idx) para casarlo con su fila en events.
const mqtt = require('mqtt');
const { Pool } = require('pg');

const BROKER_URL = process.env.MQTT_URL || 'mqtt://broker-mqtt:1883';
const TOPIC = process.env.MQTT_TOPIC || 'remote-work/esp32/ambiente';
const DISP = 'esp32_prueba_rendimiento';
// id de la fila temporal de data_sources con identifier 'esp32_prueba_rendimiento' (crearla antes y borrarla al terminar).
const SOURCE_ID = Number(process.env.SOURCE_ID);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pct(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1));
  return s[i];
}

function conectar() {
  return new Promise((res, rej) => {
    const c = mqtt.connect(BROKER_URL, { reconnectPeriod: 3000, clientId: 'prueba_' + Date.now() });
    c.once('connect', () => res(c));
    c.once('error', rej);
  });
}

function mensaje(run, idx) {
  return JSON.stringify({
    dispositivo: DISP,
    lectura_id: idx,
    temperatura: run * 100000 + idx,
    humedad: 50.0,
    ruido_raw: 2048,
  });
}

async function filas(run) {
  const r = await pool.query(
    `SELECT (payload->>'temperature')::float8 AS v, extract(epoch from time)*1000 AS t
       FROM events WHERE source_id=$1 AND (payload->>'temperature')::float8 >= $2 AND (payload->>'temperature')::float8 < $3`,
    [SOURCE_ID, run * 100000, (run + 1) * 100000]
  );
  return r.rows.map((x) => ({ idx: Math.round(x.v - run * 100000), t: Number(x.t) }));
}

async function medir(run, envios, esperaMs) {
  // espera a que dejen de llegar filas (o tope)
  let prev = -1;
  let rows = [];
  const tope = Date.now() + esperaMs;
  while (Date.now() < tope) {
    await sleep(1000);
    rows = await filas(run);
    if (rows.length === envios.size || rows.length === prev) break;
    prev = rows.length;
  }
  const lat = [];
  for (const f of rows) {
    const t0 = envios.get(f.idx);
    if (t0 !== undefined) lat.push(f.t - t0);
  }
  const ts = rows.map((f) => f.t);
  const dur = ts.length > 1 ? (Math.max(...ts) - Math.min(...ts)) / 1000 : null;
  return {
    enviados: envios.size,
    recibidos: rows.length,
    perdida_pct: +(100 * (1 - rows.length / envios.size)).toFixed(3),
    lat_ms_p50: lat.length ? +pct(lat, 50).toFixed(1) : null,
    lat_ms_p95: lat.length ? +pct(lat, 95).toFixed(1) : null,
    lat_ms_max: lat.length ? +Math.max(...lat).toFixed(1) : null,
    eventos_por_s: dur ? +(rows.length / dur).toFixed(1) : null,
  };
}

// Publica a una tasa fija (msg/s) durante 'seg' segundos.
async function aTasa(c, run, tasa, seg) {
  const envios = new Map();
  const total = Math.round(tasa * seg);
  const inicio = Date.now();
  for (let i = 0; i < total; i++) {
    const objetivo = inicio + (i * 1000) / tasa;
    const falta = objetivo - Date.now();
    if (falta > 1) await sleep(falta);
    envios.set(i, Date.now());
    c.publish(TOPIC, mensaje(run, i), { qos: 0 });
  }
  return envios;
}

async function main() {
  const fase = process.env.FASE || 'latencia';
  const run = Number(process.env.RUN || Math.floor(Date.now() / 1000) % 1000);
  const c = await conectar();
  const out = { fase, run, inicio: new Date().toISOString() };
  if (fase === 'latencia') {
    const n = Number(process.env.N || 120);
    const envios = await aTasa(c, run, 2, n / 2);
    Object.assign(out, await medir(run, envios, 20000));
  } else if (fase === 'tasa') {
    const tasa = Number(process.env.TASA);
    const seg = Number(process.env.SEG || 30);
    const envios = await aTasa(c, run, tasa, seg);
    Object.assign(out, { tasa_msg_s: tasa, dispositivos_equiv: tasa * 5, seg }, await medir(run, envios, 120000));
  } else if (fase === 'rafaga') {
    const n = Number(process.env.N || 5000);
    const envios = new Map();
    for (let i = 0; i < n; i++) {
      envios.set(i, Date.now());
      c.publish(TOPIC, mensaje(run, i), { qos: 0 });
    }
    Object.assign(out, await medir(run, envios, 180000));
  } else if (fase === 'tamano') {
    const m = mensaje(0, 1);
    Object.assign(out, { ejemplo: m, bytes_payload: Buffer.byteLength(m), bytes_topic: Buffer.byteLength(TOPIC) });
  }
  out.fin = new Date().toISOString();
  console.log(JSON.stringify(out));
  c.end(true);
  await pool.end();
}

main().catch((e) => {
  console.error('ERROR', e.message);
  process.exit(1);
});
