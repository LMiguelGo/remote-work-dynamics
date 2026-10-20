// Servicio PURO de la capa de operacion del gerente.
// No consulta la base: recibe filas ya leidas y devuelve una forma JSON limpia
// derivada del modelo nuevo. Nunca lanza.

// Umbral por defecto (segundos) para considerar una fuente "en vivo".
const UMBRAL_EN_VIVO_SEGUNDOS = 120;

// Clasifica el estado de una fuente segun su ultima actividad respecto a "ahora".
//   sin datos     -> nunca hubo eventos (ultima actividad null).
//   en vivo       -> la ultima actividad es reciente (<= umbral segundos).
//   con historial -> hubo actividad, pero vieja.
function clasificarEstado(ultimaActividad, ahora, umbralSegundos) {
  if (!ultimaActividad) return 'sin datos';
  const ultima = new Date(ultimaActividad).getTime();
  const ref = ahora instanceof Date ? ahora.getTime() : new Date(ahora).getTime();
  const diffSeg = (ref - ultima) / 1000;
  return diffSeg <= umbralSegundos ? 'en vivo' : 'con historial';
}

// construirEstadoDispositivos(fuentes, ahora, umbralSegundos) -> respuesta
//   fuentes: filas de dataSources.repo.estadoDeFuentes
//            { id, source_type, identifier, username, full_name, ultima_actividad }
//   ahora: Date (o ISO) inyectable para pruebas deterministas.
//   umbralSegundos: ventana de "en vivo"; por defecto UMBRAL_EN_VIVO_SEGUNDOS.
function construirEstadoDispositivos(fuentes, ahora = new Date(), umbralSegundos = UMBRAL_EN_VIVO_SEGUNDOS) {
  const ref = ahora instanceof Date ? ahora : new Date(ahora);
  const dispositivos = (fuentes || []).map((f) => ({
    id: f.id,
    source_type: f.source_type,
    identifier: f.identifier,
    dueno: { username: f.username, full_name: f.full_name },
    estado: clasificarEstado(f.ultima_actividad, ref, umbralSegundos),
    ultima_actividad: f.ultima_actividad
      ? new Date(f.ultima_actividad).toISOString()
      : null,
  }));

  return {
    generado_en: ref.toISOString(),
    umbral_en_vivo_segundos: umbralSegundos,
    dispositivos,
  };
}

// Da forma a un payload de QoS, tolerando campos ausentes.
function formatearQos(payload, time) {
  if (!payload) return null;
  return {
    latency_ms: payload.latency_ms ?? null,
    download_speed_mbps: payload.download_speed_mbps ?? null,
    upload_speed_mbps: payload.upload_speed_mbps ?? null,
    packet_loss_percentage: payload.packet_loss_percentage ?? null,
    time: time ? new Date(time).toISOString() : null,
  };
}

// Da forma a un payload de interrupcion, tolerando campos ausentes.
function formatearInterrupcion(payload, time) {
  if (!payload) return null;
  return {
    interruption_duration_seconds: payload.interruption_duration_seconds ?? null,
    interruption_count: payload.interruption_count ?? null,
    time: time ? new Date(time).toISOString() : null,
  };
}

// construirConectividad(eventosRed) -> respuesta
//   eventosRed: filas de events.repo.ultimaRedPorFuente, una por fuente network
//     { source_id, identifier, username, full_name,
//       interruption_time, interruption_payload, qos_time, qos_payload }
//   Una fuente sin ningun evento queda en estado 'sin datos'.
function construirConectividad(eventosRed) {
  const fuentes = (eventosRed || []).map((e) => {
    const qos = formatearQos(e.qos_payload, e.qos_time);
    const interrupcion = formatearInterrupcion(e.interruption_payload, e.interruption_time);
    return {
      id: e.source_id,
      identifier: e.identifier,
      dueno: { username: e.username, full_name: e.full_name },
      estado: qos || interrupcion ? 'con datos' : 'sin datos',
      qos,
      interrupcion,
    };
  });

  return { fuentes };
}

module.exports = {
  UMBRAL_EN_VIVO_SEGUNDOS,
  clasificarEstado,
  construirEstadoDispositivos,
  construirConectividad,
};
