"""
Vehicle routes
--------------
GET    /api/vehicles                    — list active vehicles (+ anomaly counts)
GET    /api/vehicles/types              — static vehicle type specs
POST   /api/vehicles/register           — register a new vehicle
GET    /api/vehicles/{vehicle_id}       — full vehicle detail
GET    /api/vehicles/{vehicle_id}/status
PATCH  /api/vehicles/{vehicle_id}       — update display_name / owner / notes
DELETE /api/vehicles/{vehicle_id}       — soft-delete (keeps history)

IMPORTANT: static paths (/types, /register intent) are defined BEFORE
the /{vehicle_id} catch-all so FastAPI doesn't swallow them.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

import state
from database.connection import RedisCache, get_db, get_redis
from database.models import Anomaly, SensorReading, Vehicle, VehicleTypeEnum
from models.schemas import VehicleRegisterRequest, VehicleUpdateRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/vehicles", tags=["vehicles"])


# ── Sensor specs per vehicle type (static, served to frontend) ────────────────

_VEHICLE_TYPES: Dict[str, Any] = {
    "car": {
        "type":         "car",
        "display_name": "Passenger Car",
        "description":  "Standard passenger vehicle. Uniform fault probability.",
        "extra_sensor": "fuel_level",
        "sensors": {
            "rpm":         {"unit": "rpm", "normal": [800,  4000], "fault_threshold": 6500},
            "speed":       {"unit": "km/h","normal": [0,    120],  "fault_threshold": None},
            "temperature": {"unit": "°C",  "normal": [85,   95],   "fault_threshold": 105},
            "throttle":    {"unit": "%",   "normal": [0,    100],  "fault_threshold": 95},
            "battery":     {"unit": "V",   "normal": [12.0, 14.5], "fault_threshold": 11.5},
            "fuel_level":  {"unit": "%",   "normal": [10,   100],  "fault_threshold": 15},
        },
        "fault_profile": {"rpm": 1, "speed": 1, "temperature": 1, "throttle": 1, "battery": 1},
        "inject_interval_s": [30, 60],
    },
    "truck": {
        "type":         "truck",
        "display_name": "Heavy Truck",
        "description":  "Heavy-duty vehicle. 3× more likely to have temperature faults.",
        "extra_sensor": "load_weight",
        "sensors": {
            "rpm":         {"unit": "rpm", "normal": [600,  2500], "fault_threshold": 4200},
            "speed":       {"unit": "km/h","normal": [0,    90],   "fault_threshold": None},
            "temperature": {"unit": "°C",  "normal": [90,   105],  "fault_threshold": 120},
            "throttle":    {"unit": "%",   "normal": [0,    100],  "fault_threshold": 95},
            "battery":     {"unit": "V",   "normal": [24.0, 28.0], "fault_threshold": 22.0},
            "load_weight": {"unit": "%",   "normal": [40,   95],   "fault_threshold": 100},
        },
        "fault_profile": {"rpm": 1, "speed": 1, "temperature": 3, "throttle": 1, "battery": 1},
        "inject_interval_s": [20, 45],
    },
    "bus": {
        "type":         "bus",
        "display_name": "City Bus",
        "description":  "Passenger bus. 3× more likely to have battery faults.",
        "extra_sensor": "door_status",
        "sensors": {
            "rpm":         {"unit": "rpm", "normal": [700,  3000], "fault_threshold": 4800},
            "speed":       {"unit": "km/h","normal": [0,    80],   "fault_threshold": None},
            "temperature": {"unit": "°C",  "normal": [88,   100],  "fault_threshold": 115},
            "throttle":    {"unit": "%",   "normal": [0,    100],  "fault_threshold": 95},
            "battery":     {"unit": "V",   "normal": [24.0, 28.0], "fault_threshold": 21.0},
            "door_status": {"unit": "0/1", "normal": [0,    1],    "fault_threshold": None},
        },
        "fault_profile": {"rpm": 1, "speed": 1, "temperature": 1, "throttle": 1, "battery": 3},
        "inject_interval_s": [25, 50],
    },
    "ambulance": {
        "type":         "ambulance",
        "display_name": "Ambulance",
        "description":  "Emergency vehicle. Rare faults, fast recovery.",
        "extra_sensor": "siren_active",
        "sensors": {
            "rpm":          {"unit": "rpm", "normal": [800,  5000], "fault_threshold": 7000},
            "speed":        {"unit": "km/h","normal": [0,    140],  "fault_threshold": None},
            "temperature":  {"unit": "°C",  "normal": [85,   95],   "fault_threshold": 110},
            "throttle":     {"unit": "%",   "normal": [0,    100],  "fault_threshold": 95},
            "battery":      {"unit": "V",   "normal": [12.0, 14.5], "fault_threshold": 11.5},
            "siren_active": {"unit": "0/1", "normal": [0,    1],    "fault_threshold": None},
        },
        "fault_profile": {"rpm": 1, "speed": 1, "temperature": 1, "throttle": 1, "battery": 1},
        "inject_interval_s": [60, 120],
    },
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _vehicle_to_dict(v: Vehicle, total: int = 0, active: int = 0) -> Dict[str, Any]:
    return {
        "vehicle_id":       v.vehicle_id,
        "vehicle_type":     v.vehicle_type,
        "display_name":     v.display_name,
        "owner":            v.owner,
        "notes":            v.notes,
        "status":           v.status.value,
        "is_active":        v.is_active,
        "odometer":         v.odometer,
        "manufacture_year": v.manufacture_year,
        "last_seen":        v.last_seen.isoformat(),
        "created_at":       v.created_at.isoformat(),
        "total_anomalies":  total,
        "active_anomalies": active,
    }


# ── GET /api/vehicles ─────────────────────────────────────────────────────────

@router.get("", response_model=List[Dict[str, Any]])
async def list_vehicles(
    include_inactive: bool = Query(default=False),
    db: AsyncSession = Depends(get_db),
):
    """All vehicles with status and anomaly counts. Active-only by default."""
    q = (
        select(
            Vehicle,
            func.count(Anomaly.id).label("total_anomalies"),
            func.count(Anomaly.id).filter(Anomaly.resolved == False).label("active_anomalies"),
        )
        .outerjoin(Anomaly, Vehicle.vehicle_id == Anomaly.vehicle_id)
        .group_by(Vehicle.id)
        .order_by(Vehicle.vehicle_id)
    )
    if not include_inactive:
        q = q.where(Vehicle.is_active == True)

    rows = (await db.execute(q)).all()
    return [_vehicle_to_dict(v, total or 0, active or 0) for v, total, active in rows]


# ── GET /api/vehicles/types  (must be before /{vehicle_id}) ──────────────────

@router.get("/types", response_model=Dict[str, Any])
async def get_vehicle_types():
    """Static sensor specs and fault profiles for each vehicle type."""
    return {"types": list(_VEHICLE_TYPES.values())}


# ── POST /api/vehicles/register ───────────────────────────────────────────────

@router.post("/register", status_code=status.HTTP_201_CREATED,
             response_model=Dict[str, Any])
async def register_vehicle(
    body: VehicleRegisterRequest,
    db:   AsyncSession = Depends(get_db),
):
    """
    Register a new vehicle. Returns 409 if vehicle_id already exists.
    Adds the vehicle to the live broadcast loop immediately.
    """
    existing = (await db.execute(
        select(Vehicle).where(Vehicle.vehicle_id == body.vehicle_id)
    )).scalar_one_or_none()

    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Vehicle '{body.vehicle_id}' already exists. "
                   f"Use PATCH to update or DELETE to remove it first.",
        )

    vehicle = Vehicle(
        vehicle_id       = body.vehicle_id,
        vehicle_type     = body.vehicle_type.value,
        display_name     = body.display_name,
        owner            = body.owner,
        notes            = body.notes,
        odometer         = body.odometer,
        manufacture_year = body.manufacture_year,
        status           = "normal",
        is_active        = True,
        last_seen        = datetime.now(timezone.utc),
    )
    db.add(vehicle)
    await db.commit()
    await db.refresh(vehicle)

    # Add to live broadcast loop
    state.active_vehicles.add(body.vehicle_id)
    logger.info("Registered vehicle: %s (%s)", body.vehicle_id, body.vehicle_type.value)

    return _vehicle_to_dict(vehicle)


# ── GET /api/vehicles/{vehicle_id} ────────────────────────────────────────────

@router.get("/{vehicle_id}", response_model=Dict[str, Any])
async def get_vehicle(vehicle_id: str, db: AsyncSession = Depends(get_db)):
    """Full detail: vehicle row + latest reading + last 10 anomalies."""
    vehicle = (await db.execute(
        select(Vehicle).where(Vehicle.vehicle_id == vehicle_id)
    )).scalar_one_or_none()

    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Vehicle '{vehicle_id}' not found")

    latest_row = (await db.execute(
        select(SensorReading)
        .where(SensorReading.vehicle_id == vehicle_id)
        .order_by(SensorReading.created_at.desc())
        .limit(1)
    )).scalar_one_or_none()

    latest_sensors: Optional[dict] = None
    if latest_row:
        latest_sensors = {
            "rpm":         latest_row.rpm,
            "speed":       latest_row.speed,
            "temperature": latest_row.temperature,
            "throttle":    latest_row.throttle,
            "battery":     latest_row.battery,
            "fault_active": latest_row.fault_active,
            "fault_type":  latest_row.fault_type,
            "timestamp":   latest_row.timestamp,
        }

    anomaly_rows = (await db.execute(
        select(Anomaly)
        .where(Anomaly.vehicle_id == vehicle_id)
        .order_by(Anomaly.created_at.desc())
        .limit(10)
    )).scalars().all()

    result = _vehicle_to_dict(vehicle)
    result["latest_sensors"] = latest_sensors
    result["recent_anomalies"] = [
        {
            "id":           a.id,
            "anomaly_type": a.anomaly_type,
            "severity":     a.severity.value,
            "if_score":     a.if_score,
            "lstm_error":   a.lstm_error,
            "resolved":     a.resolved,
            "created_at":   a.created_at.isoformat(),
        }
        for a in anomaly_rows
    ]
    return result


# ── GET /api/vehicles/{vehicle_id}/status ─────────────────────────────────────

@router.get("/{vehicle_id}/status", response_model=Dict[str, Any])
async def get_vehicle_status(
    vehicle_id: str,
    db:    AsyncSession = Depends(get_db),
    redis = Depends(get_redis),
):
    """Fastest status check — Redis cache → PostgreSQL fallback."""
    cache = RedisCache(redis)

    cached_status  = await cache.get_vehicle_status(vehicle_id)
    cached_sensors = await cache.get_latest_reading(vehicle_id)

    if cached_status and cached_sensors:
        return {
            "vehicle_id":     vehicle_id,
            "status":         cached_status,
            "latest_sensors": cached_sensors,
            "source":         "cache",
        }

    vehicle = (await db.execute(
        select(Vehicle).where(Vehicle.vehicle_id == vehicle_id)
    )).scalar_one_or_none()

    if vehicle is None:
        raise HTTPException(status_code=404, detail=f"Vehicle '{vehicle_id}' not found")

    latest = (await db.execute(
        select(SensorReading)
        .where(SensorReading.vehicle_id == vehicle_id)
        .order_by(SensorReading.created_at.desc())
        .limit(1)
    )).scalar_one_or_none()

    sensors = None
    if latest:
        sensors = {
            "rpm": latest.rpm, "speed": latest.speed,
            "temperature": latest.temperature, "throttle": latest.throttle,
            "battery": latest.battery,
        }
        await cache.set_latest_reading(vehicle_id, sensors)

    await cache.set_vehicle_status(vehicle_id, vehicle.status.value)

    return {
        "vehicle_id":     vehicle_id,
        "status":         vehicle.status.value,
        "latest_sensors": sensors,
        "source":         "db",
    }


# ── PATCH /api/vehicles/{vehicle_id} ─────────────────────────────────────────

@router.patch("/{vehicle_id}", response_model=Dict[str, Any])
async def update_vehicle(
    vehicle_id: str,
    body: VehicleUpdateRequest,
    db:   AsyncSession = Depends(get_db),
):
    """Update mutable metadata: display_name, owner, notes, odometer, manufacture_year."""
    vehicle = (await db.execute(
        select(Vehicle).where(Vehicle.vehicle_id == vehicle_id)
    )).scalar_one_or_none()

    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Vehicle '{vehicle_id}' not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(vehicle, field, value)

    await db.commit()
    await db.refresh(vehicle)

    logger.info("Updated vehicle %s: %s", vehicle_id, list(update_data.keys()))
    return _vehicle_to_dict(vehicle)


# ── DELETE /api/vehicles/{vehicle_id} ────────────────────────────────────────

@router.delete("/{vehicle_id}", status_code=status.HTTP_200_OK)
async def delete_vehicle(
    vehicle_id: str,
    db:    AsyncSession = Depends(get_db),
    redis = Depends(get_redis),
):
    """
    Soft-delete: sets is_active=False and removes from live broadcast.
    All historical sensor readings and anomalies are preserved.
    """
    vehicle = (await db.execute(
        select(Vehicle).where(Vehicle.vehicle_id == vehicle_id)
    )).scalar_one_or_none()

    if vehicle is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail=f"Vehicle '{vehicle_id}' not found")

    if not vehicle.is_active:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT,
                            detail=f"Vehicle '{vehicle_id}' is already inactive")

    vehicle.is_active = False
    await db.commit()

    # Remove from live broadcast loop
    state.active_vehicles.discard(vehicle_id)

    # Purge Redis cache so stale data isn't broadcast after removal
    cache = RedisCache(redis)
    await cache._r.delete(
        f"vehicle:{vehicle_id}:latest",
        f"vehicle:{vehicle_id}:status",
    )

    logger.info("Soft-deleted vehicle: %s", vehicle_id)
    return {
        "status":     "deactivated",
        "vehicle_id": vehicle_id,
        "message":    "Vehicle deactivated. History preserved. Use POST /register to re-add.",
    }
