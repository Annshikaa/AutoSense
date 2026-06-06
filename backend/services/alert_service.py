"""
AlertService — sends email (SMTP/Gmail) and SMS (Twilio) alerts for anomaly events.

Configuration (via environment variables — see .env.example):
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, ALERT_FROM_EMAIL, ALERT_EMAIL_RECIPIENT
  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, ALERT_SMS_RECIPIENT

If any required variable is missing the channel is silently skipped — the system
degrades gracefully so alerts never break anomaly persistence.
"""
from __future__ import annotations

import asyncio
import logging
import os
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import aiosmtplib
from sqlalchemy.ext.asyncio import AsyncSession

from database.models import Alert

logger = logging.getLogger(__name__)

# ── Config from environment ───────────────────────────────────────────────────

_SMTP_HOST   = os.getenv("SMTP_HOST",             "")
_SMTP_PORT   = int(os.getenv("SMTP_PORT",         "587"))
_SMTP_USER   = os.getenv("SMTP_USER",             "")
_SMTP_PASS   = os.getenv("SMTP_PASSWORD",         "")
_FROM_EMAIL  = os.getenv("ALERT_FROM_EMAIL",      "") or os.getenv("SMTP_USER", "")
_TO_EMAIL    = os.getenv("ALERT_EMAIL_RECIPIENT", "")

_TWILIO_SID   = os.getenv("TWILIO_ACCOUNT_SID",  "")
_TWILIO_TOKEN = os.getenv("TWILIO_AUTH_TOKEN",    "")
_TWILIO_FROM  = os.getenv("TWILIO_FROM_NUMBER",   "")
_TWILIO_TO    = os.getenv("ALERT_SMS_RECIPIENT",  "")

