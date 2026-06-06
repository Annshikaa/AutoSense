"""
Anomaly routes
--------------
POST  /api/anomalies
GET   /api/anomalies?vehicle_id=&severity=&limit=50
GET   /api/anomalies/active                         — all unresolved (no limit)
GET   /api/anomalies/{anomaly_id}
PATCH /api/anomalies/{anomaly_id}/acknowledge
PATCH /api/anomalies/{anomaly_id}/resolve
POST  /api/anomalies/{anomaly_id}/comment

IMPORTANT: /active must be defined BEFORE /{anomaly_id} or FastAPI will treat
"active" as an anomaly_id parameter.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from api.websocket import manager as ws_manager
from database.connection import get_db, get_redis
from database.models import (
    Anomaly, AnomalyComment, LogTypeEnum, MaintenanceLog,
    SeverityEnum, Vehicle, VehicleStatusEnum,
)
from models.schemas import (
    AcknowledgeRequest, AnomalyEvent, CommentRequest, ResolveRequest,
)
from services.notification_rules import dispatch_alerts

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/anomalies", tags=["anomalies"])


# ── Severity / status helpers ─────────────────────────────────────────────────

_STATUS_MAP: Dict[str, VehicleStatusEnum] = {
    "warning":  VehicleStatusEnum.warning,
    "critical": VehicleStatusEnum.critical,
    "fatal":    VehicleStatusEnum.fatal,
}

_SEVERITY_RANK = {"warning": 0, "critical": 1, "fatal": 2}
_RANK_TO_STATUS = {
    0: VehicleStatusEnum.warning,
    1: VehicleStatusEnum.critical,
    2: VehicleStatusEnum.fatal,
}


def _derive_severity(event: AnomalyEvent) -> SeverityEnum:
    return SeverityEnum(event.severity)


def _anomaly_to_dict(anomaly: Anomaly, include_comments: bool = False) -> Dict[str, Any]:
    d: Dict[str, Any] = {
        "id":            anomaly.id,
        "vehicle_id":    anomaly.vehicle_id,
        "anomaly_type":  anomaly.anomaly_type,
        "severity":      anomaly.severity.value,
        "if_score":      anomaly.if_score,
        "lstm_error":    anomaly.lstm_error,
        "sensor_values": anomaly.sensor_values,
        # resolution
        "resolved":          anomaly.resolved,
        "resolved_by":       anomaly.resolved_by,
        "resolved_at":       anomaly.resolved_at.isoformat() if anomaly.resolved_at else None,
        "resolution_notes":  anomaly.resolution_notes,
        # acknowledgement
        "acknowledged":      anomaly.acknowledged,
        "acknowledged_by":   anomaly.acknowledged_by,
        "acknowledged_at":   anomaly.acknowledged_at.isoformat() if anomaly.acknowledged_at else None,
        "created_at":    anomaly.created_at.isoformat(),
    }
    if include_comments:
        d["comments"] = [
            {
                "id":         c.id,
                "author":     c.author,
                "comment":    c.comment,
                "created_at": c.created_at.isoformat(),
            }
            for c in (anomaly.comments or [])
        ]
    return d


async def _escalate_vehicle_status(
    db: AsyncSession,
    vehicle_id: str,
    new_severity: str,
) -> None:
    """Ratchet vehicle status up — never downgrade via this call."""
    vehicle = (await db.execute(
        select(Vehicle).where(Vehicle.vehicle_id == vehicle_id)
    )).scalar_one_or_none()

    if vehicle is None:
        return

    current_rank = _SEVERITY_RANK.get(vehicle.status.value, -1)
    new_rank     = _SEVERITY_RANK.get(new_severity, 0)

    if new_rank > current_rank:
        vehicle.status    = _STATUS_MAP[new_severity]
        vehicle.last_seen = datetime.now(timezone.utc)


async def _recalculate_vehicle_status(
    db: AsyncSession,
    vehicle_id: str,
) -> None:
    """
    After resolving an anomaly, set vehicle status to the highest severity
    among remaining unresolved anomalies. Reset to 'normal' if none remain.
    """
    vehicle = (await db.execute(
        select(Vehicle).where(Vehicle.vehicle_id == vehicle_id)
    )).scalar_one_or_none()

    if vehicle is None:
        return

    remaining_severities = (await db.execute(
        select(Anomaly.severity)
        .where(Anomaly.vehicle_id == vehicle_id, Anomaly.resolved == False)
    )).scalars().all()

    if not remaining_severities:
        vehicle.status = VehicleStatusEnum.normal
    else:
        max_rank = max(_SEVERITY_RANK.get(s.value, 0) for s in remaining_severities)
        vehicle.status = _RANK_TO_STATUS.get(max_rank, VehicleStatusEnum.warning)

    vehicle.last_seen = datetime.now(timezone.utc)


# ── POST /api/anomalies ───────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED, response_model=Dict[str, str])
async def create_anomaly(
    event: AnomalyEvent,
    db:    AsyncSession = Depends(get_db),
    redis = Depends(get_redis),
):
    """
    Receive an anomaly event from the edge-AI layer:
    1. Persist to PostgreSQL
    2. Escalate vehicle status
    3. Broadcast via WebSocket
    4. Dispatch email/SMS alerts via NotificationRules
    """
    severity = _derive_severity(event)

    anomaly = Anomaly(
        vehicle_id    = event.vehicle_id,
        anomaly_type  = event.anomaly_type,
        severity      = severity,
        if_score      = event.if_score,
        lstm_error    = event.lstm_error,
        sensor_values = event.sensor_values,
    )
    db.add(anomaly)
    await db.flush()   # assigns anomaly.id, keeps session open

    # Fetch vehicle while session is live (needed for alert email template)
    vehicle = (await db.execute(
        select(Vehicle).where(Vehicle.vehicle_id == event.vehicle_id)
    )).scalar_one_or_none()

    await _escalate_vehicle_status(db, event.vehicle_id, severity.value)

    await ws_manager.broadcast_to_all({
        "type":          "anomaly",
        "vehicle_id":    anomaly.vehicle_id,
        "anomaly_id":    anomaly.id,
        "anomaly_type":  anomaly.anomaly_type,
        "severity":      anomaly.severity.value,
        "if_score":      anomaly.if_score,
        "lstm_error":    anomaly.lstm_error,
        "sensor_values": event.sensor_values,
        "created_at":    anomaly.created_at.isoformat(),
    })

    # Dispatch email/SMS while session is still open so anomaly attrs are live.
    # Alert log rows are flushed into the same session; single commit at the end.
    if vehicle is not None:
        try:
            await dispatch_alerts(anomaly, vehicle, db, redis)
        except Exception as exc:
            logger.error("Alert dispatch error for %s: %s", event.vehicle_id, exc)

    await db.commit()
    return {"anomaly_id": anomaly.id, "severity": severity.value}


# ── GET /api/anomalies ────────────────────────────────────────────────────────

@router.get("", response_model=List[Dict[str, Any]])
async def list_anomalies(
    vehicle_id: Optional[str]  = Query(default=None),
    severity:   Optional[str]  = Query(default=None),
    resolved:   Optional[bool] = Query(default=None),
    limit:      int            = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Filtered anomaly list. All filters are optional."""
    q = select(Anomaly).order_by(Anomaly.created_at.desc()).limit(limit)

    if vehicle_id:
        q = q.where(Anomaly.vehicle_id == vehicle_id)
    if severity:
        q = q.where(Anomaly.severity == SeverityEnum(severity))
    if resolved is not None:
        q = q.where(Anomaly.resolved == resolved)

    rows = (await db.execute(q)).scalars().all()
    return [_anomaly_to_dict(a) for a in rows]


