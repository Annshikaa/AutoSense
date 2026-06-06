"""
Pydantic v2 request/response schemas for the AutoSense backend API.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator
from database.models import LogTypeEnum, VehicleTypeEnum


# ── Input schemas  (Edge AI → Backend) ───────────────────────────────────────

class SensorReading(BaseModel):
    """
    A single sensor packet forwarded from the edge-AI layer.
    Matches the JSON produced by the C++ ECU simulator.
    """
    vehicle_id:   str   = Field(min_length=1, max_length=64)
    vehicle_type: Optional[str] = Field(default=None, max_length=32)
    timestamp:    float = Field(description="Unix time in milliseconds (from C++ simulator)")
    rpm:          float = Field(ge=0,    le=10_000)
    speed:        float = Field(ge=-1,   le=250)      # allow tiny noise below 0
    temperature:  float = Field(ge=-40,  le=200)
    throttle:     float = Field(ge=-5,   le=110)      # allow noise at boundaries
    battery:      float = Field(ge=0,    le=32)       # up to 28 V for truck/bus
    fault_active: bool  = False
    fault_type:   Optional[str] = Field(default=None, max_length=64)
    # Extra type-specific sensors (optional — only one will be present per packet)
    fuel_level:   Optional[float] = None   # car
    load_weight:  Optional[float] = None   # truck
    door_status:  Optional[float] = None   # bus
    siren_active: Optional[float] = None   # ambulance

    @field_validator("vehicle_id")
    @classmethod
    def _strip_vehicle_id(cls, v: str) -> str:
        return v.strip()

    model_config = {
        "json_schema_extra": {
            "example": {
                "vehicle_id":  "vehicle_1",
                "timestamp":   1_717_632_000_000.0,
                "rpm":         2350.5,
                "speed":       65.2,
                "temperature": 91.3,
                "throttle":    34.7,
                "battery":     13.2,
                "fault_active": False,
                "fault_type":  None,
            }
        }
    }


class AnomalyEvent(BaseModel):
    """
    An anomaly event detected by the IsolationForest / LSTM pipeline
    in edge-ai/ and forwarded to the backend for persistence.
    """
    vehicle_id:    str   = Field(min_length=1, max_length=64)
    anomaly_type:  str   = Field(min_length=1, max_length=128)
    if_score:      float = Field(description="IsolationForest score; more negative = more anomalous")
    lstm_error:    float = Field(ge=0, description="LSTM prediction MAE")
    sensor_values: Dict[str, float]
    fault_active:  bool  = False
    fault_type:    Optional[str] = None

    @property
    def severity(self) -> Literal["warning", "critical", "fatal"]:
        """Derive severity from model signals."""
        if self.if_score < -0.30 or self.lstm_error > 200:
            return "fatal"
        if self.if_score < -0.20 or self.lstm_error > 100:
            return "critical"
        return "warning"

    @field_validator("sensor_values")
    @classmethod
    def _check_sensor_keys(cls, v: dict) -> dict:
        expected = {"rpm", "speed", "temperature", "throttle", "battery"}
        missing  = expected - v.keys()
        if missing:
            raise ValueError(f"sensor_values missing keys: {missing}")
        return v


# ── Response schemas  (Backend → API consumers) ───────────────────────────────

class VehicleStatusResponse(BaseModel):
    """Current status row for one vehicle."""
    vehicle_id: str
    status:     str
    last_seen:  datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class SensorReadingResponse(BaseModel):
    """Persisted sensor reading returned by the API."""
    id:           str
    vehicle_id:   str
    rpm:          float
    speed:        float
    temperature:  float
    throttle:     float
    battery:      float
    fault_active: bool
    fault_type:   Optional[str]
    timestamp:    float
    created_at:   datetime

    model_config = {"from_attributes": True}


class AnomalyResponse(BaseModel):
    """Persisted anomaly event returned by the API."""
    id:            str
    vehicle_id:    str
    anomaly_type:  str
    severity:      str
    if_score:      float
    lstm_error:    float
    sensor_values: Dict[str, float]
    resolved:      bool
    created_at:    datetime

    model_config = {"from_attributes": True}


class VehicleSummary(BaseModel):
    """Per-vehicle roll-up used inside DashboardSummary."""
    vehicle_id:       str
    status:           str
    last_seen:        datetime
    total_readings:   int = 0
    total_anomalies:  int = 0
    active_anomalies: int = 0
    latest_sensors:   Optional[Dict[str, float]] = None


# ── Vehicle management schemas ────────────────────────────────────────────────

class VehicleRegisterRequest(BaseModel):
    vehicle_id:       str            = Field(min_length=1, max_length=64)
    vehicle_type:     VehicleTypeEnum
    display_name:     Optional[str]  = Field(default=None, max_length=128)
    owner:            Optional[str]  = Field(default=None, max_length=128)
    notes:            Optional[str]  = Field(default=None, max_length=512)
    odometer:         Optional[float] = Field(default=None, ge=0)
    manufacture_year: Optional[int]   = Field(default=None, ge=1900, le=2100)

    @field_validator("vehicle_id")
    @classmethod
    def _clean_id(cls, v: str) -> str:
        return v.strip().lower().replace(" ", "_")


class VehicleUpdateRequest(BaseModel):
    display_name:     Optional[str]   = Field(default=None, max_length=128)
    owner:            Optional[str]   = Field(default=None, max_length=128)
    notes:            Optional[str]   = Field(default=None, max_length=512)
    odometer:         Optional[float] = Field(default=None, ge=0)
    manufacture_year: Optional[int]   = Field(default=None, ge=1900, le=2100)


class VehicleDetailResponse(BaseModel):
    vehicle_id:       str
    vehicle_type:     Optional[str]
    display_name:     Optional[str]
    owner:            Optional[str]
    notes:            Optional[str]
    status:           str
    is_active:        bool
    odometer:         Optional[float]
    manufacture_year: Optional[int]
    last_seen:        datetime
    created_at:       datetime

    model_config = {"from_attributes": True}


# ── Maintenance schemas ───────────────────────────────────────────────────────

class MaintenanceCreateRequest(BaseModel):
    vehicle_id:  str             = Field(min_length=1, max_length=64)
    log_type:    LogTypeEnum
    title:       Optional[str]   = Field(default=None, max_length=256)
    description: Optional[str]   = None
    technician:  str             = Field(min_length=1, max_length=128)
    cost:        Optional[float] = Field(default=None, ge=0)
    anomaly_id:  Optional[str]   = None


# ── Anomaly management schemas ────────────────────────────────────────────────

class AcknowledgeRequest(BaseModel):
    acknowledged_by: str = Field(min_length=1, max_length=128)


class ResolveRequest(BaseModel):
    resolved_by:            str           = Field(min_length=1, max_length=128)
    resolution_notes:       Optional[str] = None
    create_maintenance_log: bool          = False


class CommentRequest(BaseModel):
    author:  str = Field(min_length=1, max_length=128)
    comment: str = Field(min_length=1)


class DashboardSummary(BaseModel):
    """
    Top-level dashboard payload — single request returns everything
    the frontend needs to render the main view.
    """
    total_vehicles:   int
    active_vehicles:  int
    total_readings:   int
    total_anomalies:  int
    active_anomalies: int
    vehicles:         List[VehicleSummary]
    generated_at:     datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
