"""
Predictor — wraps LSTMPredictor for streaming next-step forecasting.
"""
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

import numpy as np

from models.lstm_model import LSTMPredictor
from utils.data_buffer import VehicleBuffer, FEATURE_KEYS

logger = logging.getLogger(__name__)

_DEFAULT_PATH = Path(__file__).parent.parent / "data" / "lstm_model.pkl"


@dataclass
class PredictionResult:
    vehicle_id:       str
    predicted_next:   Optional[np.ndarray]     # shape (n_features,) or None
    prediction_error: float                    # MAE vs last reading
    feature_names:    List[str] = field(default_factory=lambda: FEATURE_KEYS.copy())


class Predictor:
    """
    Streaming next-step predictor backed by LSTMPredictor.
    """

    def __init__(
        self,
        model_path: Optional[Path] = None,
        seq_len:    int = 20,
    ) -> None:
        self._model = LSTMPredictor(seq_len=seq_len)
        path = Path(model_path) if model_path else _DEFAULT_PATH
        if path.exists():
            self._model.load(path)

    # ── Live inference ────────────────────────────────────────────────────────

    def predict(self, buffer: VehicleBuffer, packet: dict) -> PredictionResult:
        """Predict the next sensor vector from `buffer`'s recent history."""
        vid      = packet.get("vehicle_id", "?")
        sequence = buffer.window()

        if not self._model.is_fitted or len(sequence) < self._model.seq_len:
            return PredictionResult(
                vehicle_id       = vid,
                predicted_next   = None,
                prediction_error = 0.0,
            )

        pred, error = self._model.predict_next(sequence)
        return PredictionResult(
            vehicle_id       = vid,
            predicted_next   = pred,
            prediction_error = error,
        )

    # ── Training helpers ──────────────────────────────────────────────────────

    def fit_from_buffer(
        self,
        buffer:      VehicleBuffer,
        epochs:      int = 30,
        min_samples: int = 30,
    ) -> bool:
        X = buffer.full_window()
        if len(X) < min_samples:
            return False
        self._model.fit(X, epochs=epochs)
        logger.info("Predictor fitted on %d samples from %s",
                    len(X), buffer.vehicle_id)
        return True

    def save(self, path: Optional[Path] = None) -> None:
        self._model.save(path or _DEFAULT_PATH)

    @property
    def is_ready(self) -> bool:
        return self._model.is_fitted
