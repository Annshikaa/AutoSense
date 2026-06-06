"""
edge-ai/main.py
Full edge-AI pipeline:
  UDP :5000  →  DataBuffer  →  AnomalyDetector  →  Predictor
            →  POST to backend (sensor readings + anomaly events)
"""
from __future__ import annotations

import asyncio
import logging
import signal
import sys
from pathlib import Path
from typing import Dict, Optional

try:
    from colorama import init, Fore, Style
    init(autoreset=True)
    C = Fore.CYAN  + Style.BRIGHT
    R = Fore.RED   + Style.BRIGHT
    G = Fore.GREEN
    Y = Fore.YELLOW + Style.BRIGHT
    Z = Style.RESET_ALL
except ImportError:
    C = R = G = Y = Z = ""

try:
    import httpx
    _HTTPX_AVAILABLE = True
except ImportError:
    _HTTPX_AVAILABLE = False

logging.basicConfig(level=logging.WARNING, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR     = Path(__file__).parent / "data"
BACKEND_URL  = "http://localhost:8000"

from utils.udp_receiver         import UDPReceiver
from utils.data_buffer          import DataBuffer
from inference.anomaly_detector import AnomalyDetector
from inference.predictor        import Predictor

# ── Pipeline state ────────────────────────────────────────────────────────────
_buffer   = DataBuffer(maxlen=100)
_detector = AnomalyDetector(model_path=DATA_DIR / "isolation_forest.pkl")
_predict  = Predictor(model_path=DATA_DIR / "lstm_model.pkl", seq_len=20)

_count:            int            = 0
_pkt_counter:      Dict[str, int] = {}   # per-vehicle sub-sampling counter
_last_fault_state: Dict[str, bool] = {}  # for rising-edge anomaly detection
_http_client:      Optional["httpx.AsyncClient"] = None

POST_READING_EVERY = 10   # persist 1 in N packets → ~3/sec per vehicle


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _get_http() -> Optional["httpx.AsyncClient"]:
    return _http_client


async def _post_reading(payload: dict) -> None:
    """POST one sensor reading to the backend. Fire-and-forget."""
    client = _get_http()
    if client is None:
        return
    try:
        await client.post("/api/sensors/reading", json=payload, timeout=2.0)
    except Exception as exc:
        logger.warning("Backend /api/sensors/reading unreachable: %s", exc)


async def _post_anomaly(payload: dict) -> None:
    """POST one anomaly event to the backend. Fire-and-forget."""
    client = _get_http()
    if client is None:
        return
    try:
        resp = await client.post("/api/anomalies", json=payload, timeout=2.0)
        if resp.status_code == 201:
            print(f"{G}[ANOMALY POSTED] {payload['vehicle_id']} — {payload['anomaly_type']}{Z}")
        else:
            print(f"{R}[ANOMALY POST FAILED] HTTP {resp.status_code}: {resp.text[:200]}{Z}")
    except Exception as exc:
        logger.warning("Backend /api/anomalies unreachable: %s", exc)


# ── Core packet handler ───────────────────────────────────────────────────────

def _on_packet(packet: dict) -> None:
    global _count
    _count += 1

    buf    = _buffer.ingest(packet)
    result = _detector.score(buf, packet)
    pred   = _predict.predict(buf, packet)

    s     = packet.get("sensors", {})
    vid   = result.vehicle_id
    rpm   = s.get("rpm",         0.0)
    speed = s.get("speed",       0.0)
    temp  = s.get("temperature", 0.0)
    thr   = s.get("throttle",    0.0)
    bat   = s.get("battery",     0.0)
    ts    = packet.get("timestamp", 0.0)
    vtype = packet.get("vehicle_type", None)

    # Extra type-specific sensor (fuel_level / load_weight / door_status / siren_active)
    _CORE_KEYS = {"rpm", "speed", "temperature", "throttle", "battery"}
    extra_sensors = {k: v for k, v in s.items() if k not in _CORE_KEYS}

    # ── Console output ────────────────────────────────────────────────────────
    color = R if result.is_anomaly else G
    row = (
        f"{color}[{vid}]  "
        f"RPM:{rpm:>7.1f}  Spd:{speed:>5.1f}  "
        f"Tmp:{temp:>5.1f}  Thr:{thr:>5.1f}%  Bat:{bat:>5.2f}V  "
        f"score:{result.score:>+7.4f}"
    )
    if result.fault_active:
        row += f"  {R}!! {result.fault_type} !!"
    if pred.predicted_next is not None and _count % 10 == 0:
        row += f"  {Y}pred_err={pred.prediction_error:.3f}"
    print(row + Z)

    # ── Warm-up fit ───────────────────────────────────────────────────────────
    if buf.size == 80:
        _detector.fit_from_buffer(buf)
        _predict.fit_from_buffer(buf, epochs=20)

    # ── Backend HTTP posts (scheduled as async tasks) ─────────────────────────
    if not _HTTPX_AVAILABLE:
        return

    loop = asyncio.get_event_loop()

    # Sub-sampled sensor reading post (1 in N per vehicle)
    _pkt_counter[vid] = _pkt_counter.get(vid, 0) + 1
    if _pkt_counter[vid] % POST_READING_EVERY == 0:
        reading_payload = {
            "vehicle_id":   vid,
            "vehicle_type": vtype,
            "timestamp":    ts,
            "rpm":          rpm,
            "speed":        speed,
            "temperature":  temp,
            "throttle":     thr,
            "battery":      bat,
            "fault_active": result.fault_active,
            "fault_type":   result.fault_type if result.fault_type else None,
            **extra_sensors,   # fuel_level / load_weight / door_status / siren_active
        }
        loop.create_task(_post_reading(reading_payload))

    # Anomaly post — only on the rising edge (first packet of a new C++ fault)
    prev_fault = _last_fault_state.get(vid, False)
    _last_fault_state[vid] = result.fault_active   # C++ ground truth only

    if result.fault_active and not prev_fault:
        anomaly_payload = {
            "vehicle_id":   vid,
            "anomaly_type": result.fault_type or "ML_ANOMALY",
            "if_score":     result.score,
            "lstm_error":   pred.prediction_error,
            "sensor_values": {
                "rpm":         rpm,
                "speed":       speed,
                "temperature": temp,
                "throttle":    thr,
                "battery":     bat,
            },
            "fault_active": result.fault_active,
            "fault_type":   result.fault_type if result.fault_type else None,
        }
        loop.create_task(_post_anomaly(anomaly_payload))


# ── Async entrypoint ──────────────────────────────────────────────────────────

async def _run() -> None:
    global _http_client

    # Init HTTP client
    if _HTTPX_AVAILABLE:
        _http_client = httpx.AsyncClient(base_url=BACKEND_URL, timeout=2.0)
        logger.info("HTTP client → %s", BACKEND_URL)
    else:
        logger.warning("httpx not installed — backend posting disabled. "
                       "Run: pip install httpx")

    rx = UDPReceiver(host="0.0.0.0", port=5000)
    rx.register(_on_packet)
    await rx.start()

    print(
        C +
        "\n╔══════════════════════════════════════════════════╗\n"
         "║  AutoSense Edge-AI Pipeline  v1.1                ║\n"
         "║  IsolationForest + LSTM  |  UDP :5000            ║\n"
        f"║  Backend → {BACKEND_URL:<38}║\n"
         "╚══════════════════════════════════════════════════╝\n"
        + Z
    )

    loop = asyncio.get_running_loop()
    done = loop.create_future()

    def _shutdown(_sig):
        if not done.done():
            done.set_result(None)

    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _shutdown, sig)
        except NotImplementedError:
            pass   # Windows

    try:
        await done
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        rx.stop()
        if _http_client:
            await _http_client.aclose()
        print(C + "\nPipeline stopped.\n" + Z)
        print(_buffer.summary())


if __name__ == "__main__":
    try:
        asyncio.run(_run())
    except KeyboardInterrupt:
        pass
