-- Migration v4: anomaly management fields + comments table
-- Run against existing AutoSense databases:
--   psql -U postgres -d autosense -f v4_anomaly_management.sql

-- ── Extend anomalies ─────────────────────────────────────────────────────────

ALTER TABLE anomalies
    ADD COLUMN IF NOT EXISTS acknowledged      BOOLEAN      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS acknowledged_by   VARCHAR(128),
    ADD COLUMN IF NOT EXISTS acknowledged_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS resolution_notes  TEXT,
    ADD COLUMN IF NOT EXISTS resolved_by       VARCHAR(128),
    ADD COLUMN IF NOT EXISTS resolved_at       TIMESTAMPTZ;

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
