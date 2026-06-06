"""
Maintenance routes
------------------
POST /api/maintenance
GET  /api/maintenance                          ?vehicle_id=&log_type=&limit=50
GET  /api/maintenance/export/{vehicle_id}      full JSON export for PDF generation
GET  /api/maintenance/{vehicle_id}/summary     aggregate stats

Path ordering: /export/{vehicle_id} and /{vehicle_id}/summary are unambiguous
because FastAPI matches the literal "export" / "summary" segment. No special
ordering is needed here, but export is defined first for clarity.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database.connection import get_db
from database.models import (
    Anomaly, MaintenanceLog, Vehicle,
)
from models.schemas import MaintenanceCreateRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


# ── Serialiser helper ─────────────────────────────────────────────────────────

def _log_to_dict(log: MaintenanceLog, include_anomaly: bool = False) -> Dict[str, Any]:
    d: Dict[str, Any] = {
        "id":          log.id,
        "vehicle_id":  log.vehicle_id,
        "log_type":    log.log_type if isinstance(log.log_type, str) else log.log_type.value,
        "title":       log.title,
        "description": log.description,
        "technician":  log.technician,
        "cost":        log.cost,
        "anomaly_id":  log.anomaly_id,
        "created_at":  log.created_at.isoformat(),
    }
    if include_anomaly and log.anomaly is not None:
        a = log.anomaly
        d["linked_anomaly"] = {
            "id":            a.id,
            "anomaly_type":  a.anomaly_type,
            "severity":      a.severity.value,
            "if_score":      a.if_score,
            "lstm_error":    a.lstm_error,
            "sensor_values": a.sensor_values,
            "resolved":      a.resolved,
            "created_at":    a.created_at.isoformat(),
        }
    else:
        d["linked_anomaly"] = None
    return d


# ── POST /api/maintenance ─────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED, response_model=Dict[str, Any])
async def create_maintenance_log(
    body: MaintenanceCreateRequest,
    db:   AsyncSession = Depends(get_db),
):
    """
    Create a maintenance log entry.
    If anomaly_id is supplied, that anomaly is marked resolved atomically.
    """
    # Validate vehicle exists
    vehicle = (await db.execute(
        select(Vehicle).where(Vehicle.vehicle_id == body.vehicle_id)
    )).scalar_one_or_none()
    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Vehicle '{body.vehicle_id}' not found",
        )

    # Validate + resolve the linked anomaly if provided
    anomaly: Optional[Anomaly] = None
    if body.anomaly_id:
        anomaly = (await db.execute(
            select(Anomaly).where(Anomaly.id == body.anomaly_id)
        )).scalar_one_or_none()
        if anomaly is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Anomaly '{body.anomaly_id}' not found",
            )
        if not anomaly.resolved:
            anomaly.resolved = True
            logger.info("Anomaly %s resolved via maintenance log", body.anomaly_id)

    auto_title = body.log_type.value.replace("_", " ").title()
    log = MaintenanceLog(
        vehicle_id  = body.vehicle_id,
        log_type    = body.log_type.value,
        title       = body.title or auto_title,
        description = body.description or "",
        technician  = body.technician,
        cost        = body.cost,
        anomaly_id  = body.anomaly_id,
    )
    db.add(log)
    await db.flush()   # get log.id before commit

    await db.commit()
    await db.refresh(log)

    result = _log_to_dict(log)
    if anomaly:
        result["anomaly_resolved"] = True
    return result


# ── GET /api/maintenance ──────────────────────────────────────────────────────

@router.get("", response_model=List[Dict[str, Any]])
async def list_maintenance_logs(
    vehicle_id: Optional[str] = Query(default=None),
    log_type:   Optional[str] = Query(default=None),
    limit:      int           = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Filtered maintenance history. All params optional."""
    q = (
        select(MaintenanceLog)
        .order_by(MaintenanceLog.created_at.desc())
        .limit(limit)
    )
    if vehicle_id:
        q = q.where(MaintenanceLog.vehicle_id == vehicle_id)
    if log_type:
        q = q.where(MaintenanceLog.log_type == log_type)

    rows = (await db.execute(q)).scalars().all()
    return [_log_to_dict(row, include_anomaly=True) for row in rows]


# ── GET /api/maintenance/export/{vehicle_id} ──────────────────────────────────

