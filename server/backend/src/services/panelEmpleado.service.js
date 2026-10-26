// Servicio PURO que arma la forma JSON de /mi-panel.
// No calcula metricas de productividad: eso es trabajo de la analitica, no del backend.
// Recibe datos ya consultados y devuelve el objeto de respuesta.

// Mapeo entre las claves de lectura ambiental (payload del evento) y las de los
// umbrales del perfil (que vienen en espanol desde el seed).
const MAPA_AMBIENTE = [
  { lectura: 'temperature', umbral: 'temperatura_c' },
  { lectura: 'humidity', umbral: 'humedad_pct' },
  { lectura: 'noise_level', umbral: 'ruido_db' },
];

function estadoAmbiente(ultima, umbrales) {
  if (!ultima) return 'Sin datos';
  if (!umbrales) return 'Normal';
  for (const m of MAPA_AMBIENTE) {
    const valor = ultima[m.lectura];
    const rango = umbrales[m.umbral];
    if (valor == null || !rango) continue;
    if (rango.min != null && valor < rango.min) return 'Alerta';
    if (rango.max != null && valor > rango.max) return 'Alerta';
  }
  return 'Normal';
}

// conexion llega ya con forma de una fuente de la conectividad del lider
// ({ estado, qos, interrupcion }) o null si el empleado no tiene fuente de red.
function construirConexion(conexion) {
  if (!conexion) return { estado: 'sin datos', qos: null, interrupcion: null };
  return {
    estado: conexion.estado,
    qos: conexion.qos ?? null,
    interrupcion: conexion.interrupcion ?? null,
  };
}

function construirJornada(jornada) {
  if (jornada && jornada.start_time) {
    return { estado: 'En curso', start_time: jornada.start_time };
  }
  return { estado: 'Sin jornada activa', start_time: null };
}

function construirPanel(datos) {
  const {
    usuario,
    profile,
    ambiente,
    conexion,
    alertas,
    jornada,
    encuestaDiariaPendiente,
    encuestaSemanalPendiente,
  } = datos;

  const umbrales = profile ? profile.ambient_thresholds : null;
  const ultima = ambiente && ambiente.length > 0 ? ambiente[0] : null;

  return {
    usuario,
    capture_active: profile ? profile.capture_active : null,
    jornada: construirJornada(jornada),
    ambiente: {
      estado: estadoAmbiente(ultima, umbrales),
      ultima: ultima || null,
      umbrales: umbrales || null,
    },
    conexion: construirConexion(conexion),
    alertas: alertas || [],
    encuestaDiariaPendiente,
    encuestaSemanalPendiente,
  };
}

module.exports = { construirPanel };
