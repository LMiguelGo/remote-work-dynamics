// Servicio PURO de la tarjeta de ultimos registros del lider y del gerente.
// Sirve para comprobar que los datos de cada fuente se estan guardando. No
// consulta la base: recibe las filas ya leidas y devuelve una forma JSON limpia.

// Cantidad fija de registros que se muestran por consulta.
const LIMITE_REGISTROS = 10;

// Tipos de dato del MVP y los campos del payload que se devuelven de cada uno.
// Es una lista blanca: la ingesta generica acepta cualquier payload, asi que
// solo salen los campos del contrato de cada tipo. La red y SonarQube no entran
// porque no hacen parte del MVP.
const CAMPOS_POR_TIPO = {
  working_session: ['start_time', 'end_time'],
  daily_survey: ['satisfaction_level', 'tools_perception', 'fatigue_level', 'concentration_perception'],
  weekly_survey: ['communication_quality', 'team_coordination', 'documentation_perception'],
  ambiental_reading: ['temperature', 'humidity', 'noise_level'],
  pull_request: ['pr_number', 'action', 'lines_added', 'lines_deleted', 'files_changed'],
  pull_request_review: ['pr_number', 'review_responsiveness_minutes', 'pr_comment_density'],
  commit: ['commit_hash', 'conventional_commit_prefix'],
  issue_created: ['issue_key', 'issue_type', 'story_points'],
  issue_updated: ['issue_key', 'status_from', 'status_to', 'story_points', 'resolution_time_hours'],
};

const TIPOS_REGISTRO = Object.keys(CAMPOS_POR_TIPO);

function esTipoRegistro(tipo) {
  return typeof tipo === 'string' && Object.prototype.hasOwnProperty.call(CAMPOS_POR_TIPO, tipo);
}

// Solo se dejan pasar valores simples; un objeto o una lista quedan en null.
function valorSimple(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  return null;
}

function filtrarPayload(payload, campos) {
  const datos = {};
  const origen = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  for (const campo of campos) datos[campo] = valorSimple(origen[campo]);
  return datos;
}

// construirRegistros(filas, tipo) -> respuesta
//   filas: de events.repo.recientesDeUsuario, ya en orden de llegada (mas
//          recientes primero): { id, time, payload }
function construirRegistros(filas, tipo) {
  const campos = CAMPOS_POR_TIPO[tipo] || [];
  const registros = (filas || []).map((f) => ({
    id: String(f.id),
    time: f.time ? new Date(f.time).toISOString() : null,
    datos: filtrarPayload(f.payload, campos),
  }));
  return { tipo, limite: LIMITE_REGISTROS, registros };
}

module.exports = {
  LIMITE_REGISTROS,
  CAMPOS_POR_TIPO,
  TIPOS_REGISTRO,
  esTipoRegistro,
  construirRegistros,
};