_SEVERITY_COLOR: dict[str, str] = {
    "warning":  "#ffaa00",
    "critical": "#ff3366",
    "fatal":    "#ff1744",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_email_configured() -> bool:
    return bool(_SMTP_HOST and _SMTP_USER and _SMTP_PASS and _TO_EMAIL)


def _is_sms_configured() -> bool:
    return bool(_TWILIO_SID and _TWILIO_TOKEN and _TWILIO_FROM and _TWILIO_TO)


def _build_email_html(anomaly, vehicle) -> str:
    sev     = anomaly.severity.value
    color   = _SEVERITY_COLOR.get(sev, "#e2e8f0")
    vtype   = getattr(vehicle, "vehicle_type", None) or "—"
    display = getattr(vehicle, "display_name", None) or vehicle.vehicle_id
    ts      = anomaly.created_at.strftime("%Y-%m-%d %H:%M:%S")

    sensor_chips = "".join(
        f'<span style="padding:5px 10px;background:#0f0f17;border:1px solid #1e1e2e;'
        f'border-radius:6px;color:#94a3b8;font-size:12px;margin:3px;display:inline-block;">'
        f'{k.replace("_", " ").title()}: {v:.2f}</span>'
        for k, v in (anomaly.sensor_values or {}).items()
    )

    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#0a0a0f;font-family:-apple-system,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#12121a;border-radius:12px;
              overflow:hidden;border:1px solid #1e1e2e;">

    <div style="padding:20px 28px;background:#0f0f17;border-bottom:1px solid #1e1e2e;">
      <h1 style="margin:0;color:#e2e8f0;font-size:18px;font-weight:700;">
        AutoSense Alert &nbsp;
        <span style="display:inline-block;padding:3px 10px;border-radius:20px;
               background:{color};color:#fff;font-size:11px;font-weight:700;
               vertical-align:middle;">{sev.upper()}</span>
      </h1>
    </div>

    <div style="padding:20px 28px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:13px;width:130px;">Vehicle</td>
          <td style="padding:8px 0;color:#e2e8f0;font-size:13px;font-weight:600;">{vehicle.vehicle_id}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:13px;">Display Name</td>
          <td style="padding:8px 0;color:#e2e8f0;font-size:13px;">{display}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:13px;">Type</td>
          <td style="padding:8px 0;color:#e2e8f0;font-size:13px;">{vtype.upper()}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:13px;">Fault</td>
          <td style="padding:8px 0;color:{color};font-size:13px;font-weight:700;">{anomaly.anomaly_type}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:13px;">IF Score</td>
          <td style="padding:8px 0;color:#e2e8f0;font-size:13px;">{anomaly.if_score:.4f}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:13px;">LSTM Error</td>
          <td style="padding:8px 0;color:#e2e8f0;font-size:13px;">{anomaly.lstm_error:.4f}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:13px;">Time (UTC)</td>
          <td style="padding:8px 0;color:#e2e8f0;font-size:13px;">{ts}</td>
        </tr>
      </table>

      <div style="margin-top:16px;">
        <p style="color:#64748b;font-size:12px;margin:0 0 8px;">Sensor Readings:</p>
        <div>{sensor_chips}</div>
      </div>
    </div>

    <div style="padding:12px 28px;border-top:1px solid #1e1e2e;
                text-align:center;color:#334155;font-size:11px;">
      AutoSense Vehicle Monitoring System &middot; {ts} UTC
    </div>
  </div>
</body>
</html>"""


# ── AlertService ──────────────────────────────────────────────────────────────

class AlertService:

    async def send_email_alert(self, anomaly, vehicle) -> str:
        """
        Send an HTML email via SMTP (Gmail compatible with App Passwords).
        Returns 'sent' | 'skipped' | 'error'.
        """
        if not _is_email_configured():
            logger.debug("Email not configured — skipping alert for %s", anomaly.vehicle_id)
            return "skipped"

        subject = (
            f"[AutoSense {anomaly.severity.value.upper()}] "
            f"{anomaly.vehicle_id} — {anomaly.anomaly_type}"
        )

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = _FROM_EMAIL
        msg["To"]      = _TO_EMAIL
        msg.attach(MIMEText(_build_email_html(anomaly, vehicle), "html"))

        try:
            await aiosmtplib.send(
                msg,
                hostname  = _SMTP_HOST,
                port      = _SMTP_PORT,
                username  = _SMTP_USER,
                password  = _SMTP_PASS,
                start_tls = True,
            )
            logger.info(
                "Email sent: vehicle=%s severity=%s fault=%s → %s",
                anomaly.vehicle_id, anomaly.severity.value, anomaly.anomaly_type, _TO_EMAIL,
            )
            return "sent"
        except Exception as exc:
            logger.error("Email failed for %s: %s", anomaly.vehicle_id, exc)
            return "error"

    async def send_sms_alert(self, anomaly, vehicle) -> str:
        """
        Send an SMS via Twilio.  The Twilio client is synchronous so it runs
        in the default thread-pool executor to avoid blocking the event loop.
        Returns 'sent' | 'skipped' | 'error'.
        """
        if not _is_sms_configured():
            logger.debug("SMS not configured — skipping alert for %s", anomaly.vehicle_id)
            return "skipped"

        sv = anomaly.sensor_values or {}
        sensors_brief = " | ".join(
            f"{k.replace('_', ' ').title()}:{v:.1f}"
            for k, v in list(sv.items())[:4]
        )
        body = (
            f"AutoSense {anomaly.severity.value.upper()}: {anomaly.vehicle_id}\n"
            f"Fault: {anomaly.anomaly_type}\n"
            f"{sensors_brief}\n"
            f"IF Score: {anomaly.if_score:.3f}"
        )

        try:
            from twilio.rest import Client as TwilioClient  # lazy import
            client = TwilioClient(_TWILIO_SID, _TWILIO_TOKEN)

            def _send_sync():
                return client.messages.create(
                    body  = body,
                    from_ = _TWILIO_FROM,
                    to    = _TWILIO_TO,
                )

            loop = asyncio.get_event_loop()
            msg  = await loop.run_in_executor(None, _send_sync)
            logger.info(
                "SMS sent: vehicle=%s severity=%s sid=%s",
                anomaly.vehicle_id, anomaly.severity.value, msg.sid,
            )
            return "sent"
        except Exception as exc:
            logger.error("SMS failed for %s: %s", anomaly.vehicle_id, exc)
            return "error"

    async def log_alert(
        self,
        anomaly,
        channel: str,
        sent_status: str,
        db: AsyncSession,
    ) -> None:
        """Persist an alert dispatch record to the alerts table."""
        try:
            record = Alert(
                anomaly_id = anomaly.id,
                channel    = channel,
                status     = sent_status,
            )
            db.add(record)
            await db.flush()
        except Exception as exc:
            logger.error("Failed to log alert: %s", exc)


alert_service = AlertService()
