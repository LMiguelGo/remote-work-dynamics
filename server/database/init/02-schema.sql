-- server/database/init/02-schema.sql
-- Esquema Remote Work Dynamics. Corre solo en el primer arranque del contenedor (volumen vacio).
-- source_type sigue Miguel/data_guide.md (contrato que manda), no el enum viejo del diagrama.

-- Enums
CREATE TYPE team_type AS ENUM ('empleados','lideres');
CREATE TYPE source_type AS ENUM ('web_app','esp32','github','jira','network','sonarqube');
CREATE TYPE space_dimension AS ENUM ('S','P','A','C','E');
CREATE TYPE criticality AS ENUM ('optimo','precaucion','critico');
CREATE TYPE alert_severity AS ENUM ('info','warning','critical');

-- Roles y estructura organizacional
CREATE TABLE roles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR NOT NULL,
  description TEXT
);

CREATE TABLE team_roles (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR NOT NULL,
  description TEXT,
  weights     JSONB NOT NULL
);

CREATE TABLE teams (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR NOT NULL,
  description TEXT,
  team_type   team_type NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  leader_id   INTEGER UNIQUE
);

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR NOT NULL UNIQUE,
  password_hash VARCHAR NOT NULL,
  full_name     VARCHAR,
  created_at    TIMESTAMPTZ DEFAULT now(),
  role_id       INTEGER NOT NULL REFERENCES roles(id),
  team_id       INTEGER REFERENCES teams(id)
);

ALTER TABLE teams
  ADD CONSTRAINT fk_teams_leader FOREIGN KEY (leader_id) REFERENCES users(id);

CREATE TABLE employee_profiles (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL UNIQUE REFERENCES users(id),
  team_role_id       INTEGER NOT NULL REFERENCES team_roles(id),
  work_schedule      JSONB,
  ambient_thresholds JSONB,
  capture_active     BOOLEAN DEFAULT true
);

-- Fuentes de datos y telemetria
CREATE TABLE data_sources (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  source_type source_type NOT NULL,
  identifier  VARCHAR NOT NULL,
  description TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Tabla unica de eventos, hypertable de Timescale
CREATE TABLE events (
  id         BIGSERIAL,
  time       TIMESTAMPTZ NOT NULL,
  source_id  INTEGER NOT NULL REFERENCES data_sources(id),
  event_type VARCHAR NOT NULL,
  payload    JSONB NOT NULL,
  PRIMARY KEY (time, id)
);
SELECT create_hypertable('events','time');
CREATE INDEX idx_events_source_time ON events (source_id, time DESC);
CREATE INDEX idx_events_type_time   ON events (event_type, time DESC);

-- Retencion de datos (Actividad 5). Ventana amplia para no afectar la demo; ajustable.
SELECT add_retention_policy('events', INTERVAL '365 days');

-- Salidas derivadas
CREATE TABLE alerts (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  alert_type  VARCHAR NOT NULL,
  message     TEXT NOT NULL,
  severity    alert_severity NOT NULL DEFAULT 'warning',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE dimension_analyses (
  id                 SERIAL PRIMARY KEY,
  user_id            INTEGER NOT NULL REFERENCES users(id),
  dimension          space_dimension NOT NULL,
  start_date         DATE NOT NULL,
  end_date           DATE NOT NULL,
  normalized_score   NUMERIC NOT NULL,
  criticality_status criticality NOT NULL,
  calculated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE metric_analyses (
  id                    SERIAL PRIMARY KEY,
  dimension_analysis_id INTEGER NOT NULL REFERENCES dimension_analyses(id),
  user_id               INTEGER NOT NULL REFERENCES users(id),
  metric_name           VARCHAR NOT NULL,
  raw_value             NUMERIC,
  normalized_value      NUMERIC,
  criticality           criticality NOT NULL
);
