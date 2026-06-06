"""
Analytics routes
----------------
GET /api/analytics/summary
GET /api/analytics/heatmap
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database.connection import get_db
from database.models import Anomaly, SensorReading, Vehicle

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics", tags=["analytics"])


# ── GET /api/analytics/summary ────────────────────────────────────────────────

@router.get("/summary", response_model=Dict[str, Any])
async def get_summary(db: AsyncSession = Depends(get_db)):
    """
    Dashboard roll-up:
    - total / active vehicles
    - total / active anomalies
    - anomalies in last 24 h
    - most problematic vehicle
    - most common fault type
    """
    # Total vehicles
    total_vehicles: int = (await db.execute(
        select(func.count()).select_from(Vehicle)
    )).scalar_one()

    # Active vehicles (seen in last 60 s — kept simple as DB timestamp comparison)
    from datetime import timedelta
    cutoff_1m = datetime.now(timezone.utc) - timedelta(seconds=60)
    active_vehicles: int = (await db.execute(
        select(func.count()).select_from(Vehicle)
        .where(Vehicle.last_seen >= cutoff_1m)
    )).scalar_one()

    # Total / unresolved anomalies
    total_anomalies: int = (await db.execute(
        select(func.count()).select_from(Anomaly)
    )).scalar_one()

    active_anomalies: int = (await db.execute(
        select(func.count()).select_from(Anomaly)
        .where(Anomaly.resolved == False)
    )).scalar_one()

    # Anomalies in last 24 h
    cutoff_24h = datetime.now(timezone.utc) - timedelta(hours=24)
    anomalies_24h: int = (await db.execute(
        select(func.count()).select_from(Anomaly)
        .where(Anomaly.created_at >= cutoff_24h)
    )).scalar_one()

    # Most problematic vehicle (most total anomalies)
    most_prob_row = (await db.execute(
        select(Anomaly.vehicle_id, func.count().label("cnt"))
        .group_by(Anomaly.vehicle_id)
        .order_by(func.count().desc())
        .limit(1)
    )).first()
    most_problematic: Optional[str] = most_prob_row[0] if most_prob_row else None

    # Most common fault type
    fault_row = (await db.execute(
        select(Anomaly.anomaly_type, func.count().label("cnt"))
        .where(Anomaly.anomaly_type.isnot(None))
        .group_by(Anomaly.anomaly_type)
        .order_by(func.count().desc())
        .limit(1)
    )).first()
    most_common_fault: Optional[str] = fault_row[0] if fault_row else None

    # Per-severity breakdown
    severity_rows = (await db.execute(
        select(Anomaly.severity, func.count().label("cnt"))
        .group_by(Anomaly.severity)
    )).all()
    severity_breakdown = {row[0].value: row[1] for row in severity_rows}

    return {
        "total_vehicles":     total_vehicles,
        "active_vehicles":    active_vehicles,
        "total_anomalies":    total_anomalies,
        "active_anomalies":   active_anomalies,
        "anomalies_last_24h": anomalies_24h,
        "most_problematic_vehicle": most_problematic,
        "most_common_fault_type":   most_common_fault,
        "severity_breakdown": severity_breakdown,
        "generated_at":       datetime.now(timezone.utc).isoformat(),
    }


# ── GET /api/analytics/heatmap ────────────────────────────────────────────────

@router.get("/heatmap", response_model=Dict[str, Any])
async def get_heatmap(db: AsyncSession = Depends(get_db)):
    """
    Per-vehicle, per-fault-type occurrence counts.
    Used by the dashboard heatmap component.

    Response shape:
    {
      "vehicle_1": {"RPM_FAULT": 12, "Temperature_FAULT": 3},
      "vehicle_2": {"Battery_FAULT": 7},
      ...
      "totals":    {"RPM_FAULT": 12, "Temperature_FAULT": 3, "Battery_FAULT": 7},
      "vehicles":  ["vehicle_1", "vehicle_2", "vehicle_3"],
      "fault_types": ["RPM_FAULT", "Temperature_FAULT", "Battery_FAULT"]
    }
    """
    # From sensor_readings (raw fault flags from C++ simulator)
    reading_rows = (await db.execute(
        select(
            SensorReading.vehicle_id,
            SensorReading.fault_type,
            func.count().label("cnt"),
        )
        .where(SensorReading.fault_active == True)
        .where(SensorReading.fault_type.isnot(None))
        .group_by(SensorReading.vehicle_id, SensorReading.fault_type)
        .order_by(SensorReading.vehicle_id, func.count().desc())
    )).all()

    # From anomalies table (edge-AI detected events)
    anomaly_rows = (await db.execute(
        select(
            Anomaly.vehicle_id,
            Anomaly.anomaly_type,
            func.count().label("cnt"),
        )
        .group_by(Anomaly.vehicle_id, Anomaly.anomaly_type)
        .order_by(Anomaly.vehicle_id, func.count().desc())
    )).all()

    # Build nested dict from readings
    heatmap: Dict[str, Dict[str, int]] = {}
    for vid, ft, cnt in reading_rows:
        heatmap.setdefault(vid, {})[ft] = cnt

    # Merge anomaly counts under an "ai_detected" namespace
    ai_map: Dict[str, Dict[str, int]] = {}
    for vid, at, cnt in anomaly_rows:
        ai_map.setdefault(vid, {})[at] = cnt

    # Aggregate totals across all vehicles
    totals: Dict[str, int] = {}
    for vehicle_data in heatmap.values():
        for ft, cnt in vehicle_data.items():
            totals[ft] = totals.get(ft, 0) + cnt

    all_vehicles   = sorted(set(list(heatmap.keys()) + list(ai_map.keys())))
    all_fault_types = sorted(totals.keys())

    return {
        **heatmap,
        "ai_detected": ai_map,
        "totals":      totals,
        "vehicles":    all_vehicles,
        "fault_types": all_fault_types,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
