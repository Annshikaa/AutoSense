-- ============================================================
-- v5: Expand maintenance log types
-- Converts maintenance_logs.log_type from log_type_enum
-- (4 hardcoded values) to VARCHAR(64) so new log type strings
-- can be added without ALTER TYPE.
-- Run on an existing database:
--   psql -U autosense -d autosense -f v5_maintenance_log_types.sql
-- ============================================================

ALTER TABLE maintenance_logs
    ALTER COLUMN log_type TYPE VARCHAR(64) USING log_type::TEXT;

-- Optional: drop the old enum type if nothing else uses it
-- DROP TYPE IF EXISTS log_type_enum;
