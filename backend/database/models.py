"""
SQLAlchemy ORM models for AutoSense (PostgreSQL).
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, Column, DateTime, Enum as SAEnum,
    Float, ForeignKey, Integer, String, Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from .connection import Base


# ── Helpers ───────────────────────────────────────────────────────────────────

def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Enum definitions ──────────────────────────────────────────────────────────

class VehicleStatusEnum(str, enum.Enum):
    normal   = "normal"
    warning  = "warning"
    critical = "critical"
    fatal    = "fatal"


class SeverityEnum(str, enum.Enum):
    warning  = "warning"
    critical = "critical"
    fatal    = "fatal"


# Python-level enum used for validation in schemas and routes.
# Stored as String in the DB to avoid PostgreSQL enum migration complexity.
class LogTypeEnum(str, enum.Enum):
    routine_service     = "routine_service"
    fault_resolved      = "fault_resolved"
    inspection          = "inspection"
    brake_service       = "brake_service"
    tire_change         = "tire_change"
    battery_replacement = "battery_replacement"
    oil_change          = "oil_change"
    software_update     = "software_update"
    other               = "other"
    # legacy values kept for backwards compatibility
    repair              = "repair"
    service             = "service"


class VehicleTypeEnum(str, enum.Enum):
    car       = "car"
    truck     = "truck"
    bus       = "bus"
    ambulance = "ambulance"


# ── vehicles ──────────────────────────────────────────────────────────────────

class Vehicle(Base):
    """One row per unique vehicle_id seen by the system."""

    __tablename__ = "vehicles"

    id         = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    vehicle_id = Column(String(64),  unique=True, nullable=False, index=True)
    status     = Column(
        SAEnum(VehicleStatusEnum, name="vehicle_status_enum", create_type=False),
        nullable=False,
        default=VehicleStatusEnum.normal,
    )
    last_seen  = Column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)

    # ── Extended metadata (added v2) ──────────────────────────────────────────
    display_name     = Column(String(128), nullable=True)
    vehicle_type     = Column(String(32),  nullable=True)   # "car"|"truck"|"bus"|"ambulance"
    owner            = Column(String(128), nullable=True)
    notes            = Column(String(512), nullable=True)
    is_active        = Column(Boolean,     nullable=False, default=True)
    odometer         = Column(Float,       nullable=True)
    manufacture_year = Column(Integer,     nullable=True)

    readings = relationship(
        "SensorReading",
        primaryjoin="Vehicle.vehicle_id == foreign(SensorReading.vehicle_id)",
        lazy="select",
        viewonly=True,
    )


# ── sensor_readings ───────────────────────────────────────────────────────────

class SensorReading(Base):
    """Raw sensor packet persisted at ~10 Hz (sub-sampled from the 100 ms rate)."""

    __tablename__ = "sensor_readings"

    id          = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    vehicle_id  = Column(
        String(64),
        ForeignKey("vehicles.vehicle_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    rpm          = Column(Float,   nullable=False)
    speed        = Column(Float,   nullable=False)
    temperature  = Column(Float,   nullable=False)
    throttle     = Column(Float,   nullable=False)
    battery      = Column(Float,   nullable=False)
    fault_active = Column(Boolean, nullable=False, default=False)
    fault_type   = Column(String(64), nullable=True)
    timestamp    = Column(Float,   nullable=False)   # unix ms from C++ simulator
    created_at   = Column(DateTime(timezone=True), nullable=False, default=_now)


# ── anomalies ─────────────────────────────────────────────────────────────────

class Anomaly(Base):
    """One row per anomaly event detected by the edge-AI layer."""

    __tablename__ = "anomalies"

    id            = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    vehicle_id    = Column(String(64),  nullable=False, index=True)
    anomaly_type  = Column(String(128), nullable=False)
    severity      = Column(
        SAEnum(SeverityEnum, name="severity_enum", create_type=False),
        nullable=False,
        default=SeverityEnum.warning,
    )
    if_score      = Column(Float,   nullable=False, default=0.0)
    lstm_error    = Column(Float,   nullable=False, default=0.0)
    sensor_values = Column(JSONB,   nullable=False, default=dict)
    resolved      = Column(Boolean, nullable=False, default=False)
    resolved_by   = Column(String(128),             nullable=True)
    resolved_at   = Column(DateTime(timezone=True), nullable=True)
    resolution_notes = Column(Text,                 nullable=True)
    acknowledged     = Column(Boolean, nullable=False, default=False)
    acknowledged_by  = Column(String(128),             nullable=True)
    acknowledged_at  = Column(DateTime(timezone=True), nullable=True)
    created_at    = Column(DateTime(timezone=True), nullable=False, default=_now)

    alerts   = relationship("Alert",          back_populates="anomaly", cascade="all, delete-orphan")
    comments = relationship("AnomalyComment", back_populates="anomaly", cascade="all, delete-orphan",
                            order_by="AnomalyComment.created_at")


# ── maintenance_logs ─────────────────────────────────────────────────────────

class MaintenanceLog(Base):
    """
    One row per maintenance event: repair, scheduled service, inspection,
    or a technician-confirmed fault resolution.
    """

    __tablename__ = "maintenance_logs"

    id          = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    vehicle_id  = Column(
        String(64),
        ForeignKey("vehicles.vehicle_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    log_type    = Column(String(64), nullable=False)
    title       = Column(String(256), nullable=False)
    description = Column(Text,        nullable=False)
    technician  = Column(String(128), nullable=False)
    cost        = Column(Float,       nullable=True)
    anomaly_id  = Column(
        UUID(as_uuid=False),
        ForeignKey("anomalies.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    created_at  = Column(DateTime(timezone=True), nullable=False, default=_now)

    anomaly = relationship("Anomaly", foreign_keys=[anomaly_id], lazy="select")


# ── alerts ────────────────────────────────────────────────────────────────────

class Alert(Base):
    """Dispatch record — one row per channel per anomaly."""

    __tablename__ = "alerts"

    id         = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    anomaly_id = Column(
        UUID(as_uuid=False),
        ForeignKey("anomalies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    channel   = Column(String(32),  nullable=False)           # email / sms
    status    = Column(String(16),  nullable=False, default="sent")  # sent|skipped|error
    error_msg = Column(String(512), nullable=True)
    sent_at   = Column(DateTime(timezone=True), nullable=False, default=_now)

    anomaly  = relationship("Anomaly", back_populates="alerts")


# ── anomaly_comments ─────────────────────────────────────────────────────────

class AnomalyComment(Base):
    """Free-text notes/comments added to an anomaly by operators."""

    __tablename__ = "anomaly_comments"

    id         = Column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    anomaly_id = Column(
        UUID(as_uuid=False),
        ForeignKey("anomalies.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    author    = Column(String(128), nullable=False)
    comment   = Column(Text,        nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)

    anomaly = relationship("Anomaly", back_populates="comments")
