-- ============================================================
-- AutoSense — PostgreSQL schema initialisation
-- Run once against a fresh database:
--   psql -U postgres -d autosense -f init.sql
-- For an existing DB run migrations/v3_alert_status.sql instead.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enums ──────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE vehicle_status_enum AS ENUM (
        'normal', 'warning', 'critical', 'fatal'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE severity_enum AS ENUM (
        'warning', 'critical', 'fatal'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- log_type stored as VARCHAR(64) — validated by Pydantic, not DB enum

-- ── vehicles ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS vehicles (
    id               UUID                NOT NULL DEFAULT gen_random_uuid(),
    vehicle_id       VARCHAR(64)         NOT NULL,
    status           vehicle_status_enum NOT NULL DEFAULT 'normal',
    last_seen        TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    created_at       TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    display_name     VARCHAR(128),
    vehicle_type     VARCHAR(32),
    owner            VARCHAR(128),
    notes            VARCHAR(512),
    is_active        BOOLEAN             NOT NULL DEFAULT TRUE,
    odometer         FLOAT,
    manufacture_year INTEGER,

    CONSTRAINT pk_vehicles        PRIMARY KEY (id),
    CONSTRAINT uq_vehicles_vid    UNIQUE      (vehicle_id)
);

CREATE INDEX IF NOT EXISTS idx_vehicles_vid ON vehicles(vehicle_id);

-- ── sensor_readings ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sensor_readings (
    id           UUID        NOT NULL DEFAULT gen_random_uuid(),
    vehicle_id   VARCHAR(64) NOT NULL,
    rpm          FLOAT       NOT NULL,
    speed        FLOAT       NOT NULL,
    temperature  FLOAT       NOT NULL,
    throttle     FLOAT       NOT NULL,
    battery      FLOAT       NOT NULL,
    fault_active BOOLEAN     NOT NULL DEFAULT FALSE,
    fault_type   VARCHAR(64),
    timestamp    FLOAT       NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_sensor_readings PRIMARY KEY (id),
    CONSTRAINT fk_readings_vehicle
        FOREIGN KEY (vehicle_id)
        REFERENCES vehicles(vehicle_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_readings_vid        ON sensor_readings(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_readings_created_at ON sensor_readings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_readings_fault
    ON sensor_readings(fault_active)
    WHERE fault_active = TRUE;

-- ── anomalies ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS anomalies (
    id            UUID          NOT NULL DEFAULT gen_random_uuid(),
    vehicle_id    VARCHAR(64)   NOT NULL,
    anomaly_type  VARCHAR(128)  NOT NULL,
    severity      severity_enum NOT NULL DEFAULT 'warning',
    if_score      FLOAT         NOT NULL DEFAULT 0.0,
    lstm_error    FLOAT         NOT NULL DEFAULT 0.0,
    sensor_values    JSONB         NOT NULL DEFAULT '{}',
    resolved         BOOLEAN       NOT NULL DEFAULT FALSE,
    resolved_by      VARCHAR(128),
    resolved_at      TIMESTAMPTZ,
    resolution_notes TEXT,
    acknowledged     BOOLEAN       NOT NULL DEFAULT FALSE,
    acknowledged_by  VARCHAR(128),
    acknowledged_at  TIMESTAMPTZ,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_anomalies PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_anomalies_vid        ON anomalies(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_anomalies_created_at ON anomalies(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_severity   ON anomalies(severity);
CREATE INDEX IF NOT EXISTS idx_anomalies_unresolved
    ON anomalies(resolved)
    WHERE resolved = FALSE;

CREATE INDEX IF NOT EXISTS idx_anomalies_sensors ON anomalies USING GIN (sensor_values);

-- ── alerts ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS alerts (
    id         UUID         NOT NULL DEFAULT gen_random_uuid(),
    anomaly_id UUID         NOT NULL,
    channel    VARCHAR(32)  NOT NULL,
    status     VARCHAR(16)  NOT NULL DEFAULT 'sent',
    error_msg  VARCHAR(512),
    sent_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_alerts          PRIMARY KEY (id),
    CONSTRAINT fk_alerts_anomaly
        FOREIGN KEY (anomaly_id)
        REFERENCES anomalies(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alerts_anomaly_id ON alerts(anomaly_id);

-- ── anomaly_comments ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS anomaly_comments (
    id         UUID         NOT NULL DEFAULT gen_random_uuid(),
    anomaly_id UUID         NOT NULL,
    author     VARCHAR(128) NOT NULL,
    comment    TEXT         NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_anomaly_comments   PRIMARY KEY (id),
    CONSTRAINT fk_comments_anomaly
        FOREIGN KEY (anomaly_id)
        REFERENCES anomalies(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comments_anomaly_id ON anomaly_comments(anomaly_id);
CREATE INDEX IF NOT EXISTS idx_comments_created_at ON anomaly_comments(created_at DESC);

-- ── maintenance_logs ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS maintenance_logs (
    id          UUID            NOT NULL DEFAULT gen_random_uuid(),
    vehicle_id  VARCHAR(64)     NOT NULL,
    log_type    VARCHAR(64)     NOT NULL,
    title       VARCHAR(256)    NOT NULL,
    description TEXT            NOT NULL,
    technician  VARCHAR(128)    NOT NULL,
    cost        FLOAT,
    anomaly_id  UUID,
    created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT pk_maintenance_logs PRIMARY KEY (id),
    CONSTRAINT fk_ml_vehicle
        FOREIGN KEY (vehicle_id)
        REFERENCES vehicles(vehicle_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_ml_anomaly
        FOREIGN KEY (anomaly_id)
        REFERENCES anomalies(id)
        ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ml_vehicle_id ON maintenance_logs(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_ml_anomaly_id ON maintenance_logs(anomaly_id);
CREATE INDEX IF NOT EXISTS idx_ml_created_at ON maintenance_logs(created_at DESC);

-- ============================================================
-- Done.
-- ============================================================
