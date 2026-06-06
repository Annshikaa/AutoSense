"""
Sensor routes
-------------
POST /api/sensors/reading
GET  /api/sensors/{vehicle_id}/history?limit=100
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.connection import RedisCache, get_db, get_redis
from database.models import SensorReading, Vehicle
from models.schemas import SensorReading as SensorReadingSchema

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/sensors", tags=["sensors"])

# Sub-sample rate: persist 1 in N packets to avoid flooding the DB at 100 ms
_PERSIST_EVERY = 10
_counters: Dict[str, int] = {}


async def _upsert_vehicle(db: AsyncSession, vehicle_id: str) -> None:
    """Ensure a vehicle row exists; update last_seen."""
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    stmt = (
        pg_insert(Vehicle)
        .values(
            vehicle_id = vehicle_id,
            status     = "normal",
            last_seen  = datetime.now(timezone.utc),
        )
        .on_conflict_do_update(
            index_elements=["vehicle_id"],
            set_={"last_seen": datetime.now(timezone.utc)},
        )
    )
    await db.execute(stmt)


# ── POST /api/sensors/reading ─────────────────────────────────────────────────

@router.post("/reading", status_code=status.HTTP_200_OK)
async def ingest_reading(
    payload: SensorReadingSchema,
    db:      AsyncSession = Depends(get_db),
    redis    = Depends(get_redis),
):
    """
    Receive one sensor packet from the edge-AI layer.
    - Always updates Redis cache (TTL 5 s).
    - Persists to PostgreSQL every 10th packet per vehicle to limit write rate.
    """
    cache = RedisCache(redis)

    # ── Redis update (always) ─────────────────────────────────────────────────
    sensor_dict = {
        "rpm":         payload.rpm,
        "speed":       payload.speed,
        "temperature": payload.temperature,
        "throttle":    payload.throttle,
        "battery":     payload.battery,
        "fault_active": payload.fault_active,
        "fault_type":  payload.fault_type,
        "timestamp":   payload.timestamp,
    }
    # Include whichever extra sensor was sent (only one per vehicle type)
    for key in ("fuel_level", "load_weight", "door_status", "siren_active"):
        val = getattr(payload, key, None)
        if val is not None:
            sensor_dict[key] = val
    await cache.set_latest_reading(payload.vehicle_id, sensor_dict)

    # ── Persist to Postgres (sub-sampled) ─────────────────────────────────────
    _counters[payload.vehicle_id] = _counters.get(payload.vehicle_id, 0) + 1
    if _counters[payload.vehicle_id] % _PERSIST_EVERY == 0:
        await _upsert_vehicle(db, payload.vehicle_id)
        db.add(SensorReading(
            vehicle_id   = payload.vehicle_id,
            rpm          = payload.rpm,
            speed        = payload.speed,
            temperature  = payload.temperature,
            throttle     = payload.throttle,
            battery      = payload.battery,
            fault_active = payload.fault_active,
            fault_type   = payload.fault_type,
            timestamp    = payload.timestamp,
        ))

    return {"status": "ok", "vehicle_id": payload.vehicle_id}


# ── GET /api/sensors/{vehicle_id}/history ─────────────────────────────────────

@router.get("/{vehicle_id}/history", response_model=List[Dict[str, Any]])
async def get_history(
    vehicle_id: str,
    limit: int = Query(default=100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
):
    """Return the last `limit` sensor readings for a vehicle, newest first."""
    rows = (await db.execute(
        select(SensorReading)
        .where(SensorReading.vehicle_id == vehicle_id)
        .order_by(SensorReading.created_at.desc())
        .limit(limit)
    )).scalars().all()

    if not rows:
        # Return empty list — vehicle might just have no history yet
        return []

    return [
        {
            "id":           r.id,
            "vehicle_id":   r.vehicle_id,
            "rpm":          r.rpm,
            "speed":        r.speed,
            "temperature":  r.temperature,
            "throttle":     r.throttle,
            "battery":      r.battery,
            "fault_active": r.fault_active,
            "fault_type":   r.fault_type,
            "timestamp":    r.timestamp,
            "created_at":   r.created_at.isoformat(),
        }
        for r in rows
    ]
