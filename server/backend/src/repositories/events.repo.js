// Acceso a events (hypertable). SQL siempre parametrizado.
// El payload jsonb se envia como texto y se castea a ::jsonb, igual que el seed.

async function insertar(pool, { sourceId, eventType, payload, time }) {
  const r = await pool.query(
    `INSERT INTO events (time, source_id, event_type, payload)
     VALUES (COALESCE($1::timestamptz, now()), $2, $3, $4::jsonb)
     RETURNING time, id, event_type, payload`,
    [time || null, sourceId, eventType, JSON.stringify(payload)]
  );
  return r.rows[0];
}

// Lecturas ambientales del usuario (fuente esp32), mas recientes primero.
async function ultimasAmbiente(pool, userId, limit) {
  const r = await pool.query(
    `SELECT e.time, e.payload
       FROM events e
       JOIN data_sources ds ON ds.id = e.source_id
      WHERE ds.user_id = $1
        AND ds.source_type = 'esp32'
        AND e.event_type = 'ambiental_reading'
      ORDER BY e.time DESC
      LIMIT $2`,
    [userId, limit]
  );
  return r.rows;
}

// Ultimo evento de un tipo para una fuente (p. ej. la ultima encuesta).
async function ultimo(pool, sourceId, eventType) {
  const r = await pool.query(
    `SELECT time, id, event_type, payload
       FROM events
      WHERE source_id = $1 AND event_type = $2
      ORDER BY time DESC
      LIMIT 1`,
    [sourceId, eventType]
  );
  return r.rows[0] || null;
}

// La working_session abierta de una fuente (end_time nulo), si existe.
async function workingSessionAbierta(pool, sourceId) {
  const r = await pool.query(
    `SELECT time, id, event_type, payload
       FROM events
      WHERE source_id = $1
        AND event_type = 'working_session'
        AND payload->>'end_time' IS NULL
      ORDER BY time DESC
      LIMIT 1`,
    [sourceId]
  );
  return r.rows[0] || null;
}

// Inicia una jornada: inserta working_session con end_time nulo. time = ahora.
async function abrirWorkingSession(pool, sourceId, inicioISO) {
  const payload = JSON.stringify({ start_time: inicioISO, end_time: null });
  const r = await pool.query(
    `INSERT INTO events (time, source_id, event_type, payload)
     VALUES (now(), $1, 'working_session', $2::jsonb)
     RETURNING time, id, event_type, payload`,
    [sourceId, payload]
  );
  return r.rows[0];
}

// Finaliza una jornada: UPDATE del evento por su (time, id) poniendo end_time.
// Se filtra por time (poda de chunks en la hypertable) e id. El time viaja como
// epoch en milisegundos para evitar la perdida de microsegundos del Date de pg;
// la igualdad real la resuelve el id, que es unico (bigserial).
async function cerrarWorkingSession(pool, { time, id }, finISO) {
  const desde = new Date(new Date(time).getTime() - 1000).toISOString();
  const hasta = new Date(new Date(time).getTime() + 1000).toISOString();
  const r = await pool.query(
    `UPDATE events
        SET payload = jsonb_set(payload, '{end_time}', to_jsonb($4::text), true)
      WHERE id = $1
        AND time BETWEEN $2::timestamptz AND $3::timestamptz
        AND event_type = 'working_session'
      RETURNING time, id, event_type, payload`,
    [id, desde, hasta, finISO]
  );
  return r.rows[0] || null;
}

// Para cada fuente de tipo 'network', su ultimo evento 'interruption' y su
// ultimo 'qos_measurement' con su payload y time. Parte de data_sources (no de
// events) con LEFT JOIN LATERAL para que una fuente network sin eventos aparezca
// igual, con las columnas de evento en null. SQL parametrizado.
async function ultimaRedPorFuente(pool) {
  const r = await pool.query(
    `SELECT ds.id AS source_id,
            ds.identifier,
            u.username,
            u.full_name,
            itr.time    AS interruption_time,
            itr.payload AS interruption_payload,
            qos.time    AS qos_time,
            qos.payload AS qos_payload
       FROM data_sources ds
       JOIN users u ON u.id = ds.user_id
       LEFT JOIN LATERAL (
         SELECT e.time, e.payload
           FROM events e
          WHERE e.source_id = ds.id AND e.event_type = 'interruption'
          ORDER BY e.time DESC
          LIMIT 1
       ) itr ON true
       LEFT JOIN LATERAL (
         SELECT e.time, e.payload
           FROM events e
          WHERE e.source_id = ds.id AND e.event_type = 'qos_measurement'
          ORDER BY e.time DESC
          LIMIT 1
       ) qos ON true
      WHERE ds.source_type = 'network'
      ORDER BY ds.id`
  );
  return r.rows;
}

// Igual que ultimaRedPorFuente pero acotada a un conjunto de usuarios (los
// integrantes de un lider), para la vista de conectividad del lider.
async function ultimaRedPorFuenteDeUsuarios(pool, userIds) {
  const r = await pool.query(
    `SELECT ds.id AS source_id,
            ds.identifier,
            u.username,
            u.full_name,
            itr.time    AS interruption_time,
            itr.payload AS interruption_payload,
            qos.time    AS qos_time,
            qos.payload AS qos_payload
       FROM data_sources ds
       JOIN users u ON u.id = ds.user_id
       LEFT JOIN LATERAL (
         SELECT e.time, e.payload
           FROM events e
          WHERE e.source_id = ds.id AND e.event_type = 'interruption'
          ORDER BY e.time DESC
          LIMIT 1
       ) itr ON true
       LEFT JOIN LATERAL (
         SELECT e.time, e.payload
           FROM events e
          WHERE e.source_id = ds.id AND e.event_type = 'qos_measurement'
          ORDER BY e.time DESC
          LIMIT 1
       ) qos ON true
      WHERE ds.source_type = 'network'
        AND ds.user_id = ANY($1)
      ORDER BY ds.id`,
    [userIds]
  );
  return r.rows;
}

module.exports = {
  insertar,
  ultimasAmbiente,
  ultimo,
  workingSessionAbierta,
  abrirWorkingSession,
  cerrarWorkingSession,
  ultimaRedPorFuente,
  ultimaRedPorFuenteDeUsuarios,
};
