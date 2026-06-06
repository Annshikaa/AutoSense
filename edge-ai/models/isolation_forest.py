"""
IsolationForestDetector — scikit-learn wrapper for sensor anomaly detection.
"""
import logging
import pickle
from pathlib import Path
from typing import Tuple

import numpy as np
from sklearn.ensemble import IsolationForest

logger = logging.getLogger(__name__)

_DEFAULT_PATH = Path(__file__).parent.parent / "data" / "isolation_forest.pkl"


class IsolationForestDetector:
    """
    Thin wrapper around sklearn IsolationForest.

    contamination : expected fraction of anomalies in the training set.
    """

    def __init__(
        self,
        n_estimators:  int   = 100,
        contamination: float = 0.05,
        random_state:  int   = 42,
    ) -> None:
        self._model = IsolationForest(
            n_estimators  = n_estimators,
            contamination = contamination,
            random_state  = random_state,
            n_jobs        = -1,
        )
        self._fitted = False

    # ── Training ──────────────────────────────────────────────────────────────

    def fit(self, X: np.ndarray) -> None:
        """Fit on (n_samples, n_features) array."""
        self._model.fit(X)
        self._fitted = True
        logger.info("IsolationForest fitted on %d samples", len(X))

    # ── Inference ─────────────────────────────────────────────────────────────

    def predict(self, x: np.ndarray) -> Tuple[bool, float]:
        """
        Parameters
        ----------
        x : shape (n_features,) or (1, n_features)

        Returns
        -------
        is_anomaly : bool
        score      : float  — more negative means more anomalous
        """
        if not self._fitted:
            return False, 0.0
        x2d   = x.reshape(1, -1)
        label = self._model.predict(x2d)[0]          # +1 normal / -1 anomaly
        score = float(self._model.score_samples(x2d)[0])
        return (label == -1), score

    def predict_batch(self, X: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
        """Returns (bool anomaly array, float score array)."""
        if not self._fitted:
            return np.zeros(len(X), dtype=bool), np.zeros(len(X))
        labels = self._model.predict(X) == -1
        scores = self._model.score_samples(X)
        return labels, scores

    # ── Persistence ───────────────────────────────────────────────────────────

    def save(self, path: Path = _DEFAULT_PATH) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as fh:
            pickle.dump(self._model, fh)
        logger.info("IsolationForest saved → %s", path)

    def load(self, path: Path = _DEFAULT_PATH) -> bool:
        path = Path(path)
        if not path.exists():
            logger.warning("Model not found: %s", path)
            return False
        with open(path, "rb") as fh:
            self._model = pickle.load(fh)
        self._fitted = True
        logger.info("IsolationForest loaded ← %s", path)
        return True

    @property
    def is_fitted(self) -> bool:
        return self._fitted
