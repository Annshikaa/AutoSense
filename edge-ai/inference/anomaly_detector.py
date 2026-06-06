"""
AnomalyDetector — live per-packet scoring using IsolationForest.
"""
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import numpy as np

from models.isolation_forest import IsolationForestDetector
from utils.data_buffer import VehicleBuffer

logger = logging.getLogger(__name__)

_DEFAULT_PATH = Path(__file__).parent.parent / "data" / "isolation_forest.pkl"


@dataclass
class AnomalyResult:
    vehicle_id:    str
    is_anomaly:    bool
    score:         float          # more negative = more anomalous
    sensor_values: np.ndarray
    fault_active:  bool           # C++ ground-truth fault flag
    fault_type:    str


class AnomalyDetector:
    """
    Wraps IsolationForestDetector for streaming packet scoring.

    If no saved model exists the detector runs in pass-through mode
    (scores every packet 0.0 / not anomalous) until fit() is called.
    """

    SCORE_THRESHOLD = -0.15    # below this → flag as anomaly

    def __init__(self, model_path: Optional[Path] = None) -> None:
        self._detector   = IsolationForestDetector()
        self._model_path = Path(model_path) if model_path else _DEFAULT_PATH

        if self._model_path.exists():
            self._detector.load(self._model_path)
        else:
            logger.info("No saved model at %s — running pass-through", self._model_path)

    # ── Live scoring ──────────────────────────────────────────────────────────

    def score(self, buffer: VehicleBuffer, packet: dict) -> AnomalyResult:
        """Score the most-recent reading in `buffer`."""
        vec       = buffer.latest_vector()
        gt_fault  = packet.get("fault_active", False)
        ft        = packet.get("fault_type",   "")
        vid       = packet.get("vehicle_id",   "?")

        if vec is None or not self._detector.is_fitted:
            return AnomalyResult(
                vehicle_id    = vid,
                is_anomaly    = gt_fault,
                score         = 0.0,
                sensor_values = vec if vec is not None else np.zeros(5, dtype=np.float32),
                fault_active  = gt_fault,
                fault_type    = ft,
            )

        is_anom, score = self._detector.predict(vec)
        # Combine model signal with C++ ground truth for display
        return AnomalyResult(
            vehicle_id    = vid,
            is_anomaly    = is_anom or gt_fault,
            score         = score,
            sensor_values = vec,
            fault_active  = gt_fault,
            fault_type    = ft,
        )

    # ── Training helpers ──────────────────────────────────────────────────────

    def fit(self, X: np.ndarray) -> None:
        self._detector.fit(X)

    def fit_from_buffer(self, buffer: VehicleBuffer, min_samples: int = 20) -> bool:
        """Quick warm-up fit from the vehicle's current buffer."""
        X = buffer.full_window()
        if len(X) < min_samples:
            logger.debug("Buffer too small (%d < %d) to fit", len(X), min_samples)
            return False
        self._detector.fit(X)
        logger.info("AnomalyDetector fitted on %d samples from %s",
                    len(X), buffer.vehicle_id)
        return True

    def save(self, path: Optional[Path] = None) -> None:
        self._detector.save(path or self._model_path)

    @property
    def is_ready(self) -> bool:
        return self._detector.is_fitted
