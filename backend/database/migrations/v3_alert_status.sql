-- Migration v3: add status + error_msg columns to alerts table
-- Run against existing AutoSense databases:
--   psql -U postgres -d autosense -f v3_alert_status.sql

ALTER TABLE alerts
    ADD COLUMN IF NOT EXISTS status    VARCHAR(16)  NOT NULL DEFAULT 'sent',
    ADD COLUMN IF NOT EXISTS error_msg VARCHAR(512);