# ── GET /api/anomalies/active  (must be before /{anomaly_id}) ─────────────────

@router.get("/active", response_model=List[Dict[str, Any]])
async def list_active_anomalies(
    vehicle_id: Optional[str] = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    """
    All unresolved anomalies sorted by severity (fatal first) then time.
    Used by the dashboard for the live alert count and triage queue.
    """
    q = (
        select(Anomaly)
        .where(Anomaly.resolved == False)
        .order_by(Anomaly.severity.desc(), Anomaly.created_at.desc())
    )
    if vehicle_id:
        q = q.where(Anomaly.vehicle_id == vehicle_id)

    rows = (await db.execute(q)).scalars().all()
    return [_anomaly_to_dict(a) for a in rows]


# ── GET /api/anomalies/{anomaly_id} ───────────────────────────────────────────

@router.get("/{anomaly_id}", response_model=Dict[str, Any])
async def get_anomaly(
    anomaly_id: str,
    db: AsyncSession = Depends(get_db),
):
    anomaly = (await db.execute(
        select(Anomaly).where(Anomaly.id == anomaly_id)
    )).scalar_one_or_none()

    if anomaly is None:
        raise HTTPException(status_code=404, detail=f"Anomaly '{anomaly_id}' not found")

    result = _anomaly_to_dict(anomaly, include_comments=True)
    result["alerts"] = [
        {
            "channel":   al.channel,
            "status":    al.status,
            "sent_at":   al.sent_at.isoformat(),
            "error_msg": al.error_msg,
        }
        for al in anomaly.alerts
    ]
    return result


# ── PATCH /api/anomalies/{anomaly_id}/acknowledge ─────────────────────────────

@router.patch("/{anomaly_id}/acknowledge", response_model=Dict[str, Any])
async def acknowledge_anomaly(
    anomaly_id: str,
    body: AcknowledgeRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Mark an anomaly as seen/acknowledged by an operator.
    Idempotent — safe to call more than once.
    Sends a WebSocket event so all dashboard clients update immediately.
    """
    anomaly = (await db.execute(
        select(Anomaly).where(Anomaly.id == anomaly_id)
    )).scalar_one_or_none()

    if anomaly is None:
        raise HTTPException(status_code=404, detail=f"Anomaly '{anomaly_id}' not found")

    if not anomaly.acknowledged:
        anomaly.acknowledged    = True
        anomaly.acknowledged_by = body.acknowledged_by
        anomaly.acknowledged_at = datetime.now(timezone.utc)

        await ws_manager.broadcast_to_all({
            "type":            "anomaly_acknowledged",
            "anomaly_id":      anomaly_id,
            "vehicle_id":      anomaly.vehicle_id,
            "acknowledged_by": body.acknowledged_by,
        })

        await db.commit()

    return _anomaly_to_dict(anomaly)


# ── PATCH /api/anomalies/{anomaly_id}/resolve ─────────────────────────────────

@router.patch("/{anomaly_id}/resolve", response_model=Dict[str, Any])
async def resolve_anomaly(
    anomaly_id: str,
    body: ResolveRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Mark an anomaly as resolved.
    - Optionally auto-creates a fault_resolved maintenance log.
    - Recalculates vehicle status from remaining unresolved anomalies.
    - Broadcasts anomaly_resolved to all WebSocket clients.
    """
    anomaly = (await db.execute(
        select(Anomaly).where(Anomaly.id == anomaly_id)
    )).scalar_one_or_none()

    if anomaly is None:
        raise HTTPException(status_code=404, detail=f"Anomaly '{anomaly_id}' not found")

    if anomaly.resolved:
        return {**_anomaly_to_dict(anomaly), "already_resolved": True}

    now = datetime.now(timezone.utc)
    anomaly.resolved         = True
    anomaly.resolved_by      = body.resolved_by
    anomaly.resolved_at      = now
    anomaly.resolution_notes = body.resolution_notes

    if body.create_maintenance_log:
        log = MaintenanceLog(
            vehicle_id  = anomaly.vehicle_id,
            log_type    = LogTypeEnum.fault_resolved,
            title       = f"Fault resolved: {anomaly.anomaly_type}",
            description = (
                body.resolution_notes
                or f"Anomaly {anomaly_id[:8]}… resolved by {body.resolved_by}."
            ),
            technician  = body.resolved_by,
            anomaly_id  = anomaly_id,
        )
        db.add(log)

    await db.flush()

    # Downgrade vehicle status to match remaining active anomalies
    await _recalculate_vehicle_status(db, anomaly.vehicle_id)

    await ws_manager.broadcast_to_all({
        "type":              "anomaly_resolved",
        "anomaly_id":        anomaly_id,
        "vehicle_id":        anomaly.vehicle_id,
        "resolved_by":       body.resolved_by,
        "resolution_notes":  body.resolution_notes,
    })

    await db.commit()
    return _anomaly_to_dict(anomaly)


# ── POST /api/anomalies/{anomaly_id}/comment ──────────────────────────────────

@router.post(
    "/{anomaly_id}/comment",
    status_code=status.HTTP_201_CREATED,
    response_model=Dict[str, Any],
)
async def add_comment(
    anomaly_id: str,
    body: CommentRequest,
    db: AsyncSession = Depends(get_db),
):
    """Add a free-text note/comment to an anomaly. Stored in anomaly_comments."""
    anomaly = (await db.execute(
        select(Anomaly).where(Anomaly.id == anomaly_id)
    )).scalar_one_or_none()

    if anomaly is None:
        raise HTTPException(status_code=404, detail=f"Anomaly '{anomaly_id}' not found")

    comment = AnomalyComment(
        anomaly_id = anomaly_id,
        author     = body.author,
        comment    = body.comment,
    )
    db.add(comment)
    await db.flush()

    await ws_manager.broadcast_to_all({
        "type":       "anomaly_comment",
        "anomaly_id": anomaly_id,
        "vehicle_id": anomaly.vehicle_id,
        "comment_id": comment.id,
        "author":     body.author,
    })

    await db.commit()

    return {
        "id":         comment.id,
        "anomaly_id": anomaly_id,
        "author":     body.author,
        "comment":    body.comment,
        "created_at": comment.created_at.isoformat(),
    }
