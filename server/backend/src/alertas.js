// Evalua una lectura de contexto contra los umbrales del empleado y, si los rebasa,
// genera una alerta. La alerta siempre es de bienestar: informa a la persona, no puntua.

const { UMBRALES_DEFECTO } = require('./config');

const UNIDAD = { temperatura: '°C', humedad: '%', calidad_conexion: '/100' };

// Umbrales del usuario, completados con los de por defecto para las metricas que falten.
function umbralesDe(db, usuarioId) {
  const filas = db.prepare('SELECT metrica, minimo, maximo FROM umbrales WHERE usuario_id = ?').all(usuarioId);
  const salida = {};
  for (const [metrica, def] of Object.entries(UMBRALES_DEFECTO)) {
    const fila = filas.find((f) => f.metrica === metrica);
    salida[metrica] = fila ? { minimo: fila.minimo, maximo: fila.maximo } : { ...def };
  }
  return salida;
}

function tipoDe(metrica) {
  return metrica === 'calidad_conexion' ? 'conexion' : metrica;
}

function mensajeDe(metrica, valor, limite, sentido) {
  const u = UNIDAD[metrica] || '';
  const nombre =
    metrica === 'calidad_conexion' ? 'Tu conexión' : metrica === 'temperatura' ? 'La temperatura' : 'La humedad';
  const verbo = sentido === 'bajo' ? 'bajó del' : 'superó el';
  return `${nombre} ${verbo} umbral que definiste (${limite}${u}). Se reporta como contexto, no afecta tu evaluación.`;
}

// Inserta la alerta solo si esa metrica no tiene ya una alerta abierta, para no repetirla en cada lectura.
function evaluarLectura(db, usuarioId, metrica, valor) {
  const umbral = umbralesDe(db, usuarioId)[metrica];
  if (!umbral) return false;

  let sentido = null;
  let limite = null;
  if (umbral.minimo != null && valor < umbral.minimo) {
    sentido = 'bajo';
    limite = umbral.minimo;
  } else if (umbral.maximo != null && valor > umbral.maximo) {
    sentido = 'alto';
    limite = umbral.maximo;
  }
  if (!sentido) return false;

  const tipo = tipoDe(metrica);
  const yaExiste = db.prepare('SELECT COUNT(*) n FROM alertas WHERE usuario_id = ? AND tipo = ?').get(usuarioId, tipo).n;
  if (yaExiste > 0) return false;

  db.prepare('INSERT INTO alertas (usuario_id, tipo, mensaje, ts) VALUES (?, ?, ?, ?)').run(
    usuarioId,
    tipo,
    mensajeDe(metrica, valor, limite, sentido),
    new Date().toISOString()
  );
  return true;
}

module.exports = { umbralesDe, evaluarLectura };
