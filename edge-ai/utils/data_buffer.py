"""
Rolling per-vehicle data buffer backed by numpy arrays.

VehicleBuffer  — circular buffer for one vehicle (last N readings)
DataBuffer     — registry that lazily creates VehicleBuffers on first contact
"""
import time
from collections import deque
from typing import Dict, List, Optional

import numpy as np

FEATURE_KEYS: List[str] = ["rpm", "speed", "temperature", "throttle", "battery"]
FEATURE_DIM:  int       = len(FEATURE_KEYS)


class VehicleBuffer:
    """
    Circular buffer of the last `maxlen` sensor readings for one vehicle.

    Each reading is stored as a numpy array of shape (FEATURE_DIM,).
    All older readings are evicted automatically when the buffer is full.
    """

    def __init__(self, vehicle_id: str, maxlen: int = 100) -> None:
        self.vehicle_id  = vehicle_id
        self.maxlen      = maxlen
        self._features:    deque = deque(maxlen=maxlen)
        self._timestamps:  deque = deque(maxlen=maxlen)
        self._fault_flags: deque = deque(maxlen=maxlen)
        self._pps_window:  deque = deque()   # monotonic timestamps in last 1 s

    # ── Ingest ────────────────────────────────────────────────────────────────

    def push(self, sensors: dict, fault_active: bool = False) -> None:
        """Append one reading. `sensors` is the dict from the JSON packet."""
        vec = np.array(
            [float(sensors.get(k, 0.0)) for k in FEATURE_KEYS],
            dtype=np.float32,
        )
        now = time.monotonic()
        self._features.append(vec)
        self._timestamps.append(now)
        self._fault_flags.append(fault_active)

        # Rate tracking — prune window to last 1 s
        self._pps_window.append(now)
        cutoff = now - 1.0
        while self._pps_window and self._pps_window[0] < cutoff:
            self._pps_window.popleft()

    # ── Feature extraction ────────────────────────────────────────────────────

    def latest_vector(self) -> Optional[np.ndarray]:
        """Most-recent feature vector, shape (FEATURE_DIM,). None if empty."""
        return self._features[-1].copy() if self._features else None

    def window(self, n: Optional[int] = None) -> np.ndarray:
        """
        Return the last `n` readings as shape (n, FEATURE_DIM), oldest-first.
        If n is None, return all buffered readings.
        Returns empty array of shape (0, FEATURE_DIM) when buffer is empty.
        """
        rows = list(self._features) if n is None else list(self._features)[-n:]
        if not rows:
            return np.empty((0, FEATURE_DIM), dtype=np.float32)
        return np.stack(rows, axis=0)

    def full_window(self) -> np.ndarray:
        """All buffered readings, shape (size, FEATURE_DIM)."""
        return self.window()

    # ── Stats / rate ──────────────────────────────────────────────────────────

    @property
    def size(self) -> int:
        return len(self._features)

    @property
    def packets_per_second(self) -> float:
        """Packets received in the trailing 1-second window."""
        return float(len(self._pps_window))

    def mean(self) -> Optional[np.ndarray]:
        """Per-feature mean over all buffered readings, shape (FEATURE_DIM,)."""
        if not self._features:
            return None
        return self.full_window().mean(axis=0)

    def std(self) -> Optional[np.ndarray]:
        """Per-feature std-dev over all buffered readings, shape (FEATURE_DIM,)."""
        if len(self._features) < 2:
            return None
        return self.full_window().std(axis=0)

    def fault_rate(self) -> float:
        """Fraction of buffered readings that were flagged as faulty."""
        if not self._fault_flags:
            return 0.0
        return sum(self._fault_flags) / len(self._fault_flags)

    @staticmethod
    def feature_names() -> List[str]:
        return FEATURE_KEYS.copy()


class DataBuffer:
    """
    Registry of per-vehicle VehicleBuffers.
    A new buffer is created automatically on the first packet from a vehicle.
    """

    def __init__(self, maxlen: int = 100) -> None:
        self._maxlen  = maxlen
        self._buffers: Dict[str, VehicleBuffer] = {}

    def ingest(self, packet: dict) -> VehicleBuffer:
        """
        Parse a simulator JSON packet, push data into the vehicle's buffer,
        and return that buffer for immediate downstream use.
        """
        vid     = packet.get("vehicle_id", "unknown")
        sensors = packet.get("sensors", {})
        fa      = packet.get("fault_active", False)

        if vid not in self._buffers:
            self._buffers[vid] = VehicleBuffer(vid, self._maxlen)

        self._buffers[vid].push(sensors, fa)
        return self._buffers[vid]

    def get(self, vehicle_id: str) -> Optional[VehicleBuffer]:
        """Return the buffer for a specific vehicle, or None."""
        return self._buffers.get(vehicle_id)

    def all_vehicles(self) -> Dict[str, VehicleBuffer]:
        return dict(self._buffers)

    def summary(self) -> str:
        """One-line status string per vehicle."""
        lines = [
            f"  {vid}: {buf.size:>3} readings  "
            f"pps={buf.packets_per_second:.1f}  "
            f"fault_rate={buf.fault_rate():.1%}"
            for vid, buf in sorted(self._buffers.items())
        ]
        return "\n".join(lines) if lines else "  (no data)"
