// Consultas de la capa de operacion: estado de dispositivos, eventos de conectividad y
// configuracion de monitoreo. Alimentan la seccion de administracion del gerente y el
// suscriptor MQTT. Nada de esto toca el puntaje; es contexto e infraestructura.

const { DISPOSITIVOS, INTERVALO_MONITOREO_SEGUNDOS, DICCIONARIO_UMBRALES, BANDAS_GRAFICO } = require('./config');

const METRICAS_DISPOSITIVO = ['temperatura', 'humedad', 'ruido', 'calidad_conexion'];

// A quien pertenece una lectura de un dispositivo. Primero la tabla, luego el mapa de arranque.
function usuarioDeDispositivo(db, dispositivo) {
  const fila = db.prepare('SELECT usuario_id FROM dispositivos WHERE dispositivo = ?').get(dispositivo);
  if (fila) return fila.usuario_id;
  return DISPOSITIVOS[dispositivo] || null;
}

// Marca que un dispositivo acaba de reportar. Si no estaba registrado, lo da de alta.
function registrarLecturaDispositivo(db, dispositivo, usuarioId) {
  const ahora = new Date().toISOString();
  db.prepare(
    'INSERT INTO dispositivos (dispositivo, usuario_id, ultima_lectura) VALUES (?, ?, ?) ' +
      'ON CONFLICT(dispositivo) DO UPDATE SET ultima_lectura = excluded.ultima_lectura'
  ).run(dispositivo, usuarioId, ahora);
}

function ultimaDe(db, usuarioId, metrica) {
  const r = db
    .prepare('SELECT valor, ts FROM contexto WHERE usuario_id = ? AND metrica = ? ORDER BY ts DESC LIMIT 1')
    .get(usuarioId, metrica);
  return r ? { valor: Math.round(r.valor * 10) / 10, ts: r.ts } : null;
}

// Un dispositivo se considera en vivo si reporto en los ultimos 60 segundos de reloj real.
function esReciente(ts) {
  if (!ts) return false;
  return Date.now() - new Date(ts).getTime() < 60 * 1000;
}

// Estado de cada dispositivo registrado, con su ultima lectura por metrica.
function estadoDispositivos(db) {
  const filas = db
    .prepare(
      'SELECT d.dispositivo, d.usuario_id, d.descripcion, d.ultima_lectura, u.nombre ' +
        'FROM dispositivos d JOIN usuarios u ON u.id = d.usuario_id ORDER BY d.dispositivo'
    )
    .all();
  return filas.map((d) => {
    const lecturas = {};
    for (const m of METRICAS_DISPOSITIVO) lecturas[m] = ultimaDe(db, d.usuario_id, m);
    const conDatos = Object.values(lecturas).filter(Boolean);
    const tieneDatos = conDatos.length > 0;
    // Si no reporto por MQTT, la ultima actividad conocida es la lectura de contexto mas nueva.
    const ultimaContexto = conDatos.map((l) => l.ts).sort().slice(-1)[0] || null;
    const ultimaLectura = d.ultima_lectura || ultimaContexto;
    const enVivo = esReciente(d.ultima_lectura);
    return {
      dispositivo: d.dispositivo,
      descripcion: d.descripcion || 'Sensor ambiental',
      asignadoA: d.nombre,
      ultimaLectura,
      enVivo,
      estado: enVivo ? 'en vivo' : tieneDatos ? 'con historial' : 'sin datos',
      lecturas,
    };
  });
}

// Serie de conectividad y temperatura para el grafico con franjas de alerta.
function serieConectividad(db, limite = 40) {
  const traer = (metrica) =>
    db
      .prepare(
        'SELECT valor, ts FROM contexto WHERE metrica = ? ORDER BY ts DESC LIMIT ?'
      )
      .all(metrica, limite)
      .map((r) => ({ ts: r.ts, valor: Math.round(r.valor * 10) / 10 }))
      .reverse();
  return {
    calidad_conexion: traer('calidad_conexion'),
    temperatura: traer('temperatura'),
    bandas: BANDAS_GRAFICO,
  };
}

// Eventos de conectividad recientes: las alertas de conexion que dispararon los umbrales.
function eventosConectividad(db, limite = 15) {
  return db
    .prepare(
      "SELECT a.tipo, a.mensaje, a.ts, u.nombre FROM alertas a JOIN usuarios u ON u.id = a.usuario_id " +
        "WHERE a.tipo IN ('conexion','temperatura','humedad') ORDER BY a.ts DESC LIMIT ?"
    )
    .all(limite)
    .map((a) => ({ tipo: a.tipo, mensaje: a.mensaje, ts: a.ts, usuario: a.nombre }));
}

function ultimaLecturaMqtt(db) {
  const r = db.prepare('SELECT MAX(ultima_lectura) t FROM dispositivos').get();
  return r && r.t ? r.t : null;
}

function leerConfig(db) {
  const fila = db.prepare("SELECT valor FROM config_monitoreo WHERE clave = 'intervalo_segundos'").get();
  const intervaloSegundos = fila ? Number(fila.valor) : INTERVALO_MONITOREO_SEGUNDOS;
  return { intervaloSegundos, diccionario: DICCIONARIO_UMBRALES };
}

function guardarConfig(db, { intervaloSegundos }) {
  if (intervaloSegundos != null) {
    const v = Math.max(2, Math.min(60, Number(intervaloSegundos)));
    db.prepare(
      "INSERT INTO config_monitoreo (clave, valor) VALUES ('intervalo_segundos', ?) " +
        'ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor'
    ).run(String(v));
  }
  return leerConfig(db);
}

module.exports = {
  usuarioDeDispositivo,
  registrarLecturaDispositivo,
  estadoDispositivos,
  serieConectividad,
  eventosConectividad,
  ultimaLecturaMqtt,
  leerConfig,
  guardarConfig,
};