@router.get("/export/{vehicle_id}", response_model=Dict[str, Any])
async def export_maintenance(
    vehicle_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Full maintenance history export for PDF / report generation.
    Returns vehicle metadata, all logs (with linked anomaly details),
    and the same summary stats as /summary.
    """
    vehicle = (await db.execute(
        select(Vehicle).where(Vehicle.vehicle_id == vehicle_id)
    )).scalar_one_or_none()
    if vehicle is None:
        raise HTTPException(status_code=404, detail=f"Vehicle '{vehicle_id}' not found")

    # All logs for this vehicle, oldest-first for chronological report
    log_rows = (await db.execute(
        select(MaintenanceLog)
        .where(MaintenanceLog.vehicle_id == vehicle_id)
        .order_by(MaintenanceLog.created_at.asc())
    )).scalars().all()

    # Aggregate stats (same as /summary)
    agg = (await db.execute(
        select(
            func.count(MaintenanceLog.id).label("total"),
            func.coalesce(func.sum(MaintenanceLog.cost), 0.0).label("total_cost"),
            func.max(MaintenanceLog.created_at).label("last_service"),
        )
        .where(MaintenanceLog.vehicle_id == vehicle_id)
    )).one()

    breakdown_rows = (await db.execute(
        select(MaintenanceLog.log_type, func.count(MaintenanceLog.id).label("cnt"))
        .where(MaintenanceLog.vehicle_id == vehicle_id)
        .group_by(MaintenanceLog.log_type)
    )).all()

    fault_row = (await db.execute(
        select(Anomaly.anomaly_type, func.count(Anomaly.id).label("cnt"))
        .join(MaintenanceLog, MaintenanceLog.anomaly_id == Anomaly.id)
        .where(MaintenanceLog.vehicle_id == vehicle_id)
        .group_by(Anomaly.anomaly_type)
        .order_by(func.count(Anomaly.id).desc())
        .limit(1)
    )).one_or_none()

    return {
        "vehicle": {
            "vehicle_id":       vehicle.vehicle_id,
            "vehicle_type":     vehicle.vehicle_type,
            "display_name":     vehicle.display_name,
            "owner":            vehicle.owner,
            "manufacture_year": vehicle.manufacture_year,
            "odometer":         vehicle.odometer,
        },
        "summary": {
            "total_logs":             agg.total,
            "total_cost":             round(agg.total_cost or 0.0, 2),
            "last_service_date":      agg.last_service.isoformat() if agg.last_service else None,
            "most_common_fault_type": fault_row.anomaly_type if fault_row else None,
            "breakdown_by_type": {
                (row.log_type if isinstance(row.log_type, str) else row.log_type.value): row.cnt for row in breakdown_rows
            },
        },
        "logs": [_log_to_dict(row, include_anomaly=True) for row in log_rows],
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }


# ── GET /api/maintenance/{vehicle_id}/summary ─────────────────────────────────

@router.get("/{vehicle_id}/summary", response_model=Dict[str, Any])
async def get_maintenance_summary(
    vehicle_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Aggregate maintenance stats for one vehicle:
    total logs, total cost, last service date, most common fault,
    and per-type breakdown.
    """
    vehicle = (await db.execute(
        select(Vehicle).where(Vehicle.vehicle_id == vehicle_id)
    )).scalar_one_or_none()
    if vehicle is None:
        raise HTTPException(status_code=404, detail=f"Vehicle '{vehicle_id}' not found")

    agg = (await db.execute(
        select(
            func.count(MaintenanceLog.id).label("total"),
            func.coalesce(func.sum(MaintenanceLog.cost), 0.0).label("total_cost"),
            func.max(MaintenanceLog.created_at).label("last_service"),
        )
        .where(MaintenanceLog.vehicle_id == vehicle_id)
    )).one()

    breakdown_rows = (await db.execute(
        select(MaintenanceLog.log_type, func.count(MaintenanceLog.id).label("cnt"))
        .where(MaintenanceLog.vehicle_id == vehicle_id)
        .group_by(MaintenanceLog.log_type)
    )).all()

    # Most common fault type across all linked anomalies
    fault_row = (await db.execute(
        select(Anomaly.anomaly_type, func.count(Anomaly.id).label("cnt"))
        .join(MaintenanceLog, MaintenanceLog.anomaly_id == Anomaly.id)
        .where(MaintenanceLog.vehicle_id == vehicle_id)
        .group_by(Anomaly.anomaly_type)
        .order_by(func.count(Anomaly.id).desc())
        .limit(1)
    )).one_or_none()

    # Recent logs (last 5)
    recent_rows = (await db.execute(
        select(MaintenanceLog)
        .where(MaintenanceLog.vehicle_id == vehicle_id)
        .order_by(MaintenanceLog.created_at.desc())
        .limit(5)
    )).scalars().all()

    return {
        "vehicle_id":             vehicle_id,
        "total_logs":             agg.total,
        "total_cost":             round(agg.total_cost or 0.0, 2),
        "last_service_date":      agg.last_service.isoformat() if agg.last_service else None,
        "most_common_fault_type": fault_row.anomaly_type if fault_row else None,
        "breakdown_by_type": {
            row.log_type.value: row.cnt for row in breakdown_rows
        },
        "recent_logs": [_log_to_dict(row) for row in recent_rows],
    }
