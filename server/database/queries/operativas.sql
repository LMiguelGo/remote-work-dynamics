-- server/database/queries/operativas.sql
-- Consultas operativas como evidencia de persistencia funcional (Actividad 5).
-- No documentan buenas practicas (eso se aplica en el codigo): demuestran que el
-- almacenamiento responde a las consultas reales del sistema, una por cada tipo
-- de dato que persiste.
--
-- Como correrlas, con el stack arriba y el seed hecho:
--   docker exec -i database psql -U postgres -d rwd_database -f - < server/database/queries/operativas.sql
-- o abrir psql y pegarlas una a una.

-- 1. Ultima lectura ambiental por empleado (fuente esp32, evento ambiental_reading).
--    Un LEFT JOIN LATERAL toma el evento mas reciente de cada fuente esp32, para
--    que una fuente sin lecturas aparezca igual, con las columnas en null.
SELECT u.username,
       u.full_name,
       ds.identifier,
       amb.time AS ultima_lectura,
       amb.payload->>'temperature' AS temperatura_c,
       amb.payload->>'humidity'    AS humedad_pct,
       amb.payload->>'noise_level' AS ruido_db
  FROM data_sources ds
  JOIN users u ON u.id = ds.user_id
  LEFT JOIN LATERAL (
    SELECT e.time, e.payload
      FROM events e
     WHERE e.source_id = ds.id AND e.event_type = 'ambiental_reading'
     ORDER BY e.time DESC
     LIMIT 1
  ) amb ON true
 WHERE ds.source_type = 'esp32'
 ORDER BY u.username;

-- 2. Actividad del sistema por fuente y por dia. Cuenta eventos agrupados por el
--    tipo de fuente y el dia, para ver el volumen de ingesta de cada integracion
--    (esp32, jira, network, web_app) en el tiempo.
SELECT ds.source_type,
       date_trunc('day', e.time) AS dia,
       count(*) AS eventos
  FROM events e
  JOIN data_sources ds ON ds.id = e.source_id
 GROUP BY ds.source_type, date_trunc('day', e.time)
 ORDER BY dia DESC, ds.source_type;

-- 3. Registros de conectividad por empleado (fuente network). Ultima interrupcion
--    y ultima medicion de calidad de servicio de cada sonda de red.
SELECT u.username,
       ds.identifier,
       itr.time    AS ultima_interrupcion,
       itr.payload->>'interruption_duration_seconds' AS duracion_seg,
       qos.time    AS ultima_medicion_qos,
       qos.payload->>'latency_ms'             AS latencia_ms,
       qos.payload->>'packet_loss_percentage' AS perdida_pct
  FROM data_sources ds
  JOIN users u ON u.id = ds.user_id
  LEFT JOIN LATERAL (
    SELECT e.time, e.payload FROM events e
     WHERE e.source_id = ds.id AND e.event_type = 'interruption'
     ORDER BY e.time DESC LIMIT 1
  ) itr ON true
  LEFT JOIN LATERAL (
    SELECT e.time, e.payload FROM events e
     WHERE e.source_id = ds.id AND e.event_type = 'qos_measurement'
     ORDER BY e.time DESC LIMIT 1
  ) qos ON true
 WHERE ds.source_type = 'network'
 ORDER BY u.username;

-- 4. Alertas por usuario. Lista las alertas abiertas (sin resolver) mas recientes
--    con su severidad. Sin alertas sembradas devuelve vacio, pero valido.
SELECT u.username,
       a.alert_type,
       a.severity,
       a.message,
       a.created_at
  FROM alerts a
  JOIN users u ON u.id = a.user_id
 WHERE a.resolved_at IS NULL
 ORDER BY a.created_at DESC;

-- 5. Rollup por ventana de tiempo con time_bucket (TimescaleDB). Agrupa los eventos
--    en cubos de un dia por tipo de evento. Es la consulta que aprovecha la
--    hypertable para series temporales.
SELECT time_bucket('1 day', e.time) AS ventana,
       e.event_type,
       count(*) AS eventos
  FROM events e
 GROUP BY ventana, e.event_type
 ORDER BY ventana DESC, e.event_type;

-- 6. Eventos de Jira por incidencia (fuente jira, identifier del proyecto). Ultimo
--    estado conocido de cada issue y su tipo, como evidencia de la ingesta del
--    conector. Es la materia prima de Lead Time, MTTR y tiempo bloqueado que
--    calculara la capa de analitica.
SELECT e.payload->>'issue_key' AS incidencia,
       count(*) AS eventos,
       max(e.time) AS ultimo_evento
  FROM events e
  JOIN data_sources ds ON ds.id = e.source_id
 WHERE ds.source_type = 'jira'
 GROUP BY e.payload->>'issue_key'
 ORDER BY incidencia;

-- 7. Verificacion de la politica de retencion sobre events (Actividad 5). Confirma
--    que Timescale tiene programado el job que poda los datos antiguos.
SELECT j.proc_name,
       j.schedule_interval,
       (j.config->>'drop_after') AS retener_hasta
  FROM timescaledb_information.jobs j
 WHERE j.proc_name = 'policy_retention';
