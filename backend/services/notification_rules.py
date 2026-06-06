"""
NotificationRules — decides which channels to alert based on severity,
dedup (same fault already active), and per-vehicle-channel cooldowns.

Severity → outbound channels:
  warning  → WebSocket only (WS broadcast already handled by the route)
  critical → WebSocket + Email
  fatal    → WebSocket + Email + SMS

Cooldowns stored as Redis TTL keys:
  alert_cooldown:{vehicle_id}:email  → 300 s  (5 min)
  alert_cooldown:{vehicle_id}:sms    → 900 s  (15 min)

Dedup: if another unresolved anomaly of the *same type* already exists for
this vehicle the rising edge has already been alerted — skip to avoid spam.
"""
from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import Anomaly, SeverityEnum
from services.alert_service import alert_service

logger = logging.getLogger(__name__)

_COOLDOWN_EMAIL_S = 300   # 5 minutes
_COOLDOWN_SMS_S   = 900   # 15 minutes


# ── Redis cooldown helpers ────────────────────────────────────────────────────

async def _is_on_cooldown(redis, vehicle_id: str, channel: str) -> bool:
    return bool(await redis.exists(f"alert_cooldown:{vehicle_id}:{channel}"))


async def _set_cooldown(redis, vehicle_id: str, channel: str, ttl: int) -> None:
    await redis.setex(f"alert_cooldown:{vehicle_id}:{channel}", ttl, "1")


# ── Dedup check ───────────────────────────────────────────────────────────────

async def _same_fault_already_active(
    db: AsyncSession,
    vehicle_id: str,
    anomaly_type: str,
    this_id: str,
) -> bool:
    """
    Returns True if there is already another unresolved anomaly of the same
    type for this vehicle (meaning we already fired the rising-edge alert).
    """
    row = (await db.execute(
        select(Anomaly.id)
        .where(
            Anomaly.vehicle_id   == vehicle_id,
            Anomaly.anomaly_type == anomaly_type,
            Anomaly.resolved     == False,
            Anomaly.id           != this_id,
        )
        .limit(1)
    )).scalar_one_or_none()
    return row is not None


# ── Public entry point ────────────────────────────────────────────────────────

async def dispatch_alerts(
    anomaly: Anomaly,
    vehicle,
    db: AsyncSession,
    redis,
) -> None:
    """
    Called after an anomaly is flushed to DB (anomaly.id is set).
    WebSocket broadcast is already done by the route before this is called.
    This function handles email + SMS dispatch with cooldown and dedup.
    """
    sev = anomaly.severity.value
    vid = anomaly.vehicle_id

    # WARNING → WebSocket only, no outbound alerts
    if sev == SeverityEnum.warning.value:
        return

    # Dedup: skip if same fault type is already active for this vehicle
    if await _same_fault_already_active(db, vid, anomaly.anomaly_type, anomaly.id):
        logger.info(
            "Alert skipped (dedup): vehicle=%s fault='%s' already active",
            vid, anomaly.anomaly_type,
        )
        return

    # ── Email: CRITICAL + FATAL ───────────────────────────────────────────────
    if not await _is_on_cooldown(redis, vid, "email"):
        result = await alert_service.send_email_alert(anomaly, vehicle)
        await alert_service.log_alert(anomaly, "email", result, db)
        if result == "sent":
            await _set_cooldown(redis, vid, "email", _COOLDOWN_EMAIL_S)
    else:
        logger.debug("Email on cooldown for %s", vid)

    # ── SMS: FATAL only ───────────────────────────────────────────────────────
    if sev == SeverityEnum.fatal.value:
        if not await _is_on_cooldown(redis, vid, "sms"):
            result = await alert_service.send_sms_alert(anomaly, vehicle)
            await alert_service.log_alert(anomaly, "sms", result, db)
            if result == "sent":
                await _set_cooldown(redis, vid, "sms", _COOLDOWN_SMS_S)
        else:
            logger.debug("SMS on cooldown for %s", vid)
